/**
 * The mode family regenerated, and thirty-six cards' practice with it.
 *
 * =====================================================================
 * THE CLAIM THAT MATTERS IS THAT NO ROW LANDS ON THE WRONG CARD, and
 * the F♯/G♭ pair is where it could. `mo-mode-of-F#-2` MEANS the G♭ card
 * while SPELLING F♯; if its rows landed on the new F♯ card, the reader
 * would find a mode they had never drilled reading as practised. So
 * that pair is asserted by name, both ways.
 *
 * The second claim is that no retired id is minted again — the one
 * thing a flag-free, run-it-twice migration cannot survive.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { spacingRowId } from '../../../lib/spacingState';
import { reusedIds } from '../foldInByIdentity';
import {
  RETIRED_C_MODE_CARDS, describeModeFoldIn, foldInModeCards, modeMapping,
  retiredModeCards,
} from '../modeFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 3);

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
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
});

describe('which new card each retired one became', () => {
  const { moves, unpaired } = modeMapping();

  it('pairs all thirty-six, and leaves none behind', () => {
    // 33 generated (three modes in eleven keys) plus the three
    // hand-written C cards.
    expect(retiredModeCards()).toHaveLength(36);
    expect(moves).toHaveLength(36);
    expect(unpaired).toEqual([]);
  });

  it('lands the G♭ cards on G♭, not on the new F♯ ones', () => {
    // THE ONE PAIR THAT COULD GO WRONG. `mo-mode-of-F#-2` asks about
    // G♭ major and answers A♭ Dorian; the new `mo-mode-F#-2` asks about
    // F♯ major and answers G♯ Dorian. Only the question and the answer
    // tell them apart, and that is what the proof compares.
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('mo-mode-of-F#-2')).toBe('mo-mode-Gb-2');
    expect(by.get('mo-mode-of-F#-5')).toBe('mo-mode-Gb-5');
    expect(by.get('mo-mode-of-F#-6')).toBe('mo-mode-Gb-6');
  });

  it('lands the hand-written C cards on the generated C ones', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('mo-11')).toBe('mo-mode-C-6');
    expect(by.get('mo-12')).toBe('mo-mode-C-2');
    expect(by.get('mo-13')).toBe('mo-mode-C-5');
  });

  it('proves each with the same question and the same answer', () => {
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    const old = new Map(retiredModeCards().map(c => [c.id, c]));
    // THE THREE HAND-WRITTEN C CARDS ARE PROVED ON THE ANSWER ALONE,
    // in the block below: the question names the key as a key now
    // ("the mode of the key of C major") and their frozen records do
    // not. The thirty-three generated ones are re-derived from the
    // generator the live cards share, so they still match byte for
    // byte — which is what this asserts.
    const ruled = new Set(['mo-11', 'mo-12', 'mo-13']);
    for (const { from, to } of moves) {
      if (ruled.has(from)) continue;
      expect(live.get(to)!.question, from).toBe(old.get(from)!.question);
      expect(live.get(to)!.correctAnswer, from).toBe(old.get(from)!.correctAnswer);
    }
  });

  it('proves the three on the answer, which one card gives', () => {
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    const old = new Map(retiredModeCards().map(c => [c.id, c]));
    for (const from of ['mo-11', 'mo-12', 'mo-13']) {
      const to = new Map(moves.map(m => [m.from, m.to])).get(from)!;
      const answer = old.get(from)!.correctAnswer;
      expect(live.get(to)!.correctAnswer, from).toBe(answer);
      // And it is the ONLY card that gives it, which is what makes the
      // answer a proof rather than a guess.
      expect(FLASHCARDS.filter(c => c.correctAnswer === answer), from)
        .toHaveLength(1);
      // The question moved, and moved in exactly one way.
      expect(live.get(to)!.question, from)
        .toBe(old.get(from)!.question.replace('The mode of C major',
          'The mode of the key of C major'));
    }
  });

  it('mints no retired id again', () => {
    // THE ONE THING THAT WOULD MAKE THIS UNSAFE TO RUN TWICE. If
    // `mo-mode-of-F#-2` were back in the deck as the F♯ card, the
    // second run would move F♯ practice onto the G♭ card and no
    // comparison of ids could tell.
    expect(reusedIds(retiredModeCards())).toEqual([]);
  });

  it('and the three hand-written ones are gone from the deck', () => {
    const ids = new Set(FLASHCARDS.map(c => c.id));
    for (const c of RETIRED_C_MODE_CARDS) expect(ids.has(c.id), c.id).toBe(false);
  });
});

describe('what follows the card', () => {
  it('moves the row and its flag, and touches nothing else', async () => {
    await db.spacingState.bulkPut([
      spacingRow('mo-mode-of-F#-2'),
      spacingRow('mo-mode-Db-2'),
      spacingRow('mo-7'),
    ] as never[]);
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: MODULE, itemId: 'mo-11', timestamp: T, isCorrect: true },
      { id: 'a2', moduleId: MODULE, itemId: 'mo-7', timestamp: T + 1, isCorrect: true },
    ] as never[]);

    const r = await foldInModeCards();
    expect(r.attempts).toBe(1);
    expect(r.spacing).toBe(1);

    const refs = (await db.spacingState.toArray()).map(s => s.itemRef).sort();
    expect(refs).toEqual(['mo-7', 'mo-mode-Db-2', 'mo-mode-Gb-2']);
    const moved = await db.spacingState
      .get(spacingRowId(MODULE, 'mo-mode-of-F#-2', 'both'));
    expect(moved!.itemRef).toBe('mo-mode-Gb-2');
    expect(moved!.studyLater).toBe(true);
    expect((await db.attempts.toArray()).map(a => a.itemId).sort())
      .toEqual(['mo-7', 'mo-mode-C-6']);
  });
});

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing and says nothing', async () => {
    await db.spacingState.add(spacingRow('mo-12'));
    await foldInModeCards();
    const again = await foldInModeCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    expect(describeModeFoldIn(again)).toBeNull();
  });

  it('merges when a lagging device pushes one back', async () => {
    await db.spacingState.add(spacingRow('mo-mode-C-2', {
      lastEngagedAt: T + 5000, studyLater: false,
    }));
    await db.spacingState.add(spacingRow('mo-12', { lastEngagedAt: T }));
    const r = await foldInModeCards();
    expect(r.spacingMerged).toBe(1);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('mo-mode-C-2');
    expect(rows[0].studyLater).toBe(true);
    expect(rows[0].lastEngagedAt).toBe(T + 5000);
  });

  it('runs on a database that never had any of these rows', async () => {
    const r = await foldInModeCards();
    expect(r).toMatchObject({ attempts: 0, spacing: 0, unpaired: [] });
  });
});
