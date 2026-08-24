// @vitest-environment jsdom
/**
 * The history moves; the schedule does not.
 *
 * =====================================================================
 * THE FAILURE THIS EXISTS FOR IS SILENT AND LOOKS LIKE DATA LOSS.
 *
 * `HarmonicFluencyTracker` filters attempts by the ids CURRENTLY in
 * the catalog. Delete the 84 old scale-degree cards without moving
 * their history and every answer ever given stops matching: cardsSeen
 * falls to zero, the rolling accuracy window empties, the tier resets
 * to "not enough attempts", and the category reads as never practised.
 * Nothing is actually lost — the rows are in IndexedDB and in every
 * backup — which is what makes it the worst kind of failure. No error,
 * no notice, just a category claiming you never did the work.
 *
 * So the last test here asserts the tracker surface itself, not only
 * the rows underneath it.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { blankState } from '../../../lib/flashcards/spacedRepetition';
import {
  LEGACY_TO_QUALITY, legacyIdFor, migrateScaleDegreeMathIfNeeded,
} from '../sdmQualityMigration';
import { scaleDegreeQualityCards } from '../scaleDegreeQualityCards';
import { FLASHCARDS } from '../catalog';

const MODULE_ID = 'harmonic-fluency';

/**
 * The pairing, pinned card by card.
 *
 * PINNED AS PAIRS, NOT AS A SET. A test that both sides hold 84 ids
 * stays green if the mapping is repointed — `sdm-2-down-6th` still
 * maps somewhere, still one of 84 — and the history then lands on the
 * wrong card with nothing on screen to say so. That is the same defect
 * `generatedCardPairing.ts` exists to catch, one layer down.
 */
const PAIRING: ReadonlyArray<[string, string]> = [
  ['sdm-1-down-2nd', 'sdm-1-down-m2'],
  ['sdm-1-down-3rd', 'sdm-1-down-m3'],
  ['sdm-1-down-4th', 'sdm-1-down-P4'],
  ['sdm-1-down-5th', 'sdm-1-down-P5'],
  ['sdm-1-down-6th', 'sdm-1-down-m6'],
  ['sdm-1-down-7th', 'sdm-1-down-m7'],
  ['sdm-1-up-2nd', 'sdm-1-up-M2'],
  ['sdm-1-up-3rd', 'sdm-1-up-M3'],
  ['sdm-1-up-4th', 'sdm-1-up-P4'],
  ['sdm-1-up-5th', 'sdm-1-up-P5'],
  ['sdm-1-up-6th', 'sdm-1-up-M6'],
  ['sdm-1-up-7th', 'sdm-1-up-M7'],
  ['sdm-2-down-2nd', 'sdm-2-down-M2'],
  ['sdm-2-down-3rd', 'sdm-2-down-m3'],
  ['sdm-2-down-4th', 'sdm-2-down-P4'],
  ['sdm-2-down-5th', 'sdm-2-down-P5'],
  ['sdm-2-down-6th', 'sdm-2-down-M6'],
  ['sdm-2-down-7th', 'sdm-2-down-m7'],
  ['sdm-2-up-2nd', 'sdm-2-up-M2'],
  ['sdm-2-up-3rd', 'sdm-2-up-m3'],
  ['sdm-2-up-4th', 'sdm-2-up-P4'],
  ['sdm-2-up-5th', 'sdm-2-up-P5'],
  ['sdm-2-up-6th', 'sdm-2-up-M6'],
  ['sdm-2-up-7th', 'sdm-2-up-m7'],
  ['sdm-3-down-2nd', 'sdm-3-down-M2'],
  ['sdm-3-down-3rd', 'sdm-3-down-M3'],
  ['sdm-3-down-4th', 'sdm-3-down-P4'],
  ['sdm-3-down-5th', 'sdm-3-down-P5'],
  ['sdm-3-down-6th', 'sdm-3-down-M6'],
  ['sdm-3-down-7th', 'sdm-3-down-M7'],
  ['sdm-3-up-2nd', 'sdm-3-up-m2'],
  ['sdm-3-up-3rd', 'sdm-3-up-m3'],
  ['sdm-3-up-4th', 'sdm-3-up-P4'],
  ['sdm-3-up-5th', 'sdm-3-up-P5'],
  ['sdm-3-up-6th', 'sdm-3-up-m6'],
  ['sdm-3-up-7th', 'sdm-3-up-m7'],
  ['sdm-4-down-2nd', 'sdm-4-down-m2'],
  ['sdm-4-down-3rd', 'sdm-4-down-m3'],
  ['sdm-4-down-4th', 'sdm-4-down-P4'],
  ['sdm-4-down-5th', 'sdm-4-down-d5'],
  ['sdm-4-down-6th', 'sdm-4-down-m6'],
  ['sdm-4-down-7th', 'sdm-4-down-m7'],
  ['sdm-4-up-2nd', 'sdm-4-up-M2'],
  ['sdm-4-up-3rd', 'sdm-4-up-M3'],
  ['sdm-4-up-4th', 'sdm-4-up-A4'],
  ['sdm-4-up-5th', 'sdm-4-up-P5'],
  ['sdm-4-up-6th', 'sdm-4-up-M6'],
  ['sdm-4-up-7th', 'sdm-4-up-M7'],
  ['sdm-5-down-2nd', 'sdm-5-down-M2'],
  ['sdm-5-down-3rd', 'sdm-5-down-m3'],
  ['sdm-5-down-4th', 'sdm-5-down-P4'],
  ['sdm-5-down-5th', 'sdm-5-down-P5'],
  ['sdm-5-down-6th', 'sdm-5-down-m6'],
  ['sdm-5-down-7th', 'sdm-5-down-m7'],
  ['sdm-5-up-2nd', 'sdm-5-up-M2'],
  ['sdm-5-up-3rd', 'sdm-5-up-M3'],
  ['sdm-5-up-4th', 'sdm-5-up-P4'],
  ['sdm-5-up-5th', 'sdm-5-up-P5'],
  ['sdm-5-up-6th', 'sdm-5-up-M6'],
  ['sdm-5-up-7th', 'sdm-5-up-m7'],
  ['sdm-6-down-2nd', 'sdm-6-down-M2'],
  ['sdm-6-down-3rd', 'sdm-6-down-M3'],
  ['sdm-6-down-4th', 'sdm-6-down-P4'],
  ['sdm-6-down-5th', 'sdm-6-down-P5'],
  ['sdm-6-down-6th', 'sdm-6-down-M6'],
  ['sdm-6-down-7th', 'sdm-6-down-m7'],
  ['sdm-6-up-2nd', 'sdm-6-up-M2'],
  ['sdm-6-up-3rd', 'sdm-6-up-m3'],
  ['sdm-6-up-4th', 'sdm-6-up-P4'],
  ['sdm-6-up-5th', 'sdm-6-up-P5'],
  ['sdm-6-up-6th', 'sdm-6-up-m6'],
  ['sdm-6-up-7th', 'sdm-6-up-m7'],
  ['sdm-7-down-2nd', 'sdm-7-down-M2'],
  ['sdm-7-down-3rd', 'sdm-7-down-M3'],
  ['sdm-7-down-4th', 'sdm-7-down-A4'],
  ['sdm-7-down-5th', 'sdm-7-down-P5'],
  ['sdm-7-down-6th', 'sdm-7-down-M6'],
  ['sdm-7-down-7th', 'sdm-7-down-M7'],
  ['sdm-7-up-2nd', 'sdm-7-up-m2'],
  ['sdm-7-up-3rd', 'sdm-7-up-m3'],
  ['sdm-7-up-4th', 'sdm-7-up-P4'],
  ['sdm-7-up-5th', 'sdm-7-up-d5'],
  ['sdm-7-up-6th', 'sdm-7-up-m6'],
  ['sdm-7-up-7th', 'sdm-7-up-m7'],
];


describe('the mapping', () => {
  it('covers all 84, one old id to one new', () => {
    expect(LEGACY_TO_QUALITY.size).toBe(84);
    expect(new Set(LEGACY_TO_QUALITY.values()).size).toBe(84);
  });

  it('maps each old id to the card that asks its question', () => {
    expect(PAIRING).toHaveLength(84);
    for (const [legacy, quality] of PAIRING) {
      expect(LEGACY_TO_QUALITY.get(legacy), legacy).toBe(quality);
    }
  });

  it('holds nothing the pairing does not name', () => {
    // Guards the fixture: a pair dropped from PAIRING would let the
    // assertion above pass by checking less.
    expect([...LEGACY_TO_QUALITY.keys()].sort())
      .toEqual(PAIRING.map(([legacy]) => legacy).sort());
  });

  it('lands only on cards that still exist and alter nothing', () => {
    const byId = new Map(scaleDegreeQualityCards().map(c => [c.id, c]));
    for (const [, quality] of LEGACY_TO_QUALITY) {
      const card = byId.get(quality);
      expect(card, quality).toBeDefined();
      expect(card!.facts.alteration, quality).toBe(0);
    }
  });

  it('derives the old id rather than listing it', () => {
    expect(legacyIdFor(2, 6, 'down')).toBe('sdm-2-down-6th');
    expect(legacyIdFor(1, 2, 'up')).toBe('sdm-1-up-2nd');
    expect(legacyIdFor(4, 3, 'down')).toBe('sdm-4-down-3rd');
  });

  it('names ids the catalog no longer holds', () => {
    // The whole point of the migration: these are gone.
    const live = new Set(FLASHCARDS.map(c => c.id));
    for (const legacy of LEGACY_TO_QUALITY.keys()) {
      expect(live.has(legacy), legacy).toBe(false);
    }
  });
});

const OLD = 'sdm-2-down-6th';
const NEW = 'sdm-2-down-M6';
const T1 = 1_700_000_000_000;
const T2 = 1_700_000_900_000;

async function seedLegacy(): Promise<void> {
  // Explicit ids: the attempts table is keyed on a client-minted
  // `att-<uuid>` string, not an auto-increment, so a fixture without
  // one cannot be stored at all.
  await db.attempts.bulkAdd([
    { id: 'att-fixture-1', moduleId: MODULE_ID, itemId: OLD, correct: true, timestamp: T1 },
    { id: 'att-fixture-2', moduleId: MODULE_ID, itemId: OLD, correct: false, timestamp: T2 },
  ] as never);
  await db.flashcardStates.put({
    cardId: OLD,
    easeFactor: 2.9,
    interval: 21,
    nextReviewDate: T2 + 21 * 86_400_000,
    lastReviewed: T2,
    consecutiveCorrect: 4,
    totalAttempts: 12,
    totalCorrect: 9,
    isFlagged: true,
    flagged: true,
    flagNote: 'come back to this one',
  });
  await db.spacingState.put({
    id: 'sp-old',
    itemRef: OLD,
    moduleRef: MODULE_ID,
    hand: 'both',
    style: 'solid',
    memoryType: 'procedural',
    acquisitionStage: 'consolidating',
    currentIntervalDays: 21,
    lastEngagedAt: T2,
    nextDueAt: T2 + 21 * 86_400_000,
    performanceHistory: [{ correct: true }],
  } as never);
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.flashcardStates.clear();
  await db.spacingState.clear();
});

describe('what moves', () => {
  it('reads an old attempt under the new id, timestamp untouched', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const moved = await db.attempts.where('moduleId').equals(MODULE_ID).toArray();
    expect(moved.map(a => a.itemId)).toEqual([NEW, NEW]);
    expect(moved.map(a => a.timestamp).sort()).toEqual([T1, T2]);
    expect(moved.map(a => a.correct).sort()).toEqual([false, true]);
    // The id it was stored under does not move either — only itemId.
    expect(moved.map(a => a.id).sort()).toEqual(['att-fixture-1', 'att-fixture-2']);
  });

  it('carries lifetime totals and both flags with the note', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const state = await db.flashcardStates.get(NEW);
    expect(state?.totalAttempts).toBe(12);
    expect(state?.totalCorrect).toBe(9);
    expect(state?.isFlagged).toBe(true);
    expect(state?.flagged).toBe(true);
    expect(state?.flagNote).toBe('come back to this one');
    // A record of when, not a schedule for when next.
    expect(state?.lastReviewed).toBe(T2);
  });

  it('keeps the spacing row’s engagement record', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const rows = await db.spacingState.where('moduleRef').equals(MODULE_ID).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe(NEW);
    expect(rows[0].lastEngagedAt).toBe(T2);
    expect(rows[0].performanceHistory).toEqual([{ correct: true }]);
  });
});

describe('what resets', () => {
  it('clears SM-2 scheduling rather than carrying it', async () => {
    await seedLegacy();
    const before = Date.now();
    await migrateScaleDegreeMathIfNeeded();
    const state = await db.flashcardStates.get(NEW);
    expect(state?.easeFactor).toBe(blankState(NEW).easeFactor);
    expect(state?.interval).toBe(0);
    expect(state?.consecutiveCorrect).toBe(0);
    // Due now, which is the point: all 84 come back at once.
    expect(state!.nextReviewDate).toBeGreaterThanOrEqual(before);
  });

  it('clears the spacing schedule, and clears it to a real null', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const rows = await db.spacingState.where('moduleRef').equals(MODULE_ID).toArray();
    expect(rows[0].currentIntervalDays).toBe(0);
    // `Object.hasOwn`, not toHaveProperty(x, undefined): those read
    // identically for a field that is absent and one set to undefined,
    // and "no schedule" has to be stored, not merely missing.
    expect(Object.hasOwn(rows[0], 'nextDueAt')).toBe(true);
    expect(rows[0].nextDueAt).toBeNull();
  });
});

describe('nothing is left behind', () => {
  it('leaves no row keyed on a deleted id', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const legacyIds = new Set(LEGACY_TO_QUALITY.keys());
    expect(await db.flashcardStates.get(OLD)).toBeUndefined();
    const attempts = await db.attempts.toArray();
    expect(attempts.filter(a => legacyIds.has(a.itemId))).toEqual([]);
    const spacing = await db.spacingState.toArray();
    expect(spacing.filter(s => legacyIds.has(s.itemRef))).toEqual([]);
  });
});

describe('running it twice', () => {
  // WHAT MAKES IT IDEMPOTENT IS THE DELETE, not the early return.
  // Removing the early exit leaves every test here green — the queries
  // simply find nothing the second time. Removing the legacy-row
  // deletion turns four of them red, including both doubling checks.

  it('does nothing the second time', async () => {
    await seedLegacy();
    const first = await migrateScaleDegreeMathIfNeeded();
    expect(first).toEqual({ attempts: 2, states: 1, spacing: 1 });
    const second = await migrateScaleDegreeMathIfNeeded();
    expect(second).toEqual({ attempts: 0, states: 0, spacing: 0 });
  });

  it('does not double the totals or the attempts', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    await migrateScaleDegreeMathIfNeeded();
    expect(await db.attempts.count()).toBe(2);
    const state = await db.flashcardStates.get(NEW);
    expect(state?.totalAttempts).toBe(12);
    expect(state?.totalCorrect).toBe(9);
  });

  it('does not re-reset a card practised since the first run', async () => {
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    // Practise the new card: a real interval, earned on the new
    // question. A second run must not touch it.
    await db.flashcardStates.put({
      ...(await db.flashcardStates.get(NEW))!,
      easeFactor: 2.6, interval: 6, consecutiveCorrect: 2,
      nextReviewDate: T2 + 6 * 86_400_000,
    });
    await migrateScaleDegreeMathIfNeeded();
    const state = await db.flashcardStates.get(NEW);
    expect(state?.interval).toBe(6);
    expect(state?.consecutiveCorrect).toBe(2);
    expect(state?.easeFactor).toBe(2.6);
  });

  it('merges rather than overwrites when the new card already has history', async () => {
    // Both sets were live for a while, so a reader can genuinely hold
    // history on both ids.
    await db.flashcardStates.put({
      ...blankState(NEW), totalAttempts: 3, totalCorrect: 2, isFlagged: false,
    });
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const state = await db.flashcardStates.get(NEW);
    expect(state?.totalAttempts).toBe(15);
    expect(state?.totalCorrect).toBe(11);
    expect(state?.isFlagged).toBe(true);
  });
});

describe('the surface a reader would actually notice', () => {
  it('still counts the carried attempts as the category’s history', async () => {
    // What "never practised" would look like, asserted through the
    // same filter the tracker uses: attempts whose itemId is a card
    // currently in the catalog.
    await seedLegacy();
    await migrateScaleDegreeMathIfNeeded();
    const catCardIds = new Set(
      FLASHCARDS.filter(c => c.category === 'scale-degree-math').map(c => c.id),
    );
    const catAttempts = (await db.attempts.toArray())
      .filter(a => a.moduleId === MODULE_ID && catCardIds.has(a.itemId));
    expect(catAttempts).toHaveLength(2);
    expect(new Set(catAttempts.map(a => a.itemId)).size).toBe(1); // cardsSeen
    expect(catAttempts.filter(a => a.correct)).toHaveLength(1);   // rolling window
  });
});
