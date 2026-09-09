/**
 * The key-signature family regenerated, and thirty-six cards' practice
 * with it.
 *
 * =====================================================================
 * TWO CARDS PAIR WITH NOTHING, AND THAT IS THE RULING.
 *
 * "A key with 3 flats is most likely E♭ major or C minor" answers with
 * two keys at once and then tells the reader to look at the final chord
 * to tell which. Two cards replace it, one per mode, and neither asks
 * that question or gives that answer — so the pairing reports them
 * rather than guessing which of the two to attach a history to. That is
 * the failure this whole mechanism exists to refuse.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { spacingRowId } from '../../../lib/spacingState';
import { reusedIds } from '../foldInByIdentity';
import {
  describeKeySignatureFoldIn, foldInKeySignatureCards, keySignatureMapping,
  retiredKeySignatureCards,
} from '../keySignatureFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 5);

function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    studyLater: true,
    ...over,
  } as never;
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
});

describe('which new card each retired one became', () => {
  const { moves, unpaired } = keySignatureMapping();

  it('pairs thirty-six of thirty-eight', () => {
    expect(retiredKeySignatureCards()).toHaveLength(38);
    expect(moves).toHaveLength(36);
    expect(unpaired.map(u => u.from).sort()).toEqual(['ks-19', 'ks-20']);
  });

  it('says why the two cannot pair', () => {
    const why = new Map(unpaired.map(u => [u.from, u.reason]));
    expect(why.get('ks-19')).toContain('Eb major or C minor');
    expect(why.get('ks-19')).toContain('nothing in the deck asks');
  });

  it('replaces them with one card per mode', () => {
    const major = FLASHCARDS.find(c => c.id === 'ks-sig-major-Eb')!;
    const minor = FLASHCARDS.find(c => c.id === 'ks-sig-minor-Eb')!;
    expect(major.question).toBe('The major key with 3 flats is _____');
    expect(major.correctAnswer).toBe('E♭ major');
    expect(minor.question).toBe('The minor key with 3 flats is _____');
    expect(minor.correctAnswer).toBe('C minor');
  });

  it('lands the count cards on their own key, G♭ included', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('ks-1')).toBe('ks-count-C');
    expect(by.get('ks-7')).toBe('ks-count-F#');
    // The G♭ count card is new: the hand-written twelve never had one.
    expect(FLASHCARDS.find(c => c.id === 'ks-count-Gb')!.correctAnswer).toBe('6');
  });

  it('lands the relative cards on the direction they ask', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('ks-13')).toBe('ks-relminor-C');
    expect(by.get('ks-16')).toBe('ks-relmajor-C');
    expect(by.get('ksc-9')).toBe('ks-relmajor-F#');
    // The generated top-up said G♭ major while its id said F♯.
    expect(by.get('ks-relative-F#')).toBe('ks-relminor-Gb');
  });

  it('proves each with the same question and the same answer', () => {
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    const old = new Map(retiredKeySignatureCards().map(c => [c.id, c]));
    for (const { from, to } of moves) {
      // Accidentals fold — `ks-7` writes "F# major", the grid "F♯".
      const ascii = (t: string) => t.replace(/♯/g, '#').replace(/♭/g, 'b');
      expect(ascii(live.get(to)!.question), from).toBe(ascii(old.get(from)!.question));
      expect(ascii(live.get(to)!.correctAnswer), from)
        .toBe(ascii(old.get(from)!.correctAnswer));
    }
  });

  it('mints no retired id again', () => {
    expect(reusedIds(retiredKeySignatureCards())).toEqual([]);
  });

  it('leaves the untouched cards alone', () => {
    // The parallel set, the order of sharps and flats, the natural
    // minor formula and the parallel-vs-relative definition. Silas has
    // not ruled on these.
    for (const id of ['ks-17', 'ks-18', 'ks-21', 'ks-22',
      'ksc-1', 'ksc-2', 'ksc-15', 'ksc-16', 'ksc-17', 'ksc-18',
      'ks-parallel-Db']) {
      expect(FLASHCARDS.some(c => c.id === id), id).toBe(true);
    }
  });
});

describe('what follows the card', () => {
  it('moves the row and its flag, and touches nothing else', async () => {
    await db.spacingState.bulkPut([
      spacingRow('ks-13'), spacingRow('ks-21'),
    ] as never[]);
    const r = await foldInKeySignatureCards();
    expect(r.spacing).toBe(1);
    expect((await db.spacingState.toArray()).map(s => s.itemRef).sort())
      .toEqual(['ks-21', 'ks-relminor-C']);
    const moved = await db.spacingState.get(spacingRowId(MODULE, 'ks-13', 'both'));
    expect(moved!.studyLater).toBe(true);
  });

  it('leaves the two that pair with nothing exactly where they are', async () => {
    await db.spacingState.add(spacingRow('ks-19'));
    const r = await foldInKeySignatureCards();
    expect(r.spacing).toBe(0);
    expect((await db.spacingState.toArray())[0].itemRef).toBe('ks-19');
  });
});

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing, but still says what could not pair', async () => {
    await db.spacingState.add(spacingRow('ks-14'));
    await foldInKeySignatureCards();
    const again = await foldInKeySignatureCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    // The unpaired two are the one outcome nobody would otherwise see,
    // so they are said every run rather than only the first.
    expect(describeKeySignatureFoldIn(again)).toContain('ks-19');
  });

  it('merges when a lagging device pushes one back', async () => {
    await db.spacingState.add(spacingRow('ks-relminor-G', {
      lastEngagedAt: T + 5000, studyLater: false,
    }));
    await db.spacingState.add(spacingRow('ks-14', { lastEngagedAt: T }));
    const r = await foldInKeySignatureCards();
    expect(r.spacingMerged).toBe(1);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('ks-relminor-G');
    expect(rows[0].studyLater).toBe(true);
  });
});
