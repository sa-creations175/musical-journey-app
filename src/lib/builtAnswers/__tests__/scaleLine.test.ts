/**
 * Where a scale turns.
 *
 * The prototype states the rule in words and it is the one thing about
 * this that could be silently wrong: a pentatonic that ran to its
 * octave would be a six-note run and would stop being the hand shape
 * Shapes & Patterns drills.
 */
import { describe, expect, it } from 'vitest';
import { scaleLine } from '../scaleLine';

/** C major pentatonic and C major. */
const PENT = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

describe('a line climbs, whatever the pitch classes do', () => {
  it('keeps going up when the scale wraps below its start', () => {
    // F major pentatonic from F: F G A C D. C and D are pitch classes
    // BELOW F's, and they still sound above it.
    const line = scaleLine([5, 7, 9, 0, 2], 5, 'up', { toOctave: false });
    for (let i = 1; i < line.length; i += 1) {
      expect(line[i]).toBeGreaterThan(line[i - 1]);
    }
    expect(line[0] % 12).toBe(5);
  });

  it('starts where it is told, not at the root', () => {
    const fromFifth = scaleLine(PENT, 7, 'up', { toOctave: false });
    expect(fromFifth[0] % 12).toBe(7);
    expect(fromFifth[fromFifth.length - 1] % 12).toBe(7);
  });
});

describe('where it turns', () => {
  it('turns a pentatonic at its top note, not at the octave', () => {
    const both = scaleLine(PENT, 0, 'both', { toOctave: false });
    // Five up, four back: C D E G A G E D C.
    expect(both.map(m => m % 12)).toEqual([0, 2, 4, 7, 9, 7, 4, 2, 0]);
    expect(both).toHaveLength(9);
  });

  it('turns a seven-note scale at the octave', () => {
    const both = scaleLine(MAJOR, 0, 'both', { toOctave: true });
    expect(both).toHaveLength(15);
    expect(both[7] - both[0]).toBe(12);
    expect(both[both.length - 1]).toBe(both[0]);
  });

  it('lands on the note it started from, either way', () => {
    for (const [pcs, toOctave] of [[PENT, false], [MAJOR, true]] as const) {
      const both = scaleLine(pcs, pcs[0], 'both', { toOctave });
      expect(both[both.length - 1]).toBe(both[0]);
    }
  });

  it('runs the full octave when only one direction is asked for', () => {
    // A one-direction run has nowhere to land otherwise.
    expect(scaleLine(PENT, 0, 'up', { toOctave: false })).toHaveLength(6);
    expect(scaleLine(PENT, 0, 'down', { toOctave: false })).toHaveLength(6);
    const down = scaleLine(PENT, 0, 'down', { toOctave: false });
    expect(down[0] - down[down.length - 1]).toBe(12);
  });

  it('draws nothing for no scale, rather than throwing', () => {
    expect(scaleLine([], 0, 'both', { toOctave: false })).toEqual([]);
  });
});
