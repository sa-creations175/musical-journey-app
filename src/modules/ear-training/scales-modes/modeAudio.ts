import { ensureRunning, midiToFreq, playNote } from '../../../lib/audio';
import type { ModalVamp } from './catalog';

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

// Schedule the whole vamp (chord + bass + melody) for `loopCount`
// iterations. Uses 4/4 at `bpm` by default; beats-per-bar is derived
// from the vamp config so odd meters work too.
//
// Chord layer: blocked chord held for each chord's beats.
// Bass layer:  one octave below the chord root's register, slightly
//              louder so it grounds the vamp.
// Melody layer: sits above the chords, lower volume, slightly detuned
//              timing so it doesn't collide with chord attacks.
export async function playModalVamp(
  rootMidi: number,
  vamp: ModalVamp,
  speedMultiplier = 1.0,
  loopCount = 4,
  bpm = 80,
  onLoopStart?: (iteration: number) => void,
): Promise<ModePlaybackHandle> {
  const context = await ensureRunning();
  const m = clampSpeed(speedMultiplier);
  const secPerBeat = 60 / (bpm * m);
  const now = context.currentTime + 0.08;

  const voices: Array<{ stop: (time: number) => void }> = [];
  const timers: number[] = [];
  const beatsPerBar = vamp.beatsPerBar;
  const totalBars = vamp.chords.length;
  const barDuration = beatsPerBar * secPerBeat;

  const iterations = Math.max(1, loopCount);
  let cursor = now;

  for (let iter = 0; iter < iterations; iter++) {
    if (onLoopStart) {
      const delay = Math.max(0, (cursor - now) * 1000);
      const iteration = iter;
      timers.push(window.setTimeout(() => onLoopStart(iteration), delay));
    }

    for (let bar = 0; bar < totalBars; bar++) {
      const barStart = cursor;

      // --- Chord layer ---
      let chordCursor = barStart;
      const chord = vamp.chords[bar];
      const chordDur = chord.beats * secPerBeat;
      const polyphony = chord.intervals.length;
      const chordVol = Math.max(0.1, 0.22 / Math.sqrt(polyphony));
      for (const iv of chord.intervals) {
        voices.push(
          playNote(midiToFreq(rootMidi + iv), chordCursor, chordDur * 0.95, context, chordVol),
        );
      }
      chordCursor += chordDur;

      // --- Bass layer ---
      let bassCursor = barStart;
      const bassBar = vamp.bassBars[bar] ?? [];
      for (const b of bassBar) {
        const dur = b.beats * secPerBeat;
        // Bass octave: one below the chord root register for grounding.
        voices.push(
          playNote(midiToFreq(rootMidi + b.semitones - 12), bassCursor, dur * 0.95, context, 0.34),
        );
        bassCursor += dur;
      }

      // --- Melody layer ---
      // Nudge attacks a fraction of a beat after the chord so the voice
      // is distinct from chord block attacks.
      let melCursor = barStart + secPerBeat * 0.08;
      const melBar = vamp.melodyBars[bar] ?? [];
      for (const mel of melBar) {
        const dur = mel.beats * secPerBeat;
        voices.push(
          playNote(midiToFreq(rootMidi + mel.semitones), melCursor, dur * 0.9, context, 0.2),
        );
        melCursor += dur;
      }

      cursor = barStart + barDuration;
    }
  }

  return {
    stop: () => {
      const fadeAt = context.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
      for (const id of timers) window.clearTimeout(id);
    },
  };
}

/** Total seconds a full vamp will play given the loop count and speed. */
export function vampDurationSeconds(
  vamp: ModalVamp,
  loopCount: number,
  speedMultiplier = 1.0,
  bpm = 80,
): number {
  const m = clampSpeed(speedMultiplier);
  const secPerBeat = 60 / (bpm * m);
  const totalBeats = vamp.chords.length * vamp.beatsPerBar;
  return totalBeats * secPerBeat * Math.max(1, loopCount);
}

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
