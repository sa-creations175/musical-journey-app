/**
 * A row with no live card behind it gets said out loud.
 *
 * =====================================================================
 * THE SWEEP OUTLIVED THE MIGRATIONS, AND ITS JOB CHANGED WITH THEM.
 *
 * It used to delete, against a written-down list of ids it was
 * authorised to remove. The list went with the movers on 10 Sep 2026
 * (restructure commit 9) and the rule underneath it stayed: the
 * catalog is the only thing that says which cards exist, so a row keyed
 * on an id it does not hold is practice against a question nobody can
 * be asked.
 *
 * TWO CLAIMS, AND THE FIRST IS THE ONE THAT COULD GO WRONG SILENTLY.
 *
 * THAT IT TOUCHES NOTHING. A read-only check that deleted one row would
 * take a reader's history with it and nothing would look broken — the
 * card would simply read unpractised. Every case here counts the rows
 * before and after.
 *
 * THAT IT FINDS EVERY KIND OF ROW AND NAMES WHAT IS AT STAKE. An
 * orphaned schedule and an orphaned diary entry are different problems,
 * and the line has to say which.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { canonicalSkillId } from '../../skills/registry';
import { spacingRowId } from '../../../lib/spacingState';
import {
  authoredOnAnnotation, authoredOnSpacing, describeOrphans, reportOrphanedCards,
} from '../orphanedCardSweep';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 1);
/** An id no deck has ever held, so the test cannot pass by accident on
 *  a card that merely retired. */
const ORPHAN = 'zz-not-a-card';
/** A card that is still in the deck, laid down in every case as the
 *  thing that must not be reported. */
const LIVE = 'sc-slash-1-3-Eb';

function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    ...over,
  } as never;
}

let nextAttemptId = 0;
function attempt(itemId: string) {
  nextAttemptId += 1;
  return {
    id: `a${nextAttemptId}`, moduleId: MODULE, itemId,
    timestamp: T + nextAttemptId, isCorrect: true,
  } as never;
}

const skillOf = (cardId: string) => canonicalSkillId(MODULE, 'card', cardId);

async function rowCounts() {
  return {
    attempts: await db.attempts.count(),
    spacing: await db.spacingState.count(),
    annotations: await db.skillAnnotations.count(),
    diary: await db.harmonicDiaryEntries.count(),
  };
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
  nextAttemptId = 0;
});

describe('the deck is what says which cards exist', () => {
  it('is silent on a database whose rows all have live cards', () => {
    // The expected outcome on every boot. Asserted first, because a
    // sweep that reported something every run would be trained away.
    expect(describeOrphans({ orphans: [] })).toBeNull();
  });

  it('says nothing when every row belongs to a card in the deck', async () => {
    await db.spacingState.put(spacingRow(LIVE));
    await db.attempts.add(attempt(LIVE));
    const r = await reportOrphanedCards();
    expect(r.orphans).toEqual([]);
    expect(describeOrphans(r)).toBeNull();
  });

  it('finds a row whose card is not in the deck, and counts what is under it', async () => {
    await db.spacingState.put(spacingRow(ORPHAN));
    await db.attempts.add(attempt(ORPHAN));
    await db.attempts.add(attempt(ORPHAN));
    await db.spacingState.put(spacingRow(LIVE));
    await db.attempts.add(attempt(LIVE));

    const r = await reportOrphanedCards();
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0]).toMatchObject({
      cardId: ORPHAN, attempts: 2, spacing: 1, annotations: 0, diary: 0,
    });
    expect(describeOrphans(r))
      .toBe(`[hf] ${ORPHAN} is not in the deck and still has 2 attempt(s), `
        + '1 spacing row(s)');
  });

  it('reaches annotations and diary entries, which are keyed on a skill id', async () => {
    await db.skillAnnotations.put({
      skillId: skillOf(ORPHAN), note: 'come back to this', updatedAt: T,
    } as never);
    await db.harmonicDiaryEntries.put({
      entryId: 'hd-1', skillId: skillOf(ORPHAN),
      userText: 'this one finally clicked in the car',
      createdAt: T, updatedAt: T,
    } as never);
    const r = await reportOrphanedCards();
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0]).toMatchObject({ annotations: 1, diary: 1 });
    expect(r.orphans[0].authored).toEqual(['diaryEntry', 'note']);
  });

  it('names what a reader wrote, separately from what the app wrote', async () => {
    await db.spacingState.put(spacingRow(ORPHAN, {
      studyLater: true, reviewFlagged: true, reviewFlagNote: 'the ♭3 again',
    }));
    const r = await reportOrphanedCards();
    expect(r.orphans[0].authored)
      .toEqual(['reviewFlagNote', 'reviewFlagged', 'studyLater']);
    expect(describeOrphans(r))
      .toContain('reviewFlagNote, reviewFlagged, studyLater written by hand');
  });

  it('leaves a live card alone even when it sits beside an orphan', async () => {
    await db.spacingState.put(spacingRow(LIVE, { studyLater: true }));
    await db.spacingState.put(spacingRow(ORPHAN));
    const r = await reportOrphanedCards();
    expect(r.orphans.map(o => o.cardId)).toEqual([ORPHAN]);
    expect(FLASHCARDS.some(c => c.id === LIVE)).toBe(true);
  });
});

describe('it reads and never writes', () => {
  it('deletes nothing, on a database full of orphans', async () => {
    // THE CLAIM THAT REPLACED THE DELETE. "This id is not in the
    // catalog" is true of a card retired on purpose AND of a legacy id,
    // a synced row from an older deck, and a generator that threw on
    // import. None of those is a licence to delete a reader's history.
    for (const id of [ORPHAN, 'zz-another', 'zz-third']) {
      await db.spacingState.put(spacingRow(id));
      await db.attempts.add(attempt(id));
      await db.skillAnnotations.put({
        skillId: skillOf(id), priority: 'high', updatedAt: T,
      } as never);
      await db.harmonicDiaryEntries.put({
        entryId: `hd-${id}`, skillId: skillOf(id), userText: 'x',
        createdAt: T, updatedAt: T,
      } as never);
    }
    const before = await rowCounts();
    const r = await reportOrphanedCards();
    expect(r.orphans).toHaveLength(3);
    expect(await rowCounts()).toEqual(before);
  });

  it('is unchanged by running twice', async () => {
    await db.spacingState.put(spacingRow(ORPHAN));
    const first = await reportOrphanedCards();
    const second = await reportOrphanedCards();
    expect(second).toEqual(first);
    expect((await rowCounts()).spacing).toBe(1);
  });
});

describe('what counts as written by hand', () => {
  it('reads the three fields on a spacing row', () => {
    expect(authoredOnSpacing({})).toEqual([]);
    expect(authoredOnSpacing({ studyLater: false, reviewFlagged: false }))
      .toEqual([]);
    expect(authoredOnSpacing({ reviewFlagNote: '' })).toEqual([]);
    expect(authoredOnSpacing({
      studyLater: true, reviewFlagged: true, reviewFlagNote: 'x',
    })).toEqual(['studyLater', 'reviewFlagged', 'reviewFlagNote']);
  });

  it('reads the four on an annotation, and calls an empty one nothing', () => {
    // An annotation row with nothing set is a row the app made, not a
    // thought — the distinction the line depends on.
    expect(authoredOnAnnotation({})).toEqual([]);
    expect(authoredOnAnnotation({ tags: [], customName: '', note: '' }))
      .toEqual([]);
    expect(authoredOnAnnotation({
      priority: 'high', tags: ['x'], customName: 'n', note: 'b',
    })).toEqual(['priority', 'tags', 'customName', 'note']);
  });
});
