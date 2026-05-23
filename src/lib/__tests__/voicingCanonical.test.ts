import { describe, it, expect } from 'vitest';
import { sanitizeVoicing, voicingKeyPosition } from '../voicingColors';
import type { VoicingEntry } from '../db';
import { buildSystemVoicingPatterns } from '../../modules/shapes-and-patterns/seedVoicingPatterns';

describe('sanitizeVoicing', () => {
  it('normalizes legacy numbers, drops exact dupes, sorts ascending', () => {
    expect(sanitizeVoicing([7, 0, 4, 7])).toEqual([
      { offset: 0, hand: 'R' },
      { offset: 4, hand: 'R' },
      { offset: 7, hand: 'R' },
    ]);
  });

  it('keeps same offset with different hands (not an exact dupe)', () => {
    const v: VoicingEntry[] = [
      { offset: 12, hand: 'R' },
      { offset: 12, hand: 'L' },
    ];
    expect(sanitizeVoicing(v)).toHaveLength(2);
  });

  it('is idempotent', () => {
    const messy: Array<number | VoicingEntry> = [
      { offset: 16, hand: 'R' },
      { offset: 4, hand: 'L' },
      { offset: 16, hand: 'R' },
      12,
    ];
    const once = sanitizeVoicing(messy);
    expect(sanitizeVoicing(once)).toEqual(once);
  });

  it('handles undefined / empty', () => {
    expect(sanitizeVoicing(undefined)).toEqual([]);
    expect(sanitizeVoicing([])).toEqual([]);
  });
});

describe('legacy→absolute flip preserves pitch classes (O1)', () => {
  // Pitch class a non-negative offset resolves to, computed the way each
  // render mode does. They must agree for every existing (≥0) offset, which
  // is why flipping the editor to absoluteOffsets needs no data rewrite.
  const pcAbsolute = (offset: number, root: number) => ((root + offset) % 12 + 12) % 12;
  const pcLegacy = (offset: number, root: number) =>
    ((root + (offset % 12)) % 12 + 12) % 12;

  const sampleLegacyVoicings = [
    [0, 4, 7, 11], // maj7 root
    [0, 5, 7],     // sus4 (a 4th above root)
    [0, 3, 7, 10], // m7
    [3, 7, 10],    // rootless-ish
    [12, 16, 19],  // shifted up an octave
  ];

  it('every system pattern: absolute pc set == legacy pc set, all roots', () => {
    for (const p of buildSystemVoicingPatterns()) {
      for (let root = 0; root < 12; root++) {
        const abs = new Set(p.offsets.map(e => pcAbsolute(e.offset, root)));
        const leg = new Set(p.offsets.map(e => pcLegacy(e.offset, root)));
        expect(abs).toEqual(leg);
      }
    }
  });

  it('sample legacy voicings: absolute pc set == legacy pc set, all roots', () => {
    for (const v of sampleLegacyVoicings) {
      for (let root = 0; root < 12; root++) {
        const abs = new Set(v.map(o => pcAbsolute(o, root)));
        const leg = new Set(v.map(o => pcLegacy(o, root)));
        expect(abs).toEqual(leg);
      }
    }
  });
});

describe('absolute editable toggle round-trips through voicingKeyPosition', () => {
  it('a tapped key maps to an offset that renders back to the same key', () => {
    for (let root = 0; root < 12; root++) {
      for (let oct = 0; oct < 4; oct++) {
        for (let pc = 0; pc < 12; pc++) {
          const offset = oct * 12 + pc - root; // the absolute-mode toggle
          const { pc: rpc, octave } = voicingKeyPosition(offset, root);
          expect(rpc).toBe(pc);
          expect(octave).toBe(oct);
        }
      }
    }
  });
});
