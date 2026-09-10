/**
 * A scale as a line of notes to play.
 *
 * =====================================================================
 * WHERE IT TURNS IS THE WHOLE DECISION.
 *
 * A seven-note scale runs to its own octave and turns there: up and
 * back down lands on the note it started from, which is what makes the
 * ear hear one scale rather than seven notes.
 *
 * A PENTATONIC TURNS AT ITS TOP NOTE, not at the octave. Five notes up
 * and four back is the shape a hand actually plays, and the prototype
 * says so in terms — "the key cards run to the octave and back; the
 * pentatonic cards turn at the 6". Adding the octave would make it a
 * six-note run and stop it being the shape drilled in Shapes &
 * Patterns.
 *
 * UP AND DOWN ALONE RUN THE FULL OCTAVE either way, because a
 * one-direction run has nowhere to land otherwise.
 * =====================================================================
 */

/** Which way the line runs. */
export type Direction = 'up' | 'down' | 'both';

/** The register the line starts in — the octave above the bass. */
const BASE = 48;

/**
 * The notes, as absolute MIDI, ascending from `start`.
 *
 * Each note is the next one above the last, so a scale whose pitch
 * classes wrap below the start still climbs.
 */
function ascending(pcs: ReadonlyArray<number>, start: number): number[] {
  const at = pcs.indexOf(start);
  const order = at < 0 ? [...pcs] : [...pcs.slice(at), ...pcs.slice(0, at)];
  const out: number[] = [];
  for (const pc of order) {
    let midi = BASE + ((((pc - BASE) % 12) + 12) % 12);
    while (out.length > 0 && midi <= out[out.length - 1]) midi += 12;
    out.push(midi);
  }
  return out;
}

export function scaleLine(
  pcs: ReadonlyArray<number>,
  start: number,
  direction: Direction,
  opts: { toOctave: boolean },
): number[] {
  const asc = ascending(pcs, start);
  if (asc.length === 0) return [];
  const withOctave = [...asc, asc[0] + 12];
  if (direction === 'up') return withOctave;
  if (direction === 'down') return [...withOctave].reverse();
  // UP AND BACK, LANDING ON THE NOTE IT STARTED FROM.
  const out = opts.toOctave ? withOctave : asc;
  return [...out, ...out.slice(0, -1).reverse()];
}
