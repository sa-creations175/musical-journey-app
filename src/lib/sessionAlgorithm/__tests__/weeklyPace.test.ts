/**
 * Phase 4 Step 4 — weeklyPace.ts unit tests.
 *
 * Pure helpers — no Dexie. Caller-supplied attempt counts +
 * fixture Goal records exercise every band + the behind-pace
 * notice threshold.
 */
import { describe, expect, it } from 'vitest';
import { evaluateWeeklyGoalPace, computeWeeklyPaceByModule } from '../weeklyPace';
import {
  PACE_FACTOR_BEHIND,
  PACE_FACTOR_SIGNIFICANTLY_BEHIND,
} from '../pace';
import type { Goal } from '../../db';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_START = new Date(2026, 2, 1, 0, 0, 0, 0).getTime(); // Sun Mar 1, 2026
const WEEK_END = new Date(2026, 2, 7, 23, 59, 59, 999).getTime();

function weeklyGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: 'wk-1',
    scope: 'weekly',
    description: 'HF weekly',
    targetMetric: null,
    targetValue: 100,
    targetUnit: 'attempts',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: WEEK_START,
    targetDate: WEEK_END,
    status: 'active',
    parentGoalId: 'parent-monthly',
    contributesNumericallyToParent: true,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

describe('evaluateWeeklyGoalPace — band + factor', () => {
  it('on pace returns factor near 1.0 and no notice', () => {
    // 51% of target with ~50% of week elapsed → ratio just above 1.0
    // → ahead band → factor 1.05. Using 51 (not 50) avoids a
    // floating-point boundary case where the week's period length
    // is 7 days minus 1ms (Sun 00:00 → Sat 23:59:59.999) and 50/50
    // rounds just under 1.0 into the at-risk band.
    const midweek = WEEK_START + 3.5 * MS_PER_DAY;
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 100 }),
      actualAttempts: 51,
      now: midweek,
    });
    expect(r).not.toBeNull();
    expect(r!.moduleId).toBe('harmonic-fluency');
    expect(r!.factor).toBeCloseTo(1.05, 2);
    expect(r!.notice).toBeNull();
  });

  it('significantly behind: ratio below 0.5 yields factor 2.0', () => {
    // Day 5 of 7, 10/100 attempts → expected ~71, ratio ~0.14 → significantly-behind
    const day5 = WEEK_START + 5 * MS_PER_DAY;
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 100 }),
      actualAttempts: 10,
      now: day5,
    });
    expect(r!.factor).toBe(PACE_FACTOR_SIGNIFICANTLY_BEHIND);
  });

  it('behind band: ratio in [0.5, 0.85) yields factor 1.6', () => {
    // Day 4 of 7, 30/100 → expected ~57, ratio ~0.52 → behind
    const day4 = WEEK_START + 4 * MS_PER_DAY;
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 100 }),
      actualAttempts: 30,
      now: day4,
    });
    expect(r!.factor).toBe(PACE_FACTOR_BEHIND);
  });
});

describe('evaluateWeeklyGoalPace — behind-pace notice threshold', () => {
  it('emits notice when actual < 50% of target AND > 2 days remain', () => {
    // Day 3 of 7 (~4 days remain), 20/100 attempts (20% of target)
    const day3 = WEEK_START + 3 * MS_PER_DAY;
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 100 }),
      actualAttempts: 20,
      now: day3,
    });
    expect(r!.notice).not.toBeNull();
    expect(r!.notice!.moduleId).toBe('harmonic-fluency');
    expect(r!.notice!.actual).toBe(20);
    expect(r!.notice!.target).toBe(100);
    expect(r!.notice!.daysRemaining).toBeGreaterThan(2);
  });

  it('suppresses notice when only 2 days remain (boundary excluded)', () => {
    // Day 6 of 7 — daysRemaining = 1 (< 2), no notice even though far behind
    const day6 = WEEK_START + 6 * MS_PER_DAY;
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 100 }),
      actualAttempts: 10,
      now: day6,
    });
    // Still has a factor boost (pace ratio is bad), but no user-facing notice.
    expect(r!.factor).toBe(PACE_FACTOR_SIGNIFICANTLY_BEHIND);
    expect(r!.notice).toBeNull();
  });

  it('suppresses notice when actual >= 50% of target', () => {
    // 50/100 = exactly 50% — boundary excluded (strict <)
    const day3 = WEEK_START + 3 * MS_PER_DAY;
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 100 }),
      actualAttempts: 50,
      now: day3,
    });
    expect(r!.notice).toBeNull();
  });
});

describe('evaluateWeeklyGoalPace — degenerate cases', () => {
  it('returns null for non-weekly goal scopes', () => {
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ scope: 'monthly' }),
      actualAttempts: 50,
      now: WEEK_START + MS_PER_DAY,
    });
    expect(r).toBeNull();
  });

  it('returns null for inactive goals', () => {
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ status: 'paused' }),
      actualAttempts: 50,
      now: WEEK_START + MS_PER_DAY,
    });
    expect(r).toBeNull();
  });

  it('returns null when targetValue is null or zero', () => {
    const r = evaluateWeeklyGoalPace({
      goal: weeklyGoal({ targetValue: 0 }),
      actualAttempts: 0,
      now: WEEK_START + MS_PER_DAY,
    });
    expect(r).toBeNull();
  });
});

describe('computeWeeklyPaceByModule — multi-goal aggregation', () => {
  it('builds per-module factor map and dedupes notices', () => {
    const hfGoal = weeklyGoal({
      id: 'hf',
      relatedModules: ['harmonic-fluency'],
      targetValue: 100,
    });
    const etGoal = weeklyGoal({
      id: 'et',
      relatedModules: ['ear-training'],
      targetValue: 50,
    });
    const day4 = WEEK_START + 4 * MS_PER_DAY;
    const result = computeWeeklyPaceByModule({
      weeklyGoals: [hfGoal, etGoal],
      attemptsByModule: new Map([
        ['harmonic-fluency', 10], // way behind
        ['ear-training', 30], // on pace
      ]),
      now: day4,
    });
    expect(result.factorByModule.get('harmonic-fluency')).toBe(
      PACE_FACTOR_SIGNIFICANTLY_BEHIND,
    );
    // ET 30/50 = 60%, day4 expected ~57% → ratio ~1.05 → 'ahead' band → factor 1.05
    expect(result.factorByModule.get('ear-training')).toBeCloseTo(1.05, 2);
    // Only HF qualifies for notice (>2 days left, < 50% of target)
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0].moduleId).toBe('harmonic-fluency');
  });

  it('MAX factor across multiple weekly goals for the same module', () => {
    const a = weeklyGoal({ id: 'a', relatedModules: ['harmonic-fluency'], targetValue: 100 });
    const b = weeklyGoal({ id: 'b', relatedModules: ['harmonic-fluency'], targetValue: 50 });
    const day4 = WEEK_START + 4 * MS_PER_DAY;
    const result = computeWeeklyPaceByModule({
      weeklyGoals: [a, b],
      attemptsByModule: new Map([['harmonic-fluency', 30]]),
      now: day4,
    });
    // a: 30/100 ratio ~0.52 → behind (1.6)
    // b: 30/50  ratio ~1.05 → ahead (1.05)
    // MAX wins → 1.6
    expect(result.factorByModule.get('harmonic-fluency')).toBe(PACE_FACTOR_BEHIND);
  });

  it('empty input → empty output', () => {
    const result = computeWeeklyPaceByModule({
      weeklyGoals: [],
      attemptsByModule: new Map(),
      now: WEEK_START,
    });
    expect(result.factorByModule.size).toBe(0);
    expect(result.notices).toEqual([]);
  });
});
