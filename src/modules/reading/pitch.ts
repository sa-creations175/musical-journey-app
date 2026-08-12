/**
 * Diatonic pitch for notation. Reading's own layer, deliberately not
 * built on the app's existing pitch helpers.
 *
 * WHY NOT REUSE chordFunction.ts / voicingColors.ts. Those are
 * PITCH-CLASS tools — twelve chromatic slots, `NOTE_NAMES_FLAT` and
 * `NOTE_NAMES_SHARP` as parallel spellings of the same slot. That is
 * the right model for a keyboard, where C-sharp and D-flat are one
 * key. It is the wrong model for a STAFF, where they are different
 * glyphs on different lines, and where B-double-flat is a real thing
 * a diminished seventh needs. Collapsing spelling into pitch class is
 * exactly how enharmonic bugs get into notation, so this module keeps
 * letter, accidental, and octave as separate facts and never rounds
 * them through a semitone number.
 *
 * The unit throughout is the DIATONIC INDEX: C0 = 0, each letter step
 * = 1, each octave = 7. Staff position is diatonic by nature — one
 * line to the next space is one letter — so the two line up directly
 * and no chromatic arithmetic is involved in placing a note.
 */

import type { Clef } from './catalog';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

/** Written accidental. `null` is "no accidental drawn", which is not
 *  the same as natural — a natural sign is an explicit cancellation
 *  and gets its own value. */
export type Accidental = 'bb' | 'b' | 'n' | '#' | '##' | null;

export interface Pitch {
  letter: Letter;
  octave: number;
  accidental: Accidental;
}

/** Diatonic index: C0 = 0, D0 = 1, … B0 = 6, C1 = 7. */
export function diatonicIndex(letter: Letter, octave: number): number {
  return octave * 7 + LETTERS.indexOf(letter);
}

export function fromDiatonicIndex(index: number): { letter: Letter; octave: number } {
  const letter = LETTERS[((index % 7) + 7) % 7];
  return { letter, octave: Math.floor(index / 7) };
}

/**
 * Diatonic index of staff position 0 (the bottom line) per clef.
 *
 * Derived from the clef definitions rather than hardcoded as "E4" and
 * "G2": the treble G-clef curls around line 2, which IS G4, and the
 * bass F-clef dots straddle line 4, which IS F3. Position 2 and
 * position 6 are those lines. Writing the anchors this way means the
 * constant states the reason it holds.
 */
const CLEF_ANCHOR: Readonly<Record<Clef, number>> = {
  // treble: position 2 is the G4 line
  treble: diatonicIndex('G', 4) - 2,
  // bass: position 6 is the F3 line
  bass: diatonicIndex('F', 3) - 6,
};

/**
 * The pitch at a staff position, with no accidental.
 *
 * Position 0 is the bottom line; even positions are lines, odd are
 * spaces; negative positions run below the staff. This is a pure
 * diatonic walk from the clef anchor — no key signature is consulted,
 * which is correct for note-recognition items: they carry no
 * signature, because the answer ignores it.
 */
export function pitchAtStaffPosition(clef: Clef, position: number): Pitch {
  const { letter, octave } = fromDiatonicIndex(CLEF_ANCHOR[clef] + position);
  return { letter, octave, accidental: null };
}

/** True when the position sits on a line rather than in a space. */
export function isLinePosition(position: number): boolean {
  return ((position % 2) + 2) % 2 === 0;
}

/**
 * How many ledger lines a position needs, and on which side. The staff
 * itself is positions 0–8; anything outside needs them.
 *
 * Returned for captions and tests rather than for drawing — VexFlow
 * draws its own ledger lines. Having the number computed here is what
 * lets a test assert that `note:treble:12` really is two ledger lines
 * above the staff rather than trusting the render.
 */
export function ledgerLinesFor(position: number): {
  count: number;
  side: 'above' | 'below' | null;
} {
  if (position > 8) return { count: Math.floor((position - 8) / 2), side: 'above' };
  if (position < 0) return { count: Math.floor((0 - position + 1) / 2), side: 'below' };
  return { count: 0, side: null };
}

// ---------------------------------------------------------------------
// Spelling
// ---------------------------------------------------------------------

/** Semitone offset of each natural letter above C. */
const LETTER_SEMITONES: Readonly<Record<Letter, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const ACCIDENTAL_SEMITONES: Readonly<Record<Exclude<Accidental, null>, number>> = {
  bb: -2, b: -1, n: 0, '#': 1, '##': 2,
};

/** Absolute semitone value, C0 = 0. Used to CHECK a spelling, never to
 *  produce one — going the other way is what loses the distinction
 *  between C-sharp and D-flat. */
export function semitoneValue(p: Pitch): number {
  const acc = p.accidental === null ? 0 : ACCIDENTAL_SEMITONES[p.accidental];
  return p.octave * 12 + LETTER_SEMITONES[p.letter] + acc;
}

/**
 * Spell a pitch a given number of DIATONIC steps and SEMITONES above a
 * root — the operation chord rendering actually needs.
 *
 * Both numbers are required, and that is the point. A major third and
 * a diminished fourth are both 4 semitones, and they are different
 * notes on the staff; only the diatonic step tells them apart. Give it
 * the letter distance and the semitone distance and the accidental
 * falls out as the difference.
 *
 * Returns null when the required accidental exceeds a double — no
 * triple-sharps, which nothing in this catalog needs and which no
 * chart would print.
 */
export function spellInterval(
  root: Pitch,
  diatonicSteps: number,
  semitones: number,
): Pitch | null {
  const target = fromDiatonicIndex(
    diatonicIndex(root.letter, root.octave) + diatonicSteps,
  );
  const naturalSemitone =
    target.octave * 12 + LETTER_SEMITONES[target.letter];
  const wanted = semitoneValue(root) + semitones;
  const delta = wanted - naturalSemitone;

  const accidental = (Object.keys(ACCIDENTAL_SEMITONES) as Array<
    Exclude<Accidental, null>
  >).find(a => ACCIDENTAL_SEMITONES[a] === delta);

  if (delta === 0) return { ...target, accidental: null };
  if (!accidental) return null;
  return { ...target, accidental };
}

/**
 * How many LETTER steps a chord tone sits above the root.
 *
 * Derived from the tone's position in the stack, not from its
 * semitone count, because semitones are ambiguous: 9 semitones is a
 * major sixth (5 letter-steps) OR a diminished seventh (6), and a
 * diminished-seventh chord needs the second reading — C dim7 is
 * C-Eb-Gb-Bbb, a B, not an A. Keying off the stack removes the
 * ambiguity entirely: tertian chords stack in thirds, so the nth tone
 * is always 2n letter-steps up whatever its quality does to the
 * accidental.
 *
 * The open shapes are not tertian — they are literal voicings — so
 * they map their (unambiguous) intervals directly.
 */
const OPEN_SHAPE_STEPS: Readonly<Record<number, number>> = {
  0: 0,    // root
  7: 4,    // perfect fifth
  10: 6,   // minor seventh
  12: 7,   // octave
  16: 9,   // major tenth
};

export function diatonicStepsForChordTone(
  family: 'triad' | 'seventh' | 'open',
  indexInStack: number,
  semitones: number,
): number | null {
  if (family === 'open') return OPEN_SHAPE_STEPS[semitones] ?? null;
  // Tertian: root, third, fifth, seventh -> 0, 2, 4, 6.
  return indexInStack * 2;
}

/** VexFlow key string, e.g. `c/4`, `eb/4`, `bbb/3` (B-double-flat). */
export function toVexKey(p: Pitch): string {
  const acc = p.accidental === null || p.accidental === 'n' ? '' : p.accidental;
  return `${p.letter.toLowerCase()}${acc}/${p.octave}`;
}

/** Human spelling, e.g. `Eb`, `F#`, `Bbb`. Octave is not included —
 *  callers that want scientific pitch append it themselves. */
export function pitchName(p: Pitch): string {
  const acc = p.accidental === null || p.accidental === 'n' ? '' : p.accidental;
  return `${p.letter}${acc}`;
}

/** Scientific pitch, e.g. `C4`. */
export function scientificPitch(p: Pitch): string {
  return `${pitchName(p)}${p.octave}`;
}
