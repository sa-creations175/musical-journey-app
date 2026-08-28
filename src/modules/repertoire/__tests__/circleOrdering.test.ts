/**
 * The one ordering every key chart sorts by.
 *
 * WHAT WENT WRONG WITHOUT IT. Harmonic fluency's key axis offered a
 * "circle" view whose values were the columns exactly as declared —
 * chromatic order with F♯ appended. Against its chromatic sibling it
 * moved one column, so a toggle that promised two readings of the
 * twelve keys gave very nearly one. Four other places each built their
 * own index over the wheel; this is the one they share now.
 */
import { describe, expect, it } from 'vitest';
import {
  circleOfFourthsIndex,
  sortByCircleOfFourths,
} from '../circleOfFourths';
import { spellKey } from '../../../lib/spelling';

/**
 * THE WHEEL, IN IDENTITY SPELLING.
 *
 * Slot six is `F#` here and `Gb` on screen, and that is not a
 * discrepancy: `circleOfFourths` demotes Gb from an identity to a
 * spelling, so the stored name is F♯ and the reader sees G♭. The next
 * test asserts what the reader sees.
 */
const WHEEL_IDENTITY = [
  'C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#', 'B', 'E', 'A', 'D', 'G',
];

/**
 * The exact sequence the charts must read, top row, left to right.
 *
 * Typeset with real flat signs, because `spellKey` is what puts them on
 * screen and it renders U+266D rather than an ASCII `b`. Same twelve
 * keys as the brief's "C, F, Bb, Eb, Ab, Db, Gb, B, E, A, D, G".
 */
const WHEEL_AS_READ = [
  'C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'B', 'E', 'A', 'D', 'G',
];

describe('the twelve keys come back in wheel order', () => {
  it('sorts the identity names into the circle of 4ths', () => {
    const scrambled = ['E', 'C', 'Ab', 'G', 'Db', 'F', 'B', 'Eb', 'D', 'Bb', 'F#', 'A'];
    expect(sortByCircleOfFourths(scrambled)).toEqual(WHEEL_IDENTITY);
  });

  it('reads as C F Bb Eb Ab Db Gb B E A D G once spelled', () => {
    expect(sortByCircleOfFourths(WHEEL_IDENTITY).map(k => spellKey(k, 'flat')))
      .toEqual(WHEEL_AS_READ);
  });

  it('is a fourth up each step, all the way round', () => {
    // The property the name claims, checked rather than assumed: each
    // step is +5 semitones from the last.
    const PC: Readonly<Record<string, number>> = {
      C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11,
    };
    const order = sortByCircleOfFourths(WHEEL_IDENTITY);
    for (let i = 1; i < order.length; i++) {
      expect((PC[order[i - 1]] + 5) % 12, `${order[i - 1]} → ${order[i]}`)
        .toBe(PC[order[i]]);
    }
  });

  it('is NOT chromatic order — the bug the toggle had', () => {
    const chromatic = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    expect(sortByCircleOfFourths(chromatic)).not.toEqual(chromatic);
    expect(sortByCircleOfFourths(chromatic)).toEqual(WHEEL_IDENTITY);
  });
});

describe('enharmonics land on their own slot', () => {
  it('Gb sorts where F# does, not off the end', () => {
    expect(circleOfFourthsIndex('Gb')).toBe(circleOfFourthsIndex('F#'));
    expect(circleOfFourthsIndex('Gb')).toBe(6);
  });

  it('a thirteen-column axis keeps the pair adjacent at slot six', () => {
    // Harmonic fluency carries both spellings as separate columns.
    // They must sit together on the wheel rather than one of them
    // being pushed to the tail, which is what the old view did.
    const thirteen = [...WHEEL_IDENTITY, 'Gb'];
    const sorted = sortByCircleOfFourths(thirteen);
    expect(sorted).toHaveLength(13);
    expect(sorted.slice(5, 8)).toEqual(['Db', 'F#', 'Gb']);
  });

  it('the tie breaks the same way every time', () => {
    const a = sortByCircleOfFourths(['Gb', 'F#']);
    const b = sortByCircleOfFourths(['F#', 'Gb']);
    expect(a).toEqual(b);
  });
});

describe('what it does with a key it does not know', () => {
  it('sorts it last rather than to the front', () => {
    expect(circleOfFourthsIndex('H')).toBe(12);
    expect(sortByCircleOfFourths(['G', 'H', 'C'])).toEqual(['C', 'G', 'H']);
  });

  it('leaves the input array alone', () => {
    const input = ['G', 'C'];
    sortByCircleOfFourths(input);
    expect(input).toEqual(['G', 'C']);
  });
});
