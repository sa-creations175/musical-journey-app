import {
  LETTERS, spellInterval, type Accidental, type Letter, type Pitch,
} from '../reading/pitch';
import { CIRCLE_OF_FOURTHS_KEYS } from '../repertoire/matrix/keys';
import { QUADRANT_SIZE } from '../repertoire/matrix/keyProgress';

/**
 * The maj7♯11 chord, spelled by INTERVAL rather than by preference.
 *
 * =====================================================================
 * WHY NOT `lib/spelling.ts`, WHICH IS THE APP'S SPELLING SEAM.
 *
 * Because this is not a spelling question in that module's sense. It
 * says so itself: its scope is "the five black-key pairs, and nothing
 * else", and the four theoretical spellings — C♭, F♭, B♯, E♯ — are
 * "ACCEPTED AS INPUT and NEVER EMITTED". That is correct for what it
 * does. It flips between two names for one pitch class, and a binary
 * flat/sharp toggle genuinely cannot reach E♯: the flat spelling of B
 * is B, not C♭.
 *
 * E♯ IS NOT A SECOND NAME FOR A BLACK KEY. It is a different LETTER
 * sitting on F's slot, and which letter is right is decided by the
 * chord, not by the reader. B maj7♯11 is B D♯ F♯ A♯ E♯ — five letters,
 * B D F A E, each used once. Render that ♯11 as F and the chord has
 * two F-letters and no E, which is a different chord that happens to
 * sound the same.
 *
 * A maj7♯11 is the case that catches a pitch-class implementation:
 * A C♯ E G♯ **D♯**. The app defaults to flats, and E♭ over an A root
 * reads as a ♭5 — a lowered fifth, not a raised fourth. Same key on the
 * piano, different chord on the page.
 *
 * So this borrows `reading/pitch.ts`, which keeps letter, accidental
 * and octave as separate facts and "never rounds them through a
 * semitone number". Its `spellInterval` takes the DIATONIC step count
 * alongside the semitone count precisely so a major third and a
 * diminished fourth stay distinguishable. That is the knowledge the
 * ♯11 needs, and it already exists — building a second diatonic
 * speller here would be two statements of one rule.
 * =====================================================================
 */

/**
 * maj7♯11, as (letter steps, semitones) from the root.
 *
 * Five notes, five consecutive letters starting at the root's — each
 * used exactly once. The ♯11 is the root's FOURTH letter, raised, which
 * is why it carries 3 diatonic steps and 6 semitones rather than being
 * derived from the tritone's pitch class.
 *
 * Listed in sounding order (root, 3, 5, 7, ♯11) rather than stacked
 * thirds, because that is how the rows read it out and how the chord is
 * played. The ♯11 sits last, which is also what makes "the last note is
 * the ♯11" true for the active row's marking.
 */
const MAJ7_SHARP11: ReadonlyArray<{ steps: number; semitones: number }> = [
  { steps: 0, semitones: 0 },   // root
  { steps: 2, semitones: 4 },   // major 3rd
  { steps: 4, semitones: 7 },   // perfect 5th
  { steps: 6, semitones: 11 },  // major 7th
  { steps: 3, semitones: 6 },   // ♯11 — the root's 4th letter, raised
];

/** The four theoretical accidentals, which get a common name beside
 *  them. Nothing else does — D♯, C♯, G♭ and the rest read plain. */
const NEEDS_COMMON_NAME: Readonly<Record<string, string>> = {
  'E#': 'F', 'B#': 'C', 'Cb': 'B', 'Fb': 'E',
};

/** ASCII accidental → the glyph the rest of the app renders. */
const GLYPH: Readonly<Record<string, string>> = { '#': '♯', b: '♭' };

/**
 * Parse a root name into a `Pitch`.
 *
 * Octave 4 is arbitrary and cancels out — every interval here is taken
 * relative to the root, and only the letter and accidental are read
 * back. It has to be SOME octave because `spellInterval` works in
 * absolute diatonic indices.
 */
export function parseRoot(name: string): Pitch | null {
  const letter = name[0]?.toUpperCase() as Letter | undefined;
  if (!letter || !LETTERS.includes(letter)) return null;
  const rest = name.slice(1);
  const accidental: Accidental =
    rest === '' ? null
      : rest === '#' || rest === '♯' ? '#'
        : rest === 'b' || rest === '♭' ? 'b'
          : null;
  if (rest !== '' && accidental === null) return null;
  return { letter, accidental, octave: 4 };
}

/**
 * How one note of the chord is written.
 *
 * `common` is present ONLY for the four theoretical accidentals, and is
 * the note's everyday name. It is a reading aid beside a correct
 * spelling, never a replacement for it — E♯ is what the chord contains;
 * F is where your hand goes.
 */
export interface ChordNote {
  /** With the real glyph — "D♯", "B♭", "E♯", "C". */
  label: string;
  /** "F" for E♯, "B" for C♭. Absent otherwise. */
  common?: string;
}

/** The five notes of `root` maj7♯11, in sounding order. The last is the
 *  ♯11 — the note the active row marks. */
export function maj7Sharp11(rootName: string): ChordNote[] | null {
  const root = parseRoot(rootName);
  if (root === null) return null;
  const out: ChordNote[] = [];
  for (const { steps, semitones } of MAJ7_SHARP11) {
    const p = spellInterval(root, steps, semitones);
    // Null means the interval needed more than a double accidental.
    // No maj7♯11 on any of the twelve roots does, so this cannot fire
    // today — but returning null beats rendering a chord with a hole
    // in it if a caller ever passes something exotic.
    if (p === null) return null;
    out.push(noteOf(p));
  }
  return out;
}

function noteOf(p: Pitch): ChordNote {
  const ascii = `${p.letter}${p.accidental ?? ''}`;
  const label = p.accidental === null
    ? p.letter
    : `${p.letter}${GLYPH[p.accidental] ?? p.accidental}`;
  const common = NEEDS_COMMON_NAME[ascii];
  return common === undefined ? { label } : { label, common };
}

/**
 * The twelve roots, in four rows of three.
 *
 * ORDER AND MEMBERSHIP COME FROM `CIRCLE_OF_FOURTHS_KEYS`, the app's
 * one circle, sliced by `QUADRANT_SIZE` — the same quadrants the
 * repertoire ladder uses. Writing the twelve out again here is how the
 * app ended up with two circles that disagreed about F♯ versus G♭ once
 * already.
 *
 * ONE SUBSTITUTION, AND IT CHANGES THE CHORD RATHER THAN THE LABEL.
 * The circle's identity for the sixth key is F♯. F♯ maj7♯11 spells
 * F♯ A♯ C♯ E♯ B♯ — two theoretical accidentals in one chord. The same
 * five keys read as G♭ B♭ D♭ F C, which is how the chord is written
 * wherever it is actually played. So this row uses G♭ as the ROOT, not
 * as a re-spelling of a root that stays F♯: pass F♯ to `maj7Sharp11`
 * and you get the other chord, correctly.
 */
const ROOT_FOR_CHORD: Readonly<Record<string, string>> = { 'F#': 'Gb' };

export const QUADRANT_ROOTS: ReadonlyArray<ReadonlyArray<string>> =
  Array.from(
    { length: CIRCLE_OF_FOURTHS_KEYS.length / QUADRANT_SIZE },
    (_, q) => CIRCLE_OF_FOURTHS_KEYS
      .slice(q * QUADRANT_SIZE, (q + 1) * QUADRANT_SIZE)
      .map(k => ROOT_FOR_CHORD[k] ?? k),
  );

/** Root name with the app's glyph, for a chip or a chord symbol. */
export function rootLabel(rootName: string): string {
  const p = parseRoot(rootName);
  if (p === null) return rootName;
  return p.accidental === null
    ? p.letter
    : `${p.letter}${GLYPH[p.accidental] ?? p.accidental}`;
}

/**
 * Which row each root sits in, so a card can open with one selected
 * without the caller counting rows.
 *
 * Returns null for a root that is not one of the twelve — the caller
 * then falls back to the first of each quadrant rather than opening on
 * nothing.
 */
export function rowOfRoot(rootName: string): number | null {
  for (const [i, row] of QUADRANT_ROOTS.entries()) {
    if (row.includes(rootName)) return i;
  }
  return null;
}

/**
 * The four roots a card opens with.
 *
 * `openWith` names the ONE root the card is about; its row opens on it
 * and every other row opens on its own first key. That is the whole
 * parameter — mo-15 passes nothing and gets C / E♭ / G♭ / A, mo-3
 * passes F and gets F / E♭ / G♭ / A.
 */
export function initialSelection(openWith?: string): string[] {
  const firsts = QUADRANT_ROOTS.map(row => row[0]);
  if (openWith === undefined) return firsts;
  const row = rowOfRoot(openWith);
  if (row === null) return firsts;
  const out = [...firsts];
  out[row] = openWith;
  return out;
}
