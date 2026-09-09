/**
 * Three hand-written C slash cards fold into the generator.
 *
 * =====================================================================
 * THE CLAIM THAT MATTERS IS THAT NO ROW LANDS ON THE WRONG CARD.
 *
 * A mapping with one bad line attaches a history to a question that was
 * never answered, and nothing looks broken — the card simply reads more
 * practised than it is and is scheduled accordingly. So the pairing is
 * re-derived here from the recorded old text and the live deck, and the
 * question and the answer are compared character for character.
 *
 * The second claim is that it survives two devices in either order,
 * which is `cardRowMove`'s mechanism and is exercised here end to end.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { canonicalSkillId } from '../../skills/registry';
import { spacingRowId } from '../../../lib/spacingState';
import {
  FOLDED_C_CARDS, describeSlashCFoldIn, foldInSlashCCards, slashCMapping,
} from '../slashCFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 2);

function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    studyLater: true, reviewFlagNote: 'the leading-tone bass',
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

describe('which generated card each hand-written one became', () => {
  const { moves, unpaired } = slashCMapping();

  it('pairs all three, and leaves none behind', () => {
    expect(FOLDED_C_CARDS).toHaveLength(3);
    expect(moves).toHaveLength(3);
    expect(unpaired).toEqual([]);
  });

  it('lands each on the generated card for its own shape in C', () => {
    expect(new Map(moves.map(m => [m.from, m.to]))).toEqual(new Map([
      ['sc-8', 'sc-1-3-C'],
      ['sc-9', 'sc-5-7-C'],
      ['sc-10', 'sc-4-5-C'],
    ]));
  });

  it('proves it with a byte-identical question and answer', () => {
    // The proof, re-derived rather than trusted. Re-worded generator
    // output would leave a card unpaired and reported, which is the
    // failure this is allowed to have.
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    for (const { from, to } of moves) {
      const old = FOLDED_C_CARDS.find(c => c.id === from)!;
      expect(live.get(to)!.question, from).toBe(old.question);
      expect(live.get(to)!.correctAnswer, from).toBe(old.correctAnswer);
    }
  });

  it('none of the three is in the deck any more', () => {
    const ids = new Set(FLASHCARDS.map(c => c.id));
    for (const c of FOLDED_C_CARDS) expect(ids.has(c.id), c.id).toBe(false);
  });

  it('and exactly one card asks each question', () => {
    // Two would mean the generator had produced a duplicate of a
    // hand-written card somewhere else, and a coin toss between them is
    // the wrong-mapping failure with extra steps.
    for (const old of FOLDED_C_CARDS) {
      const matches = FLASHCARDS.filter(
        c => c.question === old.question && c.correctAnswer === old.correctAnswer,
      );
      expect(matches, old.id).toHaveLength(1);
    }
  });
});

// =====================================================================
// The rows
// =====================================================================

describe('what follows the card', () => {
  it('moves the spacing row, its flags, the attempts, the annotation and the diary', async () => {
    await db.spacingState.add(spacingRow('sc-9'));
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: MODULE, itemId: 'sc-9', timestamp: T, isCorrect: true },
      { id: 'a2', moduleId: MODULE, itemId: 'sc-9', timestamp: T + 1, isCorrect: false },
    ] as never[]);
    await db.skillAnnotations.add({
      skillId: canonicalSkillId(MODULE, 'card', 'sc-9'),
      priority: 'high', tags: ['gospel'], note: 'B pulls up to C',
      createdAt: T, updatedAt: T,
    } as never);
    await db.harmonicDiaryEntries.add({
      entryId: 'hd-1', skillId: canonicalSkillId(MODULE, 'card', 'sc-9'),
      userText: 'this is the sound of every turnaround', createdAt: T, updatedAt: T,
    } as never);

    const r = await foldInSlashCCards();
    expect(r).toMatchObject({
      attempts: 2, spacing: 1, spacingMerged: 0, annotations: 1, diary: 1,
      unpaired: [],
    });

    const moved = (await db.spacingState.toArray())[0];
    expect(moved.itemRef).toBe('sc-5-7-C');
    // THE FLAGS TRAVEL. They are the reader's own words about a card,
    // and the card is the same card.
    expect(moved.studyLater).toBe(true);
    expect(moved.reviewFlagNote).toBe('the leading-tone bass');
    // AND THE PRIMARY KEY DOES NOT MOVE — see `cardRowMove`. This is
    // what makes the two-device case an upsert rather than a delete.
    expect(moved.id).toBe(spacingRowId(MODULE, 'sc-9', 'both'));

    expect((await db.attempts.toArray()).map(a => a.itemId))
      .toEqual(['sc-5-7-C', 'sc-5-7-C']);
    expect((await db.skillAnnotations.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', 'sc-5-7-C'));
    expect((await db.harmonicDiaryEntries.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', 'sc-5-7-C'));
  });

  it('keeps the attempt timestamps exactly as they were', async () => {
    // A migration that rewrote them would be a falsified record.
    await db.attempts.add(
      { id: 'a1', moduleId: MODULE, itemId: 'sc-8', timestamp: T, isCorrect: true } as never,
    );
    await foldInSlashCCards();
    expect((await db.attempts.toArray())[0].timestamp).toBe(T);
  });

  it('touches nothing belonging to another card', async () => {
    await db.spacingState.bulkPut([
      spacingRow('sc-8'), spacingRow('sc-1-3-Db'), spacingRow('sc-13'),
    ] as never[]);
    await foldInSlashCCards();
    const refs = (await db.spacingState.toArray()).map(s => s.itemRef).sort();
    expect(refs).toEqual(['sc-1-3-C', 'sc-1-3-Db', 'sc-13']);
  });
});

// =====================================================================
// Two devices
// =====================================================================

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing and says nothing', async () => {
    await db.spacingState.add(spacingRow('sc-8'));
    await foldInSlashCCards();
    const again = await foldInSlashCCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    expect(describeSlashCFoldIn(again)).toBeNull();
  });

  it('merges rather than duplicates when a lagging device pushes one back', async () => {
    // The phone syncs up its copy of the old row after the laptop has
    // already moved its own and drilled the new card.
    await db.spacingState.add(spacingRow('sc-1-3-C', {
      lastEngagedAt: T + 5000, studyLater: false, reviewFlagNote: undefined,
    }));
    await db.spacingState.add(spacingRow('sc-8', { lastEngagedAt: T }));

    const r = await foldInSlashCCards();
    expect(r.spacingMerged).toBe(1);

    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('sc-1-3-C');
    // A FLAG IS A REQUEST, AND TWO REQUESTS ARE ONE.
    expect(rows[0].studyLater).toBe(true);
    // The schedule comes from whichever row was engaged with last.
    expect(rows[0].lastEngagedAt).toBe(T + 5000);
  });

  it('runs on a database that never had any of these rows', async () => {
    const r = await foldInSlashCCards();
    expect(r).toMatchObject({ attempts: 0, spacing: 0, unpaired: [] });
  });
});
