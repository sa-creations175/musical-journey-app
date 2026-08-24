/**
 * The scale written out in an explanation is spelled by LETTER.
 *
 * ---------------------------------------------------------------
 * ONE KEY IN TWELVE IS THE WHOLE TEST.
 *
 * Eleven of the twelve major keys spell identically whether you reach
 * them through letters or through a twelve-slot pitch table, so a test
 * that only checked C, G or B♭ would stay green against either
 * implementation. F♯ major is the one that separates them: its seventh
 * is E♯, a letter the pitch table cannot name at all — the flat
 * spelling of F is F, so no sharp/flat preference reaches it.
 *
 * So this pins F♯ explicitly and asserts the other eleven are
 * UNCHANGED, which is what makes the fix scoped rather than a
 * re-spelling of the whole category.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, degreeNote, scaleDegreeSpelled } from '../catalog';

const fSharpCard = () =>
  FLASHCARDS.find(c => c.question === 'In F# major, 4 of the scale = ?')!;

describe('F♯ major has a seventh, and it is E♯', () => {
  it('writes the seventh as E# (F) in the explanation', () => {
    expect(scaleDegreeSpelled('F#', 7)).toBe('E# (F)');
  });

  it('spells the whole scale with seven different letters', () => {
    const letters = [1, 2, 3, 4, 5, 6, 7]
      .map(d => scaleDegreeSpelled('F#', d)[0]);
    expect(new Set(letters).size).toBe(7);
  });

  it('reaches the card the reader actually sees', () => {
    const card = fSharpCard();
    expect(card.explanation ?? '').toContain('F# G# A# B C# D# E# (F)');
  });

  it('leaves no bare F in that scale — the F-letter is taken', () => {
    // A bare " F " or a trailing " F" in the list is the old output.
    const card = fSharpCard();
    const scale = (card.explanation ?? '').split(' — ')[0];
    expect(scale.split(' ')).not.toContain('F');
  });
});

describe('the other eleven keys are untouched', () => {
  const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab', 'Db'];
  for (const key of KEYS) {
    it(`${key} major spells the same by letter as by pitch`, () => {
      for (let d = 1; d <= 7; d++) {
        expect(scaleDegreeSpelled(key, d)).toBe(degreeNote(key, d));
      }
    });
  }
});

describe('the gloss appears only where it is earned', () => {
  it('gives ordinary accidentals no parenthetical', () => {
    expect(scaleDegreeSpelled('F#', 2)).toBe('G#');
    expect(scaleDegreeSpelled('Db', 4)).toBe('Gb');
    expect(scaleDegreeSpelled('C', 1)).toBe('C');
  });
});
