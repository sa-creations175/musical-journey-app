// @vitest-environment jsdom
/**
 * Phase B Step 9c Part D — end-to-end async loader + accept-merge tests.
 *
 * Covers two seams that the React panel relies on:
 *   1. `loadYearlyPaceContext` integration — given a seeded Dexie state
 *      with a yearly anchor + consistency goal + spacing rows, the
 *      loader returns the right pace context.
 *   2. `dedupeItems` — the one-tap accept's merge helper. Component
 *      rendering is exercised by Vercel preview / manual QA per the
 *      UI commit's deferred-coverage note in the report.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import { loadYearlyPaceContext } from '../yearlyPaceContext';
import { dedupeItems } from '../GoalCreationFlow';

const TODAY = new Date(2026, 4, 15).getTime();   // 2026-05-15
const JAN_2026 = new Date(2026, 0, 1).getTime();
const DEC_2026 = new Date(2026, 11, 31).getTime();

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: partial.id ?? `g-${Math.random().toString(36).slice(2, 9)}`,
    scope: partial.scope ?? 'monthly',
    description: partial.description ?? '',
    targetMetric: partial.targetMetric ?? null,
    targetValue: partial.targetValue ?? null,
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

async function clearAll() {
  await db.goals.clear();
  await db.spacingState.clear();
}

// =====================================================================
// dedupeItems
// =====================================================================

describe('dedupeItems', () => {
  it('appends new items, drops dupes, preserves order', () => {
    const merged = dedupeItems(
      ['a', 'b', 'c'],
      ['b', 'd', 'a', 'e'],
    );
    expect(merged).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('empty incoming → no change', () => {
    expect(dedupeItems(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('empty existing → just incoming, deduped within itself', () => {
    expect(dedupeItems([], ['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('all-dupe incoming → no change', () => {
    expect(dedupeItems(['a', 'b'], ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
});

// =====================================================================
// loadYearlyPaceContext — end-to-end with fake-indexeddb
// =====================================================================

describe('loadYearlyPaceContext — hidden when no yearly anchor', () => {
  beforeEach(clearAll);

  it("no anchor for module → { kind: 'hidden' }", async () => {
    const r = await loadYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      currentMonthlyGoal: null,
      today: TODAY,
    });
    expect(r).toEqual({ kind: 'hidden', reason: 'no-yearly-anchor' });
  });

  it('anchor in different module → still hidden for this module', async () => {
    await db.goals.add(mkGoal({
      id: 'anchor-ear',
      scope: 'yearly', isUmbrella: true,
      targetMetric: 'ear_training_coverage_at_acquired',
      targetValue: 143,
      relatedModules: ['ear-training'],
      startDate: JAN_2026, targetDate: DEC_2026,
    }));
    const r = await loadYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      currentMonthlyGoal: null,
      today: TODAY,
    });
    expect(r.kind).toBe('hidden');
  });
});

describe('loadYearlyPaceContext — visible end-to-end', () => {
  beforeEach(clearAll);

  it('reads anchor + consistency days + covered-so-far from Dexie', async () => {
    // Yearly HF anchor — 143 items total
    await db.goals.add(mkGoal({
      id: 'anchor', scope: 'yearly', isUmbrella: true,
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      targetValue: 143,
      relatedModules: ['harmonic-fluency'],
      startDate: JAN_2026, targetDate: DEC_2026,
    }));
    // Consistency goal — 5 days/week
    await db.goals.add(mkGoal({
      id: 'consistency', scope: 'weekly',
      targetMetric: 'practice_days_per_cadence',
      targetValue: 5,
      startDate: JAN_2026, targetDate: DEC_2026,
    }));
    // 3 HF cards in COVERED stages
    const { FLASHCARDS } = await import('../../harmonic-fluency/catalog');
    const cards = FLASHCARDS.slice(0, 3);
    await db.spacingState.bulkAdd(cards.map((c, i) => ({
      id: `s-${i}`,
      itemRef: c.id,
      moduleRef: 'harmonic-fluency',
      memoryType: 'declarative' as const,
      hand: 'both' as const,
      style: 'solid' as const,
      acquisitionStage: 'acquired' as const,
      currentIntervalDays: 0,
      lastEngagedAt: TODAY,
      nextDueAt: TODAY + 86_400_000,
      performanceHistory: [],
    })));

    const r = await loadYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      currentMonthlyGoal: null,
      today: TODAY,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.yearlyTotal).toBe(143);
    expect(r.coveredSoFar).toBe(3);
    expect(r.monthsRemainingInYear).toBe(8);
    // pace = (143 - 3) / 8 = 17.5
    expect(r.yearlyPaceMonthly).toBe(17.5);
    expect(r.consistencyTargetDays).toBe(5);
    // No monthly goal → currentScopeTarget = 0, consequence = 3/143 ≈ 2%
    expect(r.currentScopeTarget).toBe(0);
    expect(r.consequencePct).toBe(2);
  });

  it('includes pendingRelatedItems via the synthesized currentMonthlyGoal', async () => {
    // Setup: anchor + 5 cards covered.
    await db.goals.add(mkGoal({
      id: 'anchor', scope: 'yearly', isUmbrella: true,
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
      targetValue: 100,
      relatedModules: ['harmonic-fluency'],
      startDate: JAN_2026, targetDate: DEC_2026,
    }));
    const { FLASHCARDS } = await import('../../harmonic-fluency/catalog');
    const five = FLASHCARDS.slice(0, 5);
    await db.spacingState.bulkAdd(five.map((c, i) => ({
      id: `s-${i}`,
      itemRef: c.id,
      moduleRef: 'harmonic-fluency',
      memoryType: 'declarative' as const,
      hand: 'both' as const,
      style: 'solid' as const,
      acquisitionStage: 'acquired' as const,
      currentIntervalDays: 0,
      lastEngagedAt: TODAY,
      nextDueAt: TODAY + 86_400_000,
      performanceHistory: [],
    })));

    // Simulate a monthly goal whose relatedItems include 3 of the
    // covered cards — this is what the synthesizer in
    // YearlyAnchorSuggestionPanel constructs from the draft.
    const draftGoal = mkGoal({
      id: 'draft-preview',
      scope: 'monthly',
      targetMetric: 'harmonic_fluency_coverage_at_acquired_specific',
      targetUnit: 'foundational',
      targetValue: 10,
      relatedModules: ['harmonic-fluency'],
      relatedItems: five.slice(0, 3).map(c => c.id),
    });

    const r = await loadYearlyPaceContext({
      moduleId: 'harmonic-fluency',
      currentMonthlyGoal: draftGoal,
      today: TODAY,
    });
    if (r.kind !== 'visible') throw new Error('expected visible');
    expect(r.currentScopeTarget).toBe(10);
    // currentMonthlyCovered counts only items in the goal's
    // effective scope that are in COVERED stages. The 3 relatedItems
    // are all COVERED, so count >= 3.
    expect(r.currentScopeCovered).toBeGreaterThanOrEqual(3);
  });
});
