/**
 * The chord-recognition reveal names its root in the reader's spelling.
 *
 * THIS ONE WAS WRONG BEFORE ANY SETTING EXISTED. Unlike every other
 * surface in the spelling work, this was not a threading job: the quiz
 * carried a single sharp-only note table and no flat table at all, so
 * it rendered "D# minor 7" and "A# major" unconditionally — on every
 * black-key root, for every user, regardless of preference. Six of the
 * twelve roots it can pick were named in an alphabet the rest of the
 * app does not use.
 */
import { describe, it, expect } from 'vitest';
import { chordIdentityText, rootNoteName } from '../chordIdentity';
import { FLAT_SIGN, SHARP_SIGN, type Spelling } from '../../../../lib/spelling';

// C3 = 48, the base of the quiz's C3..B3 root range.
const C3 = 48;
const BLACK_KEYS: ReadonlyArray<[semitone: number, flat: string, sharp: string]> = [
  [1,  `D${FLAT_SIGN}`, `C${SHARP_SIGN}`],
  [3,  `E${FLAT_SIGN}`, `D${SHARP_SIGN}`],
  [6,  `G${FLAT_SIGN}`, `F${SHARP_SIGN}`],
  [8,  `A${FLAT_SIGN}`, `G${SHARP_SIGN}`],
  [10, `B${FLAT_SIGN}`, `A${SHARP_SIGN}`],
];
const NATURALS = [0, 2, 4, 5, 7, 9, 11];

describe('rootNoteName', () => {
  it('names every black-key root in the requested spelling', () => {
    for (const [semi, flat, sharp] of BLACK_KEYS) {
      expect(rootNoteName(C3 + semi, 'flat'), `semitone ${semi}`).toBe(flat);
      expect(rootNoteName(C3 + semi, 'sharp'), `semitone ${semi}`).toBe(sharp);
    }
  });

  it('names the naturals identically either way', () => {
    for (const semi of NATURALS) {
      const flat = rootNoteName(C3 + semi, 'flat');
      expect(rootNoteName(C3 + semi, 'sharp'), `semitone ${semi}`).toBe(flat);
    }
  });

  it('emits no ASCII accidental in either spelling', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      for (let semi = 0; semi < 12; semi++) {
        expect(rootNoteName(C3 + semi, spelling), `semitone ${semi}`)
          .not.toMatch(/[b#]/);
      }
    }
  });

  it('works across octaves — the root range is C3..B3 but the maths is mod 12', () => {
    expect(rootNoteName(48 + 3, 'flat')).toBe(`E${FLAT_SIGN}`);
    expect(rootNoteName(60 + 3, 'flat')).toBe(`E${FLAT_SIGN}`);
    expect(rootNoteName(36 + 3, 'flat')).toBe(`E${FLAT_SIGN}`);
  });
});

describe('chordIdentityText', () => {
  it('spells the root under flats — the defect this step fixes', () => {
    // D#3 is what the quiz used to print here, on a screen whose every
    // other key name reads with flats.
    expect(chordIdentityText({
      rootMidi: C3 + 3,
      chordName: 'minor 7',
      inversionLabel: null,
      spelling: 'flat',
    })).toBe(`E${FLAT_SIGN} minor 7`);
  });

  it('spells the root under sharps', () => {
    expect(chordIdentityText({
      rootMidi: C3 + 3,
      chordName: 'minor 7',
      inversionLabel: null,
      spelling: 'sharp',
    })).toBe(`D${SHARP_SIGN} minor 7`);
  });

  it('keeps the inversion suffix attached', () => {
    // The reason this was a derived string rather than JSX in the first
    // place: the suffix must not get lost.
    expect(chordIdentityText({
      rootMidi: C3 + 10,
      chordName: 'major',
      inversionLabel: '1st inversion',
      spelling: 'flat',
    })).toBe(`B${FLAT_SIGN} major, 1st inversion`);
  });

  it('omits the suffix entirely when there is no inversion label', () => {
    const out = chordIdentityText({
      rootMidi: C3,
      chordName: 'major',
      inversionLabel: null,
      spelling: 'flat',
    });
    expect(out).toBe('C major');
    expect(out).not.toContain(',');
  });
});
