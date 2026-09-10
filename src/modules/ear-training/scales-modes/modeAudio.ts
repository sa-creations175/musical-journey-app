import { ensureRunning, midiToFreq, playNote } from '../../../lib/audio';

/**
 * Playback for the scales-modes module. Two entry points:
 *
 *   playModeScale(root, intervals, speed)
 *     → ascending then descending playthrough. Step = ~0.6s at 1.0x.
 *
 *   playModalVamp(root, vamp, speed, loopCount)
 *     → schedules the whole vamp (chord + bass + melody) for loopCount
 *       iterations, returning a handle with .stop(). Chord layer blocks,
 *       bass sits an octave below, melody floats above.
 *
 * Both respect the module's speed multiplier the same way as the rest of
 * the app — M rescales time by 1/M (bpm → bpm*M, step → step/M).
 */

function clampSpeed(m: number): number {
  return Math.max(0.1, m);
}

export interface ModePlaybackHandle {
  stop: () => void;
}

// Play the mode's scale ascending, brief pause, then descending. Uses
// the currently-selected instrument via playNote. Each note lasts one
// step so notes flow into each other (mild overlap) for a connected
// feel. Stop handle cancels any still-scheduled notes.
export async function playModeScale(
  rootMidi: number,
  intervals: number[],
  speedMultiplier = 1.0,
): Promise<ModePlaybackHandle> {
  const context = await ensureRunning();
  const m = clampSpeed(speedMultiplier);
  const step = 0.6 / m;
  const hold = step * 1.05;
  const gapAtTop = step * 0.5;
  const now = context.currentTime + 0.05;

  const voices: Array<{ stop: (time: number) => void }> = [];
  const ascending = intervals;
  // Descending omits the topmost note (we just played it) — walks back
  // down to the tonic.
  const descending = [...intervals].reverse().slice(1);
  const order = [...ascending, ...descending];
  // But we want a small pause at the top before descending. Insert by
  // advancing the cursor rather than adding a silence note.

  let cursor = now;
  for (let i = 0; i < order.length; i++) {
    const note = rootMidi + order[i];
    voices.push(playNote(midiToFreq(note), cursor, hold, context, 0.28));
    cursor += step;
    if (i === ascending.length - 1) cursor += gapAtTop;
  }

  return {
    stop: () => {
      const fadeAt = context.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
    },
  };
}

/**
 * =====================================================================
 * `playModalVamp` AND `vampDurationSeconds` WERE HERE, AND THEY WENT
 * WITH THE VAMPS THEMSELVES ON 10 SEP 2026.
 *
 * They played a mode's built-in loop — three layers at once, chord,
 * bass and melody, each with its own per-bar rhythm. Silas retired the
 * loops: a mode plays what he has RECORDED and tagged with it, and a
 * recorded movement goes through the shared player like everything
 * else. So the only sequencer with no path onto that player is the one
 * with nothing left to sequence.
 *
 * The scale player below stays. It runs one line of single notes and
 * the shared player has no shape for a mode's two-octave run yet.
 * =====================================================================
 */

/** Total seconds the scale ascend+descend will play. */
export function scaleDurationSeconds(
  intervals: number[],
  speedMultiplier = 1.0,
): number {
  const m = clampSpeed(speedMultiplier);
  const step = 0.6 / m;
  const ascCount = intervals.length;
  const descCount = intervals.length - 1;
  return step * (ascCount + descCount) + step * 0.5;
}
