// @vitest-environment jsdom
/**
 * Phase B Step 9b + follow-up — cross-month carryover detection.
 *
 * Two helpers under test:
 *   · getUncoveredItemsFromLastMonth — last month's leftover scope items.
 *   · getCarryoverBacklog — running list of uncovered items across
 *     ALL past months, minus items in this month's current scope.
 *
 * Follow-up Fix 1: scope is enumerated from CATALOGS (via
 * `effectiveScopeForGoal` in scopeEnumeration.ts) — untouched-in-
 * scope items count as uncovered, not just engaged-but-not-acquired
 * ones. Tests use chord-shape per-quality groups for predictable
 * bounded scope (48 items for any triad sub-group; 360 for the
 * sevenths sub-group).
 *
 * Follow-up Fix 2 / Part D: getUncoveredItemsFromLastMonth excludes
 * items currently in THIS month's scope — Accept's effect (appending
 * leftover items to the current monthly's `relatedItems`) naturally
 * hides resolved modules from the banner.
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

// Catalog scope sizes — pinned in tests so any catalog drift fails
// here loudly (mirrors the moduleItemCounts.test.ts pattern). Triad
// per-quality groups = 12 keys × 4 inv states. Sevenths overall
// per-quality wrapper = 6 seventh qualities × 12 keys × 5 inv
// states (root/inv1/inv2/inv3/fluid, supplementary excluded).
const SHAPES_TRIAD_AUG_SCOPE = 12 * 4;     // 48
const SHAPES_SEVENTHS_SCOPE  = 6 * 12 * 5; // 360

async function clearAll() {
  await db.goals.clear();
  await db.spacingState.clear();
}

function mkMonthly(partial: Partial<Goal>): Goal {
  return {
    id: `g-${Math.random().toString(36).slice(2, 9)}`,
    scope: 'monthly',
    description: 'monthly',
    targetMetric: 'shapes_coverage_at_acquired_specific',
    targetValue: 50,
    targetUnit: 'chord_shape_triads_aug',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['shapes-and-patterns'],
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
    memoryType: 'procedural',
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
// getUncoveredItemsFromLastMonth — Fix 1 (untouched scope items)
// =====================================================================

describe('getUncoveredItemsFromLastMonth', () => {
  beforeEach(clearAll);

  it('Fix 1 regression — untouched-in-scope items count as uncovered, not just engaged ones', async () => {
    // chord_shape_triads_aug scope = 48 items. Seed 2 as COVERED;
    // touch 0 others. With Fix 1 the result should include all 46
    // untouched-in-scope items, NOT just the engaged-but-uncovered.
    await db.goals.add(mkMonthly({
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START, targetDate: APRIL_END,
    }));
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'chord-shape:aug:C:root', moduleRef: 'shapes-and-patterns', acquisitionStage: 'acquired' }),
      mkSpacing({ itemRef: 'chord-shape:aug:D:root', moduleRef: 'shapes-and-patterns', acquisitionStage: 'mastered' }),
    ]);
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toHaveLength(1);
    const sp = out[0];
    expect(sp.moduleId).toBe('shapes-and-patterns');
    expect(sp.uncoveredItemRefs).toHaveLength(SHAPES_TRIAD_AUG_SCOPE - 2);
    // Covered items are dropped from the result.
    expect(sp.uncoveredItemRefs).not.toContain('chord-shape:aug:C:root');
    expect(sp.uncoveredItemRefs).not.toContain('chord-shape:aug:D:root');
    // Items with NO spacing row count as uncovered (Fix 1 — the
    // previous narrowing missed these).
    expect(sp.uncoveredItemRefs).toContain('chord-shape:aug:Bb:inv2');
    expect(sp.uncoveredItemRefs).toContain('chord-shape:aug:F:fluid');
  });

  it("mid-month goal change: only the LAST-configured target's scope counts", async () => {
    // April 1: augmented-triads goal (later abandoned).
    // April 15: switched to sevenths.
    // Only sevenths scope counts as "last month's leftover."
    await db.goals.add(mkMonthly({
      id: 'abandoned-early',
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START, targetDate: APRIL_END,
      status: 'abandoned',
    }));
    await db.goals.add(mkMonthly({
      id: 'last-configured',
      targetUnit: 'chord_shape_sevenths',
      startDate: APRIL_START + 14 * 24 * 60 * 60 * 1000, // April 15
      targetDate: APRIL_END,
    }));
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    const sp = out.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp).toBeDefined();
    expect(sp!.monthlyGoalId).toBe('last-configured');
    // Sevenths scope, not augmented.
    expect(sp!.uncoveredItemRefs).toHaveLength(SHAPES_SEVENTHS_SCOPE);
    expect(sp!.uncoveredItemRefs).toContain('chord-shape:min7:G:root');
    // Augmented (abandoned) does NOT appear.
    expect(sp!.uncoveredItemRefs).not.toContain('chord-shape:aug:C:root');
  });

  it('module filter narrows the result', async () => {
    await db.goals.bulkAdd([
      mkMonthly({
        targetUnit: 'chord_shape_triads_aug',
        relatedModules: ['shapes-and-patterns'],
        startDate: APRIL_START, targetDate: APRIL_END,
      }),
      mkMonthly({
        targetMetric: 'harmonic_fluency_coverage_at_acquired_specific',
        targetUnit: 'ear-recognition',
        relatedModules: ['harmonic-fluency'],
        startDate: APRIL_START, targetDate: APRIL_END,
      }),
    ]);
    const shapesOnly = await getUncoveredItemsFromLastMonth(TODAY, 'shapes-and-patterns');
    expect(shapesOnly).toHaveLength(1);
    expect(shapesOnly[0].moduleId).toBe('shapes-and-patterns');
  });

  it('returns empty when no monthly goal overlaps last month', async () => {
    // A monthly goal LIVES in MAY only — doesn't overlap April.
    await db.goals.add(mkMonthly({
      startDate: MAY_START, targetDate: MAY_END,
    }));
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toEqual([]);
  });

  it('skips a module whose last-month goal scope is fully covered', async () => {
    // Pin every one of the 48 augmented-triad items to a COVERED stage.
    await db.goals.add(mkMonthly({
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START, targetDate: APRIL_END,
    }));
    const allRefs: string[] = [];
    for (const key of ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']) {
      for (const state of ['root','inv1','inv2','fluid']) {
        allRefs.push(`chord-shape:aug:${key}:${state}`);
      }
    }
    const coveredStages: AcquisitionStage[] = ['acquired', 'consolidated', 'mastered'];
    await db.spacingState.bulkAdd(allRefs.map((ref, i) => mkSpacing({
      itemRef: ref,
      moduleRef: 'shapes-and-patterns',
      acquisitionStage: coveredStages[i % coveredStages.length],
    })));
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toEqual([]);
  });

  it('Part D — items already in this month\'s scope drop out of the leftover (Accept simulation)', async () => {
    // Last month's goal: augmented triads. NONE engaged → all 48 uncovered.
    // THIS month's goal already has scope X + Accept extended its
    // relatedItems with 10 augmented items. Those 10 should NOT
    // appear in last month's leftover anymore — Accept's natural
    // hide-the-banner behaviour (no localStorage decision needed).
    await db.goals.add(mkMonthly({
      id: 'last-month',
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START, targetDate: APRIL_END,
    }));
    const acceptedItems = [
      'chord-shape:aug:C:root', 'chord-shape:aug:C:inv1',
      'chord-shape:aug:D:root', 'chord-shape:aug:D:inv1',
      'chord-shape:aug:E:root', 'chord-shape:aug:E:inv1',
      'chord-shape:aug:F:root', 'chord-shape:aug:F:inv1',
      'chord-shape:aug:G:root', 'chord-shape:aug:G:inv1',
    ];
    await db.goals.add(mkMonthly({
      id: 'this-month',
      targetUnit: 'chord_shape_sevenths', // different scope...
      relatedItems: acceptedItems,        // ...but Accept extended scope
      startDate: MAY_START, targetDate: MAY_END,
    }));
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    const sp = out.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp).toBeDefined();
    // 48 augmented − 10 accepted = 38 still leftover.
    expect(sp!.uncoveredItemRefs).toHaveLength(SHAPES_TRIAD_AUG_SCOPE - acceptedItems.length);
    for (const ref of acceptedItems) {
      expect(sp!.uncoveredItemRefs).not.toContain(ref);
    }
  });

  it('Part D — every leftover item already in this month\'s scope hides the module entirely', async () => {
    // Same as above but Accept extends EVERY augmented-triad item.
    await db.goals.add(mkMonthly({
      id: 'last-month',
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START, targetDate: APRIL_END,
    }));
    const allAugRefs: string[] = [];
    for (const key of ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']) {
      for (const state of ['root','inv1','inv2','fluid']) {
        allAugRefs.push(`chord-shape:aug:${key}:${state}`);
      }
    }
    await db.goals.add(mkMonthly({
      id: 'this-month',
      targetUnit: 'chord_shape_sevenths',
      relatedItems: allAugRefs,
      startDate: MAY_START, targetDate: MAY_END,
    }));
    const out = await getUncoveredItemsFromLastMonth(TODAY);
    expect(out).toEqual([]); // module naturally resolves
  });
});

// =====================================================================
// getCarryoverBacklog
// =====================================================================

describe('getCarryoverBacklog', () => {
  beforeEach(clearAll);

  it('items from 2 months ago stay in the backlog until covered', async () => {
    // March monthly (closes April 30 is wrong — March closes March 31).
    // Anchored on March → past monthly bucket.
    await db.goals.add(mkMonthly({
      targetUnit: 'chord_shape_triads_aug',
      startDate: MARCH_START, targetDate: MARCH_END,
    }));
    const backlog = await getCarryoverBacklog(TODAY);
    const sp = backlog.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp).toBeDefined();
    // All 48 augmented items uncovered (no spacing rows).
    expect(sp!.uncoveredItemRefs).toHaveLength(SHAPES_TRIAD_AUG_SCOPE);
  });

  it('items that reached COVERED_STAGES drop out of the backlog', async () => {
    await db.goals.add(mkMonthly({
      targetUnit: 'chord_shape_triads_aug',
      startDate: MARCH_START, targetDate: MARCH_END,
    }));
    await db.spacingState.bulkAdd([
      mkSpacing({ itemRef: 'chord-shape:aug:C:root', moduleRef: 'shapes-and-patterns', acquisitionStage: 'acquired' }),
      mkSpacing({ itemRef: 'chord-shape:aug:D:root', moduleRef: 'shapes-and-patterns', acquisitionStage: 'acquiring' }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const sp = backlog.find(e => e.moduleId === 'shapes-and-patterns');
    // 48 − 1 covered (`aug:C:root`) = 47. `aug:D:root` (acquiring) stays.
    expect(sp!.uncoveredItemRefs).toHaveLength(SHAPES_TRIAD_AUG_SCOPE - 1);
    expect(sp!.uncoveredItemRefs).not.toContain('chord-shape:aug:C:root');
    expect(sp!.uncoveredItemRefs).toContain('chord-shape:aug:D:root');
  });

  it("items already in this month's effective scope are excluded from backlog", async () => {
    // March monthly (past) — scope: all 48 aug-triads.
    // May monthly (current) — relatedItems-extended to include some.
    await db.goals.bulkAdd([
      mkMonthly({
        id: 'march-past',
        targetUnit: 'chord_shape_triads_aug',
        startDate: MARCH_START, targetDate: MARCH_END,
      }),
      mkMonthly({
        id: 'may-current',
        targetUnit: 'chord_shape_triads_aug', // same scope = full overlap
        startDate: MAY_START, targetDate: MAY_END,
      }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    expect(backlog).toEqual([]); // full overlap with current scope
  });

  it('aggregates across multiple past months per module', async () => {
    // March: aug-triads. April: min-triads. Both past, both uncovered.
    await db.goals.bulkAdd([
      mkMonthly({
        id: 'march-goal',
        targetUnit: 'chord_shape_triads_aug',
        startDate: MARCH_START, targetDate: MARCH_END,
      }),
      mkMonthly({
        id: 'april-goal',
        targetUnit: 'chord_shape_triads_min',
        startDate: APRIL_START, targetDate: APRIL_END,
      }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const sp = backlog.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp).toBeDefined();
    // 48 aug + 48 min = 96 items, all uncovered.
    expect(sp!.uncoveredItemRefs).toHaveLength(48 + 48);
    expect(sp!.uncoveredItemRefs).toContain('chord-shape:aug:C:root');
    expect(sp!.uncoveredItemRefs).toContain('chord-shape:min:G:inv1');
  });

  it("mid-month-change rule applies within each past period", async () => {
    // April had TWO configured monthlies — abandoned-early (aug),
    // last-configured (sevenths). Only sevenths scope contributes.
    await db.goals.bulkAdd([
      mkMonthly({
        id: 'abandoned-early',
        targetUnit: 'chord_shape_triads_aug',
        startDate: APRIL_START, targetDate: APRIL_END,
        status: 'abandoned',
      }),
      mkMonthly({
        id: 'last-configured',
        targetUnit: 'chord_shape_sevenths',
        startDate: APRIL_START + 14 * 24 * 60 * 60 * 1000,
        targetDate: APRIL_END,
      }),
    ]);
    const backlog = await getCarryoverBacklog(TODAY);
    const sp = backlog.find(e => e.moduleId === 'shapes-and-patterns');
    expect(sp!.uncoveredItemRefs).toHaveLength(SHAPES_SEVENTHS_SCOPE);
    expect(sp!.monthlyGoalId).toBe('last-configured');
    // Augmented refs do NOT appear (they're from the abandoned plan).
    expect(sp!.uncoveredItemRefs).not.toContain('chord-shape:aug:C:root');
  });

  it('module filter narrows backlog the same way', async () => {
    await db.goals.bulkAdd([
      mkMonthly({
        targetUnit: 'chord_shape_triads_aug',
        relatedModules: ['shapes-and-patterns'],
        startDate: MARCH_START, targetDate: MARCH_END,
      }),
      mkMonthly({
        targetMetric: 'harmonic_fluency_coverage_at_acquired_specific',
        targetUnit: 'ear-recognition',
        relatedModules: ['harmonic-fluency'],
        startDate: MARCH_START, targetDate: MARCH_END,
      }),
    ]);
    const hfOnly = await getCarryoverBacklog(TODAY, 'harmonic-fluency');
    expect(hfOnly).toHaveLength(1);
    expect(hfOnly[0].moduleId).toBe('harmonic-fluency');
  });

  it('empty result when no past monthlies have uncovered scope', async () => {
    expect(await getCarryoverBacklog(TODAY)).toEqual([]);
  });
});
