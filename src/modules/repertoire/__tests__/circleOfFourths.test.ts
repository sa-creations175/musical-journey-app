import { describe, expect, it } from 'vitest';
import { generateCircleOfFourthsSequence } from '../circleOfFourths';

/**
 * The wheel, in the app's IDENTITY vocabulary:
 *   C → F → Bb → Eb → Ab → Db → F# → B → E → A → D → G → (C)
 *
 * The sixth key reads F# here and Gb on screen, and both are correct:
 * F# is the stored name every table is keyed on, Gb is the default
 * spelling `lib/spelling.ts` renders it as. This module deals only in
 * the first — these outputs go on to build itemRefs and index lookups,
 * so a test that expected a display name here would be asserting the
 * wrong half of the split.
 *
 * Each starting key yields the remaining 11 in fourths order. Any
 * accepted spelling of the start — sharp, flat, theoretical, or one
 * carrying a Unicode accidental — normalises before the lookup.
 */
describe('generateCircleOfFourthsSequence', () => {
  it('starts at C and walks the wheel', () => {
    expect(generateCircleOfFourthsSequence('C')).toEqual([
      'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G',
    ]);
  });

  it('returns 11 keys for any valid starting point', () => {
    for (const k of ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G']) {
      expect(generateCircleOfFourthsSequence(k)).toHaveLength(11);
    }
  });

  it('never includes the starting key in its own sequence', () => {
    for (const k of ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G']) {
      expect(generateCircleOfFourthsSequence(k)).not.toContain(k);
    }
  });

  it('wraps correctly — last key precedes start, first key follows it on the wheel', () => {
    // G is one step before C on the wheel; F is one step after.
    const fromC = generateCircleOfFourthsSequence('C');
    expect(fromC[0]).toBe('F');
    expect(fromC[fromC.length - 1]).toBe('G');

    // F is one step before Bb; Eb is one step after.
    const fromBb = generateCircleOfFourthsSequence('Bb');
    expect(fromBb[0]).toBe('Eb');
    expect(fromBb[fromBb.length - 1]).toBe('F');
  });

  it('every-key sequence walks through all OTHER eleven keys exactly once', () => {
    for (const start of ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G']) {
      const seq = generateCircleOfFourthsSequence(start);
      const set = new Set(seq);
      expect(set.size).toBe(11);
      expect(set.has(start)).toBe(false);
    }
  });

  it('walks from G correctly — last step before wrapping to C', () => {
    expect(generateCircleOfFourthsSequence('G')).toEqual([
      'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D',
    ]);
  });

  it('treats Gb and F# as one key — Gb now normalises INTO the wheel', () => {
    // The direction reversed in step 2. This module used to map F# → Gb,
    // i.e. into a vocabulary nothing stored; it now maps Gb → F#, the
    // name every table is actually keyed on.
    expect(generateCircleOfFourthsSequence('Gb')).toEqual(
      generateCircleOfFourthsSequence('F#'),
    );
    expect(generateCircleOfFourthsSequence('C')).toContain('F#');
    expect(generateCircleOfFourthsSequence('C')).not.toContain('Gb');
  });

  it('handles sharps Db/C#, Eb/D#, Ab/G#, Bb/A# as enharmonic pairs', () => {
    expect(generateCircleOfFourthsSequence('C#')).toEqual(
      generateCircleOfFourthsSequence('Db'),
    );
    expect(generateCircleOfFourthsSequence('D#')).toEqual(
      generateCircleOfFourthsSequence('Eb'),
    );
    expect(generateCircleOfFourthsSequence('G#')).toEqual(
      generateCircleOfFourthsSequence('Ab'),
    );
    expect(generateCircleOfFourthsSequence('A#')).toEqual(
      generateCircleOfFourthsSequence('Bb'),
    );
  });

  it('handles Cb/Fb as natural-letter enharmonic equivalents (B/E)', () => {
    expect(generateCircleOfFourthsSequence('Cb')).toEqual(
      generateCircleOfFourthsSequence('B'),
    );
    expect(generateCircleOfFourthsSequence('Fb')).toEqual(
      generateCircleOfFourthsSequence('E'),
    );
  });

  it('returns an empty array for unrecognised inputs', () => {
    expect(generateCircleOfFourthsSequence('H')).toEqual([]);
    expect(generateCircleOfFourthsSequence('')).toEqual([]);
    expect(generateCircleOfFourthsSequence('Cmaj')).toEqual([]);
    expect(generateCircleOfFourthsSequence('c')).toEqual([]); // case-sensitive on purpose
  });
});
