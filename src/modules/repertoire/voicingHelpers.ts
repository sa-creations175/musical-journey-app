// Voicing helpers for the bar-grid chord-edit popover's piano display
// (Lead Sheet Redesign, May 2026 — docs/LEAD_SHEET_REDESIGN.md).
//
// Voicings are stored on ChordPlacement as pitch-class semitone offsets
// from the chord root (key-agnostic, e.g. root-position maj7 =
// [0,4,7,11]). These helpers resolve the concrete root from song.key +
// scale degree and convert between note names and offsets so a voicing
// entered in one key transposes automatically when the key changes.

import {
  NOTE_NAMES_FLAT,
  NOTE_NAMES_SHARP,
  SEMI_BY_DEGREE,
  keyPrefersFlats,
  pitchClassOfKey,
} from './chordFunction';
import { pitchClassOf } from './chordParser';

/** Resolve the concrete root note name for a chord from the song key
 *  and the chord's scale degree (e.g. "4maj7" in B → degree "4" →
 *  root "E"). Returns '' when the key or degree can't be resolved. */
export function chordRootNote(songKey: string, scaleDegree: string): string {
  const keyPc = pitchClassOfKey(songKey);
  if (keyPc < 0) return '';
  const semi = SEMI_BY_DEGREE[scaleDegree];
  if (semi === undefined) return '';
  const names = keyPrefersFlats(songKey) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return names[(keyPc + semi) % 12];
}

/** Convert a set of note names to pitch-class semitone offsets (0–11)
 *  from a root note. Note names carry no octave, so this is inherently
 *  first-octave; callers that need octave-aware offsets (0–23) add
 *  12 * octave themselves. Unrecognised names are dropped; result is
 *  deduped and sorted ascending. */
export function semitonesFromRoot(
  rootNote: string,
  noteNames: string[],
): number[] {
  const rootPc = pitchClassOf(rootNote);
  if (rootPc < 0) return [];
  const offsets = new Set<number>();
  for (const name of noteNames) {
    const pc = pitchClassOf(name);
    if (pc < 0) continue;
    offsets.add((pc - rootPc + 12) % 12);
  }
  return [...offsets].sort((a, b) => a - b);
}

/** Convert semitone offsets back to note names for display. Handles
 *  octave-aware offsets (0–23) by folding to pitch class — a note name
 *  is octave-agnostic, so offset 4 and offset 16 both render the same
 *  name. Spelling: pass `preferFlats` (derived from the song key) for
 *  key-correct accidentals; when omitted it's inferred from the root's
 *  own accidental (sharp root → sharps, otherwise flats). */
export function notesFromVoicing(
  rootNote: string,
  voicing: number[],
  preferFlats: boolean = !rootNote.includes('#'),
): string[] {
  const rootPc = pitchClassOf(rootNote);
  if (rootPc < 0) return [];
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return voicing.map(offset => names[(rootPc + ((offset % 12) + 12) % 12) % 12]);
}

// Degree → highlight color, mirroring the bar-grid DEGREE_PALETTES
// hues. Hex values so the piano SVG can fill keys directly. Accidental
// prefixes (b / #) are stripped before lookup.
const DEGREE_HEX: Record<string, string> = {
  '1': '#22c55e', // green-500
  '2': '#f472b6', // pink-400
  '3': '#14b8a6', // teal-500
  '4': '#9333ea', // purple-600
  '5': '#f59e0b', // amber-500
  '6': '#3b82f6', // blue-500
  '7': '#ef4444', // red-500
};
const NEUTRAL_HEX = '#a3a3a3'; // neutral-400

/** Highlight color for a chord's scale degree. Falls back to neutral
 *  for unparsed / out-of-range degrees. */
export function degreeColor(scaleDegree: string): string {
  const digit = scaleDegree.replace(/^[b#]+/, '');
  return DEGREE_HEX[digit] ?? NEUTRAL_HEX;
}
