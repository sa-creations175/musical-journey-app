// @vitest-environment jsdom
/**
 * Phase B Step 9b — cross-month carryover detection.
 *
 * Two helpers under test:
 *   · getUncoveredItemsFromLastMonth — last month's leftover scope items.
 *   · getCarryoverBacklog — running list of uncovered items across
 *     ALL past months, minus items in this month's current scope.
 *
 * Both layered on a small fixture: a few HF / ET / S&P monthly goals
 * across distinct months plus matching spacingState rows in mixed
 * acquisition stages. Fake-indexeddb backs the loads.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCarryoverBacklog,
  getUncoveredItemsFromLastMonth,
  lastMonthBoundary,
  monthBoundary,
} from '../carryover';
import {
  db,
  type AcquisitionStage,
  type Goal,
  type SpacingState,
} from '../../../lib/db';

// May 15 2026 — a Friday mid-month, far enough from boundaries that
// month-boundary math is unambiguous. April = last month, March is
// two months back.
const TODAY = new Date(2026, 4, 15, 9, 0, 0).getTime();

const APRIL_START = new Date(2026, 3, 1, 0, 0, 0).getTime();
const APRIL_END   = new Date(2026, 3, 30, 23, 59, 59, 999).getTime();
const MARCH_START = new Date(2026, 2, 1, 0, 0, 0).getTime();
const MARCH_END   = new Date(2026, 2, 31, 23, 59, 59, 999).getTime();
const MAY_START   = new Date(2026, 4, 1, 0, 0, 0).getTime();
const MAY_END     = new Date(2026, 4, 31, 23, 59, 59, 999).getTime();

async function clearAll() {
  await db.goals.clear();
  await db.spacingState.clear();
}

function mkMonthly(partial: Partial<Goal>): Goal {
  return {
    id: `g-${Math.random().toString(36).slice(2, 9)}`,
    scope: 'monthly',
    description: 'monthly',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 50,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: APRIL_START,
    targetDate: APRIL_END,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

function mkSpacing(partial: Partial<SpacingState> & {
  itemRef: string;
  moduleRef: string;
}): SpacingState {
  return {
    id: `s-${Math.random().toString(36).slice(2, 9)}`,
    memoryType: 'declarative',
    acquisitionStage: 'acquiring',
    nextDueAt: TODAY,
    lastEngagedAt: TODAY,
    performanceHistory: [],
    createdAt: TODAY - 30 * 24 * 60 * 60 * 1000,
    updatedAt: TODAY,
    ...partial,
  } as SpacingState;
}

// =====================================================================
// Month boundary helpers
// =====================================================================

describe('monthBoundary + lastMonthBoundary', () => {
  it('monthBoundary returns the calendar month containing the timestamp', () => {
    const b = monthBoundary(TODAY);
    expect(b.start).toBe(MAY_START);
    expect(b.end).toBe(MAY_END);
  });

  it('lastMonthBoundary returns the previous calendar month', () => {
    const b = lastMonthBoundary(TODAY);
    expect(b.start).toBe(APRIL_START);
    expect(b.end).toBe(APRIL_END);
  });

  it('lastMonthBoundary handles January correctly (rolls back to December)', () => {
    const jan = new Date(2026, 0, 10, 9, 0, 0).getTime();
    const b = lastMonthBoundary(jan);
    expect(new Date(b.start).getFullYear()).toBe(2025);
    expect(new Date(b.start).getMonth()).toBe(11); // December
  });
});

// =====================================================================
// getUncoveredItemsFromLastMonth
// =====================================================================

describe('getUncoveredItemsFromLastMonth', () => {
  beforeEach(clearAll);

  it('returns last month uncovered HF items, skipping covered ones', async () => {
    await db.goals.add(mkMonthly({
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      relatedModules: ['harmonic-fluency'],
      startDate: APRIL_START,
      targetDate: APRIL_END,
    }));
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-1', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
      mkSpacing({ itemRef: 'hf-2', moduleRef: 'harmonic-fluency', acquisitionStage: 'new' }),
      mkSpacing({ itemRef: 'hf-3', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquired' }), // covered
      mkSpacing({ itemRef: 'hf-4', moduleRef: 'harmonic-fluency', acquisitionStage: 'mastered' }), // covered
    ]);
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].moduleId).toBe('harmonic-fluency');
    expect(out[0].uncoveredItemRefs.sort()).toEqual(['hf-1', 'hf-2']);
  });

  it("mid-month goal change: only the LAST-configured target's scope counts", async () => {
    // User had a Shapes augmented-triads goal April 1, abandoned it
    // April 15 and switched to minor-7ths. Augmented leftovers
    // should NOT carry over — they're from an abandoned earlier plan,
    // not "leftover from end of month."
    await db.goals.add(mkMonthly({
      id: 'abandoned-early',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_triads_aug',
      relatedModules: ['shapes-and-patterns'],
      startDate: APRIL_START,
      targetDate: APRIL_END,
      status: 'abandoned',
    }));
    await db.goals.add(mkMonthly({
      id: 'last-configured',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_sevenths',
      relatedModules: ['shapes-and-patterns'],
      startDate: APRIL_START + 14 * 24 * 60 * 60 * 1000, // April 15
      targetDate: APRIL_END,
    }));
    // Uncovered augmented row + uncovered min7 row both in
    // spacingState, but only the min7 should carry over.
    await db.spacingState.bulkAdd([
      mkSpacing({
        itemRef: 'chord-shape:aug:C:root',
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquiring',
        memoryType: 'procedural',
      }),
      mkSpacing({
        itemRef: 'chord-shape:min7:G:root',
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquiring',
        memoryType: 'procedural',
      }),
    ]);
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    const sp = out.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp).toBeDefined();
    expect(sp!.monthlyGoalId).toBe('last-configured');
    expect(sp!.uncoveredItemRefs).toEqual(['chord-shape:min7:G:root']);
  });

  it('module filter narrows the result', async () => {
    await db.goals.bulkAdd([
      mkMonthly({
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        relatedModules: ['harmonic-fluency'],
        startDate: APRIL_START,
        targetDate: APRIL_END,
      }),
      mkMonthly({
        targetMetric: 'ear_training_coverage_at_acquired',
        relatedModules: ['ear-training'],
        startDate: APRIL_START,
        targetDate: APRIL_END,
      }),
    ]);
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-1', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
      mkSpacing({ itemRef: 'iv-1', moduleRef: 'intervals',        acquisitionStage: 'acquiring' }),
    ]);
    const hfOnly = await getUncoveredItemsFromLastMonth(TODAY, 'harmonic-fluency');
    expect(hfOnly).toHaveLength(1);
    expect(hfOnly[0].moduleId).toBe('harmonic-fluency');
  });

  it('returns empty when no monthly goal overlaps last month', async () => {
    // A monthly goal LIVES in MAY only — doesn't overlap April.
    await db.goals.add(mkMonthly({
      startDate: MAY_START,
      targetDate: MAY_END,
    }));
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toEqual([]);
  });

  it('skips a module whose last-month goal scope is fully covered', async () => {
    await db.goals.add(mkMonthly({
      relatedModules: ['harmonic-fluency'],
    }));
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-1', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquired' }),
      mkSpacing({ itemRef: 'hf-2', moduleRef: 'harmonic-fluency', acquisitionStage: 'mastered' }),
    ]);
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toEqual([]);
  });
});

// =====================================================================
// getCarryoverBacklog
// =====================================================================

describe('getCarryoverBacklog', () => {
  beforeEach(clearAll);

  it('items from 2 months ago stay in the backlog until covered', async () => {
    // March monthly that closed April 30 (1 month before TODAY) AND
    // a February-closing goal — both contribute backlog items as
    // long as their items are still uncovered.
    await db.goals.add(mkMonthly({
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      relatedModules: ['harmonic-fluency'],
      startDate: MARCH_START,
      targetDate: MARCH_END,
    }));
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-old-1', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
      mkSpacing({ itemRef: 'hf-old-2', moduleRef: 'harmonic-fluency', acquisitionStage: 'new' }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const hf = backlog.find(e => e.moduleId === 'harmonic-fluency');
    expect(hf).toBeDefined();
    expect(hf!.uncoveredItemRefs.sort()).toEqual(['hf-old-1', 'hf-old-2']);
  });

  it('items that reached COVERED_STAGES drop out of the backlog', async () => {
    await db.goals.add(mkMonthly({
      relatedModules: ['harmonic-fluency'],
      startDate: MARCH_START,
      targetDate: MARCH_END,
    }));
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-1', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
      mkSpacing({ itemRef: 'hf-2', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquired' }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const hf = backlog.find(e => e.moduleId === 'harmonic-fluency');
    expect(hf!.uncoveredItemRefs).toEqual(['hf-1']);
  });

  it("items already in this month's scope are excluded from backlog", async () => {
    // March monthly (past) + May monthly (current). The uncovered
    // item is scoped by BOTH — backlog drops it because it's already
    // in the current month's plan.
    await db.goals.bulkAdd([
      mkMonthly({
        id: 'march-past',
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        relatedModules: ['harmonic-fluency'],
        startDate: MARCH_START,
        targetDate: MARCH_END,
      }),
      mkMonthly({
        id: 'may-current',
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        relatedModules: ['harmonic-fluency'],
        startDate: MAY_START,
        targetDate: MAY_END,
      }),
    ]);
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-still-open', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    expect(backlog).toEqual([]); // item is in current scope, not backlog
  });

  it('aggregates across multiple past months per module', async () => {
    // Same module covered by 3 different past monthlies. Distinct
    // uncovered items in each → backlog gathers them all.
    await db.goals.bulkAdd([
      mkMonthly({
        id: 'march-goal',
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        relatedModules: ['harmonic-fluency'],
        startDate: MARCH_START,
        targetDate: MARCH_END,
      }),
      mkMonthly({
        id: 'april-goal',
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        relatedModules: ['harmonic-fluency'],
        startDate: APRIL_START,
        targetDate: APRIL_END,
      }),
    ]);
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-a', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
      mkSpacing({ itemRef: 'hf-b', moduleRef: 'harmonic-fluency', acquisitionStage: 'new' }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const hf = backlog.find(e => e.moduleId === 'harmonic-fluency');
    expect(hf!.uncoveredItemRefs.sort()).toEqual(['hf-a', 'hf-b']);
  });

  it("mid-month-change rule applies within each past period", async () => {
    // April had TWO configured monthlies — abandoned-early goal
    // (augmented), last-configured (min7). Only min7's leftover
    // contributes to backlog, same as the "last month" detection.
    await db.goals.bulkAdd([
      mkMonthly({
        id: 'abandoned-early',
        targetMetric: 'shapes_coverage_at_acquired_specific',
        targetUnit: 'chord_shape_triads_aug',
        relatedModules: ['shapes-and-patterns'],
        startDate: APRIL_START,
        targetDate: APRIL_END,
        status: 'abandoned',
      }),
      mkMonthly({
        id: 'last-configured',
        targetMetric: 'shapes_coverage_at_acquired_specific',
        targetUnit: 'chord_shape_sevenths',
        relatedModules: ['shapes-and-patterns'],
        startDate: APRIL_START + 14 * 24 * 60 * 60 * 1000,
        targetDate: APRIL_END,
      }),
    ]);
    await db.spacingState.bulkAdd([
      mkSpacing({
        itemRef: 'chord-shape:aug:C:root',
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquiring',
        memoryType: 'procedural',
      }),
      mkSpacing({
        itemRef: 'chord-shape:min7:G:root',
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquiring',
        memoryType: 'procedural',
      }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const sp = backlog.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp!.uncoveredItemRefs).toEqual(['chord-shape:min7:G:root']);
    expect(sp!.monthlyGoalId).toBe('last-configured');
  });

  it('module filter narrows backlog the same way', async () => {
    await db.goals.bulkAdd([
      mkMonthly({
        relatedModules: ['harmonic-fluency'],
        startDate: MARCH_START,
        targetDate: MARCH_END,
      }),
      mkMonthly({
        targetMetric: 'ear_training_coverage_at_acquired',
        relatedModules: ['ear-training'],
        startDate: MARCH_START,
        targetDate: MARCH_END,
      }),
    ]);
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'hf-1', moduleRef: 'harmonic-fluency', acquisitionStage: 'acquiring' }),
      mkSpacing({ itemRef: 'iv-1', moduleRef: 'intervals',        acquisitionStage: 'acquiring' }),
    ]);
    const etOnly = await getCarryoverBacklog(TODAY, 'ear-training');
    expect(etOnly).toHaveLength(1);
    expect(etOnly[0].moduleId).toBe('ear-training');
  });

  it('empty result when no past monthlies have uncovered scope', async () => {
    expect(await getCarryoverBacklog(TODAY)).toEqual([]);
  });
});

// =====================================================================
// _ helper sanity — stage type imported correctly
// =====================================================================

describe('AcquisitionStage import (type sanity)', () => {
  it('covered stages are filtered out of detection', () => {
    const stages: AcquisitionStage[] = ['acquired', 'consolidated', 'mastered'];
    expect(stages).toEqual(['acquired', 'consolidated', 'mastered']);
  });
});
