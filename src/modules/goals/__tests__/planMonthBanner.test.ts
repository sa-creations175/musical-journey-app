// @vitest-environment jsdom
/**
 * hasPlannedCurrentMonth — the PlanMonthBanner visibility predicate.
 * The banner shows when this returns false (no real monthly goal for
 * the current month). Carry-over stubs don't count as planning.
 */
import { describe, expect, it } from 'vitest';
import { hasPlannedCurrentMonth, planMonthBannerState } from '../PlanMonthBanner';
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

describe('planMonthBannerState', () => {
  // Module identity resolves via goalModuleId → moduleForMetric, so the
  // metric prefix (not relatedModules) decides the module.
  const METRIC: Record<string, string> = {
    'harmonic-fluency': 'harmonic_fluency_coverage_at_acquired',
    'ear-training': 'ear_training_coverage_at_acquired',
    'practice-consistency': 'practice_days_per_cadence',
  };
  const yearly = (moduleId: string, overrides: Partial<Goal> = {}): Goal =>
    mkGoal({
      id: `yearly-${moduleId}`,
      scope: 'yearly',
      targetMetric: METRIC[moduleId],
      relatedModules: [moduleId],
      ...overrides,
    });
  const monthly = (moduleId: string, overrides: Partial<Goal> = {}): Goal =>
    mkGoal({
      id: `monthly-${moduleId}`,
      scope: 'monthly',
      targetMetric: METRIC[moduleId],
      relatedModules: [moduleId],
      startDate: JUNE_START,
      targetDate: JUNE_END,
      ...overrides,
    });

  it('no goals at all → complete (no anchored modules require planning)', () => {
    expect(planMonthBannerState([], NOW)).toEqual({ kind: 'complete' });
  });

  it('anchored module with no monthly goal → not-started', () => {
    expect(planMonthBannerState([yearly('harmonic-fluency')], NOW))
      .toEqual({ kind: 'not-started' });
  });

  it('the single anchored module is covered by a June monthly → complete', () => {
    expect(
      planMonthBannerState([yearly('harmonic-fluency'), monthly('harmonic-fluency')], NOW),
    ).toEqual({ kind: 'complete' });
  });

  it('two anchors, one covered → in-progress with 1 remaining', () => {
    const goals = [
      yearly('harmonic-fluency'),
      yearly('ear-training'),
      monthly('harmonic-fluency'),
    ];
    expect(planMonthBannerState(goals, NOW))
      .toEqual({ kind: 'in-progress', modulesRemaining: 1 });
  });

  it('two anchors, none covered → not-started (no monthly goals exist yet)', () => {
    expect(planMonthBannerState([yearly('harmonic-fluency'), yearly('ear-training')], NOW))
      .toEqual({ kind: 'not-started' });
  });

  it('a module without a yearly anchor does not block dismissal', () => {
    // HF anchored + covered. ET has neither anchor nor monthly → not
    // required, so the month reads as complete.
    expect(
      planMonthBannerState([yearly('harmonic-fluency'), monthly('harmonic-fluency')], NOW),
    ).toEqual({ kind: 'complete' });
  });

  it('a carry-over stub does NOT cover an anchored module', () => {
    const carry = monthly('harmonic-fluency', {
      description: `${CARRYOVER_DESCRIPTION_PREFIX} — 202 items`,
    });
    expect(planMonthBannerState([yearly('harmonic-fluency'), carry], NOW))
      .toEqual({ kind: 'not-started' });
  });

  it('last month\'s monthly does not cover the current month', () => {
    const lastMonth = monthly('harmonic-fluency', {
      startDate: new Date(2026, 4, 1).getTime(),
      targetDate: MAY_END,
    });
    // covered=none, but a (non-overlapping) monthly exists elsewhere?
    // No — it doesn't overlap June, and there's no June monthly, so
    // not-started.
    expect(planMonthBannerState([yearly('harmonic-fluency'), lastMonth], NOW))
      .toEqual({ kind: 'not-started' });
  });

  it('REGRESSION: a practice-consistency monthly with empty relatedModules covers its anchor', () => {
    // The consistency monthly goal carries relatedModules: [] — the old
    // relatedModules-based check never matched it, so the banner was
    // stuck at "1 module still needs goals". Module identity now comes
    // from the metric (practice_days_per_cadence → practice-consistency),
    // so the anchor reads as covered → complete.
    const anchor = yearly('practice-consistency');
    const consistencyMonthly = monthly('practice-consistency', { relatedModules: [] });
    expect(planMonthBannerState([anchor, consistencyMonthly], NOW))
      .toEqual({ kind: 'complete' });
  });

  it('counts a yearly umbrella anchor + monthly umbrella via their children', () => {
    // Umbrella anchor (targetMetric null) with a yearly child carrying
    // the metric; covered by a monthly umbrella + child the same way.
    const yearlyUmbrella = mkGoal({ id: 'y-umb', scope: 'yearly', isUmbrella: true, targetMetric: null, relatedModules: [] });
    const yearlyChild = mkGoal({ id: 'y-child', scope: 'yearly', parentGoalId: 'y-umb', targetMetric: 'ear_training_coverage_at_acquired', relatedModules: [] });
    const monthlyUmbrella = mkGoal({ id: 'm-umb', scope: 'monthly', isUmbrella: true, targetMetric: null, relatedModules: [], startDate: JUNE_START, targetDate: JUNE_END });
    const monthlyChild = mkGoal({ id: 'm-child', scope: 'monthly', parentGoalId: 'm-umb', targetMetric: 'ear_training_coverage_at_acquired', relatedModules: [], startDate: JUNE_START, targetDate: JUNE_END });
    expect(
      planMonthBannerState([yearlyUmbrella, yearlyChild, monthlyUmbrella, monthlyChild], NOW),
    ).toEqual({ kind: 'complete' });
  });
});
