// @vitest-environment jsdom
/**
 * v45 — Ear-Theory Crossover folds into the cards that ask its facts
 * (Silas, 13 Sep 2026).
 *
 * The one-card fold is under test in `retireDqExtra1Migration.test.ts`.
 * This is what a map of ten adds: two retired cards landing on one
 * survivor, a card with nowhere to go left exactly as it was, and a
 * second run that finds nothing.
 *
 * THE REAL FOLD IS UNDER TEST, against real Dexie tables with seeded
 * rows — `db.ts` v45 calls the same function. That each pair is the right
 * pair is proved against the deck in `deckCleanupPairing.test.ts`.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { MigrationTable, MigrationTx } from '../migrations/retire913';
import {
  DUPLICATES_WITHOUT_DESTINATION, EAR_THEORY_FOLDS, EAR_THEORY_WITHOUT_DESTINATION,
  RETIRED_WITHOUT_DESTINATION, deleteRetiredCardRows, foldDuplicateCards, foldEarTheoryCrossover,
  retireContainsTheNotes,
} from '../migrations/hfDeckCleanup';

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

describe('two retired cards, one survivor', () => {
  it('et-3 and et-4 both land on fh-14, and every answer is kept', async () => {
    await db.attempts.bulkPut([
      { id: 'a1', moduleId: HF, itemId: 'et-3', timestamp: NOW },
      { id: 'a2', moduleId: HF, itemId: 'et-4', timestamp: NOW },
    ] as never);
    await db.spacingState.bulkPut([
      spacingRow({ itemRef: 'fh-14', performanceHistory: [{ t: NOW - 1 * DAY }] }),
      spacingRow({ itemRef: 'et-3', performanceHistory: [{ t: NOW - 3 * DAY }], nextDueAt: NOW + DAY }),
      spacingRow({
        itemRef: 'et-4', acquisitionStage: 'acquired', performanceHistory: [{ t: NOW - 2 * DAY }],
        reviewFlagged: true, reviewFlagNote: 'the flat 7',
      }),
    ] as never);

    const n = await foldEarTheoryCrossover(tx);

    expect(n.attempts).toBe(2);
    expect(n.spacingMerged).toBe(2);
    const rows = await db.spacingState.toArray();
    expect(rows.map(r => r.itemRef)).toEqual(['fh-14']);
    expect(rows[0].performanceHistory).toHaveLength(3);
    expect(rows[0].acquisitionStage).toBe('acquired');
    expect(rows[0].nextDueAt).toBe(NOW + DAY);
    expect(rows[0].reviewFlagNote).toBe('the flat 7');
  });

  it('keeps both diary entries\' words under the survivor', async () => {
    await db.harmonicDiaryEntries.bulkPut([
      { entryId: 'e1', skillId: skill('fh-14'), userText: 'Bb in C', emotionalTags: [], genreTags: [], lastEdited: NOW },
      { entryId: 'e2', skillId: skill('et-3'), userText: 'the lift', emotionalTags: [], genreTags: [], lastEdited: NOW },
      { entryId: 'e3', skillId: skill('et-4'), userText: 'the ending', emotionalTags: [], genreTags: [], lastEdited: NOW },
    ] as never);
    const n = await foldEarTheoryCrossover(tx);
    expect(n.diaryMerged).toBe(2);
    const entries = await db.harmonicDiaryEntries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].userText).toBe('Bb in C\nthe lift\nthe ending');
  });

  it('moves the first note and merges the second into it', async () => {
    await db.skillAnnotations.bulkPut([
      { skillId: skill('et-3'), tags: ['gospel'], note: 'Stevie', updatedAt: NOW },
      { skillId: skill('et-4'), tags: ['soul'], note: 'outro', updatedAt: NOW },
    ] as never);
    const n = await foldEarTheoryCrossover(tx);
    expect(n.annotations).toBe(2);
    const notes = await db.skillAnnotations.toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0].skillId).toBe(skill('fh-14'));
    expect(notes[0].note).toBe('Stevie\noutro');
    expect(notes[0].tags).toEqual(['gospel', 'soul']);
  });
});

describe('a card with nowhere to go', () => {
  it('keeps every row exactly where it is', async () => {
    await db.attempts.put({ id: 'a1', moduleId: HF, itemId: 'et-2', timestamp: NOW } as never);
    await db.spacingState.put(spacingRow({ itemRef: 'et-2' }) as never);
    await db.harmonicDiaryEntries.put(
      { entryId: 'e1', skillId: skill('et-2'), userText: 'Hendrix', emotionalTags: [], genreTags: [], lastEdited: NOW } as never,
    );
    await db.skillAnnotations.put({ skillId: skill('et-2'), tags: [], note: 'kept', updatedAt: NOW } as never);

    const n = await foldEarTheoryCrossover(tx);

    expect(Object.values(n).every(v => v === 0)).toBe(true);
    expect((await db.attempts.get('a1'))?.itemId).toBe('et-2');
    expect((await db.spacingState.get('sp-et-2-both'))?.itemRef).toBe('et-2');
    expect((await db.harmonicDiaryEntries.get('e1'))?.skillId).toBe(skill('et-2'));
    expect((await db.skillAnnotations.get(skill('et-2')))?.note).toBe('kept');
  });
});

describe('the map', () => {
  it('accounts for all fifteen cards once, and folds onto no retired card', () => {
    const folded = Object.keys(EAR_THEORY_FOLDS);
    const all = [...folded, ...EAR_THEORY_WITHOUT_DESTINATION]
      .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
    expect(all).toEqual(Array.from({ length: 15 }, (_, i) => `et-${i + 1}`));
    for (const target of Object.values(EAR_THEORY_FOLDS)) {
      expect(target, target).not.toMatch(/^et-/);
    }
  });

  it('touches nothing outside the deck', async () => {
    await db.attempts.put({ id: 'a1', moduleId: 'chord-recognition', itemId: 'et-1', timestamp: NOW } as never);
    await db.spacingState.put(spacingRow({ itemRef: 'et-1', moduleRef: 'intervals' }) as never);
    await foldEarTheoryCrossover(tx);
    expect((await db.attempts.get('a1'))?.itemId).toBe('et-1');
    expect((await db.spacingState.toArray())[0].itemRef).toBe('et-1');
  });
});

describe('either device, either order', () => {
  it('moves a row without changing its id, so both devices move the same row', async () => {
    await db.spacingState.put(spacingRow({ itemRef: 'et-15' }) as never);
    await foldEarTheoryCrossover(tx);
    expect((await db.spacingState.get('sp-et-15-both'))?.itemRef).toBe('fh-4');
  });

  it('a second run finds nothing left to move', async () => {
    await db.attempts.put({ id: 'a1', moduleId: HF, itemId: 'et-1', timestamp: NOW } as never);
    await db.spacingState.put(spacingRow({ itemRef: 'et-1' }) as never);
    await db.goals.put({ id: 'g1', relatedItems: ['et-1', 'fh-15'] } as never);
    await db.practiceBlocks.put({ id: 'b1', itemRefs: ['et-7'] } as never);
    const first = await foldEarTheoryCrossover(tx);
    expect(first).toMatchObject({ attempts: 1, spacingMoved: 1, goals: 1, blocks: 1 });
    expect((await db.goals.get('g1'))?.relatedItems).toEqual(['fh-15']);
    expect((await db.practiceBlocks.get('b1'))?.itemRefs).toEqual(['cc-13']);
    const again = await foldEarTheoryCrossover(tx);
    expect(Object.values(again).every(v => v === 0)).toBe(true);
  });
});

describe('v46 — the duplicates', () => {
  it('moves a mode card onto the key of C\'s card for its degree, and a secondary dominant onto its generated twin', async () => {
    await db.attempts.bulkPut([
      { id: 'a1', moduleId: HF, itemId: 'mo-3', timestamp: NOW },
      { id: 'a2', moduleId: HF, itemId: 'fh-12', timestamp: NOW },
    ] as never);
    await db.spacingState.put(spacingRow({ itemRef: 'fh-11' }) as never);
    const n = await foldDuplicateCards(tx);
    expect(n).toMatchObject({ attempts: 2, spacingMoved: 1 });
    expect((await db.attempts.get('a1'))?.itemId).toBe('mo-mode-C-4');
    expect((await db.attempts.get('a2'))?.itemId).toBe('fh-v-of-vi-C');
    expect((await db.spacingState.get('sp-fh-11-both'))?.itemRef).toBe('fh-v-of-v-C');
  });

  it('leaves fh-16 and fh-19 where they are', async () => {
    await db.attempts.bulkPut([
      { id: 'a1', moduleId: HF, itemId: 'fh-16', timestamp: NOW },
      { id: 'a2', moduleId: HF, itemId: 'fh-19', timestamp: NOW },
    ] as never);
    const n = await foldDuplicateCards(tx);
    expect(n.attempts).toBe(0);
    expect((await db.attempts.get('a1'))?.itemId).toBe('fh-16');
    expect((await db.attempts.get('a2'))?.itemId).toBe('fh-19');
    expect(DUPLICATES_WITHOUT_DESTINATION).toEqual(['fh-16', 'fh-19']);
  });

  it('a second run finds nothing left to move', async () => {
    await db.attempts.put({ id: 'a1', moduleId: HF, itemId: 'mo-1', timestamp: NOW } as never);
    await foldDuplicateCards(tx);
    const again = await foldDuplicateCards(tx);
    expect(Object.values(again).every(v => v === 0)).toBe(true);
  });
});

describe('v47 — the seven with nowhere to go', () => {
  it('names exactly the seven', () => {
    expect([...RETIRED_WITHOUT_DESTINATION].sort()).toEqual(
      ['et-10', 'et-12', 'et-13', 'et-2', 'et-5', 'fh-16', 'fh-19'],
    );
  });

  it('deletes every answer row of the seven, and nobody else\'s', async () => {
    await db.attempts.bulkPut([
      { id: 'a1', moduleId: HF, itemId: 'et-2', timestamp: NOW },
      { id: 'a2', moduleId: HF, itemId: 'fh-19', timestamp: NOW },
      { id: 'a3', moduleId: HF, itemId: 'fh-4', timestamp: NOW },
      { id: 'a4', moduleId: 'chord-recognition', itemId: 'et-2', timestamp: NOW },
    ] as never);
    await db.spacingState.bulkPut([
      spacingRow({ itemRef: 'et-5' }), spacingRow({ itemRef: 'fh-16' }), spacingRow({ itemRef: 'fh-4' }),
    ] as never);
    await db.harmonicDiaryEntries.bulkPut([
      { entryId: 'e1', skillId: skill('et-10'), userText: 'gone', emotionalTags: [], genreTags: [], lastEdited: NOW },
      { entryId: 'e2', skillId: skill('fh-4'), userText: 'kept', emotionalTags: [], genreTags: [], lastEdited: NOW },
    ] as never);
    await db.skillAnnotations.bulkPut([
      { skillId: skill('et-12'), tags: [], note: 'gone', updatedAt: NOW },
      { skillId: skill('fh-4'), tags: [], note: 'kept', updatedAt: NOW },
    ] as never);
    await db.goals.put({ id: 'g1', relatedItems: ['et-13', 'fh-4'] } as never);
    await db.practiceBlocks.put({ id: 'b1', itemRefs: ['fh-19', 'cc-1'] } as never);

    const n = await deleteRetiredCardRows(tx);

    expect(n).toEqual({ attempts: 2, spacing: 2, diary: 1, annotations: 1, goals: 1, blocks: 1 });
    expect((await db.attempts.toArray()).map(a => a.id).sort()).toEqual(['a3', 'a4']);
    expect((await db.spacingState.toArray()).map(r => r.itemRef)).toEqual(['fh-4']);
    expect((await db.harmonicDiaryEntries.toArray()).map(e => e.entryId)).toEqual(['e2']);
    expect((await db.skillAnnotations.toArray()).map(a => a.skillId)).toEqual([skill('fh-4')]);
    expect((await db.goals.get('g1'))?.relatedItems).toEqual(['fh-4']);
    expect((await db.practiceBlocks.get('b1'))?.itemRefs).toEqual(['cc-1']);
  });

  it('a second run, or the other device\'s, finds nothing', async () => {
    await db.attempts.put({ id: 'a1', moduleId: HF, itemId: 'et-13', timestamp: NOW } as never);
    await deleteRetiredCardRows(tx);
    const again = await deleteRetiredCardRows(tx);
    expect(Object.values(again).every(v => v === 0)).toBe(true);
  });
});

describe('v48 — "contains the notes" into Spell the chord', () => {
  it('folds the four diatonic sevenths and deletes the other four\'s rows', async () => {
    await db.attempts.bulkPut([
      { id: 'a1', moduleId: HF, itemId: 'cc-5', timestamp: NOW },
      { id: 'a2', moduleId: HF, itemId: 'cc-14', timestamp: NOW },
      { id: 'a3', moduleId: HF, itemId: 'cc-15', timestamp: NOW },
      { id: 'a4', moduleId: HF, itemId: 'cc-9', timestamp: NOW },
    ] as never);
    await db.spacingState.bulkPut([spacingRow({ itemRef: 'cc-6' }), spacingRow({ itemRef: 'cc-17' })] as never);
    const { folded, deleted } = await retireContainsTheNotes(tx);
    expect(folded).toMatchObject({ attempts: 2, spacingMoved: 1 });
    expect(deleted).toMatchObject({ attempts: 1, spacing: 1 });
    expect((await db.attempts.get('a1'))?.itemId).toBe('cc-spell-major-C-1');
    expect((await db.attempts.get('a2'))?.itemId).toBe('cc-spell-major-C-4');
    expect(await db.attempts.get('a3')).toBeUndefined();
    expect((await db.attempts.get('a4'))?.itemId).toBe('cc-9');
    expect((await db.spacingState.get('sp-cc-6-both'))?.itemRef).toBe('cc-spell-major-C-5');
    expect(await db.spacingState.get('sp-cc-17-both')).toBeUndefined();
  });

  it('a second run finds nothing', async () => {
    await db.attempts.put({ id: 'a1', moduleId: HF, itemId: 'cc-7', timestamp: NOW } as never);
    await retireContainsTheNotes(tx);
    const again = await retireContainsTheNotes(tx);
    expect(Object.values(again.folded).every(v => v === 0)).toBe(true);
    expect(Object.values(again.deleted).every(v => v === 0)).toBe(true);
  });
});
