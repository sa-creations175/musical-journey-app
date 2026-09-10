/**
 * How a chord row is spelled: the settings' shape and where it opens.
 *
 * SPLIT FROM `progressionSpelling.ts` SO IT IMPORTS NOTHING. That file
 * holds the hooks that read and write the setting, and with them React
 * and Dexie; the dashboard's read layer must not pull either in, and it
 * needs to write a motion's name the way the chips do. The hooks stay
 * where they were and re-export everything here.
 */

/** What goes between two chords of a row. */
export type ChordSeparator = 'dot' | 'hyphen' | 'space';

/**
 * Which chords show their quality.
 *
 *   all      every chord — "1-5-6m-4", "Major 2m-5-1"
 *   spelled  only a row with no name of its own. A named progression
 *            is written as its name with bare numbers, because the
 *            name already says what the chords are; a bare loop has
 *            nothing else to say it.
 *   off      numbers only, everywhere.
 */
export type QualityDisplay = 'all' | 'spelled' | 'off';

/**
 * The two names a half-diminished goes by, and why there are two.
 *
 * The 2 of a minor 2 5 1 is a diminished TRIAD when you are playing
 * triads and a m7♭5 when you are playing sevenths — the same chord
 * degree, two different chords under the hand. So the setting has two
 * halves and the formatter picks between them from the thickness rung
 * the surface is showing.
 */
export type HalfDimTriad = '°' | 'dim';
export type HalfDimSeventh = 'ø' | 'm7♭5';

export interface ProgressionSpelling {
  separator: ChordSeparator;
  qualities: QualityDisplay;
  halfDimTriad: HalfDimTriad;
  halfDimSeventh: HalfDimSeventh;
}

/**
 * Where the app opens.
 *
 * HYPHENS, EVERY QUALITY, ° AND ø — Silas's picks on the prototype.
 * The hyphen is what a chart writes and what a reader types; the
 * qualities are on because a 1 5 6 4 that does not say its 6 is minor
 * is not saying what makes it a 1 5 6 4; and the two symbols are the
 * shortest true names for the chord.
 */
export const DEFAULT_PROGRESSION_SPELLING: ProgressionSpelling = {
  separator: 'hyphen',
  qualities: 'all',
  halfDimTriad: '°',
  halfDimSeventh: 'ø',
};

/**
 * The spelling the Harmonic Fluency answer key is baked in.
 *
 * =====================================================================
 * THE ANSWER KEY IS NOT A DISPLAY STRING, SO IT DOES NOT MOVE.
 *
 * A card's `correctAnswer` and its three decoys are built once at
 * module load and are then the card's identity: the session grades by
 * comparing the tapped option to `correctAnswer`, and writes the tapped
 * string to the attempt row. If those followed the setting, a display
 * choice would decide what is stored and what counts as right.
 *
 * So they are baked in the MIDDLE DOT — the separator the app shipped
 * with, and one no chord name contains, which is what lets `respellRow`
 * re-join them on the way to the eye. Everything else, `label`
 * included, is baked at the reader-facing default.
 * =====================================================================
 */
export const CANONICAL_SPELLING: ProgressionSpelling = {
  separator: 'dot',
  qualities: 'all',
  halfDimTriad: '°',
  halfDimSeventh: 'ø',
};

/** The string each separator puts between two chords. */
export const SEPARATOR_TEXT: Readonly<Record<ChordSeparator, string>> = {
  dot: ' · ',
  hyphen: '-',
  space: ' ',
};

