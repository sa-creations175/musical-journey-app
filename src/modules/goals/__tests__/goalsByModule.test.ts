/**
 * Phase 2 step 6e — tests for groupByModule.
 *
 * Pins:
 *   - Nav order from MODULE_ORDER (HF → ET → Shapes → Songs →
 *     Production), with practice-consistency appended after, and
 *     the null bucket last
 *   - Empty buckets are not emitted (no subheader for modules
 *     with zero goals at this scope)
 *   - Umbrella module derivation runs through findChildren +
 *     umbrellaModuleId so single-module umbrellas land in the
 *     right bucket
 *   - Cross-module umbrellas collapse to null
 *   - Standalone goals with null targetMetric land in null
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  groupByModule,
  isCurrentOrUpcoming,
  ORDERED_GOAL_MODULES,
} from '../goalsByModule';

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'weekly',
    description: '',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: 0,
    targetDate: 0,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

describe('groupByModule', () => {
  it('returns an empty list when there are no top-level goals', () => {
    expect(groupByModule([], [])).toEqual([]);
  });

  it('groups standalone goals by their module via moduleForMetric', () => {
    const et = mkGoal({ id: 'et', targetMetric: 'ear_training_accuracy_overall' });
    const songs = mkGoal({ id: 'r', targetMetric: 'song_whole_at_level' });
    const all = [et, songs];
    const out = groupByModule(all, all);
    expect(out).toEqual([
      { moduleId: 'ear-training', goals: [et] },
      { moduleId: 'repertoire', goals: [songs] },
    ]);
  });

  it('orders modules per MODULE_ORDER nav sequence', () => {
    // Pass goals in scrambled order; output should be HF → ET →
    // Shapes → Songs → Production (then tail / null).
    const goals = [
      mkGoal({ id: 'p', targetMetric: 'production_coverage_at_acquired' }),
      mkGoal({ id: 'r', targetMetric: 'repertoire_sessions_per_week' }),
      mkGoal({ id: 's', targetMetric: 'shapes_accuracy_overall' }),
      mkGoal({ id: 'e', targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ id: 'h', targetMetric: 'harmonic_fluency_accuracy_overall' }),
    ];
    const out = groupByModule(goals, goals);
    expect(out.map(g => g.moduleId)).toEqual([
      'harmonic-fluency',
      'ear-training',
      'shapes-and-patterns',
      'repertoire',
      'production',
    ]);
  });

  it('places practice-consistency after the MODULE_ORDER subset', () => {
    const goals = [
      mkGoal({ id: 'pc', targetMetric: 'practice_weekly_floor_days' }),
      mkGoal({ id: 'et', targetMetric: 'ear_training_accuracy_overall' }),
    ];
    const out = groupByModule(goals, goals);
    expect(out.map(g => g.moduleId)).toEqual([
      'ear-training',
      'practice-consistency',
    ]);
  });

  it('puts the null bucket last when goals lack a derivable module', () => {
    const noModule = mkGoal({ id: 'x', targetMetric: null });
    const et = mkGoal({ id: 'et', targetMetric: 'ear_training_accuracy_overall' });
    const out = groupByModule([noModule, et], [noModule, et]);
    expect(out.map(g => g.moduleId)).toEqual(['ear-training', null]);
    expect(out[1].goals).toEqual([noModule]);
  });

  it('does not emit a bucket for modules with zero matching goals', () => {
    const et = mkGoal({ id: 'et', targetMetric: 'ear_training_accuracy_overall' });
    const out = groupByModule([et], [et]);
    expect(out.map(g => g.moduleId)).toEqual(['ear-training']);
  });

  it('derives an umbrella module from its children', () => {
    const umbrella = mkGoal({
      id: 'u1',
      isUmbrella: true,
      targetMetric: null,
    });
    const child1 = mkGoal({
      id: 'c1',
      parentGoalId: 'u1',
      targetMetric: 'ear_training_coverage_at_acquired',
    });
    const child2 = mkGoal({
      id: 'c2',
      parentGoalId: 'u1',
      targetMetric: 'ear_training_accuracy_overall',
    });
    const all = [umbrella, child1, child2];
    const out = groupByModule([umbrella], all);
    expect(out).toEqual([{ moduleId: 'ear-training', goals: [umbrella] }]);
  });

  it('puts cross-module umbrellas in the null bucket', () => {
    const umbrella = mkGoal({
      id: 'u1',
      isUmbrella: true,
      targetMetric: null,
    });
    const child1 = mkGoal({
      id: 'c1',
      parentGoalId: 'u1',
      targetMetric: 'ear_training_coverage_at_acquired',
    });
    const child2 = mkGoal({
      id: 'c2',
      parentGoalId: 'u1',
      targetMetric: 'shapes_coverage_at_acquired',
    });
    const all = [umbrella, child1, child2];
    const out = groupByModule([umbrella], all);
    expect(out).toEqual([{ moduleId: null, goals: [umbrella] }]);
  });

  it('preserves the original order of goals within a module bucket', () => {
    const a = mkGoal({ id: 'a', targetMetric: 'ear_training_accuracy_overall' });
    const b = mkGoal({ id: 'b', targetMetric: 'ear_training_coverage_at_acquired' });
    const c = mkGoal({ id: 'c', targetMetric: 'ear_training_sessions_per_week' });
    const out = groupByModule([a, b, c], [a, b, c]);
    expect(out[0].goals.map(g => g.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('ORDERED_GOAL_MODULES', () => {
  it('lists the five live goal-flow modules in nav order plus practice-consistency last', () => {
    expect(ORDERED_GOAL_MODULES).toEqual([
      'harmonic-fluency',
      'ear-training',
      'shapes-and-patterns',
      'repertoire',
      'production',
      'practice-consistency',
    ]);
  });
});

describe('isCurrentOrUpcoming', () => {
  const TODAY = new Date(2026, 3, 29, 12); // April 29 2026, noon
  const day = 86_400_000;

  it('includes a current weekly goal (started in the past, ends in the future)', () => {
    const g = mkGoal({
      scope: 'weekly',
      startDate: TODAY.getTime() - 2 * day,
      targetDate: TODAY.getTime() + 4 * day,
    });
    expect(isCurrentOrUpcoming(g, TODAY)).toBe(true);
  });

  it('includes a goal that starts within the lookahead window', () => {
    const g = mkGoal({
      scope: 'weekly',
      startDate: TODAY.getTime() + 3 * day,
      targetDate: TODAY.getTime() + 10 * day,
    });
    expect(isCurrentOrUpcoming(g, TODAY)).toBe(true);
  });

  it('excludes a goal whose targetDate has already passed', () => {
    const g = mkGoal({
      scope: 'weekly',
      startDate: TODAY.getTime() - 14 * day,
      targetDate: TODAY.getTime() - 1 * day,
    });
    expect(isCurrentOrUpcoming(g, TODAY)).toBe(false);
  });

  it('excludes a goal that starts beyond the lookahead window', () => {
    const g = mkGoal({
      scope: 'weekly',
      startDate: TODAY.getTime() + 14 * day,
      targetDate: TODAY.getTime() + 21 * day,
    });
    expect(isCurrentOrUpcoming(g, TODAY)).toBe(false);
  });

  it('excludes aspirational scopes regardless of dates', () => {
    expect(
      isCurrentOrUpcoming(
        mkGoal({
          scope: 'two_to_three_year',
          startDate: TODAY.getTime() - day,
          targetDate: TODAY.getTime() + 365 * day,
        }),
        TODAY,
      ),
    ).toBe(false);
    expect(
      isCurrentOrUpcoming(
        mkGoal({
          scope: 'lifetime',
          startDate: TODAY.getTime() - day,
          targetDate: TODAY.getTime() + 365 * day,
        }),
        TODAY,
      ),
    ).toBe(false);
  });

  it('includes quarterly and yearly scopes alongside weekly/monthly', () => {
    expect(
      isCurrentOrUpcoming(
        mkGoal({
          scope: 'quarterly',
          startDate: TODAY.getTime() - 30 * day,
          targetDate: TODAY.getTime() + 60 * day,
        }),
        TODAY,
      ),
    ).toBe(true);
    expect(
      isCurrentOrUpcoming(
        mkGoal({
          scope: 'yearly',
          startDate: TODAY.getTime() - 100 * day,
          targetDate: TODAY.getTime() + 200 * day,
        }),
        TODAY,
      ),
    ).toBe(true);
  });

  it('respects a custom lookaheadDays value', () => {
    const g = mkGoal({
      scope: 'weekly',
      startDate: TODAY.getTime() + 14 * day,
      targetDate: TODAY.getTime() + 21 * day,
    });
    expect(isCurrentOrUpcoming(g, TODAY, 7)).toBe(false);
    expect(isCurrentOrUpcoming(g, TODAY, 21)).toBe(true);
  });
});
