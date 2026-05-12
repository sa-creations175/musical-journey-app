import { describe, expect, it } from 'vitest';
import { generateCircleOfFourthsSequence } from '../circleOfFourths';

/**
 * Spec wheel:
 *   C → F → Bb → Eb → Ab → Db → Gb → B → E → A → D → G → (C)
 *
 * Each starting key should yield the remaining 11 in fourths order.
 * Enharmonic input (sharps) maps to the canonical flat-side form
 * before the wheel lookup; output is always in canonical form.
 */
describe('generateCircleOfFourthsSequence', () => {
  it('starts at C and walks the wheel', () => {
    expect(generateCircleOfFourthsSequence('C')).toEqual([
      'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G',
    ]);
  });

  it('returns 11 keys for any valid starting point', () => {
    for (const k of ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G']) {
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
      'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D',
    ]);
  });

  it('handles the sharp-side enharmonic F# (canonicalises to Gb)', () => {
    expect(generateCircleOfFourthsSequence('F#')).toEqual(
      generateCircleOfFourthsSequence('Gb'),
    );
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
