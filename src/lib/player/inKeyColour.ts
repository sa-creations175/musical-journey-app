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
  '1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7',
];

/**
 * The colour word a reader would use, by semitone above the tonic.
 *
 * NAMED, NOT DESCRIBED. "purple ring on the root" is a sentence someone
 * can check against the screen; "the ring colour on the root" is not.
 *
 * BY DEGREE FAMILY RATHER THAN BY HEX, because a flattened degree wears
 * the DARKER TWIN of its family's colour and a hex table would have to
 * carry both and stay in step with the lead sheet's own. A ♭3 and a 3
 * are two shades of one teal, and a reader calls both of them teal.
 */
const COLOUR_WORD_OF_SEMITONE: ReadonlyArray<string> = [
  'green', 'pink', 'pink', 'teal', 'teal', 'purple',
  'purple', 'gold', 'blue', 'blue', 'red', 'red',
];

export interface InKeyRing {
  /** The degree this chord is of the key: '1', '♭7', '4'. */
  degree: string;
  /**
   * The ring's colour, as a hex the board can draw — or null when the
   * chord is the 1 of the key and carries no ring. See the law below.
   */
  colour: string | null;
  /** What a reader would call that colour. */
  colourWord: string;
}

/**
 * The ring for a chord root, given the key.
 *
 * =====================================================================
 * NO RING WHEN THE CHORD IS THE 1 OF THE KEY.
 *
 * The 1's colour on a lead sheet is green, and green is also what the
 * interval palette fills a root with. A green ring around a green fill
 * beside the major 3rd's lime does not read as "this chord is the 1" —
 * it reads as a second fill, and the two palettes the legend exists to
 * keep apart collapse into one. The 1 needs no ring anyway: its root IS
 * the key's home, which is the thing a ring would have said. Silas's
 * ruling of 10 Sep 2026; the legend says it in words instead.
 *
 * EVERY OTHER DEGREE TAKES THE LEAD SHEET'S OWN COLOUR — 2 pink, 3
 * teal, 4 purple, 5 gold, 6 blue, 7 red, and a flattened degree the
 * darker twin of its family — so the ring and the chord cell on a chart
 * are one palette rather than two.
 *
 * `rootPc` and `keyPc` are pitch classes. Returns null only when the
 * lead sheet has no palette for the degree, which cannot happen for the
 * twelve — it is a guard rather than a case.
 */
export function inKeyRing(
  rootPc: number,
  keyPc: number,
): InKeyRing | null {
  const semitone = (((rootPc - keyPc) % 12) + 12) % 12;
  const degree = DEGREE_OF_SEMITONE[semitone];
  const palette = degreePalette(degree, false);
  if (palette === null) return null;
  return {
    degree,
    colour: semitone === 0 ? null : palette.border,
    colourWord: COLOUR_WORD_OF_SEMITONE[semitone],
  };
}

/**
 * A degree's colour as a FILL, for the Starting note aid.
 *
 * THE AID IS NOT THE RING. Before the answer the board carries no
 * interval fills at all, so there is nothing for a green 1 to be
 * confused with — the prototype paints the given note's key in its
 * in-the-key colour and that is what a reader sees. The 1 therefore has
 * a colour here where it has no ring on the reveal.
 */
export function inKeyFill(rootPc: number, keyPc: number): string | null {
  const semitone = (((rootPc - keyPc) % 12) + 12) % 12;
  const palette = degreePalette(DEGREE_OF_SEMITONE[semitone], false);
  return palette === null ? null : palette.border;
}
