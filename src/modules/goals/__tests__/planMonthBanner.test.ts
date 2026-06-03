// @vitest-environment jsdom
/**
 * hasPlannedCurrentMonth — the PlanMonthBanner visibility predicate.
 * The banner shows when this returns false (no real monthly goal for
 * the current month). Carry-over stubs don't count as planning.
 */
import { describe, expect, it } from 'vitest';
import { hasPlannedCurrentMonth } from '../PlanMonthBanner';
import { CARRYOVER_DESCRIPTION_PREFIX } from '../carryoverAccept';
import type { Goal } from '../../../lib/db';

const NOW = new Date(2026, 5, 3, 9).getTime(); // June 3 2026
const JUNE_START = new Date(2026, 5, 1).getTime();
const JUNE_END = new Date(2026, 5, 30, 23, 59, 59, 999).getTime();
const MAY_END = new Date(2026, 4, 31, 23, 59, 59, 999).getTime();

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'monthly',
    description: 'Harmonic Fluency — 20 cards',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 20,
    targetUnit: 'cards',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: JUNE_START,
    targetDate: JUNE_END,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

describe('hasPlannedCurrentMonth', () => {
  it('false when there are no goals at all (banner shows)', () => {
    expect(hasPlannedCurrentMonth([], NOW)).toBe(false);
  });

  it('true when a real monthly goal overlaps the current month', () => {
    expect(hasPlannedCurrentMonth([mkGoal()], NOW)).toBe(true);
  });

  it('false when the only monthly goal is a carry-over stub', () => {
    const carry = mkGoal({
      description: `${CARRYOVER_DESCRIPTION_PREFIX} — 202 items`,
    });
    expect(hasPlannedCurrentMonth([carry], NOW)).toBe(false);
  });

  it('true when a real monthly sits alongside a carry-over', () => {
    const carry = mkGoal({
      id: 'carry',
      description: `${CARRYOVER_DESCRIPTION_PREFIX} — 202 items`,
    });
    const real = mkGoal({ id: 'real' });
    expect(hasPlannedCurrentMonth([carry, real], NOW)).toBe(true);
  });

  it('ignores non-monthly scopes', () => {
    const weekly = mkGoal({ scope: 'weekly' });
    const yearly = mkGoal({ scope: 'yearly' });
    expect(hasPlannedCurrentMonth([weekly, yearly], NOW)).toBe(false);
  });

  it('ignores last month\'s monthly goal (no overlap with current month)', () => {
    const lastMonth = mkGoal({
      startDate: new Date(2026, 4, 1).getTime(),
      targetDate: MAY_END,
    });
    expect(hasPlannedCurrentMonth([lastMonth], NOW)).toBe(false);
  });

  it('ignores inactive monthly goals', () => {
    expect(hasPlannedCurrentMonth([mkGoal({ status: 'completed' })], NOW)).toBe(false);
    expect(hasPlannedCurrentMonth([mkGoal({ status: 'abandoned' })], NOW)).toBe(false);
  });

  it('counts a monthly umbrella as planning the month', () => {
    const umbrella = mkGoal({ isUmbrella: true, targetMetric: null });
    expect(hasPlannedCurrentMonth([umbrella], NOW)).toBe(true);
  });
});
