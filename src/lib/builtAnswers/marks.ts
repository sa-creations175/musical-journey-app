/**
 * Turning a voicing into marks on the board.
 *
 * =====================================================================
 * COLOUR FOLLOWS THE NOTE'S JOB IN THE CHORD, and the palette is
 * `INTERVAL_COLOR` — the app's own chord-tone colours, shared with the
 * lead sheet's keyboard and the chord library's reveal. The prototype
 * carries a copy of the same hexes as a stand-in; this reads the real
 * one, which is what the brief asks for in terms.
 *
 * THE BASS ALWAYS CARRIES THE ROOT'S GREEN, as a band along the foot of
 * its key rather than as a fill. A bass line that climbs onto a key the
 * hand is already using has to show both, and a fill can only show one.
 * =====================================================================
 */
import { intervalColor } from '../voicingColors';
import {
  KEYBOARD_HIGH_MIDI, KEYBOARD_LOW_MIDI, type KeyMark, onBoard,
} from './board';
import type { VoicedChord } from './voiceLeading';

/** How the reader wants a scale drawn. Remembered per device. */
export type ColourMode = 'plain' | 'interval';

/**
 * The hand moved up an octave, where it still fits.
 *
 * PER NOTE, NOT PER CHORD. The prototype's `hiFit`: a note that would
 * leave the board stays where it is rather than the whole voicing
 * refusing to move, because the control is about where the hand sits
 * and a chord that silently declined would read as a broken button.
 */
export function raise(midis: ReadonlyArray<number>, up: boolean): number[] {
  return midis.map(m => (up && onBoard(m + 12) ? m + 12 : m));
}

/** One chord, as marks. */
export function chordMarks(
  chord: VoicedChord | null,
  opts: { octaveUp?: boolean } = {},
): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>();
  if (chord === null) return marks;
  for (const midi of raise(chord.hand, opts.octaveUp === true)) {
    if (!onBoard(midi)) continue;
    marks.set(midi, { fill: intervalColor(midi - chord.rootPc) });
  }
  if (chord.bass !== null && onBoard(chord.bass)) {
    const existing = marks.get(chord.bass);
    marks.set(chord.bass, {
      // The band goes on whatever is already there; a bass note the
      // hand is not playing also takes the root's fill so the key is
      // not left blank under its band.
      ...(existing ?? { fill: intervalColor(0) }),
      bassBand: true,
    });
  }
  return marks;
}

/** A whole scale, lit across every octave of the board. */
export function scaleMarks(
  pcs: ReadonlyArray<number>,
  rootPc: number,
  mode: ColourMode,
): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>();
  const wanted = new Set(pcs.map(p => ((p % 12) + 12) % 12));
  for (let midi = KEYBOARD_LOW_MIDI; midi <= KEYBOARD_HIGH_MIDI; midi += 1) {
    const pc = midi % 12;
    if (!wanted.has(pc)) continue;
    // THE ROOT IS GREEN IN BOTH MODES. It is the note the scale is
    // named from, and a reader looking for "where does this start" is
    // asking a different question from "what job does this note do".
    if (pc === (((rootPc % 12) + 12) % 12)) marks.set(midi, { fill: intervalColor(0) });
    else if (mode === 'interval') marks.set(midi, { fill: intervalColor(pc - rootPc) });
    else marks.set(midi, { plain: true });
  }
  return marks;
}

/** The keys a reader has tapped, before anything is judged. */
export function tapMarks(
  taps: ReadonlyArray<number>,
  opts: { rootPc?: number | null } = {},
): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>();
  const tapped = new Set(taps.map(p => ((p % 12) + 12) % 12));
  for (let midi = KEYBOARD_LOW_MIDI; midi <= KEYBOARD_HIGH_MIDI; midi += 1) {
    const pc = midi % 12;
    if (!tapped.has(pc)) continue;
    // THE CLAIMED ROOT IS GREEN AND THE REST BLUE, so the lick card's
    // first tap is visibly the claim it is.
    marks.set(midi, opts.rootPc === pc ? { fill: intervalColor(0) } : { pressed: true });
  }
  return marks;
}

/** One key, marked as tapped. Used where the answer is a single note
 *  and the octave the finger landed on is the one that lights. */
export function singleMark(midi: number | null): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>();
  if (midi !== null && onBoard(midi)) marks.set(midi, { pressed: true });
  return marks;
}
