// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeWeeklyTarget,
  deriveWeeklyGoals,
} from '../weeklyDerivation';
import { db, type AttemptRecord, type Goal } from '../../../lib/db';

// ---------------------------------------------------------------------
// Time anchors
// ---------------------------------------------------------------------

const ONE_DAY = 24 * 60 * 60 * 1000;

// Pick a Sunday so the math reads naturally. Mar 1, 2026 (which is a
// Sunday). Using a date object gets us the local-time semantics
// endOfWeekFromStart relies on internally.
const WEEK_START = new Date(2026, 2, 1, 0, 0, 0, 0).getTime();
const WEEK_END   = new Date(2026, 2, 7, 23, 59, 59, 999).getTime();
// Monthly window: 4 weeks = 28 days. End of Sat in week 4.
const MONTH_END  = new Date(2026, 2, 28, 23, 59, 59, 999).getTime();

// ---------------------------------------------------------------------
// Goal record builder — stable defaults the tests can override
// ---------------------------------------------------------------------

function buildMonthly(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? `monthly-${Math.random().toString(36).slice(2, 9)}`,
    scope: 'monthly',
    description: 'Test monthly',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 130,
    targetUnit: 'items',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: WEEK_START,
    targetDate: MONTH_END,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// computeWeeklyTarget — pure formula
// ---------------------------------------------------------------------

describe('computeWeeklyTarget — reset-clean formula', () => {
  it('spreads monthly target evenly across 4 weeks', () => {
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 0,
        monthlyStartDate: WEEK_START,
        monthlyTargetDate: MONTH_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(25); // 100 / 4 weeks
  });

  it('subtracts attempts already logged before this week', () => {
    // Goal started a week ago. MONTH_END is 28 days from WEEK_START, so
    // weeks_remaining from this Sunday is still 4 (ceil(28/7)). 80/4=20.
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 20,
        monthlyStartDate: WEEK_START - 7 * ONE_DAY,
        monthlyTargetDate: MONTH_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(20); // ceil((100-20)/4) = 20
  });

  it('ceils weeks_remaining for partial trailing weeks', () => {
    // monthEnd lands ~25 days from weekStart → ceil(25/7) = 4 weeks
    const trailing = WEEK_START + 25 * ONE_DAY;
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 0,
        monthlyStartDate: WEEK_START,
        monthlyTargetDate: trailing,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(25);
  });

  it('returns full remaining when only one week left', () => {
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 70,
        monthlyStartDate: WEEK_START - 21 * ONE_DAY,
        monthlyTargetDate: WEEK_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(30); // 100 - 70 = 30 spread across 1 week
  });

  it('returns 0 when monthly already complete', () => {
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 120, // overshoot
        monthlyStartDate: WEEK_START - 21 * ONE_DAY,
        monthlyTargetDate: MONTH_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(0);
  });

  it('returns 0 when monthly target is 0', () => {
    expect(
      computeWeeklyTarget({
        monthlyTarget: 0,
        attemptsSoFar: 0,
        monthlyStartDate: WEEK_START,
        monthlyTargetDate: MONTH_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(0);
  });

  it('returns 0 when monthly window already ended before this week', () => {
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 0,
        monthlyStartDate: WEEK_START - 28 * ONE_DAY,
        monthlyTargetDate: WEEK_START - ONE_DAY,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(0);
  });
});

describe('computeWeeklyTarget — mid-week creation proration', () => {
  it('prorates the first week when goal starts on a Thursday', () => {
    // Goal created Thursday (weekStart + 4 days). Now = goal startDate.
    // monthlyTarget=100, monthEnd=25 days after now → ceil(100 * 3/25)=12.
    // (Thurs→Sat = 3 days; Thurs→monthEnd = 25 days using ceil daysBetween)
    const thursday = WEEK_START + 4 * ONE_DAY;
    const monthEnd = thursday + 24 * ONE_DAY + 1; // 25 days via ceil
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 0,
        monthlyStartDate: thursday,
        monthlyTargetDate: monthEnd,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: thursday,
      }),
    ).toBe(12);
  });

  it('respects `now` when later than goal startDate', () => {
    // Goal startDate Thursday; now is Friday. Friday → Sat = 2 days.
    const thursday = WEEK_START + 4 * ONE_DAY;
    const friday = WEEK_START + 5 * ONE_DAY;
    const monthEnd = thursday + 24 * ONE_DAY + 1;
    // From Friday: daysWeek = ceil((WEEK_END - friday)/day) = 2,
    // daysMonth = ceil((monthEnd - friday)/day) = 24
    // ceil(100 * 2/24) = 9
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 0,
        monthlyStartDate: thursday,
        monthlyTargetDate: monthEnd,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: friday,
      }),
    ).toBe(9);
  });

  it('handles a goal that ends in the same week it starts', () => {
    // Goal starts Tuesday and ends Saturday — proration over the whole
    // remaining month equals the whole remaining week.
    const tuesday = WEEK_START + 2 * ONE_DAY;
    expect(
      computeWeeklyTarget({
        monthlyTarget: 50,
        attemptsSoFar: 0,
        monthlyStartDate: tuesday,
        monthlyTargetDate: WEEK_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: tuesday,
      }),
    ).toBe(50);
  });

  it('does NOT prorate when goal startDate equals the week start', () => {
    // Sunday-aligned start uses the regular reset-clean branch even
    // though startDate === weekStart. Caller's "fresh start" semantics.
    expect(
      computeWeeklyTarget({
        monthlyTarget: 100,
        attemptsSoFar: 0,
        monthlyStartDate: WEEK_START,
        monthlyTargetDate: MONTH_END,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: WEEK_START,
      }),
    ).toBe(25); // 100 / 4 weeks — reset-clean, not prorated
  });
});

// ---------------------------------------------------------------------
// deriveWeeklyGoals — async orchestrator
// ---------------------------------------------------------------------

describe('deriveWeeklyGoals — filtering', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('skips umbrella monthly goals', async () => {
    const umbrella = buildMonthly({ isUmbrella: true, targetMetric: null });
    const out = await deriveWeeklyGoals([umbrella], WEEK_START, WEEK_START);
    expect(out).toHaveLength(0);
  });

  it('skips non-monthly goals', async () => {
    const yearly = buildMonthly({ scope: 'yearly' });
    const out = await deriveWeeklyGoals([yearly], WEEK_START, WEEK_START);
    expect(out).toHaveLength(0);
  });

  it('skips goals already past their targetDate', async () => {
    const expired = buildMonthly({
      startDate: WEEK_START - 60 * ONE_DAY,
      targetDate: WEEK_START - ONE_DAY,
    });
    const out = await deriveWeeklyGoals([expired], WEEK_START, WEEK_START);
    expect(out).toHaveLength(0);
  });

  it('skips goals with metrics that don\'t translate (accuracy)', async () => {
    const accuracy = buildMonthly({
      targetMetric: 'harmonic_fluency_accuracy_overall',
      targetValue: 90,
      targetUnit: '%',
    });
    const out = await deriveWeeklyGoals([accuracy], WEEK_START, WEEK_START);
    expect(out).toHaveLength(0);
  });

  it('skips goals with no targetMetric', async () => {
    const blank = buildMonthly({ targetMetric: null });
    const out = await deriveWeeklyGoals([blank], WEEK_START, WEEK_START);
    expect(out).toHaveLength(0);
  });
});

describe('deriveWeeklyGoals — coverage goals', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('HF coverage: 130 cards × 10 attempts ÷ 4 weeks = 325 weekly attempts', async () => {
    const monthly = buildMonthly({
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      targetValue: 130,
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(325);
    expect(weekly.targetUnit).toBe('attempts');
  });

  it('Shapes coverage uses 3 attempts/item (procedural threshold)', async () => {
    const monthly = buildMonthly({
      targetMetric: 'shapes_coverage_at_acquired',
      targetValue: 24,
      relatedModules: ['shapes-and-patterns'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    // 24 items × 3 attempts/item = 72 monthly → 72/4 = 18 weekly
    expect(weekly.targetValue).toBe(18);
    expect(weekly.targetUnit).toBe('attempts');
  });

  it('subtracts HF attempts already logged in prior weeks', async () => {
    // Monthly started 7 days before this weekStart. Log 50 HF attempts
    // in the prior week. Remaining: 1300 − 50 = 1250, weeks remaining
    // from this weekStart: ceil(21/7) = 3 → ceil(1250/3) = 417.
    const monthly = buildMonthly({
      targetValue: 130,
      startDate: WEEK_START - 7 * ONE_DAY,
      targetDate: WEEK_START + 21 * ONE_DAY,
    });
    const priorWeekTime = WEEK_START - 3 * ONE_DAY;
    const records: Array<Omit<AttemptRecord, 'id'>> = [];
    for (let i = 0; i < 50; i++) {
      records.push({
        moduleId: 'harmonic-fluency',
        itemId: `card-${i}`,
        correct: true,
        timestamp: priorWeekTime,
      });
    }
    for (const r of records) await db.attempts.add(r);

    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(417);
  });
});

describe('deriveWeeklyGoals — consistency goals (direct passthrough)', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('production hours/cadence: weekly = monthly cadence value', async () => {
    const monthly = buildMonthly({
      targetMetric: 'production_hours_per_cadence',
      targetValue: 1,
      targetUnit: 'hours',
      relatedModules: ['production'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(1);
    expect(weekly.targetUnit).toBe('hours');
  });

  it('practice consistency days/week: weekly = monthly target', async () => {
    const monthly = buildMonthly({
      targetMetric: 'practice_aspiration_days_per_week',
      targetValue: 6,
      targetUnit: 'days',
      relatedModules: ['practice-consistency'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(6);
    expect(weekly.targetUnit).toBe('days');
  });

  it('repertoire sessions/cadence: weekly = monthly cadence value', async () => {
    const monthly = buildMonthly({
      targetMetric: 'repertoire_sessions_per_cadence',
      targetValue: 3,
      targetUnit: 'sessions',
      relatedModules: ['repertoire'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(3);
    expect(weekly.targetUnit).toBe('sessions');
  });

  it('does NOT prorate consistency goals on mid-week creation', async () => {
    // Even when a consistency goal is created mid-week, the cadence
    // value passes through verbatim — "1 hour/week" is a weekly
    // commitment regardless of when in the week the user committed.
    const thursday = WEEK_START + 4 * ONE_DAY;
    const monthly = buildMonthly({
      targetMetric: 'production_hours_per_cadence',
      targetValue: 2,
      targetUnit: 'hours',
      startDate: thursday,
      relatedModules: ['production'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, thursday);
    expect(weekly.targetValue).toBe(2);
  });
});

describe('deriveWeeklyGoals — song goals', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('emits 1 session/week per song goal', async () => {
    const songGoal = buildMonthly({
      targetMetric: 'song_whole_at_level',
      targetUnit: 'comfortable',
      targetValue: null,
      relatedModules: ['repertoire'],
      relatedItems: ['song-abc'],
    });
    const [weekly] = await deriveWeeklyGoals([songGoal], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(1);
    expect(weekly.targetUnit).toBe('sessions');
  });
});

describe('deriveWeeklyGoals — production completion goals', () => {
  beforeEach(async () => {
    await db.spacingState.clear();
  });

  it('production_lessons_count: 8 lessons / 4 weeks = 2 weekly', async () => {
    const monthly = buildMonthly({
      targetMetric: 'production_lessons_count',
      targetValue: 8,
      targetUnit: 'lessons',
      relatedModules: ['production'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(2);
    expect(weekly.targetUnit).toBe('lessons');
  });

  it('production_path_completion routes through completion kind', async () => {
    const monthly = buildMonthly({
      targetMetric: 'production_path_completion',
      targetValue: 12,
      targetUnit: 'lessons',
      relatedModules: ['production'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(weekly.targetValue).toBe(3);
    expect(weekly.targetUnit).toBe('lessons');
  });
});

describe('deriveWeeklyGoals — record shape', () => {
  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('builds a complete weekly Goal record with proper field values', async () => {
    const monthly = buildMonthly({
      id: 'parent-monthly-id',
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      targetValue: 130,
      contextTag: 'keys',
      relatedModules: ['harmonic-fluency'],
      relatedItems: ['custom-1'],
    });
    const [weekly] = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);

    expect(weekly.scope).toBe('weekly');
    expect(weekly.parentGoalId).toBe('parent-monthly-id');
    expect(weekly.contributesNumericallyToParent).toBe(true);
    expect(weekly.isUmbrella).toBe(false);
    expect(weekly.status).toBe('active');
    expect(weekly.startDate).toBe(WEEK_START);
    expect(weekly.targetDate).toBe(WEEK_END);
    expect(weekly.currentValue).toBe(0);
    expect(weekly.lastEngagedAt).toBeNull();
    expect(weekly.targetMetric).toBe('harmonic_fluency_coverage_at_acquired');
    expect(weekly.contextTag).toBe('keys');
    expect(weekly.relatedModules).toEqual(['harmonic-fluency']);
    expect(weekly.relatedItems).toEqual(['custom-1']);
    expect(weekly.description).toContain('Harmonic Fluency');
    expect(weekly.description).toContain('325');
    expect(weekly.description).toContain('attempts');
    expect(typeof weekly.id).toBe('string');
    expect(weekly.id).not.toBe('parent-monthly-id');
  });

  it('produces independent Goal records for multiple monthly goals', async () => {
    const hf = buildMonthly({
      id: 'hf-monthly',
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      targetValue: 40,
    });
    const consistency = buildMonthly({
      id: 'pc-monthly',
      targetMetric: 'practice_aspiration_days_per_week',
      targetValue: 5,
      targetUnit: 'days',
      relatedModules: ['practice-consistency'],
    });

    const out = await deriveWeeklyGoals([hf, consistency], WEEK_START, WEEK_START);
    expect(out).toHaveLength(2);
    expect(out.map(g => g.parentGoalId).sort()).toEqual(['hf-monthly', 'pc-monthly']);
    expect(out.every(g => g.scope === 'weekly')).toBe(true);
  });

  it('drops weekly records whose computed target is 0 (monthly already met)', async () => {
    // Coverage / completion uses getAttemptsInRange, not currentValue.
    // Production source is spacingState performanceHistory — log enough
    // entries so attemptsSoFar exceeds the monthly target.
    const monthly = buildMonthly({
      targetMetric: 'production_lessons_count',
      targetValue: 8,
      relatedModules: ['production'],
      startDate: WEEK_START - 7 * ONE_DAY,
    });
    const priorWeekTime = WEEK_START - 3 * ONE_DAY;
    await db.spacingState.add({
      id: 'spacing-overshoot',
      itemRef: 'lesson-overshoot',
      moduleRef: 'production',
      memoryType: 'integration',
      acquisitionStage: 'mastered',
      currentIntervalDays: 0,
      lastEngagedAt: priorWeekTime,
      nextDueAt: null,
      performanceHistory: Array.from({ length: 10 }, () => ({
        t: priorWeekTime,
        kind: 'state-change',
      })),
    });

    const out = await deriveWeeklyGoals([monthly], WEEK_START, WEEK_START);
    expect(out).toHaveLength(0);
  });
});
