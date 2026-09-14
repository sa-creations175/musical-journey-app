import 'fake-indexeddb/auto';
/**
 * The marks are the reader's: seeded once, then theirs.
 *
 * =====================================================================
 * "NEVER RE-SEED" IS THE LOAD-BEARING HALF.
 *
 * A seed that runs on every open would put back every dot a reader had
 * switched off. So the test switches one off and seeds again.
 * =====================================================================
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { markSyncReady } from '../sync/syncReady';
import {
  MARKS_SEEDED_KEY, MARK_KEY_PREFIX, clearMark, readMarks, seedMarksIfNeeded, setMark,
} from '../chordQualityMarks';
import { SEED_MARKS } from '../chordQualitiesByScale';

beforeEach(async () => {
  markSyncReady();
  await db.userPrefs.clear();
});

describe('the seed', () => {
  it('gives a new reader Silas\'s marks and sets the flag', async () => {
    await seedMarksIfNeeded();
    expect(await readMarks()).toEqual(SEED_MARKS);
    expect((await db.userPrefs.get(MARKS_SEEDED_KEY))?.value).toBe(1);
  });

  it('never puts back a mark the reader took off', async () => {
    await seedMarksIfNeeded();
    await clearMark('harmonic-7');
    await seedMarksIfNeeded();
    expect(await readMarks()).not.toHaveProperty('harmonic-7');
  });

  it('keeps a reader\'s own note on a seeded cell', async () => {
    await setMark('natural-5', 'Ordinary People');
    await seedMarksIfNeeded();
    expect((await readMarks())['natural-5']).toBe('Ordinary People');
  });
});

describe('a mark', () => {
  it('is one synced prefs row, keyed by scale and degree, the note its value', async () => {
    await setMark('melodic-4', 'the bright 4');
    expect(await db.userPrefs.get(`${MARK_KEY_PREFIX}melodic-4`))
      .toEqual({ key: `${MARK_KEY_PREFIX}melodic-4`, value: 'the bright 4' });
  });

  it('can have no note yet and still be a mark', async () => {
    await setMark('phrygian-2', '');
    expect(await readMarks()).toEqual({ 'phrygian-2': '' });
  });

  it('comes off whole, note and all', async () => {
    await setMark('dorian-4', 'the same bright 4');
    await clearMark('dorian-4');
    expect(await readMarks()).toEqual({});
  });
});
