import { describe, it, expect } from 'vitest';
import {
  EXTENDED_DOM_VOICINGS,
  chordShapeOffsets,
  extendedDomOffsets,
  rootPcOf,
} from '../mentalVizVoicing';

describe('chordShapeOffsets (triads / sevenths)', () => {
  it('root position = the interval stack', () => {
    expect(chordShapeOffsets('maj', 0)).toEqual([0, 4, 7]);
    expect(chordShapeOffsets('maj7', 0)).toEqual([0, 4, 7, 11]);
  });

  it('inversions rotate the bass up, bumping rotated-out tones an octave', () => {
    // C major 1st inv: E G C(+8ve) → 4, 7, 12.
    expect(chordShapeOffsets('maj', 1)).toEqual([4, 7, 12]);
    // 2nd inv: G C(+8ve) E(+8ve) → 7, 12, 16.
    expect(chordShapeOffsets('maj', 2)).toEqual([7, 12, 16]);
    // maj7 3rd inv: 7th in the bass → 11, 12, 16, 19.
    expect(chordShapeOffsets('maj7', 3)).toEqual([11, 12, 16, 19]);
  });

  it('offsets stay strictly ascending (renders bottom-to-top)', () => {
    for (const q of ['min', 'dim', 'aug', 'sus2', 'sus4', 'min7', 'dom7', 'm7b5', 'dim7', 'mmaj7']) {
      for (let inv = 0; inv < 4; inv++) {
        const offs = chordShapeOffsets(q, inv);
        for (let i = 1; i < offs.length; i++) {
          expect(offs[i]).toBeGreaterThan(offs[i - 1]);
        }
      }
    }
  });
});

describe('extendedDomOffsets', () => {
  it('has 8 voicings (dom9(13) A/B, dom7#9#5 A/B, dom7b9 ×4)', () => {
    expect(EXTENDED_DOM_VOICINGS).toHaveLength(8);
  });

  it('LH bass in octave 1, RH stacked ascending in octave 2+', () => {
    const a = EXTENDED_DOM_VOICINGS.find(v => v.id === 'dom9-13-a')!;
    const offs = extendedDomOffsets(a);
    // 1 LH + 4 RH = 5 tones.
    expect(offs).toHaveLength(5);
    const lh = offs.filter(o => o.hand === 'L');
    const rh = offs.filter(o => o.hand === 'R');
    expect(lh).toEqual([{ offset: 0, hand: 'L' }]); // root bass
    // RH all in octave 2+ and strictly ascending.
    expect(rh.every(o => o.offset >= 12)).toBe(true);
    for (let i = 1; i < rh.length; i++) {
      expect(rh[i].offset).toBeGreaterThan(rh[i - 1].offset);
    }
  });

  it('all voicings produce a strictly ascending stack within 0–35', () => {
    for (const v of EXTENDED_DOM_VOICINGS) {
      const offs = extendedDomOffsets(v).map(o => o.offset);
      for (let i = 1; i < offs.length; i++) {
        expect(offs[i]).toBeGreaterThan(offs[i - 1]);
      }
      expect(offs[offs.length - 1]).toBeLessThanOrEqual(35);
    }
  });
});

describe('rootPcOf', () => {
  it('maps keys (sharp + flat spellings) to pitch class', () => {
    expect(rootPcOf('C')).toBe(0);
    expect(rootPcOf('F#')).toBe(6);
    expect(rootPcOf('Gb')).toBe(6);
    expect(rootPcOf('Bb')).toBe(10);
  });
});
