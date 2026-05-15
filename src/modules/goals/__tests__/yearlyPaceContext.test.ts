// @vitest-environment jsdom
/**
 * Phase B Step 9c — yearly-pace + consequence math tests.
 *
 * Pure-input tests: feed `computeYearlyPaceContext` a hand-built
 * inputs bundle and pin every output number against the design-doc
 * formulas. The async loader (`loadYearlyPaceContext`) is integration-
 * tested separately once Part D wires it into the UI.
 */
import { describe, expect, it } from 'vitest';
import {
  computeYearlyPaceContext,
  monthsRemainingInYear,
} from '../yearlyPaceContext';
import type { YearlyPaceInputs } from '../yearlyPaceContext';
import type { Goal } from '../../../lib/db';

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: partial.id ?? `g-${Math.random().toString(36).slice(2, 8)}`,
    scope: partial.scope ?? 'monthly',
    description: partial.description ?? '',
    targetMetric: partial.targetMetric ?? null,
    targetValue: partial.targetValue ?? 0,
    targetUnit: partial.targetUnit ?? null,
    currentValue: partial.currentValue ?? 0,
    contextTag: partial.contextTag ?? null,
    relatedModules: partial.relatedModules ?? [],
    relatedItems: partial.relatedItems ?? [],
    startDate: partial.startDate ?? 0,
    targetDate: partial.targetDate ?? 0,
    status: partial.status ?? 'active',
    parentGoalId: partial.parentGoalId ?? null,
    contributesNumericallyToParent: partial.contributesNumericallyToParent ?? false,
    isUmbrella: partial.isUmbrella ?? false,
    lastEngagedAt: partial.lastEngagedAt ?? null,
  };
}

const MAY_15_2026 = new Date(2026, 4, 15).getTime();   // month index 4 = May
const DEC_31_2026 = new Date(2026, 11, 31).getTime();
const JAN_1_2026 = new Date(2026, 0, 1).getTime();

// =====================================================================
// monthsRemainingInYear
// =====================================================================

describe('monthsRemainingInYear', () => {
  it('Jan = 12, May = 8, Dec = 1 (current month included)', () => {
    expect(monthsRemainingInYear(JAN_1_2026)).toBe(12);
    expect(monthsRemainingInYear(MAY_15_2026)).toBe(8);
    expect(monthsRemainingInYear(DEC_31_2026)).toBe(1);
  });
});

// =====================================================================
// hidden state (no yearly anchor)
// =====================================================================

describe('computeYearlyPaceContext — hidden', () => {
  it('returns { kind: "hidden" } when no yearly anchor is active', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: null,
      coveredSoFar: 0,
      currentMonthlyGoal: null,
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
    });
    expect(r).toEqual({ kind: 'hidden', reason: 'no-yearly-anchor' });
  });
});

// =====================================================================
// Standard mid-year case
// =====================================================================

describe('computeYearlyPaceContext — standard mid-year', () => {
  function baseInputs(overrides: Partial<YearlyPaceInputs> = {}): YearlyPaceInputs {
    return {
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({
        id: 'anchor', scope: 'yearly', isUmbrella: true,
        targetValue: 143, relatedModules: ['harmonic-fluency'],
      }),
      coveredSoFar: 47,
      currentMonthlyGoal: mkGoal({
        id: 'may', scope: 'monthly',
        targetMetric: 'harmonic_fluency_coverage_at_acquired_specific',
        targetValue: 15, relatedModules: ['harmonic-fluency'],
      }),
      currentMonthlyCovered: 5,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
      ...overrides,
    };
  }

  it('yearly pace = (143 − 47) ÷ 8 months remaining = 12', () => {
    const r = computeYearlyPaceContext(baseInputs());
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.yearlyTotal).toBe(143);
    expect(r.coveredSoFar).toBe(47);
    expect(r.monthsRemainingInYear).toBe(8);
    expect(r.yearlyPaceMonthly).toBe(12);
  });

  it('time-per-day = (15 target × 0.5 min/attempt) ÷ 5 days = 1.5 min/day', () => {
    // HF seed = 30 s/attempt = 0.5 min. 15 × 0.5 = 7.5 min/week
    // ÷ 5 days = 1.5 min/day.
    const r = computeYearlyPaceContext(baseInputs());
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.timePerDayMinutes).toBe(1.5);
  });

  it('consequence = (47 + 15×8) ÷ 143 × 100 = round(116.78…) = 117%', () => {
    const r = computeYearlyPaceContext(baseInputs());
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.consequencePct).toBe(117);
  });

  it('affirmative = true when currentTarget (15) ≥ yearlyPace (12)', () => {
    const r = computeYearlyPaceContext(baseInputs());
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.affirmative).toBe(true);
  });

  it('affirmative = false when currentTarget falls below yearlyPace', () => {
    const r = computeYearlyPaceContext(baseInputs({
      currentMonthlyGoal: mkGoal({
        targetValue: 10, // less than yearly pace of 12
      }),
    }));
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.affirmative).toBe(false);
  });
});

// =====================================================================
// Edge cases
// =====================================================================

describe('computeYearlyPaceContext — edge cases', () => {
  it('over-anchor (covered > total) → yearlyPaceMonthly clamps to 0', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({ targetValue: 100 }),
      coveredSoFar: 120,
      currentMonthlyGoal: null,
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.yearlyPaceMonthly).toBe(0);
    // affirmative requires yearlyPace > 0 — over-anchor isn't
    // "affirmative" because the panel has nothing to confirm.
    expect(r.affirmative).toBe(false);
  });

  it('December → divides by 1 (current month still in play)', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({ targetValue: 50 }),
      coveredSoFar: 40,
      currentMonthlyGoal: mkGoal({ targetValue: 10 }),
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: DEC_31_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.monthsRemainingInYear).toBe(1);
    expect(r.yearlyPaceMonthly).toBe(10);
    expect(r.affirmative).toBe(true);
    // Consequence: (40 + 10×1) / 50 × 100 = 100%.
    expect(r.consequencePct).toBe(100);
  });

  it('no consistency goal → timePerDayMinutes is null', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({ targetValue: 100 }),
      coveredSoFar: 0,
      currentMonthlyGoal: mkGoal({ targetValue: 10 }),
      currentMonthlyCovered: 0,
      consistencyTargetDays: 0,
      today: MAY_15_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.timePerDayMinutes).toBeNull();
  });

  it('no monthly goal → currentScopeTarget = 0, consequence = covered%', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({ targetValue: 100 }),
      coveredSoFar: 30,
      currentMonthlyGoal: null,
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.currentScopeTarget).toBe(0);
    // Projected = 30 + 0×8 = 30. 30/100 = 30%.
    expect(r.consequencePct).toBe(30);
    expect(r.affirmative).toBe(false);
  });

  it('consequence caps at 200% (an over-ambitious target doesn\'t render 4000%)', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({ targetValue: 50 }),
      coveredSoFar: 0,
      currentMonthlyGoal: mkGoal({ targetValue: 100 }),
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    // Raw = (0 + 100×8) / 50 × 100 = 1600%. Capped to 200.
    expect(r.consequencePct).toBe(200);
  });

  it('zero yearlyTotal → consequence = 0 (no divide-by-zero)', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      yearlyAnchor: mkGoal({ targetValue: 0 }),
      coveredSoFar: 0,
      currentMonthlyGoal: mkGoal({ targetValue: 10 }),
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.consequencePct).toBe(0);
  });

  it('honors module-specific minutes-per-attempt seeds (S&P uses ~1.67 min/rep)', () => {
    const r = computeYearlyPaceContext({
      moduleId: 'shapes-and-patterns',
      yearlyAnchor: mkGoal({ targetValue: 100 }),
      coveredSoFar: 0,
      currentMonthlyGoal: mkGoal({ targetValue: 10 }),
      currentMonthlyCovered: 0,
      consistencyTargetDays: 5,
      today: MAY_15_2026,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    // 10 × 1.67 = 16.7 min ÷ 5 days = 3.34, rounded to 3.3.
    expect(r.timePerDayMinutes).toBe(3.3);
  });
});
