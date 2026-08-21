/**
 * Tests for the enharmonic spelling seam.
 *
 * The load-bearing one is "the three S&P grids agree" at the bottom.
 * Everything above it is the unit behaviour that test depends on.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SPELLING,
  FLAT_SIGN,
  NOTE_NAMES_FLAT,
  NOTE_NAMES_FLAT_ASCII,
  NOTE_NAMES_SHARP,
  NOTE_NAMES_SHARP_ASCII,
  SHARP_SIGN,
  pitchClassOf,
  spellKey,
  spellKeys,
  spellNote,
  toAsciiAccidentals,
  type Spelling,
} from '../spelling';

// The two grid vocabularies that disagreed before this module existed.
// Imported from where the grids actually read them, NOT restated here —
// a copy of the arrays would keep passing after the real ones drifted.
import { KEYS_CIRCLE_OF_FOURTHS } from '../../modules/shapes-and-patterns/catalog';
import { CIRCLE_OF_FOURTHS } from '../../modules/repertoire/circleOfFourths';

/** [flat-display, sharp-display, flat-ascii, sharp-ascii] */
const BLACK_KEY_PAIRS: ReadonlyArray<[string, string, string, string]> = [
  [`D${FLAT_SIGN}`, `C${SHARP_SIGN}`, 'Db', 'C#'],
  [`E${FLAT_SIGN}`, `D${SHARP_SIGN}`, 'Eb', 'D#'],
  [`G${FLAT_SIGN}`, `F${SHARP_SIGN}`, 'Gb', 'F#'],
  [`A${FLAT_SIGN}`, `G${SHARP_SIGN}`, 'Ab', 'G#'],
  [`B${FLAT_SIGN}`, `A${SHARP_SIGN}`, 'Bb', 'A#'],
];
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

describe('the default', () => {
  it('is flats — the spelling the user reads charts in', () => {
    expect(DEFAULT_SPELLING).toBe('flat');
  });
});

describe('spellKey — the five black-key pairs', () => {
  it('names each pair by the requested side, from ASCII or symbol input', () => {
    for (const [flat, sharp, flatAscii, sharpAscii] of BLACK_KEY_PAIRS) {
      // All four spellings of the same pitch are accepted as input and
      // land on the same two outputs. The ASCII pair is what storage
      // holds; the symbol pair is what a screen has already shown.
      for (const input of [flat, sharp, flatAscii, sharpAscii]) {
        expect(spellKey(input, 'flat'), `${input} → flat`).toBe(flat);
        expect(spellKey(input, 'sharp'), `${input} → sharp`).toBe(sharp);
      }
    }
  });

  it('emits real accidental signs, never the ASCII letter b or hash', () => {
    // `b` is a letter, so `text-transform: uppercase` rendered Bb as BB.
    // ♭ and ♯ have no uppercase form and survive any case transform.
    for (const [flat, sharp] of BLACK_KEY_PAIRS) {
      expect(flat).toContain(FLAT_SIGN);
      expect(sharp).toContain(SHARP_SIGN);
      expect(flat).not.toContain('b');
      expect(sharp).not.toContain('#');
      expect(flat.toUpperCase(), 'a flat must survive uppercasing').toBe(flat);
      expect(sharp.toUpperCase(), 'a sharp must survive uppercasing').toBe(sharp);
    }
  });

  it('leaves the seven naturals alone in both spellings', () => {
    for (const n of NATURALS) {
      expect(spellKey(n, 'flat'), n).toBe(n);
      expect(spellKey(n, 'sharp'), n).toBe(n);
    }
  });

  it('is idempotent — re-spelling an already-spelled name is a no-op', () => {
    // Load-bearing now that output ≠ input alphabet: a name that has
    // been through the display path must still resolve if it goes
    // through again, or a value that round-trips the UI degrades.
    const everyName = [
      ...NATURALS,
      ...BLACK_KEY_PAIRS.flat(),
    ];
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      for (const name of everyName) {
        const once = spellKey(name, spelling);
        expect(spellKey(once, spelling), `${name} re-spelled`).toBe(once);
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

  it('accepts the symbol forms of them too', () => {
    expect(pitchClassOf(`C${FLAT_SIGN}`)).toBe(11);
    expect(pitchClassOf(`B${SHARP_SIGN}`)).toBe(0);
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

  it('now reads from ONE vocabulary — step 2 retired the second', () => {
    // This assertion is the inverse of the one it replaces.
    //
    // In step 1 the guard read `.not.toEqual(...)`: the two arrays
    // genuinely differed, and the guard existed so the agreement test
    // above could not pass vacuously by someone quietly making them
    // identical. Step 2 made them identical ON PURPOSE — Gb stopped
    // being an identity — so the guard fired, correctly, and this is
    // what it becomes.
    //
    // The agreement test above is no longer load-bearing for the grids
    // (one source cannot disagree with itself); it now guards the
    // display function against re-introducing a split.
    expect([...KEYS_CIRCLE_OF_FOURTHS]).toEqual([...CIRCLE_OF_FOURTHS]);
  });

  it('holds no Gb anywhere in the identity vocabulary', () => {
    // The actual step-2 claim. Gb is a spelling now; if it reappears in
    // either array it is an identity again, and scale itemRefs go back
    // to addressing rows nothing else in the app can find.
    for (const k of [...KEYS_CIRCLE_OF_FOURTHS, ...CIRCLE_OF_FOURTHS]) {
      expect(k, `${k} is a display spelling, not an identity`).not.toBe('Gb');
    }
    expect([...CIRCLE_OF_FOURTHS]).toContain('F#');
  });

  it('shows the user flats by default, so F# never reaches a column', () => {
    const labels = spellKeys(KEYS_CIRCLE_OF_FOURTHS, DEFAULT_SPELLING);
    expect(labels).toContain(`G${FLAT_SIGN}`);
    for (const sharpName of [...NOTE_NAMES_SHARP, ...NOTE_NAMES_SHARP_ASCII]) {
      if (!/[#\u266F]/.test(sharpName)) continue;
      expect(labels, `${sharpName} leaked into a default-spelling label`)
        .not.toContain(sharpName);
    }
  });

  it('puts no ASCII accidental on any column, in either spelling', () => {
    // The uppercase transform is gone from those headers, but this is
    // the property that made it safe to remove rather than a promise
    // that it stays gone.
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      for (const label of spellKeys(KEYS_CIRCLE_OF_FOURTHS, spelling)) {
        expect(label, `${label} carries an ASCII accidental`).not.toMatch(/[b#]/);
        expect(label.toUpperCase(), `${label} changes under uppercase`).toBe(label);
      }
    }
  });
});

/**
 * THE IDENTITY SIDE OF THE RULE.
 *
 * The header promises that storage keeps ASCII and only screens get
 * symbols. These assert the promise rather than trusting the reviewer
 * to have kept it — a symbol reaching an itemRef or an index key is
 * silent data loss, not a rendering glitch.
 */
describe('identity strings stay ASCII', () => {
  it('keeps both ASCII tables free of accidental symbols', () => {
    for (const name of [...NOTE_NAMES_FLAT_ASCII, ...NOTE_NAMES_SHARP_ASCII]) {
      expect(name, name).not.toMatch(/[\u266D\u266E\u266F]/);
    }
  });

  it('pairs each display name with its ASCII counterpart, slot for slot', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(toAsciiAccidentals(NOTE_NAMES_FLAT[pc])).toBe(NOTE_NAMES_FLAT_ASCII[pc]);
      expect(toAsciiAccidentals(NOTE_NAMES_SHARP[pc])).toBe(NOTE_NAMES_SHARP_ASCII[pc]);
    }
  });

  it('leaves the identity vocabularies the grids are keyed on untouched', () => {
    // These are the arrays that build itemRefs and index lookups. If a
    // symbol ever appears here, spacing history stops resolving.
    for (const k of [...KEYS_CIRCLE_OF_FOURTHS, ...CIRCLE_OF_FOURTHS]) {
      expect(k, `${k} is an identity and must stay ASCII`)
        .not.toMatch(/[\u266D\u266E\u266F]/);
    }
  });
});
