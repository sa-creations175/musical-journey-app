// @vitest-environment jsdom
/**
 * Keyboard-diagram geometry.
 *
 * Asserts the MAPPING — which key index a pitch lands on — not the
 * rendered SVG. The diagram's whole job is to say "D5 is here", and a
 * mapping that is off by one octave looks completely plausible on
 * screen while teaching the wrong thing. Rendered-class assertions
 * would catch none of that.
 */
import { describe, expect, it } from 'vitest';
import {
  WHITE_KEY_COUNT,
  blackKeySpans,
  bracketEndpointsX,
  cLandmarks,
  keyCentreX,
  whiteIndexOf,
  whiteKeyX,
} from '../KeyboardDiagram';
import { pitchAtStaffPosition } from '../../modules/reading/pitch';

describe('the instrument is a real 88', () => {
  it('has 52 white keys, A0 first and C8 last', () => {
    expect(WHITE_KEY_COUNT).toBe(52);
    expect(whiteIndexOf('A', 0)).toBe(0);
    expect(whiteIndexOf('C', 8)).toBe(51);
  });

  it('has exactly 8 Cs, C1 through C8', () => {
    // C0 is below the instrument — an 88 starts at A0.
    const cs = cLandmarks();
    expect(cs.map(c => c.octave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('refuses pitches off the ends instead of clamping them', () => {
    // A clamped key would draw a confident highlight in the wrong
    // place, which is worse than drawing none.
    expect(whiteIndexOf('C', 0)).toBeNull();
    expect(whiteIndexOf('G', 0)).toBeNull();
    expect(whiteIndexOf('D', 8)).toBeNull();
    expect(keyCentreX({ letter: 'C', octave: 0 })).toBeNull();
  });
});

describe('landmark positions', () => {
  it('MIDDLE C IS C4, and sits near the middle of the keyboard', () => {
    // The fact the diagram exists to teach. C4 is white key 23 of 52.
    expect(whiteIndexOf('C', 4)).toBe(23);
    const middle = whiteIndexOf('C', 4)!;
    expect(middle / WHITE_KEY_COUNT).toBeGreaterThan(0.4);
    expect(middle / WHITE_KEY_COUNT).toBeLessThan(0.5);
  });

  it('consecutive Cs are seven white keys apart', () => {
    const cs = cLandmarks();
    for (let i = 1; i < cs.length; i++) {
      expect(cs[i].index - cs[i - 1].index, `C${cs[i].octave}`).toBe(7);
    }
  });

  it('white keys advance left to right without gaps', () => {
    for (let i = 1; i < WHITE_KEY_COUNT; i++) {
      expect(whiteKeyX(i)).toBeGreaterThan(whiteKeyX(i - 1));
    }
  });
});

describe('the staff-range bracket spans what the staff actually covers', () => {
  it('treble is E4 to F5, bass is G2 to A3 — derived from the staff', () => {
    // Position 0 is the bottom line, 8 the top. If these two ever
    // disagreed with the clef anchors, the bracket would be lying
    // about the notation it sits under.
    const trebleLow = pitchAtStaffPosition('treble', 0);
    const trebleHigh = pitchAtStaffPosition('treble', 8);
    expect([trebleLow.letter, trebleLow.octave]).toEqual(['E', 4]);
    expect([trebleHigh.letter, trebleHigh.octave]).toEqual(['F', 5]);

    const bassLow = pitchAtStaffPosition('bass', 0);
    const bassHigh = pitchAtStaffPosition('bass', 8);
    expect([bassLow.letter, bassLow.octave]).toEqual(['G', 2]);
    expect([bassHigh.letter, bassHigh.octave]).toEqual(['A', 3]);
  });

  it('each staff covers only a small slice of the instrument', () => {
    // The perspective the full 88 exists to give. Five lines and four
    // spaces is nine staff positions, so nine white keys — E4 to F5,
    // and G2 to A3. Nine of fifty-two: each staff is under a fifth of
    // the instrument, and the two together still leave most of it
    // unnamed by either.
    for (const clef of ['treble', 'bass'] as const) {
      const low = pitchAtStaffPosition(clef, 0);
      const high = pitchAtStaffPosition(clef, 8);
      const span = whiteIndexOf(high.letter, high.octave)!
        - whiteIndexOf(low.letter, low.octave)! + 1;
      expect(span, clef).toBe(9);
      expect(span / WHITE_KEY_COUNT, clef).toBeLessThan(0.2);
    }
  });

  it('the bass staff sits entirely below the treble staff', () => {
    expect(whiteIndexOf('A', 3)!).toBeLessThan(whiteIndexOf('E', 4)!);
  });
});

describe('BRACKET ENDPOINTS LAND ON THE RIGHT KEYS', () => {
  // The bug this exists for: drawn edge-to-edge, the endpoints sat at
  // white-key BOUNDARIES, and a black key straddles every boundary —
  // so the bass bracket appeared to name G-flat 2 and B-flat 3 rather
  // than G2 and A3. The range was right and the drawing was not, which
  // is the worst combination for a diagram nobody can check by eye.

  /** Index of the black key covering an x, or -1. */
  const blackKeyAt = (x: number) =>
    blackKeySpans().findIndex(s => x >= s.x1 && x <= s.x2);

  const endsFor = (clef: 'treble' | 'bass') => {
    const low = pitchAtStaffPosition(clef, 0);
    const high = pitchAtStaffPosition(clef, 8);
    return {
      low, high,
      ends: bracketEndpointsX(
        { letter: low.letter, octave: low.octave },
        { letter: high.letter, octave: high.octave },
      )!,
    };
  };

  it('no endpoint sits over a black key, for either clef', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const { ends } = endsFor(clef);
      expect(blackKeyAt(ends.x1), `${clef} low`).toBe(-1);
      expect(blackKeyAt(ends.x2), `${clef} high`).toBe(-1);
    }
  });

  it('each endpoint is inside the white key it NAMES', () => {
    // Stronger than "not on a black key": it must be on the right
    // white key, not merely on some white key.
    for (const clef of ['treble', 'bass'] as const) {
      const { low, high, ends } = endsFor(clef);
      const lowIdx = whiteIndexOf(low.letter, low.octave)!;
      const highIdx = whiteIndexOf(high.letter, high.octave)!;
      expect(ends.x1).toBeGreaterThan(whiteKeyX(lowIdx));
      expect(ends.x1).toBeLessThan(whiteKeyX(lowIdx + 1));
      expect(ends.x2).toBeGreaterThan(whiteKeyX(highIdx));
      expect(ends.x2).toBeLessThan(whiteKeyX(highIdx + 1));
    }
  });

  it('the OLD edge-based endpoints really did fall on black keys', () => {
    // Pins the bug itself, so "simplifying" back to edges goes red
    // rather than silently reintroducing it.
    for (const clef of ['treble', 'bass'] as const) {
      const { low, high } = endsFor(clef);
      const lowEdge = whiteKeyX(whiteIndexOf(low.letter, low.octave)!);
      const highEdge = whiteKeyX(whiteIndexOf(high.letter, high.octave)! + 1);
      expect(blackKeyAt(lowEdge), `${clef} low edge`).not.toBe(-1);
      expect(blackKeyAt(highEdge), `${clef} high edge`).not.toBe(-1);
    }
  });

  it('EVERY white key centre is clear of every black key', () => {
    // The general property the fix rests on, checked across all 52
    // rather than trusting the arithmetic for the four in use.
    for (let i = 0; i < WHITE_KEY_COUNT; i++) {
      expect(blackKeyAt(whiteKeyX(i) + 11.5), `white ${i}`).toBe(-1);
    }
  });
});

describe('THE HIGHLIGHT MARKER SITS ON THE ANSWER KEY', () => {
  it('the marker is inside the key it names, for every drillable note', () => {
    // Same class of error as the bracket, and the one that would teach
    // a wrong note outright.
    for (const clef of ['treble', 'bass'] as const) {
      for (let position = -4; position <= 12; position++) {
        const p = pitchAtStaffPosition(clef, position);
        const idx = whiteIndexOf(p.letter, p.octave)!;
        const x = keyCentreX({ letter: p.letter, octave: p.octave })!;
        expect(x, `${clef}:${position}`).toBeGreaterThan(whiteKeyX(idx));
        expect(x, `${clef}:${position}`).toBeLessThan(whiteKeyX(idx + 1));
      }
    }
  });

  it('a marker never lands on the key next door', () => {
    // Off-by-one is the failure that looks entirely plausible.
    for (let i = 0; i < WHITE_KEY_COUNT; i++) {
      expect(Math.floor((whiteKeyX(i) + 11.5) / 23), `white ${i}`).toBe(i);
    }
  });
});

describe('every drillable note lands on a key', () => {
  it('the whole catalog range fits on the instrument', () => {
    // Two ledger lines either side of both staves. If any of it fell
    // off the ends, that card would answer with no key highlighted.
    for (const clef of ['treble', 'bass'] as const) {
      for (let position = -4; position <= 12; position++) {
        const p = pitchAtStaffPosition(clef, position);
        expect(whiteIndexOf(p.letter, p.octave), `${clef}:${position}`)
          .not.toBeNull();
      }
    }
  });

  it('note pitches are all naturals, so all land on white keys', () => {
    // Note cards render no accidentals by design; the diagram relies
    // on that to place them without black-key logic.
    for (const clef of ['treble', 'bass'] as const) {
      for (let position = -4; position <= 12; position++) {
        expect(pitchAtStaffPosition(clef, position).accidental).toBeNull();
      }
    }
  });
});

describe('accidentals place on the adjacent black key', () => {
  it('a sharp sits right of its natural, a flat left', () => {
    const c4 = keyCentreX({ letter: 'C', octave: 4 })!;
    const cSharp4 = keyCentreX({ letter: 'C', octave: 4, accidental: '#' })!;
    const dFlat4 = keyCentreX({ letter: 'D', octave: 4, accidental: 'b' })!;
    expect(cSharp4).toBeGreaterThan(c4);
    // C# and Db are the same key — the diagram cannot show a spelling,
    // only a position.
    expect(dFlat4).toBe(cSharp4);
  });
});
