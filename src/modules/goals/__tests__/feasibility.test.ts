// @vitest-environment jsdom
/**
 * Phase 2 step 7a — `getGoalFeasibility` helper tests.
 *
 * Covers:
 *   - Aspirational scopes return a motivational placeholder
 *   - Coverage-goal projection math: on_track / at_risk /
 *     critical / unrecoverable boundaries
 *   - Threshold edges (≥ target, exactly 85% target, exactly
 *     doubling-reaches-target)
 *   - Deadline passed: unrecoverable when target unmet,
 *     on_track when already met
 *   - Recommendation strings contain real numbers (projected,
 *     target, date, weekly items needed) — no template-only
 *     phrases
 *   - Default day-profile mix kicks in when caller omits it
 *   - Custom mix overrides default (and changes status when
 *     pace is altered)
 *
 * Pure-function tests — no Dexie. Coverage metric routing is
 * exercised end-to-end via the real metric ids; non-coverage
 * metrics fall through to 'unknown' (handled in step 7b).
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  getGoalFeasibility,
  ASPIRATIONAL_PLACEHOLDERS,
  AT_RISK_RATIO,
  DEFAULT_DAY_PROFILE_MIX,
} from '../progress';

const TODAY = new Date(2026, 3, 30, 12); // April 30 2026, noon
const DEC_31 = new Date(2026, 11, 31).getTime();
const DAY = 86_400_000;

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'yearly',
    description: '',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: TODAY.getTime() - 30 * DAY,
    targetDate: DEC_31,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

// ── Aspirational scopes ──────────────────────────────────────

describe('aspirational scopes', () => {
  it('returns a placeholder kind for lifetime goals', () => {
    const out = getGoalFeasibility(
      mkGoal({ scope: 'lifetime' }),
      { currentValue: 0, today: TODAY },
    );
    expect(out.kind).toBe('aspirational');
    if (out.kind === 'aspirational') {
      expect(ASPIRATIONAL_PLACEHOLDERS).toContain(out.message);
    }
  });

  it('returns a placeholder kind for two_to_three_year goals', () => {
    const out = getGoalFeasibility(
      mkGoal({ scope: 'two_to_three_year' }),
      { currentValue: 0, today: TODAY },
    );
    expect(out.kind).toBe('aspirational');
  });

  it('returns one of the five canonical placeholder strings', () => {
    expect(ASPIRATIONAL_PLACEHOLDERS).toHaveLength(5);
    const out = getGoalFeasibility(
      mkGoal({ id: 'g-aspire', scope: 'lifetime' }),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'aspirational') {
      expect(ASPIRATIONAL_PLACEHOLDERS).toContain(out.message);
    }
  });

  it('seeds the placeholder by goal.id — same goal, same phrase across renders', () => {
    const goal = mkGoal({ id: 'g-stable', scope: 'lifetime' });
    const ctx = { currentValue: 0, today: TODAY };
    const a = getGoalFeasibility(goal, ctx);
    const b = getGoalFeasibility(goal, ctx);
    const c = getGoalFeasibility(goal, ctx);
    if (a.kind === 'aspirational' && b.kind === 'aspirational' && c.kind === 'aspirational') {
      expect(a.message).toBe(b.message);
      expect(b.message).toBe(c.message);
    }
  });

  it('different goal ids can land on different placeholders', () => {
    // The hash distributes across the 5-element pool. We don't
    // require every id to differ (collisions exist in any hash)
    // but at least two of these specific ids should diverge.
    const ids = ['g-1', 'g-2', 'g-3', 'g-4', 'g-5', 'g-6', 'g-7', 'g-8'];
    const messages = new Set<string>();
    for (const id of ids) {
      const out = getGoalFeasibility(
        mkGoal({ id, scope: 'lifetime' }),
        { currentValue: 0, today: TODAY },
      );
      if (out.kind === 'aspirational') messages.add(out.message);
    }
    expect(messages.size).toBeGreaterThan(1);
  });
});

// ── Routing: unknown / non-coverage ──────────────────────────

describe('routing — non-coverage metrics fall through', () => {
  it('returns unknown when no metric is set', () => {
    const out = getGoalFeasibility(
      mkGoal({ scope: 'yearly', targetMetric: null }),
      { currentValue: 0, today: TODAY },
    );
    expect(out.kind).toBe('unknown');
  });

  it('returns unknown for item-count metrics (deferred — needs per-module rate data)', () => {
    const out = getGoalFeasibility(
      mkGoal({
        scope: 'yearly',
        targetMetric: 'song_whole_at_level',
        targetValue: 25,
        targetUnit: 'comfortable',
      }),
      { currentValue: 8, today: TODAY },
    );
    expect(out.kind).toBe('unknown');
  });
});

// ── Accuracy branch ──────────────────────────────────────────

describe('accuracy goals — gap + critical-window status', () => {
  // Yearly goal startDate roughly Jan 1 2026 (full-year period).
  // TODAY (Apr 30) is well outside the last 20% (≈Oct 19).
  const YEARLY_START = new Date(2026, 0, 1).getTime();

  function yearlyAccuracyGoal(target: number, targetDate: number): Goal {
    return mkGoal({
      scope: 'yearly',
      targetMetric: 'ear_training_accuracy_overall',
      targetValue: target,
      startDate: YEARLY_START,
      targetDate,
    });
  }

  it('on_track when current accuracy meets or exceeds target', () => {
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, DEC_31),
      { currentValue: 87, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });

  it('at_risk when within 5 points and outside the critical window', () => {
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, DEC_31),
      { currentValue: 82, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('at_risk');
  });

  it('at_risk when gap > 5pp BUT outside the critical window (lots of period left)', () => {
    // Apr 30 of a Jan 1–Dec 31 period: ~245 days remaining of
    // 365. Far outside the last 20% (~73 days). Gap-only
    // wouldn't recover, but time pressure isn't yet on.
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, DEC_31),
      { currentValue: 60, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('at_risk');
  });

  it('critical when gap > 5pp AND inside the critical window', () => {
    // 30-day period ending in 5 days → in the last 20%.
    // Gap of 10pp + late-stage time pressure → critical.
    const periodStart = TODAY.getTime() - 25 * DAY;
    const periodEnd = TODAY.getTime() + 5 * DAY;
    const out = getGoalFeasibility(
      mkGoal({
        scope: 'monthly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
        startDate: periodStart,
        targetDate: periodEnd,
      }),
      { currentValue: 75, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('critical');
  });

  it('at_risk when in critical window BUT gap ≤ 5pp', () => {
    // Late stage but small gap — still at_risk, not critical.
    const periodStart = TODAY.getTime() - 25 * DAY;
    const periodEnd = TODAY.getTime() + 5 * DAY;
    const out = getGoalFeasibility(
      mkGoal({
        scope: 'monthly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
        startDate: periodStart,
        targetDate: periodEnd,
      }),
      { currentValue: 82, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('at_risk');
  });

  it('unrecoverable when deadline passed and target unmet (regardless of gap)', () => {
    const yesterday = TODAY.getTime() - DAY;
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, yesterday),
      { currentValue: 80, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('unrecoverable');
  });

  it('on_track even when deadline passed if current ≥ target', () => {
    const yesterday = TODAY.getTime() - DAY;
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, yesterday),
      { currentValue: 87, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });

  it('critical recommendation surfaces days-remaining + gap up front', () => {
    const periodStart = TODAY.getTime() - 25 * DAY;
    const periodEnd = TODAY.getTime() + 5 * DAY;
    const out = getGoalFeasibility(
      mkGoal({
        scope: 'monthly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
        startDate: periodStart,
        targetDate: periodEnd,
      }),
      { currentValue: 75, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.status).toBe('critical');
      expect(out.recommendation).toMatch(/^\d+ days? left to close a \d+-point gap\./);
      expect(out.recommendation).toMatch(/Keep practicing to close the gap/);
    }
  });

  it('at_risk recommendation states the gap', () => {
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, DEC_31),
      { currentValue: 75, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.status).toBe('at_risk');
      expect(out.recommendation).toMatch(/75%/);
      expect(out.recommendation).toMatch(/85%/);
      expect(out.recommendation).toMatch(/10 points below/);
    }
  });

  it('unrecoverable recommendation acknowledges deadline passed', () => {
    const yesterday = TODAY.getTime() - DAY;
    const out = getGoalFeasibility(
      yearlyAccuracyGoal(85, yesterday),
      { currentValue: 60, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/Deadline passed/);
      expect(out.recommendation).toMatch(/reached 60%/);
      expect(out.recommendation).toMatch(/target was 85%/);
    }
  });
});

// ── Consistency branch ───────────────────────────────────────

function weeklyConsistencyGoal(
  target: number,
  startDate: number,
  targetDate: number,
): Goal {
  return mkGoal({
    scope: 'weekly',
    targetMetric: 'ear_training_sessions_per_week',
    targetValue: target,
    startDate,
    targetDate,
  });
}

describe('consistency goals — pace-ratio + remaining-day feasibility', () => {
  // Period: Mon Apr 27 → Tue May 5 2026 (8 days). TODAY is Thu
  // Apr 30 noon → daysPassed = 4 (ceil), daysRemaining = 4.
  const PERIOD_START = new Date(2026, 3, 27).getTime();
  const PERIOD_END = new Date(2026, 4, 5).getTime();

  it('on_track when current already meets target', () => {
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, PERIOD_START, PERIOD_END),
      { currentValue: 4, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });

  it('on_track when ahead of expected pace', () => {
    // expectedSoFar = 4 × 4/8 = 2; current 3 → ratio 1.5.
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, PERIOD_START, PERIOD_END),
      { currentValue: 3, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });

  it('at_risk when slightly behind pace', () => {
    // 20-day period (Apr 20 → May 10), TODAY = Apr 30 noon →
    // daysPassed = 11, daysTotal = 20. target 20, current 10
    // → expectedSoFar = 11, ratio = 10/11 = 0.91 → at_risk.
    const start = new Date(2026, 3, 20).getTime();
    const end = new Date(2026, 4, 10).getTime();
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(20, start, end),
      { currentValue: 10, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('at_risk');
  });

  it('critical when behind pace but remaining sessions still fit remaining days', () => {
    // 8-day period, daysPassed=4, daysRemaining=4. target 4,
    // current 0 → ratio 0, sessionsRemaining=4 ≤ 4 → critical.
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, PERIOD_START, PERIOD_END),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('critical');
  });

  it('unrecoverable when remaining sessions cannot fit remaining days', () => {
    // TODAY → Sat May 2 noon → daysPassed=6, daysRemaining=2.
    // target 4, current 0: need 4 in 2 days → unrecoverable.
    const may2 = new Date(2026, 4, 2, 12);
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, PERIOD_START, PERIOD_END),
      { currentValue: 0, today: may2 },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('unrecoverable');
  });

  it('unrecoverable when deadline passed and target unmet', () => {
    const past = new Date(2026, 3, 1).getTime();   // Apr 1
    const past2 = new Date(2026, 3, 8).getTime();  // Apr 8
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, past, past2),
      { currentValue: 2, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('unrecoverable');
  });

  it('critical recommendation specifies sessions and days', () => {
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, PERIOD_START, PERIOD_END),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/Need 4 more sessions in the next 4 days/);
    }
  });

  it('critical singular case reads "today" instead of "in the next 1 day"', () => {
    // May 3 noon → daysPassed=ceil(6.5)=7, daysRemaining=1.
    // target=2, current=1 → 1 session needed today.
    const may3 = new Date(2026, 4, 3, 12);
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(2, PERIOD_START, PERIOD_END),
      { currentValue: 1, today: may3 },
    );
    if (out.kind === 'measurable') {
      expect(out.recommendation).toBe(
        'Need 1 more session today to stay on track.',
      );
    }
  });

  it('unrecoverable (future deadline) shows sessions-per-day needed instead of "won\'t fit"', () => {
    const may2 = new Date(2026, 4, 2, 12);
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, PERIOD_START, PERIOD_END),
      { currentValue: 0, today: may2 },
    );
    if (out.kind === 'measurable') {
      expect(out.status).toBe('unrecoverable');
      // 4 sessions / 2 days = 2 sessions per day
      expect(out.recommendation).toMatch(/you'd need 2 sessions per day/);
      expect(out.recommendation).not.toMatch(/won't fit/);
    }
  });

  it('deadline-passed recommendation uses "X of Y sessions" prose (no bare fraction)', () => {
    const past = new Date(2026, 3, 1).getTime();
    const past2 = new Date(2026, 3, 8).getTime();
    const out = getGoalFeasibility(
      weeklyConsistencyGoal(4, past, past2),
      { currentValue: 2, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/Deadline passed — reached 2 of 4 sessions\./);
      expect(out.recommendation).not.toMatch(/2\/4/);
    }
  });
});

// ── Coverage-goal status tiers ───────────────────────────────

/**
 * Helper to construct an ET coverage goal that lands in a
 * specific status tier given a target and currentValue. ET
 * default mix pace = 3*30 + 1*50 + 1*10 = 150 items/week.
 */
function etCoverageGoal(target: number, targetDate: number): Goal {
  return mkGoal({
    scope: 'yearly',
    targetMetric: 'ear_training_coverage_at_acquired',
    targetValue: target,
    targetDate,
  });
}

describe('coverage status tiers (ET, default mix = 150 items/week)', () => {
  it('on_track when current already meets target', () => {
    const out = getGoalFeasibility(
      etCoverageGoal(143, DEC_31),
      { currentValue: 143, today: TODAY },
    );
    expect(out.kind).toBe('measurable');
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });

  it('on_track when projection comfortably exceeds target', () => {
    // 35 weeks remaining × 150 = 5250 → projected 5250 vs target 143.
    const out = getGoalFeasibility(
      etCoverageGoal(143, DEC_31),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });

  it('at_risk when projected lands between 85% and 100% of target', () => {
    // 6 weeks × default ET pace 150 = 900 items.
    // currentValue 0, target 1000 → projected 900 = 90% target.
    // Above AT_RISK_RATIO (0.85), below target → at_risk.
    const sixWeeksOut = TODAY.getTime() + 42 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(1000, sixWeeksOut),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('at_risk');
  });

  it('at_risk on a near-deadline goal where existing progress lands ≥ 85%', () => {
    // Deadline tomorrow, single light session worth of pace
    // accrues. currentValue 86 + projected pace ≈ 87 → 86% of
    // 100 → at_risk (not unrecoverable, since deadline > 0).
    const tomorrow = TODAY.getTime() + 1 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, tomorrow),
      {
        currentValue: 86,
        today: TODAY,
        mix: { standard: 0, deep: 0, light: 1 }, // ~1 item over 1 day
      },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('at_risk');
  });

  it('critical when projected < 85% and doubling pace would reach', () => {
    // Single week remaining, mix produces 50 items in that
    // week, target 100. projected=50 (50%) < 85%, doubled=100 ≥
    // target → critical.
    const oneWeekOut = TODAY.getTime() + 7 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, oneWeekOut),
      {
        currentValue: 0,
        today: TODAY,
        // Mix yields 50 ET items/week:
        // standard=1 (30) + light=2 (20) = 50.
        mix: { standard: 1, light: 2, deep: 0 },
      },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('critical');
  });

  it('unrecoverable when even doubling pace would not reach target', () => {
    // 1 week remaining, mix yields 20 items/week, target 100.
    // projected=20 (20%), doubled=40 (40%) — both < target.
    const oneWeekOut = TODAY.getTime() + 7 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, oneWeekOut),
      {
        currentValue: 0,
        today: TODAY,
        mix: { standard: 0, deep: 0, light: 2 }, // 2*10 = 20
      },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('unrecoverable');
  });

  it('unrecoverable when deadline has already passed and target unmet', () => {
    const yesterday = TODAY.getTime() - 1 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, yesterday),
      { currentValue: 50, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('unrecoverable');
  });

  it('on_track when deadline passed but target was already met', () => {
    const yesterday = TODAY.getTime() - 1 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, yesterday),
      { currentValue: 100, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
  });
});

// ── Recommendations contain real numbers ────────────────────

describe('recommendations are calculated, not templated', () => {
  it('on_track recommendation frames around target only (no inverted X/Y)', () => {
    const out = getGoalFeasibility(
      etCoverageGoal(143, DEC_31),
      { currentValue: 50, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/On pace/i);
      expect(out.recommendation).toMatch(/all 143 cards/);
      expect(out.recommendation).not.toMatch(/\d+\/\d+/);
    }
  });

  it('at_risk recommendation uses prose "X of Y cards" form for ET', () => {
    const sixWeeksOut = TODAY.getTime() + 42 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(1000, sixWeeksOut),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.status).toBe('at_risk');
      expect(out.recommendation).toMatch(/projected to cover \d+ of 1000 cards/);
    }
  });

  it('unrecoverable (future deadline) uses "Even at full pace" + module unit', () => {
    const oneWeekOut = TODAY.getTime() + 7 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(500, oneWeekOut),
      {
        currentValue: 0,
        today: TODAY,
        mix: { standard: 0, deep: 0, light: 1 }, // 10/week, well below
      },
    );
    if (out.kind === 'measurable') {
      expect(out.status).toBe('unrecoverable');
      expect(out.recommendation).toMatch(/Even at full pace/);
      expect(out.recommendation).toMatch(/of 500 cards/);
    }
  });

  it('coverage strings use "shapes" for Shapes & Patterns (not the activity unit "minutes")', () => {
    // Activity unit for Shapes is "minutes" (what you do per
    // session) but the COVERAGE unit is "shapes" (what's being
    // counted toward the target). The two diverge here — pin
    // the coverage unit explicitly.
    const oneWeekOut = TODAY.getTime() + 7 * DAY;
    const goal = mkGoal({
      scope: 'yearly',
      targetMetric: 'shapes_coverage_at_acquired',
      targetValue: 408,
      targetDate: oneWeekOut,
    });
    const out = getGoalFeasibility(goal, {
      currentValue: 0,
      today: TODAY,
      mix: { standard: 0, deep: 0, light: 1 }, // sparse → unrecoverable
    });
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/of 408 shapes/);
      expect(out.recommendation).not.toMatch(/minutes/);
    }
  });

  it('coverage strings use "lessons" for Production', () => {
    const oneWeekOut = TODAY.getTime() + 7 * DAY;
    const goal = mkGoal({
      scope: 'yearly',
      targetMetric: 'production_coverage_at_acquired',
      targetValue: 56,
      targetDate: oneWeekOut,
    });
    const out = getGoalFeasibility(goal, {
      currentValue: 0,
      today: TODAY,
      mix: { standard: 0, deep: 0, light: 1 },
    });
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/of 56 lessons/);
      expect(out.recommendation).not.toMatch(/minutes/);
    }
  });

  it('coverageUnitForModule returns the right noun per module', async () => {
    // Tiny pin-the-mapping test so a future rename surfaces in
    // a single place rather than scattered string assertions.
    const { coverageUnitForModule } = await import('../progress');
    expect(coverageUnitForModule('ear-training')).toBe('cards');
    expect(coverageUnitForModule('harmonic-fluency')).toBe('cards');
    expect(coverageUnitForModule('shapes-and-patterns')).toBe('shapes');
    expect(coverageUnitForModule('repertoire')).toBe('songs');
    expect(coverageUnitForModule('production')).toBe('lessons');
    expect(coverageUnitForModule('practice-consistency')).toBe('sessions');
  });

  it('critical recommendation includes weekly items needed', () => {
    const oneWeekOut = TODAY.getTime() + 7 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, oneWeekOut),
      {
        currentValue: 0,
        today: TODAY,
        mix: { standard: 1, light: 2, deep: 0 }, // critical
      },
    );
    if (out.kind === 'measurable') {
      expect(out.status).toBe('critical');
      // "Need about N cards per week" — module unit replaces
      // generic "items".
      expect(out.recommendation).toMatch(/Need about \d+ cards per week/);
      expect(out.recommendation).toMatch(/100/);
    }
  });

  it('unrecoverable (deadline passed) recommendation uses "X of Y unit" prose', () => {
    const yesterday = TODAY.getTime() - 1 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, yesterday),
      { currentValue: 47, today: TODAY },
    );
    if (out.kind === 'measurable') {
      expect(out.recommendation).toMatch(/47 of 100 cards/);
      expect(out.recommendation).toMatch(/Deadline passed/i);
      expect(out.recommendation).not.toMatch(/47\/100/);
    }
  });
});

// ── Day profile mix wiring ───────────────────────────────────

describe('day-profile mix', () => {
  it('uses DEFAULT_DAY_PROFILE_MIX when ctx.mix is omitted', () => {
    // 2 weeks remaining, default mix yields 150 ET items/week →
    // projected ~300, target 100 → on_track.
    const twoWeeksOut = TODAY.getTime() + 14 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, twoWeeksOut),
      { currentValue: 0, today: TODAY },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('on_track');
    expect(DEFAULT_DAY_PROFILE_MIX).toEqual({
      standard: 3,
      deep: 1,
      light: 1,
    });
  });

  it('respects a slow custom mix and downshifts the status', () => {
    // 2 weeks remaining, mix yields 10 ET items/week →
    // projected 20 vs target 100. Doubled 40 < 100 →
    // unrecoverable.
    const twoWeeksOut = TODAY.getTime() + 14 * DAY;
    const out = getGoalFeasibility(
      etCoverageGoal(100, twoWeeksOut),
      {
        currentValue: 0,
        today: TODAY,
        mix: { standard: 0, deep: 0, light: 1 }, // 10/week
      },
    );
    if (out.kind === 'measurable') expect(out.status).toBe('unrecoverable');
  });
});

// ── AT_RISK_RATIO is the documented constant ────────────────

describe('AT_RISK_RATIO', () => {
  it('is exported and equals 0.85 (sign-off in step 6h.2 review)', () => {
    expect(AT_RISK_RATIO).toBe(0.85);
  });
});
