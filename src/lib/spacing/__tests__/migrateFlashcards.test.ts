/**
 * The migration, on both paths.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPACING_SETTINGS } from '../settings';
import { resumeGapDays } from '../migrateFlashcards';

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
