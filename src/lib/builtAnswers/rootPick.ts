/**
 * A root as the picker holds it: a letter and an accidental.
 *
 * KEPT AS THE TWO PARTS rather than as a pitch class, so E♯ and F are
 * different picks. The deck asks in the key of F♯ major and the key of
 * G♭ major, where the 7 is E♯ and the 4 is C♭, and a picker that could
 * only express pitch classes could not show a reader what they built.
 */
import { spellNote, type Spelling } from '../spelling';

export interface RootPick {
  letter: string;
  /** -1 flat, 0 natural, 1 sharp. */
  acc: -1 | 0 | 1;
}

const LETTER_PC: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

export const ACC_GLYPH: Readonly<Record<number, string>> =
  { '-1': '♭', 0: '', 1: '♯' };

/** The letters, in the order the prototype's row shows them. */
export const PICKER_LETTERS: ReadonlyArray<string> =
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export function rootPitchClass(p: RootPick): number {
  return (((LETTER_PC[p.letter] + p.acc) % 12) + 12) % 12;
}

export function rootLabel(p: RootPick | null): string {
  return p === null ? '' : `${p.letter}${ACC_GLYPH[p.acc]}`;
}

/**
 * The pick a keyboard tap makes, spelled the way a key would spell it.
 *
 * `spellNote` HANDS BACK A GLYPH, not ASCII — `lib/spelling` holds its
 * twelve names with ♭ and ♯ in them. Reading the accidental as 'b'
 * silently turned every flat into a sharp, which looked like a
 * spelling preference rather than a bug.
 */
export function pickFromPitchClass(pc: number, spelling: Spelling): RootPick {
  const name = spellNote(pc, spelling);
  const accidental = name.slice(1);
  return {
    letter: name[0],
    acc: accidental === '' ? 0 : accidental === '♭' ? -1 : 1,
  };
}

/** One inversion the row can offer. */
export interface InversionOption { id: number; label: string }

export const INVERSIONS: ReadonlyArray<InversionOption> = [
  { id: 0, label: 'Root position' },
  { id: 1, label: '1st inversion' },
  { id: 2, label: '2nd inversion' },
  { id: 3, label: '3rd inversion' },
];
