/**
 * Progression Vocabulary: fourteen cards move, twelve stay, none is
 * deleted.
 *
 * =====================================================================
 * THE UNUSUAL THING HERE IS THAT `unpaired` IS EMPTY.
 *
 * Every other family in commit 8 retired something the deck stopped
 * asking. This one retires only cards whose exact question is asked
 * again — the eight hand-written in-key cards and the six 1-5-6-4
 * top-ups — so nothing goes to `orphanedCardCleanup` and no row is
 * dropped. The twelve one-offs are not retired at all; they are still
 * in the deck, under their own ids, and this asserts that too.
 *
 * The sharpest case is `pr-1564-F#`, whose question says G♭. It lands
 * on `pr-prog-1-5-6-4-Gb`, not on the F♯ card, because the pairing is
 * made from the TEXT rather than from the id — which is the entire
 * argument for a prefix that has never existed.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { canonicalSkillId } from '../../skills/registry';
import { spacingRowId } from '../../../lib/spacingState';
import { reusedIds } from '../foldInByIdentity';
import {
  describeProgressionFoldIn, foldInProgressionCards, progressionMapping,
  retiredProgressionCards,
} from '../progressionFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 9);

function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    studyLater: true, reviewFlagNote: 'the II is major',
    ...over,
  } as never;
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
});

// =====================================================================
// The pairing
// =====================================================================

describe('which generated card each retired one became', () => {
  const { moves, unpaired } = progressionMapping();

  it('pairs all twenty-three and leaves none behind', () => {
    // Eleven progression cards and the twelve ii-V-I cadences. It was
    // twenty-six: `pr-4`, `pr-5`, `pr-6` and `pr-10` folded into four
    // generated sets that have since left the deck, so they are
    // deletions now rather than fold-ins and are not in this list.
    expect(retiredProgressionCards()).toHaveLength(23);
    expect(moves).toHaveLength(23);
    expect(unpaired).toEqual([]);
  });

  it('lands each hand-written card on its own key and shape', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('pr-1')).toBe('pr-prog-1-5-6-4-C');
    expect(by.get('pr-2')).toBe('pr-prog-2-5-1-Bb');
    expect(by.get('pr-3')).toBe('pr-prog-1-6-4-5-G');
    expect(by.get('pr-7')).toBe('pr-prog-backdoor-F');
    // The 1-4-5 joined the generated set on 9 Sep and `pr-18` asked its
    // question in A word for word.
    expect(by.get('pr-18')).toBe('pr-prog-1-4-5-A');
  });

  it('sends the F♯-id top-up to the G♭ card, because its text says G♭', () => {
    // THE ID-REUSE HAZARD, ASSERTED. `pr-1564-F#` was minted from the
    // identity vocabulary and asks about G♭ major; the new deck has a
    // separate F♯ card. A pairing made from the id would have moved
    // this history onto the wrong one of the two.
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('pr-1564-F#')).toBe('pr-prog-1-5-6-4-Gb');
    expect(FLASHCARDS.some(c => c.id === 'pr-prog-1-5-6-4-F#')).toBe(true);
  });

  it('proves it with a byte-identical question and answer', () => {
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    const old = new Map(retiredProgressionCards().map(c => [c.id, c]));
    const ascii = (s: string) => s.replace(/♭/g, 'b').replace(/♯/g, '#');
    for (const { from, to } of moves) {
      // The ruled exceptions are proved on the answer alone, in their
      // own block below: the eleven cadences, and `pr-7`, whose
      // question was rewritten numbers-first.
      if (from.startsWith('fh-') || from === 'pr-7') continue;
      expect(ascii(live.get(to)!.question), from)
        .toBe(ascii(old.get(from)!.question));
      expect(ascii(live.get(to)!.correctAnswer), from)
        .toBe(ascii(old.get(from)!.correctAnswer));
    }
  });

  it('mints no retired id again', () => {
    expect(reusedIds(retiredProgressionCards())).toEqual([]);
  });
});

// =====================================================================
// The ruled exception: the ii-V-I cadence IS the 2-5-1
// =====================================================================

describe('the ruled exceptions, pair by pair', () => {
  const { moves } = progressionMapping();
  const byFrom = new Map(moves.map(m => [m.from, m.to]));

  it('pins all twelve pairs, key by key', () => {
    // THE ONLY PAIRING IN THE DECK NOT MADE ON THE QUESTION, so it is
    // the one written out in full rather than derived. A line that
    // changed here would be a history attached to the wrong key.
    expect(new Map([...byFrom].filter(([from]) => from.startsWith('fh-'))))
      .toEqual(new Map([
        // THE TWELFTH, hand-written, in the one key the generator
        // skipped. Leaving it would have kept the 2-5-1 alive twice in
        // C and once everywhere else.
        ['fh-3', 'pr-prog-2-5-1-C'],
        ['fh-ii-v-i-Db', 'pr-prog-2-5-1-Db'],
        ['fh-ii-v-i-D', 'pr-prog-2-5-1-D'],
        ['fh-ii-v-i-Eb', 'pr-prog-2-5-1-Eb'],
        ['fh-ii-v-i-E', 'pr-prog-2-5-1-E'],
        ['fh-ii-v-i-F', 'pr-prog-2-5-1-F'],
        // ITS TEXT SAYS G♭, SO IT GOES TO THE G♭ CARD — not to the F♯
        // one, which the deck also has and which answers something
        // else. The pairing is on the answer, so it cannot get this
        // wrong; the assertion says so out loud.
        ['fh-ii-v-i-F#', 'pr-prog-2-5-1-Gb'],
        ['fh-ii-v-i-G', 'pr-prog-2-5-1-G'],
        ['fh-ii-v-i-Ab', 'pr-prog-2-5-1-Ab'],
        ['fh-ii-v-i-A', 'pr-prog-2-5-1-A'],
        ['fh-ii-v-i-Bb', 'pr-prog-2-5-1-Bb'],
        ['fh-ii-v-i-B', 'pr-prog-2-5-1-B'],
      ]));
  });

  it('pairs on the answer, which is identical, not on the question', () => {
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    const old = new Map(retiredProgressionCards().map(c => [c.id, c]));
    for (const [from, to] of byFrom) {
      if (!from.startsWith('fh-')) continue;
      expect(live.get(to)!.correctAnswer, from)
        .toBe(old.get(from)!.correctAnswer);
      // And the questions really are different — otherwise the
      // exception would be doing nothing and could be deleted.
      expect(live.get(to)!.question, from)
        .not.toBe(old.get(from)!.question);
    }
  });

  it('takes the backdoor the same way, for a rewritten question', () => {
    // Numbers lead, names follow: `pr-7` asked "The backdoor
    // progression I-IV-bVII-I in F major is _____" and the card asks
    // "The 1 4 ♭7 1 (backdoor) in F major is _____". One sentence
    // rewritten, four chords unchanged — the same narrow exception, not
    // a looser rule.
    expect(byFrom.get('pr-7')).toBe('pr-prog-backdoor-F');
    const live = FLASHCARDS.find(c => c.id === 'pr-prog-backdoor-F')!;
    expect(live.question).toBe('The 1 4 ♭7 1 (backdoor) in F major is _____');
    expect(live.correctAnswer).toBe('F - B♭ - E♭ - F');
  });

  it('leaves the F♯ 2-5-1 alone, with its own answer', () => {
    expect(FLASHCARDS.find(c => c.id === 'pr-prog-2-5-1-F#')!.correctAnswer)
      .toBe('G♯m7 - C♯7 - F♯maj7');
    expect(FLASHCARDS.find(c => c.id === 'pr-prog-2-5-1-Gb')!.correctAnswer)
      .toBe('A♭m7 - D♭7 - G♭maj7');
  });

  it('takes nothing else out of Functional Harmony', () => {
    const fh = FLASHCARDS.filter(c => c.category === 'functional-harmony');
    expect(fh.filter(c => c.id.startsWith('fh-ii-v-i-'))).toHaveLength(0);
    expect(fh.filter(c => c.id.startsWith('fh-v-of-v-'))).toHaveLength(11);
    expect(fh.filter(c => c.id.startsWith('fh-v-of-vi-'))).toHaveLength(11);
    // `fh-3` went with the eleven — the twelfth key, hand-written.
    expect(fh.some(c => c.id === 'fh-3')).toBe(false);
    // Everything else it had, it keeps: eighteen hand-written cards.
    expect(fh.filter(c => /^fh-\d+$/.test(c.id))).toHaveLength(18);
  });
});

// =====================================================================
// What did NOT move
// =====================================================================

describe('the one-offs that stay are untouched', () => {
  const ids = new Set(FLASHCARDS.map(c => c.id));

  it('keeps every card that names no key', () => {
    // Ruled explicitly: the rotation card, the 12-bar structure and the
    // rest stay prose. `pr-9` matters more now than it did — 6-4-1-5
    // left the deck as a rotation of the 1-5-6-4, and this is the card
    // that carries that idea.
    for (const id of ['pr-8', 'pr-9', 'pr-12', 'pr-16', 'pr-17', 'pr-19']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('generates six progressions, not ten', () => {
    // The gospel walk-up, rhythm changes and the neo-soul cycle went
    // for want of a reference; 6-4-1-5 went as a rotation of the
    // 1-5-6-4 loop. `1-6-4-5` is a different loop — the 6 straight
    // after the 1 — and stays.
    const shapes = new Set(
      FLASHCARDS.filter(c => c.id.startsWith('pr-prog-'))
        .map(c => String(c.axis!.shape)),
    );
    expect([...shapes].sort()).toEqual(
      ['1-4-5', '1-5-6-4', '1-6-2-5', '1-6-4-5', 'backdoor', 'ii-V-I'],
    );
  });

  it('removes the one-key cards outright, and keeps the bossa', () => {
    // A progression is in every key or it is not in the deck. The
    // descending minor, the Dorian vamp, 4-1-5-6 and 1-♭7-4 are gone
    // with their history — REMOVALS, not fold-ins, so they are in
    // `REMOVED_WITHOUT_SUCCESSOR` and not in the retired list here.
    const retired = new Set(retiredProgressionCards().map(c => c.id));
    for (const id of ['pr-11', 'pr-14', 'pr-15', 'pr-20',
      'pr-4', 'pr-5', 'pr-6', 'pr-10']) {
      expect(ids.has(id), id).toBe(false);
      expect(retired.has(id), id).toBe(false);
    }
    // `pr-13`, the bossa I-VI-ii-V in F, is the one one-key progression
    // card left and Silas has not ruled on it — see the report.
    expect(ids.has('pr-13')).toBe(true);
  });

  it('generates no minor-key progression to replace the one removed', () => {
    // `pr-11` was in A MINOR and went rather than being generated: the
    // thirteen keys are major keys, and read as minor tonics they would
    // name D♭ minor and G♭ minor.
    expect(FLASHCARDS.some(c => c.id.startsWith('pr-prog-descending'))).toBe(false);
  });

  it('and none of the fourteen that moved is still in the deck', () => {
    for (const c of retiredProgressionCards()) expect(ids.has(c.id), c.id).toBe(false);
  });
});

// =====================================================================
// The rows
// =====================================================================

describe('what follows the card', () => {
  it('moves the spacing row, its flags, the attempts, the annotation and the diary', async () => {
    await db.spacingState.add(spacingRow('pr-3'));
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: MODULE, itemId: 'pr-3', timestamp: T, isCorrect: true },
      { id: 'a2', moduleId: MODULE, itemId: 'pr-3', timestamp: T + 1, isCorrect: false },
    ] as never[]);
    await db.skillAnnotations.add({
      skillId: canonicalSkillId(MODULE, 'card', 'pr-3'),
      priority: 'high', tags: ['gospel'], note: 'the doo-wop one',
      createdAt: T, updatedAt: T,
    } as never);
    await db.harmonicDiaryEntries.add({
      entryId: 'hd-1', skillId: canonicalSkillId(MODULE, 'card', 'pr-3'),
      userText: 'every ballad I have ever played', createdAt: T, updatedAt: T,
    } as never);

    const r = await foldInProgressionCards();
    expect(r).toMatchObject({
      attempts: 2, spacing: 1, spacingMerged: 0, annotations: 1, diary: 1,
      unpaired: [],
    });

    const moved = (await db.spacingState.toArray())[0];
    expect(moved.itemRef).toBe('pr-prog-1-6-4-5-G');
    expect(moved.studyLater).toBe(true);
    expect(moved.reviewFlagNote).toBe('the II is major');
    // The primary key does not move — what makes the two-device case an
    // upsert rather than a delete. See `cardRowMove`.
    expect(moved.id).toBe(spacingRowId(MODULE, 'pr-3', 'both'));

    expect((await db.attempts.toArray()).map(a => a.itemId))
      .toEqual(['pr-prog-1-6-4-5-G', 'pr-prog-1-6-4-5-G']);
    expect((await db.skillAnnotations.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', 'pr-prog-1-6-4-5-G'));
    expect((await db.harmonicDiaryEntries.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', 'pr-prog-1-6-4-5-G'));
  });

  it('touches nothing belonging to a card that stayed', async () => {
    await db.spacingState.bulkPut([
      spacingRow('pr-1'), spacingRow('pr-15'), spacingRow('pr-prog-2-5-1-E'),
    ] as never[]);
    await foldInProgressionCards();
    expect((await db.spacingState.toArray()).map(s => s.itemRef).sort())
      .toEqual(['pr-15', 'pr-prog-1-5-6-4-C', 'pr-prog-2-5-1-E']);
  });

  it('keeps the attempt timestamps exactly as they were', async () => {
    await db.attempts.add(
      { id: 'a1', moduleId: MODULE, itemId: 'pr-2', timestamp: T, isCorrect: true } as never,
    );
    await foldInProgressionCards();
    expect((await db.attempts.toArray())[0].timestamp).toBe(T);
  });
});

// =====================================================================
// Two devices
// =====================================================================

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing and says nothing', async () => {
    await db.spacingState.add(spacingRow('pr-1'));
    await foldInProgressionCards();
    const again = await foldInProgressionCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    // Nothing unpaired, so a quiet run has nothing to report at all.
    expect(describeProgressionFoldIn(again)).toBeNull();
  });

  it('merges rather than duplicates when a lagging device pushes one back', async () => {
    await db.spacingState.add(spacingRow('pr-prog-1-5-6-4-Gb', {
      lastEngagedAt: T + 5000, studyLater: false, reviewFlagNote: undefined,
    }));
    await db.spacingState.add(spacingRow('pr-1564-F#', { lastEngagedAt: T }));

    const r = await foldInProgressionCards();
    expect(r.spacingMerged).toBe(1);

    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('pr-prog-1-5-6-4-Gb');
    expect(rows[0].studyLater).toBe(true);
    expect(rows[0].lastEngagedAt).toBe(T + 5000);
  });

  it('runs on a database that never had any of these rows', async () => {
    const r = await foldInProgressionCards();
    expect(r).toMatchObject({ attempts: 0, spacing: 0, unpaired: [] });
  });
});
