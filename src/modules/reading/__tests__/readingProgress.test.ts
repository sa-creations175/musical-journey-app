// @vitest-environment jsdom
/**
 * The readers for `noteMiss` and `hintUsed`.
 *
 * These tests are the reason those two fields are allowed to exist: a
 * field nothing reads should not be stored. (`elapsedMs` is the
 * deliberate exception, recorded unread because recognition speed
 * cannot be backfilled — that decision is documented at the field.)
 *
 * They also pin the thing that made `excludeFromFluency` the wrong
 * lever: hint-on attempts must stay IN the accuracy pile and be
 * separable within it, not be dropped from it.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type AttemptRecord } from '../../../lib/db';
import {
  readingHintSplit,
  readingMissBreakdown,
  readingSkillAccuracy,
} from '../readingProgress';
import { moduleAccuracy } from '../../goals/progress';

let clock = 1_700_000_000_000;
function attempt(partial: Partial<AttemptRecord> & { itemId: string; correct: boolean }) {
  return {
    moduleId: 'reading',
    timestamp: clock++,
    elapsedMs: 1000,
    ...partial,
  } as AttemptRecord;
}

beforeEach(async () => {
  await db.attempts.clear();
  clock = 1_700_000_000_000;
});

describe('hint split', () => {
  it('reads "with hint" and "without" apart from ONE pile', async () => {
    await db.attempts.bulkAdd([
      // 5 with the hint, 4 right.
      ...Array.from({ length: 4 }, () =>
        attempt({ itemId: 'sig:2s:major:name', correct: true, hintUsed: true })),
      attempt({ itemId: 'sig:2s:major:name', correct: false, hintUsed: true }),
      // 5 without, 2 right.
      ...Array.from({ length: 2 }, () =>
        attempt({ itemId: 'sig:2s:major:name', correct: true })),
      ...Array.from({ length: 3 }, () =>
        attempt({ itemId: 'sig:2s:major:name', correct: false })),
    ]);

    const split = await readingHintSplit();
    expect(split.withHint.total).toBe(5);
    expect(split.withHint.percent).toBe(80);
    expect(split.withoutHint.total).toBe(5);
    expect(split.withoutHint.percent).toBe(40);
  });

  it('HINT-ON ATTEMPTS STAY IN THE OVERALL PILE', async () => {
    // The property excludeFromFluency would have destroyed: it drops
    // the row from moduleAccuracy entirely. Separable, not excluded.
    await db.attempts.bulkAdd([
      attempt({ itemId: 'sig:2s:major:name', correct: true, hintUsed: true }),
      attempt({ itemId: 'sig:2s:major:name', correct: true, hintUsed: true }),
      attempt({ itemId: 'sig:2s:major:name', correct: true, hintUsed: true }),
      attempt({ itemId: 'sig:2s:major:name', correct: true, hintUsed: true }),
      attempt({ itemId: 'sig:2s:major:name', correct: false }),
    ]);
    const overall = await moduleAccuracy(['reading']);
    expect(overall.total).toBe(5);
    expect(overall.percent).toBe(80);
  });

  it('counts only the NAME direction, not every card with no hint flag', async () => {
    // Chord and count cards have no hint state at all. Counting them
    // as "without hint" would inflate the unaided figure with cards
    // that were never eligible for help.
    await db.attempts.bulkAdd([
      attempt({ itemId: 'chord:maj:root:treble', correct: true }),
      attempt({ itemId: 'sig:2s:major:count', correct: true }),
      attempt({ itemId: 'note:treble:4', correct: true }),
      attempt({ itemId: 'sig:2s:major:name', correct: true }),
    ]);
    const split = await readingHintSplit();
    expect(split.withoutHint.total).toBe(1);
    expect(split.withHint.total).toBe(0);
  });
});

describe('miss breakdown', () => {
  it('says how much of the miss is octave versus letter', async () => {
    await db.attempts.bulkAdd([
      attempt({ itemId: 'note:treble:4', correct: false, noteMiss: 'octave' }),
      attempt({ itemId: 'note:treble:5', correct: false, noteMiss: 'octave' }),
      attempt({ itemId: 'note:bass:2', correct: false, noteMiss: 'octave' }),
      attempt({ itemId: 'note:bass:3', correct: false, noteMiss: 'letter' }),
      attempt({ itemId: 'note:bass:6', correct: false, noteMiss: 'both' }),
      attempt({ itemId: 'note:treble:0', correct: true }),
    ]);
    const b = await readingMissBreakdown();
    expect(b).toEqual({ octave: 3, letter: 1, both: 1, totalWrong: 5 });
  });

  it('ignores correct attempts and other skills', async () => {
    await db.attempts.bulkAdd([
      attempt({ itemId: 'note:treble:4', correct: true, noteMiss: 'octave' }),
      attempt({ itemId: 'chord:maj:root:treble', correct: false }),
      attempt({ itemId: 'shape:triad:root', correct: false }),
      attempt({ itemId: 'sig:2s:major:name', correct: false }),
    ]);
    expect(await readingMissBreakdown())
      .toEqual({ octave: 0, letter: 0, both: 0, totalWrong: 0 });
  });

  it('totalWrong is COUNTED, so an unattributed miss shows as a gap', async () => {
    // Summing the three would silently rebalance the percentages if a
    // wrong note attempt ever arrived without a noteMiss. Counting the
    // rows makes that visible as octave+letter+both < totalWrong.
    await db.attempts.bulkAdd([
      attempt({ itemId: 'note:treble:4', correct: false, noteMiss: 'octave' }),
      attempt({ itemId: 'note:treble:5', correct: false }), // no attribution
    ]);
    const b = await readingMissBreakdown();
    expect(b.totalWrong).toBe(2);
    expect(b.octave + b.letter + b.both).toBe(1);
  });
});

describe('per-skill accuracy', () => {
  it('narrows to one skill via attemptFilter', async () => {
    await db.attempts.bulkAdd([
      attempt({ itemId: 'note:treble:4', correct: true }),
      attempt({ itemId: 'note:treble:5', correct: true }),
      attempt({ itemId: 'note:bass:2', correct: true }),
      attempt({ itemId: 'note:bass:3', correct: true }),
      attempt({ itemId: 'note:bass:6', correct: false }),
      // Different skill — must not move the note figure.
      attempt({ itemId: 'chord:maj:root:treble', correct: false }),
      attempt({ itemId: 'chord:min:root:treble', correct: false }),
    ]);
    const notes = await readingSkillAccuracy('note');
    expect(notes.total).toBe(5);
    expect(notes.percent).toBe(80);
  });

  it('routes by PARSE, so a foreign itemId cannot be counted', async () => {
    await db.attempts.bulkAdd([
      attempt({ itemId: 'note:treble:4', correct: true }),
      attempt({ itemId: 'note:treble:5', correct: true }),
      attempt({ itemId: 'note:treble:6', correct: true }),
      attempt({ itemId: 'note:treble:7', correct: true }),
      attempt({ itemId: 'note:treble:8', correct: true }),
      // Not a Reading ref at all, even though it starts with "note".
      attempt({ itemId: 'note:alto:4', correct: false }),
      attempt({ itemId: 'notexyz', correct: false }),
    ]);
    const notes = await readingSkillAccuracy('note');
    expect(notes.total).toBe(5);
    expect(notes.percent).toBe(100);
  });
});
