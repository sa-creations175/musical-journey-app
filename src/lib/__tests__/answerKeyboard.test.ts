/**
 * The answer keyboard's geometry, hit-testing and mode decision.
 *
 * Pure — no render. What is asserted is the mapping from a point to a
 * KEY, because that is the whole contract: the card judges, and it can
 * only judge what it is told was pressed.
 */
import { describe, expect, it } from 'vitest';
import {
  BH, BW, MIN_BLACK_KEY_PX, WH, WW, blackKeyPx, blackKeys, keyAt,
  octavesForWidth, spellingsOf, viewBoxWidth, whiteKeys,
} from '../answerKeyboard';

describe('a press maps to pitch class AND octave', () => {
  it('reads the lower octave', () => {
    // Middle of the first white key.
    expect(keyAt(WW / 2, WH - 5, 2)).toEqual({ pc: 0, octave: 0 });
  });

  it('reads the SAME pitch class in the upper octave as octave 1', () => {
    // THE TEST THAT PINNING PITCH CLASS ALONE WOULD PASS WITHOUT.
    // A component that lost track of which octave was tapped returns
    // pc 0 for both of these, and a pc-only assertion stays green
    // while the card can no longer tell an ascending answer from a
    // descending one.
    const upperC = 7 * WW + WW / 2;
    expect(keyAt(upperC, WH - 5, 2)).toEqual({ pc: 0, octave: 1 });
    expect(keyAt(WW / 2, WH - 5, 2)).toEqual({ pc: 0, octave: 0 });
  });

  it('distinguishes every white key of both octaves', () => {
    const seen = whiteKeys(2).map(k =>
      keyAt(k.x + WW / 2, WH - 5, 2));
    // Fourteen distinct (pc, octave) pairs — not seven seen twice.
    expect(new Set(seen.map(k => `${k!.pc}:${k!.octave}`)).size).toBe(14);
  });

  it('distinguishes every black key of both octaves', () => {
    const seen = blackKeys(2).map(k => keyAt(k.x + BW / 2, 5, 2));
    expect(new Set(seen.map(k => `${k!.pc}:${k!.octave}`)).size).toBe(10);
  });

  it('returns null outside the board', () => {
    expect(keyAt(-1, 10, 2)).toBeNull();
    expect(keyAt(viewBoxWidth(2) + 1, 10, 2)).toBeNull();
    expect(keyAt(10, WH + 1, 2)).toBeNull();
  });
});

describe('black over white, where they overlap', () => {
  // C♯ sits over the boundary between C and D. Its centre is at
  // exactly one white-key width.
  const cSharpCentre = WW;

  it('registers the BLACK key in the overlap region', () => {
    // Same x, high up: the black key is drawn there and wins.
    expect(keyAt(cSharpCentre, 10, 2)).toEqual({ pc: 1, octave: 0 });
  });

  it('registers the WHITE key below the black key’s foot', () => {
    // Same x, below BH: the black key has ended and D is underneath.
    expect(keyAt(cSharpCentre, BH + 5, 2)).toEqual({ pc: 2, octave: 0 });
  });

  it('puts the boundary exactly at the black key’s height', () => {
    expect(keyAt(cSharpCentre, BH, 2)!.pc).toBe(1);
    expect(keyAt(cSharpCentre, BH + 0.5, 2)!.pc).toBe(2);
  });

  it('registers white keys in the gaps where no black key sits', () => {
    // Between E and F there is no black key, so the top of that
    // boundary belongs to a white key at any height.
    const eFBoundary = 3 * WW;
    expect(keyAt(eFBoundary - 1, 5, 2)).toEqual({ pc: 4, octave: 0 });
    expect(keyAt(eFBoundary + 1, 5, 2)).toEqual({ pc: 5, octave: 0 });
  });
});

describe('the octave-count decision reads the constant', () => {
  it('takes two octaves only when black keys clear MIN_BLACK_KEY_PX', () => {
    // THE TEST A CONSTANT-ONLY CHECK WOULD PASS WITHOUT. Asserting
    // MIN_BLACK_KEY_PX === 28 says nothing about whether the layout
    // consults it. These pin the DECISION at the boundary the constant
    // defines, so a hardcoded device breakpoint fails here.
    const twoOctaveFloor = viewBoxWidth(2) * (MIN_BLACK_KEY_PX / BW);
    expect(octavesForWidth(twoOctaveFloor)).toBe(2);
    expect(octavesForWidth(twoOctaveFloor - 1)).toBe(1);
  });

  it('moves with the constant rather than with a device width', () => {
    // At the exact width where a two-octave black key equals the
    // constant, the answer is two. One pixel less and it is one. That
    // relationship is what a breakpoint cannot reproduce.
    expect(blackKeyPx(viewBoxWidth(2) * (MIN_BLACK_KEY_PX / BW), 2))
      .toBeCloseTo(MIN_BLACK_KEY_PX, 6);
  });

  it('drops to one octave at phone width', () => {
    // 390px: two octaves gives ~16px black keys, one gives ~32px.
    expect(blackKeyPx(390, 2)).toBeLessThan(MIN_BLACK_KEY_PX);
    expect(blackKeyPx(390, 1)).toBeGreaterThan(MIN_BLACK_KEY_PX);
    expect(octavesForWidth(390)).toBe(1);
  });

  it('takes two octaves on a wide viewport', () => {
    expect(octavesForWidth(800)).toBe(2);
  });

  it('treats an unmeasured width as the narrow case', () => {
    // ResizeObserver has not fired yet. One octave is the safe first
    // paint: it is usable at every width, and two is not.
    expect(octavesForWidth(0)).toBe(1);
  });
});

describe('the same physical key means the same thing in both modes', () => {
  it('emits one pitch class for a given board position, whatever the mode', () => {
    // Asserted on the EMITTED value, not on what is drawn. The board
    // narrows to one octave; the identity of a key does not change.
    for (const k of whiteKeys(1)) {
      const one = keyAt(k.x + WW / 2, WH - 5, 1);
      const two = keyAt(k.x + WW / 2, WH - 5, 2);
      expect(one!.pc).toBe(two!.pc);
      expect(one!.octave).toBe(0);
    }
  });

  it('keeps black keys aligned to the same white-key boundaries', () => {
    const oneOct = blackKeys(1).map(k => k.x);
    const twoOctFirst = blackKeys(2).filter(k => k.octave === 0).map(k => k.x);
    expect(oneOct).toEqual(twoOctFirst);
  });
});

describe('the board is C to B, and closes cleanly', () => {
  it('starts on C and ends on B in both modes', () => {
    expect(whiteKeys(1)[0].pc).toBe(0);
    expect(whiteKeys(1).at(-1)!.pc).toBe(11);
    expect(whiteKeys(2).at(-1)!.pc).toBe(11);
  });

  it('leaves no black key hanging off either edge', () => {
    // A window starting on A would end on G♯, which sits between G and
    // the next A — off screen, drawn as half a key at the edge.
    for (const octaves of [1, 2]) {
      for (const k of blackKeys(octaves)) {
        expect(k.x).toBeGreaterThan(0);
        expect(k.x + BW).toBeLessThan(viewBoxWidth(octaves));
      }
    }
  });

  it('renders 7 white and 5 black per octave', () => {
    expect(whiteKeys(2)).toHaveLength(14);
    expect(blackKeys(2)).toHaveLength(10);
  });
});

describe('both names for a key', () => {
  it('gives two for every black key', () => {
    expect(spellingsOf(6)).toEqual(['F♯', 'G♭']);
    expect(spellingsOf(3)).toEqual(['D♯', 'E♭']);
    for (const pc of [1, 3, 6, 8, 10]) expect(spellingsOf(pc)).toHaveLength(2);
  });

  it('gives one for a natural, rather than repeating it', () => {
    expect(spellingsOf(0)).toEqual(['C']);
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) expect(spellingsOf(pc)).toHaveLength(1);
  });
});
