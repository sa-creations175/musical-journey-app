/**
 * A sharp degree with no name folds to the flat twin that has one.
 *
 * =====================================================================
 * THE HOLE THIS CLOSES WAS SILENT, WHICH IS WHY IT LASTED.
 *
 * `#5dim` parsed cleanly, stored cleanly and drew on the grid. Then
 * `SEMI_BY_DEGREE` — the one table that turns a degree into a distance
 * above the tonic — had no row for `#5`, so `chordRootNote` returned
 * an empty string: no root, no voicing, no sound, and nothing on screen
 * to say why. `#1`, `#2` and `#6` sat in the same hole.
 *
 * Ruling 22 folds them at ENTRY rather than widening the table, because
 * the reader's spelling setting decides how a degree SHOWS anyway.
 *
 * `#4` FOLDS TOO, AND THE REASON IS THE OPPOSITE ONE (ruling 31,
 * reversing the exception this file used to pin).
 *
 * The other four fold because the app has NO name for the sharp side.
 * The tritone folds because it has TWO names for one degree, and which
 * of the two a reader sees is a spelling decision the app already has
 * a setting for. Storing both would be storing a display decision —
 * which is the same argument, arriving at the same place, from the
 * other end.
 *
 * So this file pins both halves: the fold at entry, and `spellDegree`
 * giving the ♯4 back on the way to the eye.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  parseChordFunction, renderNumbers, renderRoman, spellDegree,
  SEMI_BY_DEGREE, SHARP_DEGREE_FOLD,
} from '../chordFunction';
import { chordRootNote } from '../voicingHelpers';

const fn = (text: string) => parseChordFunction(text)!.function;

describe('the four with no name of their own', () => {
  it('stores each as its flat twin', () => {
    expect(fn('#1')).toBe('b2');
    expect(fn('#2')).toBe('b3');
    expect(fn('#5')).toBe('b6');
    expect(fn('#6')).toBe('b7');
  });

  it('and never gives the sharp name back, because there is none', () => {
    // The guard on `spellDegree`. A reader on sharps sees ♭6, not ♯5:
    // nothing in this vocabulary calls a chord a ♯5, and printing one
    // to honour a preference would invent a name.
    for (const flat of ['b2', 'b3', 'b6', 'b7']) {
      expect(spellDegree(flat, 'sharp'), flat).toBe(flat);
    }
  });

  it('keeps the quality that came with it', () => {
    const parsed = parseChordFunction('#5dim')!;
    expect(parsed.function).toBe('b6');
    expect(parsed.quality).toBe('dim');
  });

  it('folds a slash bass too', () => {
    // The bass is a degree like any other and resolves through the same
    // table — an unfoldable one would give a slash chord no bass note.
    const parsed = parseChordFunction('2/#5')!;
    expect(parsed.bass).toBe('b6');
  });

  it('leaves `raw` exactly as it was typed', () => {
    // The record of what was written. Rewriting it would lose the only
    // evidence that a fold happened at all.
    const parsed = parseChordFunction('#5dim')!;
    expect(parsed.raw === undefined || parsed.raw === '#5dim').toBe(true);
  });
});

describe('the tritone, which has two names and one storage', () => {
  it('stores ♯4 as ♭5, like every other typed sharp', () => {
    // Ruling 31. THIS FILE USED TO PIN THE OPPOSITE and the reversal is
    // the point: ♯4 and ♭5 are one degree with two names, so which one
    // is stored is not a musical fact, it is a display decision — and
    // the app already has a setting that makes display decisions.
    expect(fn('#4')).toBe('b5');
    expect(fn('#4dim')).toBe('b5');
    expect(SHARP_DEGREE_FOLD['#4']).toBe('b5');
  });

  it('folds a ♯4 bass too', () => {
    expect(parseChordFunction('1/#4')!.bass).toBe('b5');
  });

  it('gives the ♯4 back when the reader is on sharps', () => {
    expect(spellDegree('b5', 'sharp')).toBe('#4');
    expect(spellDegree('b5', 'flat')).toBe('b5');
  });

  it('and gives it back on the page, in both notations', () => {
    // The end of it, stated as what a reader sees. One stored degree,
    // two spellings, and the setting alone deciding.
    const dim = parseChordFunction('#4dim')!;
    expect(renderNumbers(dim, 'sharp')).toBe('#4dim');
    expect(renderNumbers(dim, 'flat')).toBe('b5dim');
    // The numeral's CASE is the quality's business, not the
    // spelling's — a diminished chord is lowercase either way.
    expect(renderRoman(dim, 'sharp')).toBe('#ivdim');
    expect(renderRoman(dim, 'flat')).toBe('bvdim');
    const plain = parseChordFunction('#4')!;
    expect(renderRoman(plain, 'sharp')).toBe('#IV');
    expect(renderRoman(plain, 'flat')).toBe('bV');
  });

  it('spells a slash bass by the same setting', () => {
    const chord = parseChordFunction('1/#4')!;
    expect(renderNumbers(chord, 'sharp')).toBe('1/#4');
    expect(renderNumbers(chord, 'flat')).toBe('1/b5');
  });
});

describe('what it does NOT touch', () => {
  it('leaves every flat degree alone', () => {
    for (const d of ['b2', 'b3', 'b5', 'b6', 'b7']) {
      expect(fn(d), d).toBe(d);
    }
    // Including the one the tritone folds ONTO: `b5` is the storage,
    // so it cannot itself be rewritten by anything here.
  });

  it('leaves the plain degrees alone', () => {
    for (const d of ['1', '2', '3', '4', '5', '6', '7']) {
      expect(fn(d), d).toBe(d);
    }
  });
});

describe('why these four and not others', () => {
  it('folds exactly the degrees the app cannot resolve', () => {
    // DERIVED, NOT LISTED TWICE. The fold table and the resolution
    // table are two halves of one fact: a degree that survives parsing
    // must have a distance above the tonic, or it cannot be voiced or
    // played. This asserts the two agree rather than trusting them to.
    for (const flat of Object.values(SHARP_DEGREE_FOLD)) {
      expect(SEMI_BY_DEGREE[flat], flat).toBeTypeOf('number');
    }
    // THE OTHER HALF USED TO SAY "everything folded is unresolvable",
    // and ruling 31 broke that: `#4` resolves perfectly well and folds
    // anyway, because its reason is a spelling one rather than a
    // missing-name one. `SEMI_BY_DEGREE` keeps its `#4` row so a chord
    // stored before the fold can still find its root.
    expect(SEMI_BY_DEGREE['#4']).toBe(SEMI_BY_DEGREE['b5']);
    for (const sharp of ['#1', '#2', '#5', '#6']) {
      expect(SEMI_BY_DEGREE[sharp], sharp).toBeUndefined();
    }
  });

  it('so every parsed chord can now find its root', () => {
    // The end of the failure, stated as the thing a reader would
    // notice: `#5dim` in C used to have no root at all.
    for (const text of ['#1', '#2', '#5dim', '#6m7', '#4', 'b6dim', '1']) {
      const parsed = parseChordFunction(text)!;
      expect(chordRootNote('C', parsed.function), text).not.toBe('');
    }
  });
});
