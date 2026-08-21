/**
 * Tests for the enharmonic spelling seam.
 *
 * The load-bearing one is "the three S&P grids agree" at the bottom.
 * Everything above it is the unit behaviour that test depends on.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SPELLING,
  NOTE_NAMES_FLAT,
  NOTE_NAMES_SHARP,
  pitchClassOf,
  spellKey,
  spellKeys,
  spellNote,
  type Spelling,
} from '../spelling';

// The two grid vocabularies that disagreed before this module existed.
// Imported from where the grids actually read them, NOT restated here —
// a copy of the arrays would keep passing after the real ones drifted.
import { KEYS_CIRCLE_OF_FOURTHS } from '../../modules/shapes-and-patterns/catalog';
import { CIRCLE_OF_FOURTHS } from '../../modules/repertoire/circleOfFourths';

const BLACK_KEY_PAIRS: ReadonlyArray<[flat: string, sharp: string]> = [
  ['Db', 'C#'], ['Eb', 'D#'], ['Gb', 'F#'], ['Ab', 'G#'], ['Bb', 'A#'],
];
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

describe('the default', () => {
  it('is flats — the spelling the user reads charts in', () => {
    expect(DEFAULT_SPELLING).toBe('flat');
  });
});

describe('spellKey — the five black-key pairs', () => {
  it('names each pair by the requested side, from either input', () => {
    for (const [flat, sharp] of BLACK_KEY_PAIRS) {
      for (const input of [flat, sharp]) {
        expect(spellKey(input, 'flat'), `${input} → flat`).toBe(flat);
        expect(spellKey(input, 'sharp'), `${input} → sharp`).toBe(sharp);
      }
    }
  });

  it('leaves the seven naturals alone in both spellings', () => {
    for (const n of NATURALS) {
      expect(spellKey(n, 'flat'), n).toBe(n);
      expect(spellKey(n, 'sharp'), n).toBe(n);
    }
  });

  it('is idempotent — re-spelling an already-spelled name is a no-op', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      for (const [flat, sharp] of [...BLACK_KEY_PAIRS, ...NATURALS.map(n => [n, n] as [string, string])]) {
        const once = spellKey(flat, spelling);
        expect(spellKey(once, spelling)).toBe(once);
        expect(spellKey(spellKey(sharp, spelling), spelling)).toBe(spellKey(sharp, spelling));
      }
    }
  });
});

describe('theoretical spellings — accepted as input, never emitted', () => {
  const THEORETICAL: ReadonlyArray<[string, number]> =
    [['Cb', 11], ['Fb', 4], ['B#', 0], ['E#', 5]];

  it('resolves all four to a pitch class rather than failing', () => {
    for (const [name, pc] of THEORETICAL) {
      expect(pitchClassOf(name), name).toBe(pc);
    }
  });

  it('never returns one from spellKey, in either spelling', () => {
    const names = new Set([...NOTE_NAMES_FLAT, ...NOTE_NAMES_SHARP]);
    for (const [name] of THEORETICAL) {
      for (const spelling of ['flat', 'sharp'] as Spelling[]) {
        const out = spellKey(name, spelling);
        expect(names.has(out), `${name} → ${out}`).toBe(true);
      }
    }
  });

  it('keeps both output tables free of them', () => {
    for (const [name] of THEORETICAL) {
      expect(NOTE_NAMES_FLAT).not.toContain(name);
      expect(NOTE_NAMES_SHARP).not.toContain(name);
    }
  });
});

describe('unknown input', () => {
  it('passes through unchanged rather than being dropped or masked', () => {
    // `Song.key` is freeform and keyDiagnostics exists because
    // non-canonical values are in the data. Showing what is stored is
    // what makes that screen legible.
    for (const junk of ['Cm', 'D minor', 'H', '', 'Gbb']) {
      expect(spellKey(junk, 'flat'), junk).toBe(junk);
      expect(spellKey(junk, 'sharp'), junk).toBe(junk);
    }
  });

  it('reports null from pitchClassOf so callers can decline', () => {
    expect(pitchClassOf('H')).toBeNull();
    expect(pitchClassOf('Cm')).toBeNull();
  });
});

describe('spellNote', () => {
  it('names every pitch class from both tables', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(spellNote(pc, 'flat')).toBe(NOTE_NAMES_FLAT[pc]);
      expect(spellNote(pc, 'sharp')).toBe(NOTE_NAMES_SHARP[pc]);
    }
  });

  it('normalises out-of-range and negative input', () => {
    expect(spellNote(12, 'flat')).toBe('C');
    expect(spellNote(-1, 'flat')).toBe('B');
    expect(spellNote(-12, 'sharp')).toBe('C');
  });
});

/**
 * THE BUG THIS STEP FIXES.
 *
 * Three grids sit on one Shapes & Patterns screen — chord shapes and
 * voice leading read `KEYS_CIRCLE_OF_FOURTHS`, scales reads
 * `CIRCLE_OF_FOURTHS` — and the two arrays disagree about the name of
 * the sixth key. Scrolling from Chord Shapes to Scales renamed a
 * column.
 *
 * Asserted on the MECHANISM: the two vocabularies, put through the one
 * display function, produce the same labels in the same order. Not on
 * the string "Gb" appearing somewhere — that would still pass if only
 * one grid had been wired up.
 *
 * Reversal check: assert on the raw arrays instead of the spelled ones
 * and this goes red, because the raw arrays are exactly what differ.
 */
describe('the three S&P grids agree on every column label', () => {
  it('renders one label sequence from both key vocabularies', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      expect(
        spellKeys(KEYS_CIRCLE_OF_FOURTHS, spelling),
        `grids disagree under ${spelling}`,
      ).toEqual(spellKeys(CIRCLE_OF_FOURTHS, spelling));
    }
  });

  it('is a real reconciliation, not a vacuous one — the sources DO differ', () => {
    // Guards the test above: if someone made the two arrays identical,
    // the agreement assertion would pass for a reason unrelated to the
    // display function, and would no longer be testing it.
    expect([...KEYS_CIRCLE_OF_FOURTHS]).not.toEqual([...CIRCLE_OF_FOURTHS]);
  });

  it('shows the user flats by default, so F# never reaches a column', () => {
    const labels = spellKeys(KEYS_CIRCLE_OF_FOURTHS, DEFAULT_SPELLING);
    expect(labels).toContain('Gb');
    for (const sharpName of NOTE_NAMES_SHARP.filter(n => n.includes('#'))) {
      expect(labels, `${sharpName} leaked into a default-spelling label`)
        .not.toContain(sharpName);
    }
  });
});
