import { describe, it, expect } from 'vitest';
import { voicingKeyPosition } from '../voicingColors';
import { chordShapeOffsets } from '../../modules/shapes-and-patterns/mentalVizVoicing';

/**
 * Regression: the mental-viz keyboard placed voicing offsets via a mod-12
 * interval mapping anchored to C, so for non-C roots a tone whose pitch
 * class fell below the root (e.g. the 5th of F is C) wrapped to the LEFT
 * of the root — F Major root position rendered 5·R·3 instead of R·3·5.
 *
 * `voicingKeyPosition` treats the offset as true semitones above the root
 * (absolute), so ascending offsets always map to ascending absolute
 * semitones → left-to-right keys, for every root.
 */

// Root pitch classes for the regression cases the bug report named.
const C = 0;
const F = 5;
const BB = 10;
const DB = 1;

describe('voicingKeyPosition — absolute placement', () => {
  it('offset is true semitones above the root (pc + octave decomposition)', () => {
    // Root F (5), 5th = offset 7 → semitone 12 = C in the next octave.
    expect(voicingKeyPosition(7, F)).toEqual({ pc: 0, octave: 1, semitone: 12 });
    // Root C (0), 5th = offset 7 → G in the first octave.
    expect(voicingKeyPosition(7, C)).toEqual({ pc: 7, octave: 0, semitone: 7 });
  });

  it('C root is unchanged from the legacy mapping (offset == semitone)', () => {
    for (const off of [0, 4, 7, 11, 12, 16, 19, 23]) {
      const { semitone } = voicingKeyPosition(off, C);
      expect(semitone).toBe(off);
    }
  });

  // The reported failure: a root-position major triad must read R·3·5
  // ascending left-to-right for any root. With the shape based in octave 2
  // (chordShapeOffsets('maj', 0) = [12, 16, 19]) absolute placement keeps
  // the semitones strictly increasing.
  it.each([
    ['C', C],
    ['F', F],
    ['Bb', BB],
    ['Db', DB],
  ])('major triad root position renders ascending for %s', (_label, rootPc) => {
    const offsets = chordShapeOffsets('maj', 0); // [12, 16, 19]
    const semitones = offsets.map(o => voicingKeyPosition(o, rootPc).semitone);
    for (let i = 1; i < semitones.length; i++) {
      expect(semitones[i]).toBeGreaterThan(semitones[i - 1]);
    }
  });

  it('F major root position: 5th (C) lands ABOVE the root, not to its left', () => {
    const [root, third, fifth] = chordShapeOffsets('maj', 0).map(o =>
      voicingKeyPosition(o, F),
    );
    expect(root.pc).toBe(5); // F
    expect(third.pc).toBe(9); // A
    expect(fifth.pc).toBe(0); // C
    // The bug: C (pc 0) used to render in the SAME octave as F → left of
    // it. Absolute placement puts it a higher semitone than the root.
    expect(fifth.semitone).toBeGreaterThan(root.semitone);
    expect(fifth.octave).toBe(root.octave + 1);
  });

  it('Bb and Db root-position triads keep the 3rd and 5th above the root', () => {
    for (const rootPc of [BB, DB]) {
      const [root, third, fifth] = chordShapeOffsets('maj', 0).map(o =>
        voicingKeyPosition(o, rootPc),
      );
      expect(third.semitone).toBeGreaterThan(root.semitone);
      expect(fifth.semitone).toBeGreaterThan(third.semitone);
    }
  });
});
