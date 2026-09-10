/**
 * A chord's colour as a DEGREE OF THE KEY, and the word for it.
 *
 * =====================================================================
 * TWO PALETTES, TWO QUESTIONS, AND THE LEGEND HAS TO NAME BOTH.
 *
 * `voicingColors.intervalColor` answers "what interval of THIS CHORD is
 * this note" — the fills on the keyboard. The lead sheet's
 * `chordColors` answers "what degree of THE KEY is this chord" — the
 * colour a chord cell wears on a chart.
 *
 * A reveal draws both at once: the notes are filled by interval and the
 * chord's own root carries a ring in its degree-of-the-key colour. The
 * ring is how a reader ties the sound they just heard to the number the
 * card asked about, so the legend has to be able to NAME the colour it
 * drew — "purple ring on the root = this chord is the 4 of the key".
 *
 * SO THE COLOUR COMES FROM THE LEAD SHEET'S OWN TABLE rather than from
 * a bespoke one. A ring the chart does not use would be a third palette
 * for the same question, and the reader would have to learn it twice.
 * =====================================================================
 */
import { degreePalette } from '../../modules/repertoire/chordColors';

/** The seven degree names, by semitones above the key's tonic. The
 *  chromatic five borrow the degree below them, which is what the
 *  lead sheet's own `SEMITONE_FAMILY` does. */
const DEGREE_OF_SEMITONE: ReadonlyArray<string> = [
  '1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7',
];

/**
 * The colour word a reader would use for a hex.
 *
 * NAMED, NOT DESCRIBED. "purple ring on the root" is a sentence someone
 * can check against the screen; "the ring colour on the root" is not.
 * The seven are the lead sheet's own seven degree families.
 */
const COLOUR_WORD: Readonly<Record<string, string>> = {
  '#22c55e': 'green',
  '#f472b6': 'pink',
  '#14b8a6': 'teal',
  '#9333ea': 'purple',
  '#a855f7': 'purple',
  '#f59e0b': 'gold',
  '#3b82f6': 'blue',
  '#ef4444': 'red',
};

export interface InKeyRing {
  /** The degree this chord is of the key: '1', '♭7', '4'. */
  degree: string;
  /** The ring's colour, as a hex the board can draw. */
  colour: string;
  /** What a reader would call that colour. */
  colourWord: string;
}

/**
 * The ring for a chord root, given the key.
 *
 * `rootPc` and `keyPc` are pitch classes. Returns null only when the
 * lead sheet has no palette for the degree, which cannot happen for the
 * twelve — it is a guard rather than a case.
 */
export function inKeyRing(
  rootPc: number,
  keyPc: number,
  dark = false,
): InKeyRing | null {
  const semitone = (((rootPc - keyPc) % 12) + 12) % 12;
  const degree = DEGREE_OF_SEMITONE[semitone];
  const palette = degreePalette(degree, dark);
  if (palette === null) return null;
  const colour = palette.border;
  return {
    degree,
    colour,
    colourWord: COLOUR_WORD[colour.toLowerCase()] ?? 'ringed',
  };
}
