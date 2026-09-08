/**
 * What a chord in a movement is CALLED.
 *
 * =====================================================================
 * THE NUMBER AND THE NAME, BOTH, NUMBER FIRST (ruling 14).
 *
 * A movement is a shape before it is a set of notes — the walk-up is a
 * 1 to a 6, whichever key it is played in — so the degree leads and the
 * letter name sits under it. `chordToDisplay` already produces the
 * letter name and is used unchanged; this file is only the degree half.
 *
 * =====================================================================
 * THE NUMBER FOLLOWS THE SPELLING SETTING TOO, and that is the part
 * ruling 14 had to say out loud: with flats the walk-up reads
 * 1, 1, 3⁷, 2/♭5, ♭6°, 6m, 6m, and with sharps the same chords read
 * ♯5 and ♯4. A screen that re-spelled the note names and left the
 * numbers alone would be showing one chord two ways.
 *
 * So a degree is resolved to a SEMITONE and re-spelled from a table,
 * exactly as a note name is — the stored `b6` is an identity, and ♭6
 * and ♯5 are its two readings.
 * =====================================================================
 */
import type { ChordFunction } from '../../../lib/db';
import type { Spelling } from '../../../lib/spelling';
import { SEMI_BY_DEGREE } from '../../repertoire/chordFunction';

/** The twelve degrees, spelled each way. Index is semitones above the
 *  tonic — the same index `SEMI_BY_DEGREE` produces. */
const DEGREE_FLAT = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
const DEGREE_SHARP = ['1', '♯1', '2', '♯2', '3', '4', '♯4', '5', '♯5', '6', '♯6', '7'];

/** One degree, written for the eye. Falls back to what is stored when
 *  the degree is not one this app knows — a card that cannot be placed
 *  still has to render something. */
export function degreeLabel(fn: string, spelling: Spelling): string {
  const semi = SEMI_BY_DEGREE[fn];
  if (semi === undefined) return fn;
  return (spelling === 'flat' ? DEGREE_FLAT : DEGREE_SHARP)[semi % 12];
}

/**
 * A chord's degree name, in parts.
 *
 * PARTS RATHER THAN A STRING, because the seventh is set as a
 * superscript and a string cannot carry that. The prototype's own two
 * substitutions are here and nothing else: `7` is raised and `dim`
 * becomes `°`.
 */
export interface DegreeName {
  degree: string;
  /** True when `quality` should be set as a superscript. */
  raised: boolean;
  quality: string;
  /** The slash degree, or null. */
  bass: string | null;
}

export function movementDegreeName(
  chord: ChordFunction, spelling: Spelling,
): DegreeName {
  const raised = chord.quality === '7';
  return {
    degree: degreeLabel(chord.function, spelling),
    raised,
    quality: raised ? '7' : chord.quality === 'dim' ? '°' : chord.quality,
    bass: chord.bass === undefined ? null : degreeLabel(chord.bass, spelling),
  };
}
