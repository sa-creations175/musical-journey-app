import { describe, it, expect } from 'vitest';
import { keyCenterX, keyboardViewBoxWidth } from '../PianoKeyboard';

// These back the interval-direction arrow overlay (ET intervals reveal):
// the arrow's x-positions must match the keyboard's own key geometry.

describe('keyboardViewBoxWidth', () => {
  it('is 7 white keys * 24px * octaves', () => {
    expect(keyboardViewBoxWidth(3)).toBe(504);
    expect(keyboardViewBoxWidth(4)).toBe(672);
    expect(keyboardViewBoxWidth()).toBe(504); // default 3
  });
});

describe('keyCenterX (absolute offset → key x-center)', () => {
  it('places the root, white, and black keys at the expected centers (rootPc 0)', () => {
    expect(keyCenterX(0, 0)).toBe(12); // C, white idx 0 → 0*24 + 12
    expect(keyCenterX(1, 0)).toBe(24); // C#, black after white 0 → 1*24
    expect(keyCenterX(7, 0)).toBe(108); // G, white idx 4 → 4*24 + 12
    expect(keyCenterX(12, 0)).toBe(180); // C one octave up → 7*24 + 12
  });

  it('increases monotonically with the interval (note moves right)', () => {
    let prev = -1;
    for (let semis = 0; semis <= 12; semis++) {
      const x = keyCenterX(semis, 0);
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('keeps the interval note right of the root for any root (ascending sits right)', () => {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      for (const semis of [1, 4, 7, 12]) {
        expect(keyCenterX(semis, rootPc)).toBeGreaterThan(keyCenterX(0, rootPc));
      }
    }
  });
});
