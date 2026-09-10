/**
 * The degree chips a chord-motion answer is built from.
 *
 * =====================================================================
 * THE ANSWER IS A DEGREE, WHICH IS THE QUESTION THE CARD ASKS.
 *
 * Chord Motion asked its answer on a keyboard: tap the key the move
 * landed on. That is a fine way to answer and it is still offered — but
 * it makes the reader translate a degree they heard into a letter, in a
 * key the card named, before they can say what they heard. Silas's
 * ruling of 10 Sep 2026 puts degrees first and the board second.
 *
 * SEVEN CHIPS DIATONIC, TWELVE CHROMATIC, and the twelve are the same
 * seven with the five borrowed degrees between them — the motion pool's
 * own `DEGREE_TABLE`, so a chip cannot exist for a motion the pool
 * cannot produce.
 *
 * THE QUALITY SUFFIX IS THE APP'S OWN. "7°" or "7dim" is the
 * progression-spelling setting, read through `qualitySuffix`, so the
 * chips agree with every grid row and flashcard on the same screen.
 * =====================================================================
 */
import { qualitySuffix } from '../../../lib/progressionRow';
import type { ProgressionSpelling } from '../../../lib/progressionSpelling';
import { DEGREE_TABLE, type DegreeLabel } from './chordMotionPool';

/** The chord-shape quality a degree's chord takes, for the suffix. */
const SUFFIX_QUALITY: Readonly<Record<string, string>> = {
  major: 'maj7',
  minor: 'm7',
  dominant: '7',
  diminished: 'm7b5',
};

export interface DegreeChip {
  label: DegreeLabel;
  /** What the chip says: "1", "2m", "7°". */
  text: string;
  diatonic: boolean;
}

/**
 * The chips on offer.
 *
 * `chromatic` adds the five borrowed degrees; without it the row is the
 * seven of the major scale, which is what the card asks about unless
 * Note context says otherwise.
 *
 * NO RUNG PASSED, so a diminished takes its TRIAD name — the chip names
 * a degree of the key rather than a voicing of it, which is the same
 * reading a grid row label takes.
 */
export function degreeChips(
  chromatic: boolean,
  settings?: ProgressionSpelling,
): DegreeChip[] {
  return DEGREE_TABLE
    .filter(e => chromatic || e.diatonic)
    .map(e => ({
      label: e.label,
      text: chipText(e.label, settings),
      diatonic: e.diatonic,
    }));
}

/**
 * What a degree's chip says: "1", "2m", "♯4°".
 *
 * ONE SPELLING FOR THE CHIP AND EVERY LINE THAT NAMES IT. The result
 * line and the verdict say "the 4m", not "the 4" or "B♭m7", so a reader
 * checks their answer against the same words they tapped.
 */
export function chipText(
  label: DegreeLabel,
  settings?: ProgressionSpelling,
): string {
  const entry = DEGREE_TABLE.find(e => e.label === label);
  return label.replace(/b/g, '♭').replace(/#/g, '♯')
    + qualitySuffix(SUFFIX_QUALITY[entry?.quality ?? 'major'] ?? 'maj7',
      settings ? { settings } : {});
}

/** A degree's pitch class in a key. */
export function degreePc(keyPc: number, label: DegreeLabel): number {
  const entry = DEGREE_TABLE.find(e => e.label === label);
  return (((keyPc + (entry?.semi ?? 0)) % 12) + 12) % 12;
}

/**
 * The degree a tapped key is, in a key.
 *
 * THE PIANO ANSWERS WITH A NOTE, AND THE RESULT LINE NAMES IT AS A
 * DEGREE. "It landed on the 4, not the 5" — never "not the C", because
 * the card's question is which degree, and a letter would make the
 * reader translate their own answer back before they could read it.
 * Every pitch class has exactly one entry in the table.
 */
export function degreeOfPc(keyPc: number, pc: number): DegreeLabel {
  const semi = (((pc - keyPc) % 12) + 12) % 12;
  return DEGREE_TABLE.find(e => e.semi === semi)?.label ?? '1';
}
