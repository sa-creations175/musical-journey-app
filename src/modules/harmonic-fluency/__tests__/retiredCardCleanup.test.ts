/**
 * Retiring `ksc-3`.
 *
 * =====================================================================
 * THE ASSERTION THAT MATTERS IS THE REFUSAL.
 *
 * Deleting the right rows is easy to get right and easy to check. What
 * this file is really for is the case where the database is not the
 * one the ruling was made about — a star that appeared, a second
 * attempt, a spacing row that is already gone. Every one of those has
 * to stop the delete rather than adapt to it, because the ruling said
 * "nothing hand-authored exists on either card" and a cleanup that
 * ran anyway would be answering a question nobody asked.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import {
  cleanUpRetiredCard,
  PREF_KSC3_RETIRED,
  refusalFor,
  RETIRED_CARD_ID,
  SURVIVING_CARD_ID,
  surveyRetiredCard,
} from '../retiredCardCleanup';
import { setPref } from '../../../lib/userPrefs';

const MODULE = 'harmonic-fluency';

/** The database as the survey found it: one attempt, one spacing row,
 *  nothing hand-authored. */
async function seedAuthorisedShape() {
  await db.attempts.add({
    id: 'a1', moduleId: MODULE, itemId: RETIRED_CARD_ID,
    timestamp: Date.UTC(2026, 7, 23), isCorrect: false,
  } as never);
  await db.spacingState.add({
    id: `sp-${MODULE}-both-${RETIRED_CARD_ID}`,
    itemRef: RETIRED_CARD_ID, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquiring',
    currentIntervalDays: 1, lastEngagedAt: Date.UTC(2026, 7, 23),
    nextDueAt: null, performanceHistory: [],
  } as never);
}

/** A row belonging to the card that was KEPT, so every test can show
 *  it survived rather than only that the other one went. */
async function seedSurvivor() {
  await db.attempts.add({
    id: 'a2', moduleId: MODULE, itemId: SURVIVING_CARD_ID,
    timestamp: Date.UTC(2026, 7, 24), isCorrect: false,
  } as never);
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.userPrefs.clear();
  await setPref(PREF_KSC3_RETIRED, false);
});

describe('the card itself', () => {
  it('is gone from the deck', () => {
    expect(FLASHCARDS.some(c => c.id === RETIRED_CARD_ID)).toBe(false);
  });

  it('and the question it duplicated is still asked', () => {
    // Half a deletion — both gone — is the failure worth naming, since
    // the two were identical and either could have been targeted.
    //
    // `ks-16` ITSELF RETIRED IN COMMIT 8, into the generated relative
    // set. The claim survives it: the question is still in the deck,
    // asked once, which is what the deletion was for.
    expect(SURVIVING_CARD_ID).toBe('ks-16');
    const asking = FLASHCARDS.filter(
      c => c.question === 'The relative major of A minor is _____',
    );
    expect(asking).toHaveLength(1);
    expect(asking[0].correctAnswer).toBe('C major');
  });

  it('leaves exactly one card asking that question', () => {
    // The whole point of the deletion. Two cards asking the same thing
    // split one skill's history in two.
    const asking = FLASHCARDS.filter(
      c => c.question === 'The relative major of A minor is _____',
    );
    expect(asking).toHaveLength(1);
  });

  it('renumbers nothing around it', () => {
    // These ids are written out one at a time rather than minted from
    // an index, so removing one from the middle cannot repoint the
    // rest. Asserted because the silent version of this bug is what
    // `generatedCardPairing` exists to catch.
    // `ksc-4` and `ksc-5` retired in commit 8 with the rest of the
    // relative-major cards; `ksc-2` and `ksc-15` did not, and they sit
    // either side of the gap.
    for (const id of ['ksc-2', 'ksc-15', 'ksc-16']) {
      expect(FLASHCARDS.some(c => c.id === id), id).toBe(true);
    }
    expect(FLASHCARDS.find(c => c.id === 'ksc-2')?.correctAnswer)
      .toBe('b3, b6, and b7');
  });
});

describe('what the cleanup does when the shape is the authorised one', () => {
  it('deletes one attempt and one spacing row, and nothing else', async () => {
    await seedAuthorisedShape();
    await seedSurvivor();

    const report = await cleanUpRetiredCard();

    expect(report.refused).toBeNull();
    expect(report.attemptsDeleted).toBe(1);
    expect(report.spacingDeleted).toBe(1);
    // The survivor's row is untouched — the count is what a reader
    // would check, so it is what this checks.
    expect(await db.attempts.count()).toBe(1);
    expect((await db.attempts.toArray())[0].itemId).toBe(SURVIVING_CARD_ID);
    expect(await db.spacingState.count()).toBe(0);
  });

  it('runs once, then does nothing', async () => {
    await seedAuthorisedShape();
    await cleanUpRetiredCard();

    // A second attempt row arriving afterwards must not be swept up by
    // a re-run. The pref is what stops that.
    await db.attempts.add({
      id: 'a3', moduleId: MODULE, itemId: RETIRED_CARD_ID,
      timestamp: Date.now(), isCorrect: true,
    } as never);
    const second = await cleanUpRetiredCard();

    expect(second.skipped).toBe(true);
    expect(second.attemptsDeleted).toBe(0);
    expect(await db.attempts.count()).toBe(1);
  });
});

describe('what it does when the database is not that one', () => {
  it('refuses on a star, and leaves the rows where they are', async () => {
    await seedAuthorisedShape();
    await db.spacingState.toCollection().modify(s => { s.studyLater = true; });

    const report = await cleanUpRetiredCard();

    expect(report.refused).toContain('studyLater');
    expect(report.attemptsDeleted).toBe(0);
    expect(await db.spacingState.count()).toBe(1);
    // NOT marked done — a refusal is a state to come back to.
    expect((await cleanUpRetiredCard()).skipped).toBe(false);
  });

  it('refuses on a review flag and on a note', () => {
    // Pure, so the rule reads without a database.
    expect(refusalFor({ attempts: 1, spacingRows: 1, handAuthored: ['reviewFlagged'] }))
      .toContain('reviewFlagged');
    expect(refusalFor({ attempts: 1, spacingRows: 1, handAuthored: ['reviewFlagNote'] }))
      .toContain('reviewFlagNote');
  });

  it('refuses when a second attempt has appeared', async () => {
    await seedAuthorisedShape();
    await db.attempts.add({
      id: 'a4', moduleId: MODULE, itemId: RETIRED_CARD_ID,
      timestamp: Date.now(), isCorrect: true,
    } as never);

    const report = await cleanUpRetiredCard();
    expect(report.refused).toContain('expected 1 attempt, found 2');
    expect(await db.attempts.count()).toBe(2);
  });

  it('refuses when the rows are already gone', async () => {
    // Not "nothing to do, mark it done". An empty database where one
    // attempt was expected is a database that changed under the
    // ruling, and it should be looked at rather than waved through.
    const report = await cleanUpRetiredCard();
    expect(report.refused).toContain('expected 1 attempt, found 0');
  });

  it('says nothing about hand-authored fields that are not set', async () => {
    // Guard the guard: the refusal above has to be caused by the flag,
    // not by the survey reporting one on every row.
    await seedAuthorisedShape();
    expect((await surveyRetiredCard()).handAuthored).toEqual([]);
  });
});

describe('what it counts', () => {
  it('only this card, in only this module', async () => {
    await seedAuthorisedShape();
    // Same item id under a different module would be a different card.
    await db.attempts.add({
      id: 'a5', moduleId: 'production', itemId: RETIRED_CARD_ID,
      timestamp: Date.now(), isCorrect: true,
    } as never);

    expect((await surveyRetiredCard()).attempts).toBe(1);
    const report = await cleanUpRetiredCard();
    expect(report.attemptsDeleted).toBe(1);
    expect(await db.attempts.count()).toBe(1);
  });
});
