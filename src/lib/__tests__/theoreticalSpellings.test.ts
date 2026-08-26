/**
 * The gloss is a function of the SPELLING, never of the role.
 *
 * That is the whole safety argument for putting it on answer options,
 * so it is what these assert: the four get it wherever they appear,
 * nothing else ever gets it, and a longer name that merely starts with
 * one of them is not one of them.
 */
import { describe, expect, it } from 'vitest';
import {
  PRACTICAL_NAME,
  glossTheoreticalSpellings,
  practicalNameOf,
} from '../theoreticalSpellings';

describe('the four spellings', () => {
  it('are exactly the notes a single accidental lands on a white key', () => {
    // Derived rather than compared to a second copy of the list: walk
    // the seven letters and both single accidentals, and keep the ones
    // whose semitone lands on a natural.
    const SEMITONE: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
    };
    const naturals = new Set(Object.values(SEMITONE));
    const found: string[] = [];
    for (const [letter, pc] of Object.entries(SEMITONE)) {
      for (const [acc, step] of [['#', 1], ['b', -1]] as const) {
        if (naturals.has(((pc + step) % 12 + 12) % 12)) found.push(`${letter}${acc}`);
      }
    }
    expect(found.sort()).toEqual(Object.keys(PRACTICAL_NAME).sort());
  });

  it('name the white key they land on', () => {
    expect(practicalNameOf('Fb')).toBe('E');
    expect(practicalNameOf('Cb')).toBe('B');
    expect(practicalNameOf('E#')).toBe('F');
    expect(practicalNameOf('B#')).toBe('C');
  });

  it('are the only notes with a practical name', () => {
    for (const n of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
      expect(practicalNameOf(n), n).toBeUndefined();
    }
  });
});

describe('the gloss', () => {
  it('brackets the white key, in glyphs and in ASCII', () => {
    expect(glossTheoreticalSpellings('F♭')).toBe('F♭(E)');
    expect(glossTheoreticalSpellings('C♭')).toBe('C♭(B)');
    expect(glossTheoreticalSpellings('E♯')).toBe('E♯(F)');
    expect(glossTheoreticalSpellings('B♯')).toBe('B♯(C)');
    expect(glossTheoreticalSpellings('Fb')).toBe('Fb(E)');
    expect(glossTheoreticalSpellings('B#')).toBe('B#(C)');
  });

  it('finds the note inside a longer label', () => {
    expect(glossTheoreticalSpellings('B♭m/C♭')).toBe('B♭m/C♭(B)');
    expect(glossTheoreticalSpellings('E♭m/F♭')).toBe('E♭m/F♭(E)');
  });

  it('leaves every ordinary name alone', () => {
    for (const n of ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B',
                     'Bb', 'Ab', 'C#', 'B♭m/A♭', 'B♭m/F', 'A♭ Lydian']) {
      expect(glossTheoreticalSpellings(n), n).toBe(n);
    }
  });

  it('does not fire on a name that only STARTS with one of the four', () => {
    // C♭♭ is a double flat, E♯11 is an extension, and Cbb is the ASCII
    // of the first. None of them is the note this glosses.
    expect(glossTheoreticalSpellings('C♭♭')).toBe('C♭♭');
    expect(glossTheoreticalSpellings('Cbb')).toBe('Cbb');
    expect(glossTheoreticalSpellings('E♯11')).toBe('E♯11');
    expect(glossTheoreticalSpellings('B♭m')).toBe('B♭m');
  });

  it('is idempotent — a glossed label glosses to itself', () => {
    // The reveal shows the same string a button already showed, so a
    // second pass must not produce "C♭(B)(B)".
    const once = glossTheoreticalSpellings('B♭m/C♭');
    expect(glossTheoreticalSpellings(once)).toBe(once);
  });
});
