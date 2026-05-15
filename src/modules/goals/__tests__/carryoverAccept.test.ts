// @vitest-environment jsdom
/**
 * Phase B Step 9b follow-up — Accept's goal-modification side effect.
 *
 * Verifies the goal record actually changes on Accept (not just a
 * localStorage marker), Decline produces no goal mutation, and the
 * next detection run sees the module as resolved (Part D — banner
 * naturally hides without needing a localStorage decision).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyCarryoverAcceptance } from '../carryoverAccept';
import { getUncoveredItemsFromLastMonth, type ModuleUncoveredEntry } from '../carryover';
import { db, type Goal } from '../../../lib/db';

const TODAY = new Date(2026, 4, 15, 9, 0, 0).getTime();
const APRIL_START = new Date(2026, 3, 1).getTime();
const APRIL_END   = new Date(2026, 3, 30, 23, 59, 59, 999).getTime();
const MAY_START   = new Date(2026, 4, 1).getTime();
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

// =====================================================================
// Accept on an existing current-month monthly — extends scope
// =====================================================================

describe('applyCarryoverAcceptance — existing current monthly', () => {
  beforeEach(clearAll);

  it("appends leftover refs to relatedItems + bumps targetValue", async () => {
    const lastMonthGoal = mkMonthly({
      id: 'april-source',
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START,
      targetDate: APRIL_END,
    });
    const currentGoal = mkMonthly({
      id: 'may-current',
      targetUnit: 'chord_shape_sevenths',
      targetValue: 20,
      relatedItems: [],
      startDate: MAY_START,
      targetDate: MAY_END,
    });
    await db.goals.bulkAdd([lastMonthGoal, currentGoal]);

    const entries: ModuleUncoveredEntry[] = [{
      moduleId: 'shapes-and-patterns',
      uncoveredItemRefs: [
        'chord-shape:aug:C:root',
        'chord-shape:aug:D:root',
        'chord-shape:aug:E:root',
      ],
      monthlyGoalId: lastMonthGoal.id,
    }];
    await applyCarryoverAcceptance(
      entries,
      { 'shapes-and-patterns': 'accepted' },
      TODAY,
    );

    const after = await db.goals.get('may-current');
    expect(after).toBeDefined();
    expect(after!.relatedItems.sort()).toEqual([
      'chord-shape:aug:C:root',
      'chord-shape:aug:D:root',
      'chord-shape:aug:E:root',
    ]);
    expect(after!.targetValue).toBe(23); // 20 + 3 leftover
  });

  it('dedupes when leftover items already exist in relatedItems', async () => {
    const lastMonth = mkMonthly({ id: 'src' });
    const current = mkMonthly({
      id: 'may',
      targetValue: 30,
      relatedItems: ['chord-shape:aug:C:root'], // already there
      startDate: MAY_START,
      targetDate: MAY_END,
    });
    await db.goals.bulkAdd([lastMonth, current]);

    await applyCarryoverAcceptance(
      [{
        moduleId: 'shapes-and-patterns',
        uncoveredItemRefs: [
          'chord-shape:aug:C:root',   // dupe — already in relatedItems
          'chord-shape:aug:D:root',   // new
        ],
        monthlyGoalId: lastMonth.id,
      }],
      { 'shapes-and-patterns': 'accepted' },
      TODAY,
    );

    const after = await db.goals.get('may');
    expect(after!.relatedItems.sort()).toEqual([
      'chord-shape:aug:C:root',
      'chord-shape:aug:D:root',
    ]);
    expect(after!.targetValue).toBe(31); // 30 + 1 genuinely new
  });

  it('Decline does NOT modify the goal record', async () => {
    const lastMonth = mkMonthly({ id: 'src' });
    const current = mkMonthly({
      id: 'may',
      targetValue: 25,
      relatedItems: [],
      startDate: MAY_START,
      targetDate: MAY_END,
    });
    await db.goals.bulkAdd([lastMonth, current]);

    await applyCarryoverAcceptance(
      [{
        moduleId: 'shapes-and-patterns',
        uncoveredItemRefs: ['chord-shape:aug:C:root'],
        monthlyGoalId: lastMonth.id,
      }],
      { 'shapes-and-patterns': 'declined' },
      TODAY,
    );

    const after = await db.goals.get('may');
    expect(after!.relatedItems).toEqual([]);
    expect(after!.targetValue).toBe(25);
  });

  it('idempotent — re-running with the same decisions is a no-op', async () => {
    const lastMonth = mkMonthly({ id: 'src' });
    const current = mkMonthly({
      id: 'may',
      targetValue: 10,
      relatedItems: [],
      startDate: MAY_START,
      targetDate: MAY_END,
    });
    await db.goals.bulkAdd([lastMonth, current]);

    const entries: ModuleUncoveredEntry[] = [{
      moduleId: 'shapes-and-patterns',
      uncoveredItemRefs: ['chord-shape:aug:C:root', 'chord-shape:aug:D:root'],
      monthlyGoalId: lastMonth.id,
    }];
    await applyCarryoverAcceptance(entries, { 'shapes-and-patterns': 'accepted' }, TODAY);
    await applyCarryoverAcceptance(entries, { 'shapes-and-patterns': 'accepted' }, TODAY);

    const after = await db.goals.get('may');
    expect(after!.relatedItems.sort()).toEqual([
      'chord-shape:aug:C:root',
      'chord-shape:aug:D:root',
    ]);
    expect(after!.targetValue).toBe(12); // 10 + 2, not 14
  });
});

// =====================================================================
// Accept with no current-month monthly — creates a stub
// =====================================================================

describe('applyCarryoverAcceptance — no current monthly → stub creation', () => {
  beforeEach(clearAll);

  it('creates a stub monthly carrying the leftover items as scope', async () => {
    const source = mkMonthly({
      id: 'april-src',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_triads_aug',
      relatedModules: ['shapes-and-patterns'],
      startDate: APRIL_START,
      targetDate: APRIL_END,
    });
    await db.goals.add(source);

    await applyCarryoverAcceptance(
      [{
        moduleId: 'shapes-and-patterns',
        uncoveredItemRefs: [
          'chord-shape:aug:C:root',
          'chord-shape:aug:D:root',
        ],
        monthlyGoalId: source.id,
      }],
      { 'shapes-and-patterns': 'accepted' },
      TODAY,
    );

    const goals = await db.goals.toArray();
    expect(goals).toHaveLength(2); // source + stub
    const stub = goals.find(g => g.id !== source.id)!;
    expect(stub.scope).toBe('monthly');
    expect(stub.targetMetric).toBe('shapes_coverage_at_acquired_specific');
    expect(stub.targetUnit).toBe('chord_shape_triads_aug');
    expect(stub.relatedModules).toEqual(['shapes-and-patterns']);
    expect(stub.relatedItems.sort()).toEqual([
      'chord-shape:aug:C:root',
      'chord-shape:aug:D:root',
    ]);
    expect(stub.targetValue).toBe(2);
    expect(stub.status).toBe('active');
    expect(stub.startDate).toBe(TODAY);
    expect(stub.targetDate).toBe(MAY_END);
    expect(stub.isUmbrella).toBe(false);
  });
});

// =====================================================================
// Part D — Accept naturally hides the module from re-detection
// =====================================================================

describe('Accept-then-redetect — banner naturally hides for accepted modules', () => {
  beforeEach(clearAll);

  it('after Accept, getUncoveredItemsFromLastMonth no longer surfaces that module', async () => {
    // Last month: scope = 48 augmented-triad items, all uncovered.
    // Current month: existing monthly. Accept extends its
    // relatedItems with every leftover item → detection sees no
    // remaining leftover (Part D natural-hide path, no localStorage
    // decision needed).
    const lastMonth = mkMonthly({
      id: 'april-src',
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START,
      targetDate: APRIL_END,
    });
    const current = mkMonthly({
      id: 'may-current',
      targetUnit: 'chord_shape_sevenths', // different scope
      relatedItems: [],
      startDate: MAY_START,
      targetDate: MAY_END,
    });
    await db.goals.bulkAdd([lastMonth, current]);

    // Before Accept — augmented module surfaces in detection.
    const before = await getUncoveredItemsFromLastMonth(TODAY);
    expect(before).toHaveLength(1);
    expect(before[0].moduleId).toBe('shapes-and-patterns');

    // Accept all of the detected leftover.
    await applyCarryoverAcceptance(
      before,
      { 'shapes-and-patterns': 'accepted' },
      TODAY,
    );

    // After Accept — module drops from detection (items now in
    // current scope via relatedItems extension).
    const after = await getUncoveredItemsFromLastMonth(TODAY);
    expect(after).toEqual([]);
  });

  it('Decline-then-redetect still surfaces the module (banner UX hides it via localStorage)', async () => {
    const lastMonth = mkMonthly({
      id: 'april-src',
      targetUnit: 'chord_shape_triads_aug',
      startDate: APRIL_START,
      targetDate: APRIL_END,
    });
    await db.goals.add(lastMonth);

    const detected = await getUncoveredItemsFromLastMonth(TODAY);
    await applyCarryoverAcceptance(
      detected,
      { 'shapes-and-patterns': 'declined' },
      TODAY,
    );
    const after = await getUncoveredItemsFromLastMonth(TODAY);
    // Decline doesn't modify the goal record → items still uncovered.
    expect(after).toHaveLength(1);
    expect(after[0].moduleId).toBe('shapes-and-patterns');
  });
});
