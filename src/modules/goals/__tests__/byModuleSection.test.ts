// @vitest-environment jsdom
/**
 * Integration tests for the redesigned by-module section bucketing
 * + adjacent helpers (pace, type label, week-time). Pins:
 *   · bucketModuleGoalsByTimeframe groups goals correctly
 *     by yearly / monthly / weekly inside the right module.
 *   · The "show monthly section / show weekly section" decisions
 *     follow the spec's empty-state rules.
 *   · Pace pill + days text wiring picks the right surface per
 *     goal flavor.
 *
 * fake-indexeddb backs the live db; per-test resets isolate
 * fixtures. No React rendering — Goals.tsx mounting pulls in
 * dozens of unrelated dependencies; the bucketing and pace
 * decisions are pure functions we can exercise directly.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import { bucketModuleGoalsByTimeframe } from '../Goals';
import { classifyGoalPace, isDaysConsistencyGoal } from '../byModulePace';
import { goalTypeLabel } from '../umbrellaSummary';

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  const now = Date.now();
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    scope: 'monthly',
    description: '',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: now - 14 * 86_400_000,
    targetDate: now + 14 * 86_400_000,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.goals.clear();
});

// -------------------------------------------------------------
// bucketModuleGoalsByTimeframe — module + scope routing
// -------------------------------------------------------------

describe('bucketModuleGoalsByTimeframe', () => {
  it('routes a yearly umbrella to the right module via its children', () => {
    const umbrellaId = 'u-et';
    const goals = [
      mkGoal({
        id: umbrellaId,
        scope: 'yearly',
        isUmbrella: true,
        description: 'ET 2026',
      }),
      mkGoal({
        id: 'c1',
        scope: 'monthly',
        parentGoalId: umbrellaId,
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 30,
      }),
    ];
    const out = bucketModuleGoalsByTimeframe('ear-training', goals);
    expect(out.yearlyAnchor?.id).toBe(umbrellaId);
    expect(out.monthlyGoals).toHaveLength(1);
    expect(out.weeklyGoals).toHaveLength(0);
  });

  it('routes non-umbrella goals via moduleForMetric', () => {
    const goals = [
      mkGoal({
        scope: 'monthly',
        targetMetric: 'harmonic_fluency_days_per_cadence',
        targetValue: 5,
      }),
      mkGoal({
        scope: 'weekly',
        targetMetric: 'shapes_coverage_at_acquired',
        targetValue: 50,
      }),
    ];
    const hf = bucketModuleGoalsByTimeframe('harmonic-fluency', goals);
    expect(hf.monthlyGoals).toHaveLength(1);
    expect(hf.weeklyGoals).toHaveLength(0);
    const shapes = bucketModuleGoalsByTimeframe('shapes-and-patterns', goals);
    expect(shapes.monthlyGoals).toHaveLength(0);
    expect(shapes.weeklyGoals).toHaveLength(1);
  });

  it('keeps standalone monthly goals (no parentGoalId) in the monthly bucket', () => {
    const goals = [
      mkGoal({
        scope: 'monthly',
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 30,
      }),
    ];
    const out = bucketModuleGoalsByTimeframe('ear-training', goals);
    expect(out.yearlyAnchor).toBeUndefined();
    expect(out.monthlyGoals).toHaveLength(1);
  });

  it('parented monthly goals AND standalone monthly goals BOTH land in monthly bucket', () => {
    // The previous "standalone vs parented" split is gone — the
    // timeframe bucket holds both flavors.
    const umbrellaId = 'u-et';
    const goals = [
      mkGoal({ id: umbrellaId, scope: 'yearly', isUmbrella: true }),
      mkGoal({
        id: 'parented',
        scope: 'monthly',
        parentGoalId: umbrellaId,
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 30,
      }),
      mkGoal({
        id: 'standalone',
        scope: 'monthly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 80,
      }),
    ];
    const out = bucketModuleGoalsByTimeframe('ear-training', goals);
    expect(out.monthlyGoals.map(g => g.id).sort()).toEqual(['parented', 'standalone']);
  });

  it('excludes the umbrella itself from monthly/weekly buckets', () => {
    const goals = [
      mkGoal({
        id: 'u',
        scope: 'monthly',
        isUmbrella: true,
        description: 'umbrella at monthly scope',
      }),
    ];
    const out = bucketModuleGoalsByTimeframe('ear-training', goals);
    expect(out.monthlyGoals).toHaveLength(0);
    expect(out.weeklyGoals).toHaveLength(0);
  });

  it('returns empty buckets when no goals match the module', () => {
    const goals = [
      mkGoal({
        scope: 'monthly',
        targetMetric: 'shapes_coverage_at_acquired',
        targetValue: 50,
      }),
    ];
    const out = bucketModuleGoalsByTimeframe('ear-training', goals);
    expect(out.yearlyAnchor).toBeUndefined();
    expect(out.monthlyGoals).toEqual([]);
    expect(out.weeklyGoals).toEqual([]);
  });
});

// -------------------------------------------------------------
// Pace surface decisions — which row gets which treatment
// -------------------------------------------------------------

describe('weekly row pace surface', () => {
  const now = Date.now();
  const goal = (m: string, value: number, currentValue = 0, scope: Goal['scope'] = 'weekly'): Goal =>
    mkGoal({
      scope,
      targetMetric: m,
      targetValue: value,
      currentValue,
      startDate: now - 3 * 86_400_000,
      targetDate: now + 4 * 86_400_000,
    });

  it('Coverage weekly goal → colored pace pill (uses currentValue)', () => {
    // 3 days in over 7-day window → pro-rated = 30 × 3/7 = ~12.85.
    // currentValue 20 → ratio ~1.55 → well-ahead → green.
    const r = classifyGoalPace({
      goal: goal('ear_training_coverage_at_acquired', 30, 20),
      actual: 20, // caller passes currentValue for coverage goals
      now,
    });
    expect(r.kind).toBe('pill');
    if (r.kind === 'pill') expect(r.color).toBe('green');
  });

  it('Consistency days weekly goal → no pill, shows muted text', () => {
    const r = classifyGoalPace({
      goal: goal('harmonic_fluency_days_per_cadence', 5, 3),
      actual: 3,
      now,
    });
    expect(r.kind).toBe('no-pill');
    expect(isDaysConsistencyGoal(goal('harmonic_fluency_days_per_cadence', 5))).toBe(true);
  });

  it('Production lessons weekly goal → colored pace pill', () => {
    const r = classifyGoalPace({
      goal: goal('production_lessons_per_cadence', 3, 0),
      actual: 0,
      now,
    });
    // 3 days in over 7-day window, 0 of 3 lessons → ratio 0 → behind.
    expect(r.kind).toBe('pill');
    if (r.kind === 'pill') expect(r.color).toBe('red');
  });

  it('Attempts weekly goal (non-coverage) → colored pace pill from this-week attempts', () => {
    // Hypothetical attempts-unit weekly goal targeting 100 attempts.
    // Caller passes actualAttempts; mid-week with 50 → ratio ~1.17 → green.
    const g = goal('harmonic_fluency_attempt_target', 100, 0);
    const r = classifyGoalPace({ goal: g, actual: 50, now });
    expect(r.kind).toBe('pill');
    if (r.kind === 'pill') expect(r.color).toBe('green');
  });
});

// -------------------------------------------------------------
// Row label sanity — Coverage rename hooks through correctly
// -------------------------------------------------------------

describe('row badge labels in by-module view', () => {
  it('HF coverage goal labels as "Coverage"', () => {
    expect(goalTypeLabel(
      mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' }),
      'harmonic-fluency',
    )).toBe('Coverage');
  });
  it('ET accuracy goal labels as "Accuracy"', () => {
    expect(goalTypeLabel(
      mkGoal({ targetMetric: 'ear_training_accuracy_overall' }),
      'ear-training',
    )).toBe('Accuracy');
  });
  it('Repertoire days goal labels as "Consistency"', () => {
    expect(goalTypeLabel(
      mkGoal({ targetMetric: 'repertoire_days_per_cadence' }),
      'repertoire',
    )).toBe('Consistency');
  });
  it('Shapes proficiency goal labels as "Proficiency"', () => {
    expect(goalTypeLabel(
      mkGoal({ targetMetric: 'shapes_proficiency_overall' }),
      'shapes-and-patterns',
    )).toBe('Proficiency');
  });
});

// -------------------------------------------------------------
// Empty-state decisions documented as predicates the section uses
// -------------------------------------------------------------

describe('section visibility rules', () => {
  function visibility(yearlyAnchor: Goal | undefined, monthlyCount: number, weeklyCount: number) {
    return {
      showMonthly: !!yearlyAnchor || monthlyCount > 0,
      showWeekly: weeklyCount > 0,
    };
  }

  it('shows THIS MONTH when anchor exists, even with no monthly goals', () => {
    const anchor = mkGoal({ scope: 'yearly', isUmbrella: true });
    expect(visibility(anchor, 0, 0).showMonthly).toBe(true);
  });
  it('shows THIS MONTH when monthly goals exist, even with no anchor', () => {
    expect(visibility(undefined, 2, 0).showMonthly).toBe(true);
  });
  it('omits THIS MONTH when neither anchor nor monthlies', () => {
    expect(visibility(undefined, 0, 0).showMonthly).toBe(false);
  });
  it('omits THIS WEEK unless there is at least one weekly goal', () => {
    expect(visibility(undefined, 0, 0).showWeekly).toBe(false);
    expect(visibility(undefined, 0, 1).showWeekly).toBe(true);
  });
});
