// @vitest-environment jsdom
/**
 * v44 — `dq-extra-1` folds into `dq-maj-4` (Silas, 14 Sep 2026).
 *
 * THIS IS THE STEP THAT CAN LOSE SOMETHING, so, as with the 11 Sep fold
 * (`retire913Migration.test.ts`), the assertions are about preservation:
 * every attempt, schedule, diary line, note, goal scope and past block
 * filed under the retired card ends up on the card it folds into, and a
 * reader with history on both keeps all of it.
 *
 * THE REAL FOLD IS UNDER TEST, against real Dexie tables with seeded
 * rows — `db.ts` v44 calls the same function.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { MigrationTable, MigrationTx } from '../migrations/retire913';
import {
  RETIRED_CARD, TARGET_CARD, foldRetiredDiatonicCard,
} from '../migrations/retireDqExtra1';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const HF = 'harmonic-fluency';
const skill = (id: string) => `${HF}:card:${id}`;

const tx: MigrationTx = {
  table: (name: string) =>
    (db as unknown as Record<string, MigrationTable>)[name],
};

function spacingRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `sp-${String(over.itemRef)}-${String(over.hand ?? 'both')}`,
    itemRef: TARGET_CARD,
    moduleRef: HF,
    hand: 'both',
    memoryType: 'recall',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt: NOW,
    nextDueAt: NOW + 3 * DAY,
    performanceHistory: [],
    ...over,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.attempts.clear(), db.spacingState.clear(), db.harmonicDiaryEntries.clear(),
    db.skillAnnotations.clear(), db.goals.clear(), db.practiceBlocks.clear(),
  ]);
});

describe('the attempts', () => {
  it('moves the retired card\'s attempts, and nobody else\'s', async () => {
    await db.attempts.bulkPut([
      { id: 'a1', moduleId: HF, itemId: RETIRED_CARD, timestamp: NOW },
      { id: 'a2', moduleId: HF, itemId: 'dq-maj-1', timestamp: NOW },
      { id: 'a3', moduleId: 'chord-recognition', itemId: RETIRED_CARD, timestamp: NOW },
    ] as never);
    const n = await foldRetiredDiatonicCard(tx);
    expect(n.attempts).toBe(1);
    expect((await db.attempts.get('a1'))?.itemId).toBe(TARGET_CARD);
    expect((await db.attempts.get('a2'))?.itemId).toBe('dq-maj-1');
    expect((await db.attempts.get('a3'))?.itemId).toBe(RETIRED_CARD);
  });
});

describe('the schedule', () => {
  it('moves a row with no twin, keeping its id, which is the sync key', async () => {
    await db.spacingState.put(spacingRow({ itemRef: RETIRED_CARD }) as never);
    const n = await foldRetiredDiatonicCard(tx);
    expect(n.spacingMoved).toBe(1);
    const row = await db.spacingState.get(`sp-${RETIRED_CARD}-both`);
    expect(row?.itemRef).toBe(TARGET_CARD);
  });

  it('merges where the reader has both: further stage, sooner due, both histories, the flag kept', async () => {
    await db.spacingState.bulkPut([
      spacingRow({ itemRef: TARGET_CARD, nextDueAt: NOW + 5 * DAY, performanceHistory: [{ t: NOW - DAY }] }),
      spacingRow({
        itemRef: RETIRED_CARD, acquisitionStage: 'acquired', nextDueAt: NOW + 2 * DAY,
        performanceHistory: [{ t: NOW - 2 * DAY }], reviewFlagged: true, reviewFlagNote: 'the IV as a triad',
      }),
    ] as never);
    const n = await foldRetiredDiatonicCard(tx);
    expect(n.spacingMerged).toBe(1);
    expect(await db.spacingState.get(`sp-${RETIRED_CARD}-both`)).toBeUndefined();
    const merged = await db.spacingState.get(`sp-${TARGET_CARD}-both`);
    expect(merged?.acquisitionStage).toBe('acquired');
    expect(merged?.nextDueAt).toBe(NOW + 2 * DAY);
    expect(merged?.performanceHistory).toHaveLength(2);
    expect(merged?.reviewFlagged).toBe(true);
    expect(merged?.reviewFlagNote).toBe('the IV as a triad');
  });
});

describe('what was written by hand', () => {
  it('a diary entry merges with the survivor\'s, both texts kept', async () => {
    await db.harmonicDiaryEntries.bulkPut([
      { entryId: 'e1', skillId: skill(TARGET_CARD), userText: 'home, with the 7th', emotionalTags: ['warm'], genreTags: [], lastEdited: NOW },
      { entryId: 'e2', skillId: skill(RETIRED_CARD), userText: 'the plain 4', emotionalTags: ['open'], genreTags: [], lastEdited: NOW - DAY },
    ] as never);
    const n = await foldRetiredDiatonicCard(tx);
    expect(n.diaryMerged).toBe(1);
    expect(await db.harmonicDiaryEntries.get('e2')).toBeUndefined();
    const kept = await db.harmonicDiaryEntries.get('e1');
    expect(kept?.userText).toBe('home, with the 7th\nthe plain 4');
    expect(kept?.emotionalTags).toEqual(['warm', 'open']);
  });

  it('a diary entry with no twin moves to the surviving card', async () => {
    await db.harmonicDiaryEntries.put(
      { entryId: 'e2', skillId: skill(RETIRED_CARD), userText: 'the plain 4', emotionalTags: [], genreTags: [], lastEdited: NOW } as never,
    );
    const n = await foldRetiredDiatonicCard(tx);
    expect(n.diaryMoved).toBe(1);
    expect((await db.harmonicDiaryEntries.get('e2'))?.skillId).toBe(skill(TARGET_CARD));
  });

  it('an annotation, a goal\'s scope and a past block follow the card', async () => {
    await db.skillAnnotations.put({ skillId: skill(RETIRED_CARD), tags: ['gospel'], note: 'Sunday', updatedAt: NOW } as never);
    await db.goals.put({ id: 'g1', relatedItems: [RETIRED_CARD, TARGET_CARD, 'dq-nm-4'] } as never);
    await db.practiceBlocks.put({ id: 'b1', itemRefs: [RETIRED_CARD, 'dq-maj-1'] } as never);
    const n = await foldRetiredDiatonicCard(tx);
    expect(n).toMatchObject({ annotations: 1, goals: 1, blocks: 1 });
    expect(await db.skillAnnotations.get(skill(RETIRED_CARD))).toBeUndefined();
    expect((await db.skillAnnotations.get(skill(TARGET_CARD)))?.note).toBe('Sunday');
    expect((await db.goals.get('g1'))?.relatedItems).toEqual([TARGET_CARD, 'dq-nm-4']);
    expect((await db.practiceBlocks.get('b1'))?.itemRefs).toEqual([TARGET_CARD, 'dq-maj-1']);
  });
});

describe('it runs once in effect', () => {
  it('a second run finds nothing left to move', async () => {
    await db.attempts.put({ id: 'a1', moduleId: HF, itemId: RETIRED_CARD, timestamp: NOW } as never);
    await db.spacingState.put(spacingRow({ itemRef: RETIRED_CARD }) as never);
    await foldRetiredDiatonicCard(tx);
    const again = await foldRetiredDiatonicCard(tx);
    expect(again).toEqual({
      attempts: 0, spacingMoved: 0, spacingMerged: 0, diaryMoved: 0,
      diaryMerged: 0, annotations: 0, goals: 0, blocks: 0,
    });
  });
});
