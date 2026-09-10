/**
 * What the board shows, as data rather than as pixels.
 *
 * The failure worth guarding is a mark on the wrong OCTAVE: a voicing
 * is a set of absolute notes, and a board that resolved by pitch class
 * would light three Cs where the hand plays one. Which is exactly why
 * this build does not reuse `KeyboardVisual`.
 */
import { describe, expect, it } from 'vitest';
import { chordMarks, raise, scaleMarks, singleMark, tapMarks } from '../marks';
import { intervalColor } from '../../voicingColors';
import { KEYBOARD_HIGH_MIDI, KEYBOARD_LOW_MIDI } from '../board';

describe('a chord is marked note by note, not pitch class by pitch class', () => {
  const chord = { hand: [60, 64, 67], bass: 36, rootPc: 0 };

  it('marks the notes the hand plays and no others', () => {
    const marks = chordMarks(chord);
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([36, 60, 64, 67]);
    // The other two Cs on a three-octave board are NOT lit.
    expect(marks.has(48)).toBe(false);
    expect(marks.has(72)).toBe(false);
  });

  it('colours each note by its job in the chord', () => {
    const marks = chordMarks(chord);
    expect(marks.get(60)!.fill).toBe(intervalColor(0));
    expect(marks.get(64)!.fill).toBe(intervalColor(4));
    expect(marks.get(67)!.fill).toBe(intervalColor(7));
  });

  it('gives the bass a band, and a fill when the hand is not on it', () => {
    const marks = chordMarks(chord);
    expect(marks.get(36)!.bassBand).toBe(true);
    expect(marks.get(36)!.fill).toBe(intervalColor(0));
  });

  it('keeps both when the bass climbs onto a key the hand is using', () => {
    // The case the band exists for: a fill can only show one thing.
    const marks = chordMarks({ hand: [55, 59, 62], bass: 55, rootPc: 7 });
    expect(marks.get(55)).toEqual({ fill: intervalColor(0), bassBand: true });
  });

  it('draws nothing for a chord that has not been built', () => {
    expect(chordMarks(null).size).toBe(0);
  });
});

describe('the hand moves up an octave, note by note', () => {
  it('raises what fits and leaves what does not', () => {
    expect(raise([60, 64, 67], true)).toEqual([72, 76, 79].map(m => (m <= KEYBOARD_HIGH_MIDI ? m : m - 12)));
    // ALL THREE FIT NOW. The board ran to 72 until 10 Sep 2026 and 76
    // and 79 were off the top of it; four octaves reach 84, so a middle
    // C major triad lifts whole. The per-note rule is unchanged and the
    // top of the board is still where it stops — see below.
    expect(raise([60, 64, 67], true)).toEqual([72, 76, 79]);
    expect(raise([76, 79, 84], true)).toEqual([76, 79, 84]);
    expect(raise([60, 64, 67], false)).toEqual([60, 64, 67]);
  });
});

describe('a scale lights across the whole board', () => {
  it('lights every octave of every note in it', () => {
    const marks = scaleMarks([0, 4, 7], 0, 'plain');
    // Four octaves and a closing C: five Cs, four Es, four Gs.
    expect([...marks.keys()].filter(m => m % 12 === 0)).toHaveLength(5);
    expect([...marks.keys()].filter(m => m % 12 === 4)).toHaveLength(4);
    expect([...marks.keys()].filter(m => m % 12 === 7)).toHaveLength(4);
  });

  it('is plain or by interval, and the root is green in both', () => {
    const plain = scaleMarks([0, 4, 7], 0, 'plain');
    const interval = scaleMarks([0, 4, 7], 0, 'interval');
    expect(plain.get(64)).toEqual({ plain: true });
    expect(interval.get(64)).toEqual({ fill: intervalColor(4) });
    expect(plain.get(60)!.fill).toBe(intervalColor(0));
    expect(interval.get(60)!.fill).toBe(intervalColor(0));
  });

  it('stays on the board', () => {
    for (const midi of scaleMarks([0, 2, 4, 5, 7, 9, 11], 0, 'interval').keys()) {
      expect(midi).toBeGreaterThanOrEqual(KEYBOARD_LOW_MIDI);
      expect(midi).toBeLessThanOrEqual(KEYBOARD_HIGH_MIDI);
    }
  });
});

describe('taps before anything is judged', () => {
  it('lights every octave of what was tapped, in blue', () => {
    const marks = tapMarks([3, 7]);
    expect(marks.get(51)).toEqual({ pressed: true });
    expect(marks.get(63)).toEqual({ pressed: true });
    expect(marks.has(60)).toBe(false);
  });

  it('makes the claimed root green and the rest blue', () => {
    // The lick card's first tap is the claim it is making.
    const marks = tapMarks([5, 8, 10], { rootPc: 5 });
    expect(marks.get(53)!.fill).toBe(intervalColor(0));
    expect(marks.get(56)).toEqual({ pressed: true });
  });

  it('lights exactly the key a finger landed on, where the octave is the answer', () => {
    expect([...singleMark(53).keys()]).toEqual([53]);
    expect(singleMark(null).size).toBe(0);
    // Off the board draws nothing rather than throwing.
    expect(singleMark(200).size).toBe(0);
  });
});
