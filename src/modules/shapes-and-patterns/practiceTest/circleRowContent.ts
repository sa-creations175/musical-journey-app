/**
 * What a Circle of 4ths row says, for each kind of drill that has one.
 *
 * `CircleOfFourthsRow` is the one row; this file holds the parts it lets
 * differ — the line above the twelve, what a tile says, and the line
 * under them — for chord shapes (Silas, 14 Sep 2026) and for Chord
 * Movements & Passes (13 Sep 2026). See the row's header for the list.
 */
import type { InversionState } from '../../../lib/db';
import { spellKey, spellNote, type Spelling } from '../../../lib/spelling';
import { CHORD_QUALITY_BY_ID, KEYS, QUALITY_INTERVALS } from '../catalog';

/** Silas's words above a chord-shape Circle drill (14 Sep 2026). */
export const CHORD_SHAPE_CIRCLE_NOTE =
  'Drill chord shapes around the Circle of 4ths. This exercise counts toward the Circle of 4ths cell in the matrix.';

/** Silas's words above a Chord Movements & Passes Circle drill (13 Sep 2026). */
export const MOVEMENT_CIRCLE_NOTE =
  'Drill this movement around the Circle of 4ths. This exercise counts toward the Circle of 4ths cell in the matrix.';

/** What a kind of Circle drill says: the parts the row lets differ. */
export interface CircleRowContent {
  note: string;
  /** What a key's tile says. */
  tile: (keyName: string, spelling: Spelling) => string;
  /** The line under the twelve, for the key being played. */
  line: (keyName: string, spelling: Spelling) => string;
}

/**
 * The shape's notes above its root, lowest first.
 *
 * ROTATED, AS THE CELL PLAYER ROTATES THEM. All inversions fluid has no
 * one shape to write, so it shows root position.
 */
function shapeIntervals(
  intervals: readonly number[], state: InversionState | null,
): number[] {
  const at = state === 'inv1' ? 1 : state === 'inv2' ? 2 : state === 'inv3' ? 3 : 0;
  const n = Math.min(at, intervals.length - 1);
  return [...intervals.slice(n), ...intervals.slice(0, n).map(t => t + 12)];
}

/** A chord shape's Circle row: the chord on each tile, its notes below. */
export function chordShapeCircleRow(
  quality: string, inversionState: InversionState | null,
): CircleRowContent {
  const suffix = CHORD_QUALITY_BY_ID.get(quality)?.suffix ?? '';
  const tile = (keyName: string, spelling: Spelling) => `${spellKey(keyName, spelling)}${suffix}`;
  return {
    note: CHORD_SHAPE_CIRCLE_NOTE,
    tile,
    line: (keyName, spelling) => {
      const rootPc = KEYS.indexOf(keyName as (typeof KEYS)[number]);
      const notes = shapeIntervals(QUALITY_INTERVALS[quality] ?? [], inversionState)
        .map(t => spellNote(rootPc + t, spelling))
        .join(' ');
      // ALL INVERSIONS FLUID SHOWS ROOT POSITION AND SAYS SO (Silas, 14
      // Sep 2026): "Cm7 · C E♭ G B♭ (any inversion)".
      return `${tile(keyName, spelling)} · ${notes}${inversionState === 'fluid' ? ' (any inversion)' : ''}`;
    },
  };
}

/**
 * A movement's Circle row: the key on each tile, the row's chords below
 * — "In F: Gm7 · C7 · Fmaj7".
 */
export function movementCircleRow(
  chordsIn: (keyName: string, spelling: Spelling) => readonly string[],
): CircleRowContent {
  return {
    note: MOVEMENT_CIRCLE_NOTE,
    tile: (keyName, spelling) => spellKey(keyName, spelling),
    line: (keyName, spelling) => `In ${spellKey(keyName, spelling)}: ${chordsIn(keyName, spelling).join(' · ')}`,
  };
}
