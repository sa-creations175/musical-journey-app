// @vitest-environment jsdom
/**
 * The migration, on both paths.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SPACING_SETTINGS } from '../settings';
import {
  migrateFlashcardSchedules,
  previewFlashcardMigration,
  resumeGapDays,
  PREF_FLASHCARD_MIGRATION,
  PREF_FLASHCARD_MIGRATION_ARMED,
} from '../migrateFlashcards';
import { db } from '../../db';
import { getPref, setPref } from '../../userPrefs';

const TALLY = DEFAULT_SPACING_SETTINGS.acquiring.tally;   // 2·1·0·1·0·1 → 0,0,1,3,5

describe('where a part-way card resumes', () => {
  it('resumes a 3-answer card at the day-3 step, two days out', () => {
    // THE SPEC'S OWN WORKED EXAMPLE. Day 0 and day 1 are behind it, so
    // the next exposure is the day-3 one — two days after the day-1
    // step it last completed, counted from the migration date.
    expect(resumeGapDays(TALLY, 3)).toBe(2);
  });

  it('then owes one more two days after that, and graduates', () => {
    expect(resumeGapDays(TALLY, 4)).toBe(2);
    expect(resumeGapDays(TALLY, 5)).toBeNull();
  });

  it('puts a card with one answer straight back in the same session', () => {
    // Day 0 carries two exposures, so the second is due immediately.
    expect(resumeGapDays(TALLY, 1)).toBe(0);
  });

  it('starts an untouched card at the beginning', () => {
    expect(resumeGapDays(TALLY, 0)).toBe(0);
  });

  it('owes nothing once the tally is spent', () => {
    expect(resumeGapDays(TALLY, 9)).toBeNull();
  });

  it('follows a changed tally rather than the default', () => {
    // 1·0·0·2 over six slots → day offsets 0,3,3.
    const custom = [1, 0, 0, 2, 0, 0];
    expect(resumeGapDays(custom, 1)).toBe(3);
    expect(resumeGapDays(custom, 2)).toBe(0);
    expect(resumeGapDays(custom, 3)).toBeNull();
  });
});

// =====================================================================
// Wired, and not armed
// =====================================================================

describe('the arming gate', () => {
  beforeEach(async () => {
    await db.spacingState.clear();
    await db.flashcardStates.clear();
    await db.userPrefs.clear();
  });

  it('does nothing at all while unarmed, however much there is to do', async () => {
    // THE WHOLE POINT OF THE SECOND PREF. The migration is in the boot
    // path; this is what stops it firing there.
    await db.flashcardStates.bulkAdd([
      { cardId: 'ks-1', easeFactor: 2.5, interval: 6, nextReviewDate: 1_000,
        lastReviewed: 500, consecutiveCorrect: 2, totalAttempts: 9, totalCorrect: 8 },
    ]);
    const r = await migrateFlashcardSchedules();
    expect(r.skipped).toBe(true);
    expect(await db.spacingState.count()).toBe(0);
    // And it did not quietly mark itself done, which would strand the
    // rows permanently the moment someone armed it later.
    expect(await getPref(PREF_FLASHCARD_MIGRATION, false)).toBe(false);
  });

  it('the preview counts the same rows without writing any of them', async () => {
    await db.flashcardStates.bulkAdd([
      { cardId: 'ks-1', easeFactor: 2.5, interval: 6, nextReviewDate: 1_000,
        lastReviewed: 500, consecutiveCorrect: 2, totalAttempts: 9, totalCorrect: 8 },
    ]);
    const preview = await previewFlashcardMigration();
    expect(preview.toMaintaining + preview.toAcquiring).toBe(1);
    expect(await db.spacingState.count()).toBe(0);
    expect(await getPref(PREF_FLASHCARD_MIGRATION, false)).toBe(false);

    // Armed, the run lands exactly what the preview promised.
    await setPref(PREF_FLASHCARD_MIGRATION_ARMED, true);
    const run = await migrateFlashcardSchedules();
    expect(run.skipped).toBe(false);
    expect(run.toMaintaining).toBe(preview.toMaintaining);
    expect(run.toAcquiring).toBe(preview.toAcquiring);
    expect(await db.spacingState.count()).toBe(1);
  });
});
