import { ensureRunning, midiToFreq, playNote } from './audio';

/**
 * Single-voice note-sequence + blocked-chord primitive that sits between
 * the raw audio engine (src/lib/audio.ts) and the higher-level
 * music-theory engines (progressionTheory.ts, modeAudio.ts).
 *
 * What it covers
 * ──────────────
 *   • Sequential single-voice melodic playback with per-note durations.
 *     Direction (asc / desc / arbitrary) is encoded in the order of the
 *     `notes` array — there's no `direction` flag to argue about.
 *   • A `playBlocked` sibling for "all these intervals at once," so
 *     callers don't need to drop down to playNote to get a chord block.
 *
 * What it does NOT cover (deliberately)
 * ─────────────────────────────────────
 *   • Multi-strata score rendering (chord + bass + melody layers).
 *     That's playProgression / playModalVamp.
 *   • Music-theory concepts (Roman numerals, voicing complexity, slash
 *     chords). Callers convert intervals/MIDI numbers themselves.
 *   • Genre-specific articulation (swing feel, gospel triplets).
 *
 * Volume scaling: single-voice playback uses a fixed default (0.3) since
 * the polyphony-aware √-scaling in playChordBlocked is for chords, not
 * sequences. Blocked playback DOES use the polyphony scaling so chord
 * blocks of different sizes don't clip.
 */

export interface NoteEvent {
  /** Semitones above the rootMidi parameter at the call site. */
  semitones: number;
  /** Note duration in beats at the given bpm. */
  beats: number;
  /** Optional per-note velocity (0..1). Defaults to a single-voice
   *  amplitude of 0.3. */
  velocity?: number;
}

export interface PlaybackHandle {
  stop: () => void;
}

function clampSpeed(m: number): number {
  return Math.max(0.1, m);
}

/**
 * Schedule a sequential single-voice line.
 *
 * Direction is implicit in `notes` ordering: ascending = sorted
 * low-to-high, descending = high-to-low, arbitrary = whatever you want.
 *
 * The `overlap` opt controls how much each note bleeds into the next:
 *   overlap = 0   → strict sequential (cursor advances by full note dur)
 *   overlap = 0.05 (default) → gentle legato, matches the existing
 *                              playInterval behaviour
 *   overlap = 1   → cursor doesn't advance — every note starts at the
 *                   same instant (functionally a blocked chord, though
 *                   for that case use playBlocked)
 */
export async function playNoteSequence(
  rootMidi: number,
  notes: NoteEvent[],
  bpm: number,
  opts: {
    speedMultiplier?: number;
    overlap?: number;
    onNote?: (index: number) => void;
  } = {},
): Promise<PlaybackHandle> {
  const ctx = await ensureRunning();
  const m = clampSpeed(opts.speedMultiplier ?? 1.0);
  const secPerBeat = 60 / (bpm * m);
  const overlap = Math.max(0, Math.min(1, opts.overlap ?? 0.05));
  const now = ctx.currentTime + 0.05;

  const voices: Array<{ stop: (time: number) => void }> = [];
  const timers: number[] = [];

  let cursor = now;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const noteDur = note.beats * secPerBeat;
    const hold = noteDur;
    const vol = note.velocity ?? 0.3;
    voices.push(
      playNote(midiToFreq(rootMidi + note.semitones), cursor, hold, ctx, vol),
    );
    if (opts.onNote) {
      const fireAt = cursor - now;
      const idx = i;
      const cb = opts.onNote;
      timers.push(window.setTimeout(() => cb(idx), Math.max(0, fireAt * 1000)));
    }
    cursor += noteDur * (1 - overlap);
  }

  return {
    stop: () => {
      const fadeAt = ctx.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
      for (const id of timers) window.clearTimeout(id);
    },
  };
}

/**
 * Play a chord with all intervals struck simultaneously and held for a
 * given number of beats. Mirrors playChordBlocked's behaviour but in
 * the beats/bpm convention so it composes with playNoteSequence in the
 * same time domain.
 */
export async function playBlocked(
  rootMidi: number,
  intervals: number[],
  durationBeats: number,
  bpm: number,
  opts: { speedMultiplier?: number; velocity?: number } = {},
): Promise<PlaybackHandle> {
  const ctx = await ensureRunning();
  const m = clampSpeed(opts.speedMultiplier ?? 1.0);
  const secPerBeat = 60 / (bpm * m);
  const dur = durationBeats * secPerBeat;
  const now = ctx.currentTime + 0.05;
  // Same √-polyphony scaling as src/lib/audio.ts so blocks of different
  // sizes don't clip.
  const defaultVol = Math.max(0.12, 0.28 / Math.sqrt(Math.max(1, intervals.length)));
  const vol = opts.velocity ?? defaultVol;

  const voices = intervals.map(iv =>
    playNote(midiToFreq(rootMidi + iv), now, dur, ctx, vol),
  );

  return {
    stop: () => {
      const fadeAt = ctx.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
    },
  };
}
