// @vitest-environment jsdom
/**
 * Scope-level maintenance — allocation slice, module rollup, and the
 * selection gate inside aggregateGoalCandidatesByModule.
 */
import { describe, expect, it } from 'vitest';
import type { Goal, SpacingState } from '../../../lib/db';
import {
  aggregateGoalCandidatesByModule,
  buildBlockBudgetsFromWeeklyNeeds,
  maintenanceModulesFrom,
} from '../sessionGenerator';
import type { ModuleWeeklyNeed } from '../../../lib/sessionAlgorithm/moduleWeeklyNeed';
import {
  MEMORY_TYPE_DURATIONS,
  type AlgorithmBlock,
} from '../../../lib/sessionAlgorithm/timeAllocation';
import { SCOPE_MAINTENANCE_FRACTION } from '../../../lib/sessionAlgorithm/sessionDesign';
import { COVERAGE_OVERALL_METRIC } from '../../goals/coverageMetrics';
import type { ScopeMaintenanceView } from '../../../lib/sessionAlgorithm/scopeMaintenanceResolve';

const HF = 'harmonic-fluency';
const DECL_HIGH = MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds; // 600
const DECL_MIN = MEMORY_TYPE_DURATIONS.declarative.minSeconds;         // 180

function block(id: string, moduleRef: string): AlgorithmBlock {
  return {
    id, moduleRef, memoryType: 'declarative', itemRefs: ['x'],
    weight: 1, hasAcquiringItems: false, isKeyboardRequired: false,
  };
}

function need(partial: Partial<ModuleWeeklyNeed> & {
  moduleId: ModuleWeeklyNeed['moduleId'];
}): ModuleWeeklyNeed {
  return {
    targetAttemptsThisWeek: 100, completedAttemptsThisWeek: 0,
    remainingAttempts: 100, estimatedMinutesNeeded: 30,
    pace: 'on-pace', overPractice: 'none',
    ...partial,
  };
}

function view(partial: Partial<ScopeMaintenanceView> & {
  scopeKey: string;
}): ScopeMaintenanceView {
  return {
    goalId: 'g', label: 'l', moduleRefs: [HF], inMaintenance: false,
    suggestEnter: false, suggestRelease: false,
    qualification: {
      qualifies: false, reason: null, catalogTotal: 1, acquiredCount: 1,
    },
    ...partial,
  };
}

// =====================================================================
// The slice
// =====================================================================

describe('maintenance allocation slice', () => {
  const blocks = [block('hf-1', HF)];
  const maint = new Set<ModuleWeeklyNeed['moduleId']>(['harmonic-fluency']);

  it('takes the maintenance fraction of the tier, not the full budget', () => {
    const needs = [need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 30 })];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, [], 0, maint);
    // 0.30 × 600 = 180 s, not 30 min.
    expect(out.blockTimeNeeds.get('hf-1')).toBe(SCOPE_MAINTENANCE_FRACTION * DECL_HIGH);
  });

  it('THE POINT: a module with no budget still gets a slice', () => {
    // No remaining attempts is exactly what a finished scope looks
    // like. Before this, the module fell out of the map entirely.
    const needs = [need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 0 })];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, [], 0, maint);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(SCOPE_MAINTENANCE_FRACTION * DECL_HIGH);
    expect(out.phaseBModules.has('harmonic-fluency')).toBe(true);
  });

  it('never lands below the memory-type minimum', () => {
    const needs = [need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 0 })];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, [], 0, maint);
    expect(out.blockTimeNeeds.get('hf-1')!).toBeGreaterThanOrEqual(DECL_MIN);
  });

  it('wins over the over-practice fractions', () => {
    // Maintenance ("learned, keep warm") is the more settled claim
    // than over-practice ("enough for this week").
    const needs = [need({ moduleId: 'harmonic-fluency', overPractice: 'weekly' })];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, [], 0, maint);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(SCOPE_MAINTENANCE_FRACTION * DECL_HIGH);
    // ...and differs from what weekly over-practice alone would give.
    const without = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, [], 0);
    expect(without.blockTimeNeeds.get('hf-1')).toBe(0.5 * DECL_HIGH);
  });

  it('the SR due-floor can lift it, capped at typical-high', () => {
    // 30 due HF rows × 30 s/attempt = 900 s of demand, over the cap.
    const rows: SpacingState[] = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`, itemRef: `c${i}`, moduleRef: HF, hand: 'both',
      style: 'solid', memoryType: 'declarative', acquisitionStage: 'acquired',
      currentIntervalDays: 10, lastEngagedAt: 0, nextDueAt: 1,
      performanceHistory: [],
    }));
    const needs = [need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 0 })];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, rows, 1000, maint);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(DECL_HIGH);
  });

  it('an empty maintenance set changes nothing', () => {
    const needs = [need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 10 })];
    expect(
      buildBlockBudgetsFromWeeklyNeeds(blocks, needs, [], 0, new Set())
        .blockTimeNeeds.get('hf-1'),
    ).toBe(600);
  });
});

// =====================================================================
// Scope → module rollup
// =====================================================================

describe('maintenanceModulesFrom', () => {
  it('rolls up when every scope on the module is in maintenance', () => {
    const out = maintenanceModulesFrom([
      view({ scopeKey: 'a', inMaintenance: true }),
      view({ scopeKey: 'b', inMaintenance: true }),
    ]);
    expect(out.has('harmonic-fluency')).toBe(true);
  });

  it('DOES NOT roll up when one scope is still active', () => {
    // Starving the active scope because a sibling settled is the bug
    // this guard exists for.
    const out = maintenanceModulesFrom([
      view({ scopeKey: 'a', inMaintenance: true }),
      view({ scopeKey: 'b', inMaintenance: false }),
    ]);
    expect(out.has('harmonic-fluency')).toBe(false);
  });

  it('handles a multi-module scope (ET fans out)', () => {
    const out = maintenanceModulesFrom([
      view({
        scopeKey: 'et', inMaintenance: true,
        moduleRefs: ['intervals', 'chord-recognition'],
      }),
    ]);
    expect(out.has('ear-training')).toBe(true);
  });

  it('is empty with no views', () => {
    expect(maintenanceModulesFrom([]).size).toBe(0);
  });
});

// =====================================================================
// Selection gate
// =====================================================================

describe('selection gate in aggregateGoalCandidatesByModule', () => {
  const goal: Goal = {
    id: 'g1', scope: 'monthly', description: '',
    targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
    targetValue: null, targetUnit: null, currentValue: 0, contextTag: null,
    relatedModules: [], relatedItems: [], startDate: 0, targetDate: 0,
    status: 'active', parentGoalId: null,
    contributesNumericallyToParent: false, isUmbrella: false,
    lastEngagedAt: null,
  };
  const SCOPE = 'harmonic_fluency_coverage_at_acquired';
  const NOW = new Date(2026, 0, 5, 12, 0, 0).getTime();

  const row = (
    itemRef: string,
    acquisitionStage: SpacingState['acquisitionStage'],
    nextDueAt: number | null,
  ): SpacingState => ({
    id: itemRef, itemRef, moduleRef: HF, hand: 'both', style: 'solid',
    memoryType: 'declarative', acquisitionStage, currentIntervalDays: 1,
    lastEngagedAt: 0, nextDueAt, performanceHistory: [],
  });

  const rows = [
    row('new-1', 'acquiring', null),
    row('done-due', 'acquired', NOW - 1000),
    row('done-later', 'acquired', NOW + 90 * 24 * 60 * 60 * 1000),
  ];

  it('without the gate, coverage behaviour is unchanged', () => {
    const blocks = aggregateGoalCandidatesByModule(
      [goal], rows, NOW, 'laptop',
    );
    expect(blocks[0]?.itemRefs).toEqual(['new-1']);
  });

  it('a CONFIRMED scope selects acquired-and-due instead', () => {
    const blocks = aggregateGoalCandidatesByModule(
      [goal], rows, NOW, 'laptop',
      new Map(), [], undefined, undefined, new Set([SCOPE]),
    );
    expect(blocks[0]?.itemRefs).toEqual(['done-due']);
  });

  it('dueBefore is END OF DAY — later today is swept up, tomorrow is not', () => {
    // Includes 23:59:59.999 today; excludes 00:00:00.000 tomorrow.
    const laterToday = new Date(2026, 0, 5, 23, 59, 59, 999).getTime();
    const tomorrow = new Date(2026, 0, 6, 0, 0, 0, 0).getTime();
    const blocks = aggregateGoalCandidatesByModule(
      [goal],
      [row('a', 'acquired', laterToday), row('b', 'acquired', tomorrow)],
      NOW, 'laptop',
      new Map(), [], undefined, undefined, new Set([SCOPE]),
    );
    expect(blocks[0]?.itemRefs).toEqual(['a']);
  });

  it('a scope not in the set keeps its coverage spec', () => {
    const blocks = aggregateGoalCandidatesByModule(
      [goal], rows, NOW, 'laptop',
      new Map(), [], undefined, undefined, new Set(['some-other-scope']),
    );
    expect(blocks[0]?.itemRefs).toEqual(['new-1']);
  });

  it('a maintenance scope with nothing due produces NO block at all', () => {
    // Which is why quiet days need no drop rule in the allocator.
    const blocks = aggregateGoalCandidatesByModule(
      [goal], [row('done-later', 'acquired', new Date(2026, 0, 7).getTime())],
      NOW, 'laptop',
      new Map(), [], undefined, undefined, new Set([SCOPE]),
    );
    expect(blocks).toEqual([]);
  });
});
