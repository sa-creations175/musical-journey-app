/**
 * A progression written as a row of chords.
 *
 * =====================================================================
 * ONE FORMATTER, BECAUSE FIVE SURFACES WERE SPELLING IT FIVE WAYS.
 *
 * "1-5-6-4" on a card's question, "1 5 6 4" on its chip and on the
 * grid's row, "C - G - Am - F" on its answer, "1 5 6 4" again on the
 * rotate button. Four separators for one idea, and none of them said
 * that the 6 is minor — which is the whole reason a 1 5 6 4 sounds like
 * a 1 5 6 4.
 *
 * Silas's ruling of 10 Sep 2026, replacing "numbers lead, names follow"
 * wherever that was written as numbers ALONE.
 *
 * =====================================================================
 * EVERY CHORD SHOWS ITS QUALITY, AND THE QUALITY IS THE FAMILY.
 *
 *   major and dominant   bare — 1, 4, 5, ♭7
 *   minor                m   — 6m, 2m, 4m
 *   diminished           dim — 7dim
 *
 * A SEVENTH IS NOT SPELLED OUT. The 5 of a 2 5 1 is a dominant seventh
 * in the data and reads "5", because what a reader needs from the row
 * is which chords the progression is made of, not how thick to play
 * them — the thickness is a row of its own on the grid. Where a
 * seventh IS part of the name, the name already carries it and this
 * does not add one.
 *
 * The family comes from `FAMILY_OF`, which is where this app already
 * says what kind of chord a quality is. A second table here would be a
 * second answer to that question.
 *
 * =====================================================================
 * THE SEPARATOR IS A MIDDLE DOT WITH A SPACE EITHER SIDE.
 *
 * Never bare spaces, hyphens or arrows. Bare spaces cannot separate
 * "6m 4" from a two-word name; a hyphen reads as a range; and the arrow
 * is spoken for — it means RESOLUTION, which is why the passes keep it
 * ("5(7♯9♯5) → 1m") and are not written with dots.
 * =====================================================================
 */
import { FAMILY_OF, type QualityId } from './builtAnswers/chordShapes';

/** Between two chords of a row. */
export const CHORD_SEPARATOR = ' · ';

/**
 * The suffix a quality shows.
 *
 * An unknown quality shows itself rather than disappearing: a chord the
 * app cannot classify is better read as odd than as a bare number that
 * says something false.
 */
export function qualitySuffix(quality: string): string {
  const family = FAMILY_OF[quality as QualityId];
  if (family === undefined) return quality;
  if (family === 'min') return 'm';
  if (family === 'dim' || family === 'half-dim') return 'dim';
  return '';
}

/** A degree as it is written: `b7` is ♭7, `#4` is ♯4. */
export function degreeGlyphs(degree: string): string {
  return degree.replace(/b/g, '♭').replace(/#/g, '♯');
}

/** One chord of a row — its degree and its quality. */
export interface RowChord {
  degree: string;
  quality: string;
}

/** One chord, written. */
export function chordInRow(chord: RowChord): string {
  return `${degreeGlyphs(chord.degree)}${qualitySuffix(chord.quality)}`;
}

/**
 * A whole progression, written.
 *
 * Takes the progression's OWN chord data — degrees and qualities — so
 * a surface never builds the string itself and two surfaces cannot come
 * to disagree about what a progression is called.
 */
export function progressionRow(chords: ReadonlyArray<RowChord>): string {
  return chords.map(chordInRow).join(CHORD_SEPARATOR);
}

/** Anything else that is a row of chords — note names, for one. */
export function joinRow(parts: ReadonlyArray<string>): string {
  return parts.join(CHORD_SEPARATOR);
}
