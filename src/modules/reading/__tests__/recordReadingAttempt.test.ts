// @vitest-environment jsdom
/**
 * Reading's attempt write path.
 *
 * Two things are being pinned. First, that the row Reading writes has
 * ONE identity — `itemId` is the itemRef, and the spacing row agrees —
 * because the alternative is the split Intervals still carries, where
 * attempts and spacingState disagree about what an item is. Second,
 * that the skill-scoped fields are set only where they mean something:
 * a hint flag on a chord row would quietly inflate the hint split.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildReadingAttempt,
  noteMissFor,
  recordReadingAttempt,
} from '../recordReadingAttempt';
import { db } from '../../../lib/db';
import { judgeNote } from '../answerModels';

async function clearAll() {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.dailySummaries.clear();
}

describe('the attempt row', () => {
  it('uses the itemRef AS the itemId — one identity, not two', () => {
    const row = buildReadingAttempt({
      itemRef: 'chord:min7:inv2:bass', correct: true, elapsedMs: 1200,
    })!;
    expect(row.itemId).toBe('chord:min7:inv2:bass');
    expect(row.moduleId).toBe('reading');
  });

  it('does NOT carry `direction` — that field is the Intervals split', () => {
    // Intervals stores interval.id in itemId and composes
    // `${id}:${direction}` for spacing, so its two tables disagree.
    // Reading's distinctions are all already segments of the ref.
    for (const ref of [
      'note:treble:4', 'shape:seventh:inv3', 'sig:2s:major:name',
      'chord:maj:root:treble',
    ]) {
      const row = buildReadingAttempt({ itemRef: ref, correct: true, elapsedMs: 1 })!;
      expect(row.direction, ref).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(row, 'direction'), ref).toBe(false);
    }
  });

  it('records elapsed time, and never targetSeconds', () => {
    // They are different measurements: targetSeconds is a cap the user
    // chose, elapsedMs is time actually taken. Reading has no timer at
    // all, so a targetSeconds here would be a fiction.
    const row = buildReadingAttempt({
      itemRef: 'note:bass:0', correct: true, elapsedMs: 4321,
    })!;
    expect(row.elapsedMs).toBe(4321);
    expect(row.targetSeconds).toBeUndefined();
  });

  it('refuses a ref that is not a Reading item', () => {
    // A row against an unparseable ref could never be attributed by
    // any coverage or accuracy query — it would just sit there.
    expect(buildReadingAttempt({ itemRef: 'nonsense', correct: true, elapsedMs: 1 }))
      .toBeNull();
    expect(buildReadingAttempt({ itemRef: 'chord-shape:maj:C:root', correct: true, elapsedMs: 1 }))
      .toBeNull();
    expect(buildReadingAttempt({ itemRef: 'shape:triad:inv3', correct: true, elapsedMs: 1 }))
      .toBeNull();
  });
});

describe('noteMiss — which half went wrong', () => {
  it('is absent when the attempt was right', () => {
    // The field answers "what went wrong", so it should not be present
    // when nothing did.
    expect(noteMissFor(judgeNote('treble', 0, 'E'))).toBeUndefined();
  });

  it("a wrong note is a wrong LETTER — 'octave' is no longer reachable", () => {
    // note:treble:0 is E4. The octave is not asked, so it cannot be
    // missed; the only miss a new row can carry is the letter.
    expect(noteMissFor(judgeNote('treble', 0, 'F'))).toBe('letter');
    expect(noteMissFor(judgeNote('treble', 0, 'B'))).toBe('letter');
  });

  it('rides on the row only for NOTE items', () => {
    const note = buildReadingAttempt({
      itemRef: 'note:treble:0',
      correct: false,
      elapsedMs: 1,
      noteVerdict: judgeNote('treble', 0, 'F'),
    })!;
    expect(note.noteMiss).toBe('letter');

    // A verdict handed in for a non-note card is ignored rather than
    // written — the field would mean nothing on a chord row.
    const chord = buildReadingAttempt({
      itemRef: 'chord:maj:root:treble',
      correct: false,
      elapsedMs: 1,
      noteVerdict: judgeNote('treble', 0, 'F'),
    })!;
    expect(chord.noteMiss).toBeUndefined();
  });
});

describe('hintUsed — only where a hint exists', () => {
  it('is set on a signature NAME attempt answered with the hint on', () => {
    const row = buildReadingAttempt({
      itemRef: 'sig:2s:major:name', correct: true, elapsedMs: 1, hintUsed: true,
    })!;
    expect(row.hintUsed).toBe(true);
  });

  it('is ABSENT rather than false when the hint was off', () => {
    // Matches excludeFromFluency's convention — the false case is the
    // default and is not written.
    const row = buildReadingAttempt({
      itemRef: 'sig:2s:major:name', correct: true, elapsedMs: 1, hintUsed: false,
    })!;
    expect(row.hintUsed).toBeUndefined();
  });

  it('is never set on a direction or skill that has no hint', () => {
    // Otherwise the hint split would count cards that were never
    // eligible for help.
    for (const ref of [
      'sig:2s:major:count', 'sig:2s:major:which',
      'note:treble:4', 'shape:triad:root', 'chord:maj:root:treble',
    ]) {
      const row = buildReadingAttempt({
        itemRef: ref, correct: true, elapsedMs: 1, hintUsed: true,
      })!;
      expect(row.hintUsed, ref).toBeUndefined();
    }
  });
});

describe('the three calls', () => {
  beforeEach(clearAll);

  it('writes the attempt, the spacing row, and the daily summary', async () => {
    // The shape every ET surface agrees on. If any one of the three is
    // dropped the module still "works" — and silently stops counting
    // toward coverage, or streaks, or both.
    await recordReadingAttempt({
      itemRef: 'sig:3f:minor:name', correct: true, elapsedMs: 900,
    });

    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].itemId).toBe('sig:3f:minor:name');

    const spacing = await db.spacingState.toArray();
    expect(spacing).toHaveLength(1);
    expect(spacing[0].moduleRef).toBe('reading');

    const summaries = await db.dailySummaries.toArray();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].moduleId).toBe('reading');
    expect(summaries[0].correctCount).toBe(1);
  });

  it('the spacing itemRef and the attempt itemId are the SAME string', async () => {
    // The invariant Intervals breaks. Asserted on a real write rather
    // than on the builder, because the split there happens at the call
    // site, not in the row.
    await recordReadingAttempt({
      itemRef: 'chord:halfdim:inv1:treble', correct: false, elapsedMs: 10,
    });
    const [attempt] = await db.attempts.toArray();
    const [spacing] = await db.spacingState.toArray();
    expect(spacing.itemRef).toBe(attempt.itemId);
  });

  it('a wrong attempt counts toward the day, not only a right one', async () => {
    await recordReadingAttempt({
      itemRef: 'note:bass:-4', correct: false, elapsedMs: 10,
      noteVerdict: judgeNote('bass', -4, 'D'),
    });
    const [summary] = await db.dailySummaries.toArray();
    expect(summary.wrongCount).toBe(1);
    expect(summary.correctCount).toBe(0);
  });

  it('writes nothing at all for an unparseable ref', async () => {
    const result = await recordReadingAttempt({
      itemRef: 'vl:five-one:C', correct: true, elapsedMs: 10,
    });
    expect(result).toBeNull();
    expect(await db.attempts.count()).toBe(0);
    expect(await db.spacingState.count()).toBe(0);
    expect(await db.dailySummaries.count()).toBe(0);
  });
});

describe('the walk-away ceiling, newly applied to Reading', () => {
  /**
   * =================================================================
   * READING IS WHERE THE CONTAMINATION CAME FROM.
   *
   * `ReadingDrill` sets `shownAt` once per card and never invalidates
   * it, so a card left open overnight is written as an answer that
   * took hours. Those rows are real records of nothing, and they sat
   * beside genuine measurements under one field name for months
   * because this module wrote `elapsedMs` unguarded.
   *
   * The ceiling stops NEW rows like that. It deliberately does not
   * touch the old ones — `window.__readingElapsedShape()` has to see
   * the corpus as it is before anyone decides what to do about it.
   * =================================================================
   */
  const FIVE_MINUTES = 5 * 60 * 1000;

  it('keeps a real answer', () => {
    const row = buildReadingAttempt({
      itemRef: 'note:bass:0', correct: true, elapsedMs: 2_400,
    })!;
    expect(row.elapsedMs).toBe(2_400);
  });

  it('keeps an answer at exactly five minutes', () => {
    const row = buildReadingAttempt({
      itemRef: 'note:bass:0', correct: true, elapsedMs: FIVE_MINUTES,
    })!;
    expect(Object.hasOwn(row, 'elapsedMs')).toBe(true);
  });

  it('records NO elapsedMs one millisecond over', () => {
    const row = buildReadingAttempt({
      itemRef: 'note:bass:0', correct: true, elapsedMs: FIVE_MINUTES + 1,
    })!;
    // Object.hasOwn, not toHaveProperty(x, undefined): those read
    // identically for absent and set-to-undefined, and only absence
    // survives the trip to Postgres as "no measurement".
    expect(Object.hasOwn(row, 'elapsedMs')).toBe(false);
  });

  it('records nothing for the overnight card that started all this', () => {
    const row = buildReadingAttempt({
      itemRef: 'note:bass:0', correct: true, elapsedMs: 9 * 60 * 60 * 1000,
    })!;
    expect(Object.hasOwn(row, 'elapsedMs')).toBe(false);
    // Omitted, not clamped to the ceiling — a clamp would file a
    // "slow" vote from a datapoint nobody trusts.
    expect(row.elapsedMs).toBeUndefined();
  });

  it('still writes everything else on a discarded-timing row', () => {
    // The attempt itself is real. Only the measurement is missing.
    const row = buildReadingAttempt({
      itemRef: 'note:bass:0', correct: false, elapsedMs: 6 * 60 * 1000,
    })!;
    expect(row.correct).toBe(false);
    expect(row.itemId).toBe('note:bass:0');
    expect(typeof row.timestamp).toBe('number');
  });
});
