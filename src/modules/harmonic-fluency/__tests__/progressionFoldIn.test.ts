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

  it('pairs all fourteen and leaves none behind', () => {
    expect(retiredProgressionCards()).toHaveLength(14);
    expect(moves).toHaveLength(14);
    expect(unpaired).toEqual([]);
  });

  it('lands each hand-written card on its own key and shape', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('pr-1')).toBe('pr-prog-1-5-6-4-C');
    expect(by.get('pr-2')).toBe('pr-prog-2-5-1-Bb');
    expect(by.get('pr-5')).toBe('pr-prog-gospel-walk-up-C');
    expect(by.get('pr-6')).toBe('pr-prog-rhythm-changes-Bb');
    expect(by.get('pr-7')).toBe('pr-prog-backdoor-F');
    expect(by.get('pr-10')).toBe('pr-prog-neo-soul-C');
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
// What did NOT move
// =====================================================================

describe('the twelve one-offs are untouched', () => {
  const ids = new Set(FLASHCARDS.map(c => c.id));

  it('keeps every card that names no key', () => {
    // Ruled explicitly: the rotation card, the 12-bar structure and the
    // rest stay prose.
    for (const id of ['pr-8', 'pr-9', 'pr-12', 'pr-16', 'pr-17', 'pr-19']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('keeps every progression the ruled list does not name', () => {
    // The bossa turnaround, the Dorian vamp, 4-1-5-6, 1-4-5 and 1-♭7-4.
    // Generating these would be ADDING progressions to the family,
    // which is the one thing the brief says not to do.
    for (const id of ['pr-13', 'pr-14', 'pr-15', 'pr-18', 'pr-20']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('keeps the descending minor, which has no thirteen-key vocabulary', () => {
    // `pr-11` is in A MINOR. The thirteen keys are major keys; read as
    // minor tonics they would name D♭ minor and G♭ minor.
    expect(ids.has('pr-11')).toBe(true);
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
    await db.spacingState.add(spacingRow('pr-5'));
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: MODULE, itemId: 'pr-5', timestamp: T, isCorrect: true },
      { id: 'a2', moduleId: MODULE, itemId: 'pr-5', timestamp: T + 1, isCorrect: false },
    ] as never[]);
    await db.skillAnnotations.add({
      skillId: canonicalSkillId(MODULE, 'card', 'pr-5'),
      priority: 'high', tags: ['gospel'], note: 'the lift',
      createdAt: T, updatedAt: T,
    } as never);
    await db.harmonicDiaryEntries.add({
      entryId: 'hd-1', skillId: canonicalSkillId(MODULE, 'card', 'pr-5'),
      userText: 'every bridge I have ever played', createdAt: T, updatedAt: T,
    } as never);

    const r = await foldInProgressionCards();
    expect(r).toMatchObject({
      attempts: 2, spacing: 1, spacingMerged: 0, annotations: 1, diary: 1,
      unpaired: [],
    });

    const moved = (await db.spacingState.toArray())[0];
    expect(moved.itemRef).toBe('pr-prog-gospel-walk-up-C');
    expect(moved.studyLater).toBe(true);
    expect(moved.reviewFlagNote).toBe('the II is major');
    // The primary key does not move — what makes the two-device case an
    // upsert rather than a delete. See `cardRowMove`.
    expect(moved.id).toBe(spacingRowId(MODULE, 'pr-5', 'both'));

    expect((await db.attempts.toArray()).map(a => a.itemId))
      .toEqual(['pr-prog-gospel-walk-up-C', 'pr-prog-gospel-walk-up-C']);
    expect((await db.skillAnnotations.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', 'pr-prog-gospel-walk-up-C'));
    expect((await db.harmonicDiaryEntries.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', 'pr-prog-gospel-walk-up-C'));
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
