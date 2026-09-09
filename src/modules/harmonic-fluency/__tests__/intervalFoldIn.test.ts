/**
 * The interval family regenerated, and twenty-five cards' practice
 * with it.
 *
 * =====================================================================
 * THE TWO IDS THAT COULD NOT BE EXTENDED, AND WHY EACH FAILS.
 *
 * `iv-1` numbers by INDEX into a hand-written array. Insert a pair in
 * the middle and every id after it addresses a different question, with
 * nothing on screen to say so — the failure `generatedCardPairing`
 * exists to catch.
 *
 * `iv-Db-5` names a scale DEGREE. The grid names a SEMITONE COUNT, so
 * the same string would mean a perfect 5th under one generator and a
 * perfect 4th under the other.
 *
 * Both retire for good. The tests below assert that neither shape comes
 * back, because a retired id minted again is the one thing a
 * flag-free, run-it-twice migration cannot survive.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { spacingRowId } from '../../../lib/spacingState';
import { reusedIds } from '../foldInByIdentity';
import {
  describeIntervalFoldIn, foldInIntervalCards, intervalMapping,
  retiredIntervalCards,
} from '../intervalFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 3);

function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    reviewFlagged: true,
    ...over,
  } as never;
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
});

describe('which new card each retired one became', () => {
  const { moves, unpaired } = intervalMapping();

  it('pairs all twenty-five, and leaves none behind', () => {
    expect(retiredIntervalCards()).toHaveLength(25);
    expect(moves).toHaveLength(25);
    expect(unpaired).toEqual([]);
  });

  it('lands each on the grid cell for its own two notes', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('iv-1')).toBe('iv-C-up-7');      // C to G
    expect(by.get('iv-17')).toBe('iv-F-up-6');     // F to B, the tritone
    expect(by.get('iv-Db-5')).toBe('iv-Db-up-7');  // the 5 of D♭, 7 semitones
    expect(by.get('iv-Gb-4')).toBe('iv-Gb-up-5');  // the 4 of G♭, 5 semitones
  });

  it('pairs across an ASCII accidental in the old question text', () => {
    // `iv-10` asks "from F to Bb"; the grid writes "from F to B♭". Two
    // spellings of one name, which `foldInByIdentity` folds before
    // comparing — and which raw bytes would have orphaned.
    const old = retiredIntervalCards().find(c => c.id === 'iv-10')!;
    expect(old.question).toContain('Bb');
    const to = new Map(moves.map(m => [m.from, m.to])).get('iv-10')!;
    expect(FLASHCARDS.find(c => c.id === to)!.question).toContain('B♭');
  });

  it('mints neither retired id shape again', () => {
    expect(reusedIds(retiredIntervalCards())).toEqual([]);
    // And the shapes themselves are gone, not merely these instances:
    // a positional id or a degree-named one arriving later would be the
    // same hazard with a different number in it.
    for (const c of FLASHCARDS.filter(x => x.category === 'intervals')) {
      expect(c.id, c.id).not.toMatch(/^iv-\d+$/);
      expect(c.id, c.id).not.toMatch(/^iv-[A-G][b#]?-\d+$/);
    }
  });
});

describe('the grid it folded into', () => {
  const grid = FLASHCARDS.filter(c => /^iv-[^-]+-up-\d+$/.test(c.id));

  it('is every note by every distance, none missing', () => {
    // 13 x 12 = 156. Six of them need a double flat — the minor 2nd
    // above D♭ is E𝄫 — and write it, with the plain name beside it.
    expect(grid).toHaveLength(156);
  });

  it('starts on both spellings of the sixth pitch', () => {
    expect(grid.filter(c => c.id.startsWith('iv-F#-up-'))).toHaveLength(12);
    expect(grid.filter(c => c.id.startsWith('iv-Gb-up-'))).toHaveLength(12);
  });

  it('names every distance from the one table', () => {
    // Not from the second copy that used to stand in
    // `catalogExpansions` saying "Minor 3rd" where `INTERVAL_NAMES`
    // says "minor 3rd".
    const answers = new Set(grid.map(c => c.correctAnswer));
    expect(answers.has('minor 3rd')).toBe(true);
    expect(answers.has('Minor 3rd')).toBe(false);
  });

  it('says "an Octave", never "a Octave"', () => {
    const octave = FLASHCARDS.find(c => c.id === 'iv-C-up-12')!;
    expect(octave.correctAnswer).toBe('Octave');
    expect(octave.explanation).toContain('an Octave');
  });
});

describe('what follows the card', () => {
  it('moves the row and its flag, and touches nothing else', async () => {
    await db.spacingState.bulkPut([
      spacingRow('iv-1'), spacingRow('iv-inv-sum'),
    ] as never[]);
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: MODULE, itemId: 'iv-Db-5', timestamp: T, isCorrect: true },
      { id: 'a2', moduleId: MODULE, itemId: 'iv-inv-sum', timestamp: T + 1, isCorrect: true },
    ] as never[]);

    const r = await foldInIntervalCards();
    expect(r).toMatchObject({ attempts: 1, spacing: 1, unpaired: [] });

    const moved = await db.spacingState.get(spacingRowId(MODULE, 'iv-1', 'both'));
    expect(moved!.itemRef).toBe('iv-C-up-7');
    expect(moved!.reviewFlagged).toBe(true);
    expect((await db.attempts.toArray()).map(a => a.itemId).sort())
      .toEqual(['iv-Db-up-7', 'iv-inv-sum']);
    expect((await db.spacingState.toArray()).map(s => s.itemRef).sort())
      .toEqual(['iv-C-up-7', 'iv-inv-sum']);
  });
});

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing and says nothing', async () => {
    await db.spacingState.add(spacingRow('iv-2'));
    await foldInIntervalCards();
    const again = await foldInIntervalCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    expect(describeIntervalFoldIn(again)).toBeNull();
  });

  it('merges when a lagging device pushes one back', async () => {
    await db.spacingState.add(spacingRow('iv-C-up-4', {
      lastEngagedAt: T + 5000, reviewFlagged: false,
    }));
    await db.spacingState.add(spacingRow('iv-2', { lastEngagedAt: T }));
    const r = await foldInIntervalCards();
    expect(r.spacingMerged).toBe(1);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('iv-C-up-4');
    expect(rows[0].reviewFlagged).toBe(true);
  });

  it('runs on a database that never had any of these rows', async () => {
    const r = await foldInIntervalCards();
    expect(r).toMatchObject({ attempts: 0, spacing: 0, unpaired: [] });
  });
});
