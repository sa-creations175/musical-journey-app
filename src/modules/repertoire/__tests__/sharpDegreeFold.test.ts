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
 * `#4` IS NOT FOLDED, and that is the assertion that keeps this from
 * becoming a rule about accidentals. It and `b5` are the same pitch and
 * two different degrees, and the app names both.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  parseChordFunction, SEMI_BY_DEGREE, SHARP_DEGREE_FOLD,
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

describe('what it does NOT touch', () => {
  it('leaves ♯4 alone, because the app names it', () => {
    // ♯4 and ♭5 are the same pitch and two different degrees — the ♯4
    // rises out of a major context, the ♭5 falls inside a minor one.
    // Folding it would erase a distinction the whole degree-note family
    // exists to teach.
    expect(fn('#4')).toBe('#4');
    expect(fn('#4dim')).toBe('#4');
    expect(SHARP_DEGREE_FOLD['#4']).toBeUndefined();
  });

  it('leaves every flat degree alone', () => {
    for (const d of ['b2', 'b3', 'b5', 'b6', 'b7']) {
      expect(fn(d), d).toBe(d);
    }
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
    for (const sharp of Object.keys(SHARP_DEGREE_FOLD)) {
      expect(SEMI_BY_DEGREE[sharp], sharp).toBeUndefined();
    }
    for (const flat of Object.values(SHARP_DEGREE_FOLD)) {
      expect(SEMI_BY_DEGREE[flat], flat).toBeTypeOf('number');
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
