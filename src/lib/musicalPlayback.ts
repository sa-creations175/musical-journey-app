import { ensureRunning, midiToFreq, paintOnAudioClock, playNote } from './audio';

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

/**
 * Whether a drill primes the ear with the tonic before it plays.
 *
 * =====================================================================
 * ONE DEFINITION, IN THE LAYER BOTH CALLERS ALREADY USE.
 *
 * This began in `chord-progressions/progressionTheory.ts` because that
 * is who needed it first. It is not a chord-progressions fact: any
 * drill whose question is "which SCALE DEGREE" rather than "which
 * interval" has to establish a key first, or the reader hears D up to
 * F♯ and answers "major 3rd" — correctly, to a question that was not
 * asked.
 *
 * Harmonic fluency's scale-degree cards need exactly that, and reaching
 * into an ear-training module for it would be the second copy waiting
 * to happen. Both modules already import this file for
 * `playNoteSequence`, so the fact lives here and progressionTheory
 * re-exports it for its existing importers.
 * =====================================================================
 */
export type TonicContext = 'singleNote' | 'none';

// Fixed priming note — not scaled by speed multiplier because it's a
// reference pitch, not part of the music. Sustains long enough that the
// ear has time to lock onto the tonic before the drill starts.
export const TONIC_DURATION = 2.0;
export const TONIC_GAP = 0.5;

/** Total seconds added ahead of the drill by the given tonic context. */
export function tonicLeadInSeconds(context: TonicContext): number {
  return context === 'singleNote' ? TONIC_DURATION + TONIC_GAP : 0;
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
 * Schedule a SEQUENCE of blocked chords — one after another, in the
 * same beats/bpm domain as the two above.
 *
 * =====================================================================
 * THE ONE PRIMITIVE THE CARD SOUNDS NEEDED, AND IT IS NOT A SECOND
 * SYNTH.
 *
 * `playNoteSequence` sequences and is single-voice; `playBlocked` is
 * polyphonic and plays one chord now. A slash chord is one chord, a
 * ii-V-I is three, a pentatonic is five single notes and a key
 * relation is two chords — all of them are "these note-sets, in this
 * order", which is the shape neither of the two above has. So it is
 * this file's third scheduling shape rather than a caller's own
 * `setTimeout` chain: the same `playNote`, the same cursor arithmetic,
 * one `stop` that silences everything already scheduled.
 *
 * A one-note step is a legal chord, so a melodic line needs no special
 * case — which is what lets one card-sound description cover a
 * progression and a scale without forking.
 * =====================================================================
 */
export async function playBlockedSequence(
  steps: ReadonlyArray<{ semitones: readonly number[]; beats: number }>,
  rootMidi: number,
  bpm: number,
  opts: {
    speedMultiplier?: number;
    gapBeats?: number;
    /** Fires as each step SOUNDS, on the audio clock (`paintOnAudioClock`). */
    onStep?: (index: number) => void;
    /** Fires as the last step ends, on the same clock. */
    onEnd?: () => void;
  } = {},
): Promise<PlaybackHandle> {
  const ctx = await ensureRunning();
  const m = clampSpeed(opts.speedMultiplier ?? 1.0);
  const secPerBeat = 60 / (bpm * m);
  const gap = (opts.gapBeats ?? 0) * secPerBeat;
  const voices: Array<{ stop: (time: number) => void }> = [];

  // WHAT LIGHTS IS WHAT SOUNDS: each step's paint carries the same moment
  // its notes are scheduled at. See `paintOnAudioClock`.
  const painter = opts.onStep !== undefined || opts.onEnd !== undefined
    ? paintOnAudioClock(ctx) : null;

  let cursor = ctx.currentTime + 0.05;
  steps.forEach((step, index) => {
    const dur = step.beats * secPerBeat;
    // The same √-polyphony scaling `playBlocked` uses, so a five-note
    // step and a one-note step sit at the same apparent loudness.
    const vol = Math.max(0.12, 0.28 / Math.sqrt(Math.max(1, step.semitones.length)));
    for (const semi of step.semitones) {
      voices.push(playNote(midiToFreq(rootMidi + semi), cursor, dur, ctx, vol));
    }
    if (opts.onStep !== undefined) {
      const onStep = opts.onStep;
      painter?.at(cursor, () => onStep(index));
    }
    cursor += dur + (index < steps.length - 1 ? gap : 0);
  });
  if (opts.onEnd !== undefined) painter?.at(cursor, opts.onEnd);

  return {
    stop: () => {
      const fadeAt = ctx.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
      painter?.stop();
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
  opts: {
    speedMultiplier?: number;
    velocity?: number;
    /** Fires as the chord sounds, and as it ends, on the audio clock. */
    onStart?: () => void;
    onEnd?: () => void;
  } = {},
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
  const painter = opts.onStart !== undefined || opts.onEnd !== undefined
    ? paintOnAudioClock(ctx) : null;
  if (opts.onStart !== undefined) painter?.at(now, opts.onStart);
  if (opts.onEnd !== undefined) painter?.at(now + dur, opts.onEnd);

  return {
    stop: () => {
      const fadeAt = ctx.currentTime + 0.05;
      for (const v of voices) v.stop(fadeAt);
      painter?.stop();
    },
  };
}
