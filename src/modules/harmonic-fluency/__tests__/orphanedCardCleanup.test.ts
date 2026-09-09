/**
 * 6/♭7 left the deck. Its rows go — except the ones a reader wrote.
 *
 * =====================================================================
 * THREE CLAIMS, AND TWO OF THEM CANNOT BE SEEN ON SCREEN.
 *
 * THAT IT DELETES ONLY WHAT IT WAS AUTHORISED TO. A cleanup that
 * widened by one id would take a live card's history with it and
 * nothing would look broken — the card would simply read unpractised.
 * So a live card's rows are laid down beside the orphans in every case
 * here and asserted untouched.
 *
 * THAT IT NEVER THROWS AWAY SOMETHING SOMEBODY TYPED. A flag, a note, a
 * tag, a diary entry: none is derivable from anything, so the row stays
 * and is reported instead. Its attempts stay with it, because a flag
 * pointing at a history that has been deleted is worse than either.
 *
 * THAT IT IS SAFE TO RUN TWICE, ON EITHER DEVICE, IN ANY ORDER. There
 * is no pref — the mechanism is that a second run finds nothing — and a
 * row pushed back by a lagging phone is removed on the next pass rather
 * than refused because a flag says the job is done.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { canonicalSkillId } from '../../skills/registry';
import { spacingRowId } from '../../../lib/spacingState';
import {
  REMOVED_WITHOUT_SUCCESSOR, authoredOnAnnotation, authoredOnSpacing,
  cleanUpOrphanedCards, describeOrphanCleanup, refusalFor,
} from '../orphanedCardCleanup';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 1);
const ORPHAN = 'sc-6-b7-Eb';
/** A card that is still in the deck, laid down in every case as the
 *  thing that must survive. */
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

async function seed(over: { spacing?: Record<string, unknown> } = {}) {
  await db.spacingState.bulkPut([
    spacingRow(ORPHAN, over.spacing ?? {}),
    spacingRow(LIVE),
  ] as never[]);
  await db.attempts.bulkAdd(
    [attempt(ORPHAN), attempt(ORPHAN), attempt(LIVE)] as never[],
  );
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
});

// =====================================================================
// What it is authorised to touch
// =====================================================================

describe('the authorised set', () => {
  it('is the cards removed with no successor, and nothing else', () => {
    // Twelve for the 6/♭7 shape (ruling 30), two for the key
    // signatures that named two keys at once, five pentatonic formula
    // cards and twelve "share the same" ones (commit 8), and the
    // fifteen interval inversion fact cards, and the four one-key
    // progression cards.
    expect(REMOVED_WITHOUT_SUCCESSOR).toHaveLength(50);
    expect(REMOVED_WITHOUT_SUCCESSOR.filter(id => /^pr-\d+$/.test(id)))
      .toEqual(['pr-11', 'pr-14', 'pr-15', 'pr-20']);
    expect(REMOVED_WITHOUT_SUCCESSOR.filter(id => id.startsWith('iv-inv')))
      .toHaveLength(15);
    expect(REMOVED_WITHOUT_SUCCESSOR.filter(id => id.startsWith('sc-6-b7-')))
      .toHaveLength(11);
    expect(REMOVED_WITHOUT_SUCCESSOR).toContain('sc-11');
    expect(REMOVED_WITHOUT_SUCCESSOR).toContain('ks-19');
    expect(REMOVED_WITHOUT_SUCCESSOR).toContain('ks-20');
  });

  it('names no card that is still in the deck', () => {
    // The claim the whole file rests on. If this ever fails, the list
    // has been widened onto a live card.
    const live = new Set(FLASHCARDS.map(c => c.id));
    for (const id of REMOVED_WITHOUT_SUCCESSOR) {
      expect(live.has(id), `${id} is still in the deck`).toBe(false);
    }
  });

  it('refuses the whole pass if one of them comes back', () => {
    expect(refusalFor(new Set<string>())).toBeNull();
    const refusal = refusalFor(new Set(['sc-6-b7-Eb']));
    expect(refusal).not.toBeNull();
    expect(refusal).toContain('sc-6-b7-Eb');
  });
});

// =====================================================================
// The ordinary case
// =====================================================================

describe('a card with nothing written on it', () => {
  it('loses its rows, and the live card keeps its own', async () => {
    await seed();
    const r = await cleanUpOrphanedCards();

    expect(r.refused).toBeNull();
    expect(r.attemptsDeleted).toBe(2);
    expect(r.spacingDeleted).toBe(1);
    expect(r.heldBack).toEqual([]);

    expect(await db.spacingState.get(spacingRowId(MODULE, ORPHAN, 'both')))
      .toBeUndefined();
    expect(await db.spacingState.get(spacingRowId(MODULE, LIVE, 'both')))
      .toBeDefined();
    expect(await db.attempts.filter(a => a.itemId === LIVE).count()).toBe(1);
    expect(await db.attempts.filter(a => a.itemId === ORPHAN).count()).toBe(0);
  });

  it('takes its annotation with it', async () => {
    await seed();
    await db.skillAnnotations.put({
      skillId: canonicalSkillId(MODULE, 'card', ORPHAN),
      tags: [], createdAt: T, updatedAt: T,
    });
    const r = await cleanUpOrphanedCards();
    expect(r.annotationsDeleted).toBe(1);
    expect(await db.skillAnnotations.count()).toBe(0);
  });
});

// =====================================================================
// What a reader wrote
// =====================================================================

describe('a card with something written on it', () => {
  it('keeps everything, and says so', async () => {
    await seed({ spacing: { reviewFlagNote: 'the Bb bass move' } });
    const r = await cleanUpOrphanedCards();

    expect(r.spacingDeleted).toBe(0);
    // ITS ATTEMPTS STAY WITH IT. A flag pointing at a history that has
    // been deleted is worse than either half on its own.
    expect(r.attemptsDeleted).toBe(0);
    expect(r.heldBack).toEqual([
      { cardId: ORPHAN, authored: ['reviewFlagNote'] },
    ]);
    expect(await db.spacingState.get(spacingRowId(MODULE, ORPHAN, 'both')))
      .toBeDefined();
  });

  it('holds back for a tag on the annotation', async () => {
    await seed();
    await db.skillAnnotations.put({
      skillId: canonicalSkillId(MODULE, 'card', ORPHAN),
      tags: ['gospel walk-down'], createdAt: T, updatedAt: T,
    });
    const r = await cleanUpOrphanedCards();
    expect(r.heldBack).toEqual([{ cardId: ORPHAN, authored: ['tags'] }]);
    expect(r.spacingDeleted).toBe(0);
    expect(r.annotationsDeleted).toBe(0);
  });

  it('holds back for a diary entry, which is a paragraph somebody typed', async () => {
    await seed();
    await db.harmonicDiaryEntries.put({
      entryId: 'hd-1',
      skillId: canonicalSkillId(MODULE, 'card', ORPHAN),
      userText: 'this one finally clicked in the car',
      createdAt: T, updatedAt: T,
    } as never);
    const r = await cleanUpOrphanedCards();
    expect(r.heldBack).toEqual([{ cardId: ORPHAN, authored: ['diaryEntry'] }]);
    expect(r.diaryDeleted).toBe(0);
    expect(await db.harmonicDiaryEntries.count()).toBe(1);
  });

  it('says it every run, not only the first', async () => {
    await seed({ spacing: { studyLater: true } });
    const first = await cleanUpOrphanedCards();
    const second = await cleanUpOrphanedCards();
    expect(describeOrphanCleanup(first)).toContain('keeps its rows');
    expect(describeOrphanCleanup(second)).toContain('keeps its rows');
  });

  it('knows what counts as written by hand, and what does not', () => {
    expect(authoredOnSpacing({})).toEqual([]);
    expect(authoredOnSpacing({ studyLater: false, reviewFlagNote: '' }))
      .toEqual([]);
    expect(authoredOnSpacing({ studyLater: true })).toEqual(['studyLater']);
    // An annotation row with nothing set is one the app made, not a
    // thought somebody had.
    expect(authoredOnAnnotation({ tags: [] })).toEqual([]);
    expect(authoredOnAnnotation({ tags: [], note: 'x' })).toEqual(['note']);
  });
});

// =====================================================================
// Two devices
// =====================================================================

describe('safe on either device, in either order, more than once', () => {
  it('a second run finds nothing and says nothing', async () => {
    await seed();
    await cleanUpOrphanedCards();
    const again = await cleanUpOrphanedCards();
    expect(again.attemptsDeleted).toBe(0);
    expect(again.spacingDeleted).toBe(0);
    expect(describeOrphanCleanup(again)).toBeNull();
  });

  it('removes a row a lagging device pushed back afterwards', async () => {
    // THE CASE A PREF WOULD GET WRONG. A phone that has not opened the
    // app since the change syncs its copy up; a flag-guarded pass would
    // refuse to touch the one row this exists to remove.
    await seed();
    await cleanUpOrphanedCards();
    await db.spacingState.put(spacingRow(ORPHAN) as never);
    await db.attempts.add(attempt(ORPHAN) as never);

    const later = await cleanUpOrphanedCards();
    expect(later.spacingDeleted).toBe(1);
    expect(later.attemptsDeleted).toBe(1);
    expect(await db.spacingState.get(spacingRowId(MODULE, ORPHAN, 'both')))
      .toBeUndefined();
  });

  it('runs on a database that never had any of these rows', async () => {
    // The other device's first run, after the first device has already
    // swept and synced the deletes down.
    await db.spacingState.put(spacingRow(LIVE) as never);
    const r = await cleanUpOrphanedCards();
    expect(r).toMatchObject({ refused: null, spacingDeleted: 0, heldBack: [] });
    expect(await db.spacingState.count()).toBe(1);
  });
});
