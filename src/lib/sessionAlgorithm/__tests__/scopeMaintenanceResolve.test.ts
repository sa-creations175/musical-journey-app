// @vitest-environment jsdom
/**
 * Scope-level maintenance — the shared resolver the three surfaces read.
 *
 * The property that matters here is that ONE record drives all three
 * surfaces, so a dismissal anywhere quiets everywhere. That is tested
 * by asserting the resolver's output, since every surface renders
 * straight off it.
 */
import { describe, expect, it } from 'vitest';
import type { Goal, SpacingState } from '../../db';
import type { PerformanceEntry } from '../../spacingState';
import { COVERAGE_OVERALL_METRIC } from '../../../modules/goals/coverageMetrics';
import { harmonicFluencyCounts } from '../../moduleItemCounts';
import { FLASHCARDS } from '../../../modules/harmonic-fluency/catalog';
import {
  maintenanceScopeKeysFrom,
  resolveScopeMaintenanceViews,
} from '../scopeMaintenanceResolve';
import {
  MAINTENANCE_DISMISSAL_QUIET_MS,
  withConfirmation,
  withDismissal,
  type ScopeMaintenanceMap,
} from '../scopeMaintenanceState';

const HF = 'harmonic-fluency';
const SCOPE = 'harmonic_fluency_coverage_at_acquired';
const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date(2026, 0, 5, 12, 0, 0).getTime();

function attempts(n: number, days: number, wrong = 0): PerformanceEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    t: BASE + (i % days) * DAY,
    kind: 'attempt' as const,
    correct: i >= wrong,
  }));
}

const hfGoal: Goal = {
  id: 'g1', scope: 'monthly', description: 'Harmonic Fluency breadth',
  targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
  targetValue: null, targetUnit: null, currentValue: 0, contextTag: null,
  relatedModules: [], relatedItems: [], startDate: 0, targetDate: 0,
  status: 'active', parentGoalId: null,
  contributesNumericallyToParent: false, isUmbrella: false,
  lastEngagedAt: null,
};

/** A full HF catalog of acquired rows, each with the given history.
 *  Uses REAL card ids so the catalog-cardinality gate is satisfied
 *  honestly rather than by a filter that waves it through. */
function fullHfRows(history: PerformanceEntry[]): SpacingState[] {
  return FLASHCARDS.map(card => ({
    id: card.id, itemRef: card.id, moduleRef: HF, hand: 'both' as const,
    style: 'solid' as const, memoryType: 'declarative' as const,
    acquisitionStage: 'acquired' as const, currentIntervalDays: 10,
    lastEngagedAt: BASE, nextDueAt: BASE,
    performanceHistory: history as unknown as Array<Record<string, unknown>>,
  }));
}

const NOW = BASE + 10 * DAY;

describe('resolveScopeMaintenanceViews', () => {
  it('suggests entry for a finished, steady scope', () => {
    const views = resolveScopeMaintenanceViews(
      [hfGoal], fullHfRows(attempts(20, 4)), {}, NOW,
    );
    expect(views).toHaveLength(1);
    expect(views[0].scopeKey).toBe(SCOPE);
    expect(views[0].label).toBe('Harmonic Fluency breadth');
    expect(views[0].suggestEnter).toBe(true);
    expect(views[0].inMaintenance).toBe(false);
    expect(views[0].qualification.catalogTotal)
      .toBe(harmonicFluencyCounts().total);
  });

  it('does not suggest entry when the catalog is not fully acquired', () => {
    const rows = fullHfRows(attempts(20, 4)).slice(0, 3);
    const views = resolveScopeMaintenanceViews([hfGoal], rows, {}, NOW);
    expect(views[0].suggestEnter).toBe(false);
    expect(views[0].qualification.reason).toBe('items-not-all-acquired');
  });

  it('a dismissal quiets the suggestion for every surface at once', () => {
    // All three surfaces render off this one resolver output, so a
    // single false here is a dismissal honoured in all three places.
    const state: ScopeMaintenanceMap = withDismissal({}, SCOPE, NOW);
    const rows = fullHfRows(attempts(20, 4));
    expect(resolveScopeMaintenanceViews([hfGoal], rows, state, NOW + 1)[0]
      .suggestEnter).toBe(false);
    expect(resolveScopeMaintenanceViews(
      [hfGoal], rows, state, NOW + MAINTENANCE_DISMISSAL_QUIET_MS,
    )[0].suggestEnter).toBe(true);
  });

  it('a confirmed scope reports inMaintenance and stops suggesting entry', () => {
    const state = withConfirmation({}, SCOPE, NOW);
    const views = resolveScopeMaintenanceViews(
      [hfGoal], fullHfRows(attempts(20, 4)), state, NOW,
    );
    expect(views[0].inMaintenance).toBe(true);
    expect(views[0].suggestEnter).toBe(false);
    expect(views[0].suggestRelease).toBe(false);
    expect(maintenanceScopeKeysFrom(views)).toEqual(new Set([SCOPE]));
  });

  it('suggests release once a confirmed scope slips below 85%', () => {
    const state = withConfirmation({}, SCOPE, NOW);
    const views = resolveScopeMaintenanceViews(
      [hfGoal], fullHfRows(attempts(20, 4, 5)), state, NOW,
    );
    expect(views[0].inMaintenance).toBe(true);
    expect(views[0].suggestRelease).toBe(true);
  });

  it('an unconfirmed slipped scope is offered neither direction', () => {
    const views = resolveScopeMaintenanceViews(
      [hfGoal], fullHfRows(attempts(20, 4, 5)), {}, NOW,
    );
    expect(views[0].suggestEnter).toBe(false);
    expect(views[0].suggestRelease).toBe(false);
  });

  it('skips inactive goals and non-coverage goals', () => {
    const rows = fullHfRows(attempts(20, 4));
    expect(resolveScopeMaintenanceViews(
      [{ ...hfGoal, status: 'completed' }], rows, {}, NOW,
    )).toEqual([]);
    expect(resolveScopeMaintenanceViews(
      [{ ...hfGoal, targetMetric: 'harmonic_fluency_accuracy_overall' }],
      rows, {}, NOW,
    )).toEqual([]);
  });

  it('two goals over one scope collapse to a single view', () => {
    const views = resolveScopeMaintenanceViews(
      [hfGoal, { ...hfGoal, id: 'g2' }], fullHfRows(attempts(20, 4)), {}, NOW,
    );
    expect(views).toHaveLength(1);
  });
});
