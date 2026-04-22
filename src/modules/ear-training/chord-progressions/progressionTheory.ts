import { ensureRunning, midiToFreq, playNote } from '../../../lib/audio';
import type { ChordQuality } from './catalog';

export const KEYS: readonly string[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
];

// Root MIDI for each key using a comfortable C3..B3 range. Picking a
// root here keeps extended jazz voicings from shooting too high.
export function keyToRootMidi(key: string): number {
  const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const idxSharp = sharps.indexOf(key);
  if (idxSharp >= 0) return 48 + idxSharp;
  const idxFlat = flats.indexOf(key);
  if (idxFlat >= 0) return 48 + idxFlat;
  return 48;
}

// Parse a Roman numeral like "I", "ii", "bVII", "V7b9", "iiø7", "IVmaj7"
// and return its semitone offset above the key's tonic. Quality suffixes
// (7, maj7, ø, °, b9, etc.) are ignored — quality is specified separately
// in each progression's chordQualities array.
export function numeralOffset(numeral: string): number {
  let prefix = 0;
  let rest = numeral;
  while (rest.startsWith('b')) { prefix -= 1; rest = rest.slice(1); }
  while (rest.startsWith('#')) { prefix += 1; rest = rest.slice(1); }
  const match = rest.match(/^([IVXivx]+)/);
  if (!match) return 0;
  const roman = match[1].toUpperCase();
  const map: Record<string, number> = {
    I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11,
  };
  return (map[roman] ?? 0) + prefix;
}

export type Complexity = 'triad' | 'seventh' | 'jazz';

// Chord intervals above the chord root, keyed by quality × complexity.
// In triad mode dominant renders as a plain major triad (no b7) — V
// commonly voices as a major triad in pop/worship/gospel. Progressions
// whose theory depends on a dom7 set `requiresDominant: true` in the
// catalog; we use that to bump the effective complexity up one tier
// just for the dominant chord.
const VOICINGS: Record<ChordQuality, Record<Complexity, number[]>> = {
  major:      { triad: [0, 4, 7],     seventh: [0, 4, 7, 11],  jazz: [0, 4, 7, 11, 14] },
  minor:      { triad: [0, 3, 7],     seventh: [0, 3, 7, 10],  jazz: [0, 3, 7, 10, 14] },
  dominant:   { triad: [0, 4, 7],     seventh: [0, 4, 7, 10],  jazz: [0, 4, 7, 10, 14] },
  diminished: { triad: [0, 3, 6],     seventh: [0, 3, 6, 9],   jazz: [0, 3, 6, 9] },
  'half-dim': { triad: [0, 3, 6, 10], seventh: [0, 3, 6, 10],  jazz: [0, 3, 6, 10, 13] },
  augmented:  { triad: [0, 4, 8],     seventh: [0, 4, 8, 10],  jazz: [0, 4, 8, 10, 14] },
};

function effectiveComplexity(
  quality: ChordQuality,
  complexity: Complexity,
  requiresDominant: boolean,
): Complexity {
  if (requiresDominant && quality === 'dominant' && complexity === 'triad') {
    return 'seventh';
  }
  return complexity;
}

export function voicingFor(
  quality: ChordQuality,
  complexity: Complexity,
  requiresDominant = false,
): number[] {
  return VOICINGS[quality][effectiveComplexity(quality, complexity, requiresDominant)];
}

// Human-friendly chord name used on the final reveal ("In C: C → G → Am → F").
const NOTE_NAMES: string[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function noteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

const QUALITY_SUFFIX: Record<ChordQuality, { triad: string; seventh: string; jazz: string }> = {
  major:      { triad: '',    seventh: 'maj7',  jazz: 'maj9' },
  minor:      { triad: 'm',   seventh: 'm7',    jazz: 'm9' },
  dominant:   { triad: '',    seventh: '7',     jazz: '9' },
  diminished: { triad: '°',   seventh: '°7',    jazz: '°7' },
  'half-dim': { triad: 'ø7',  seventh: 'ø7',    jazz: 'ø7' },
  augmented:  { triad: '+',   seventh: '+7',    jazz: '+9' },
};

export function chordDisplay(
  rootMidi: number,
  quality: ChordQuality,
  complexity: Complexity,
  opts: { requiresDominant?: boolean; slashBassMidi?: number } = {},
): string {
  const eff = effectiveComplexity(quality, complexity, opts.requiresDominant ?? false);
  const base = `${noteName(rootMidi)}${QUALITY_SUFFIX[quality][eff]}`;
  return opts.slashBassMidi !== undefined
    ? `${base}/${noteName(opts.slashBassMidi)}`
    : base;
}

// --- Slash-chord parsing ---------------------------------------------

// Parse a numeral that may include slash notation. The slash portion is
// always read as a scale degree of the key (e.g. "/3" = 3rd degree,
// "/b7" = flatted 7th degree). Callers compute the bass MIDI as
// tonicMidi + bassOffset.
export interface ParsedNumeral {
  chord: string;
  /** Semitone offset above tonic for the bass note, or undefined if no slash. */
  bassOffset?: number;
  /** Raw text after the slash (preserved for exact-string grading). */
  bassToken?: string;
}

const MAJOR_DEGREE_OFFSETS: Record<number, number> = {
  1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11,
};

export function bassOffsetFromDegree(token: string): number | undefined {
  let prefix = 0;
  let rest = token;
  while (rest.startsWith('b')) { prefix -= 1; rest = rest.slice(1); }
  while (rest.startsWith('#')) { prefix += 1; rest = rest.slice(1); }
  const n = parseInt(rest, 10);
  if (!Number.isFinite(n) || n < 1 || n > 7) return undefined;
  return MAJOR_DEGREE_OFFSETS[n] + prefix;
}

export function parseSlashChord(numeral: string): ParsedNumeral {
  const idx = numeral.indexOf('/');
  if (idx < 0) return { chord: numeral };
  const chord = numeral.slice(0, idx);
  const bassToken = numeral.slice(idx + 1);
  const bassOffset = bassOffsetFromDegree(bassToken);
  return bassOffset === undefined
    ? { chord }
    : { chord, bassOffset, bassToken };
}

/** True if the progression contains any slash-chord numeral. */
export function containsSlashChords(numerals: string[]): boolean {
  return numerals.some(n => n.includes('/'));
}

/** Split answer + correct into (chord, slash) parts for partial-credit grading. */
export function splitAnswer(numeral: string): { chord: string; slash: string } {
  const idx = numeral.indexOf('/');
  return idx < 0
    ? { chord: numeral, slash: '' }
    : { chord: numeral.slice(0, idx), slash: numeral.slice(idx + 1) };
}

// --- Playback --------------------------------------------------------

export type ListeningMode = 'bass' | 'chords' | 'bass-chords';

export type TonicContext = 'singleNote' | 'none';

// Fixed priming note — not scaled by speed multiplier because it's a
// reference pitch, not part of the music. Sustains long enough that the
// ear has time to lock onto the tonic before the progression starts.
export const TONIC_DURATION = 2.0;
export const TONIC_GAP = 0.5;

/** Total seconds added ahead of the progression by the given tonic context. */
export function tonicLeadInSeconds(context: TonicContext): number {
  return context === 'singleNote' ? TONIC_DURATION + TONIC_GAP : 0;
}

export interface ProgressionStep {
  /** Absolute MIDI of the chord root (tonic + numeralOffset). */
  rootMidi: number;
  /** Absolute MIDI of the low-octave bass. Defaults to rootMidi - 12 when
      there's no slash. For slash chords, callers set this to
      (tonicMidi + bassOffset) - 12. */
  bassMidi: number;
  /** True when the numeral includes explicit slash notation. Drives
      chords-only inversion voicing. */
  isSlash: boolean;
  quality: ChordQuality;
  beats: number;
}

export interface PlaybackHandle {
  stop: () => void;
}

// Render a progression as a sequence of scheduled notes. Supports three
// listening modes: bass alone, chord voicing alone, or both layered.
// Loop count replays the whole sequence N times in one scheduling pass,
// so seek-ahead is predictable — Stop cancels all scheduled voices.
export async function playProgression(
  steps: ProgressionStep[],
  bpm: number,
  complexity: Complexity,
  mode: ListeningMode,
  speedMultiplier: number,
  loopCount: number,
  tonicContext: TonicContext,
  tonicMidi: number,
  requiresDominant: boolean,
  onStep?: (index: number, iteration: number) => void,
): Promise<PlaybackHandle> {
  const context = await ensureRunning();
  const m = Math.max(0.1, speedMultiplier);
  const effBpm = bpm * m;
  const secPerBeat = 60 / effBpm;
  const now = context.currentTime + 0.05;

  const voices: Array<{ stop: (time: number) => void }> = [];
  const timers: number[] = [];

  // Optional tonic prime at a comfortable middle-octave pitch. Fixed
  // duration — we don't want the reference note stretched by the speed
  // multiplier. Uses the currently-selected instrument via playNote.
  let cursor = now;
  if (tonicContext === 'singleNote') {
    voices.push(playNote(midiToFreq(tonicMidi), cursor, TONIC_DURATION, context, 0.32));
    cursor += TONIC_DURATION + TONIC_GAP;
  }

  const iterations = Math.max(1, loopCount);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const dur = secPerBeat * step.beats;
      const hold = dur * 0.95;
      const chordIntervals = voicingFor(step.quality, complexity, requiresDominant);

      // Mode-dependent note list:
      //   bass         → bass note only
      //   chords       → chord voicing; slash chords are voiced in
      //                  inversion (bass tone is the lowest chord note)
      //   bass-chords  → bass at low octave + chord at normal octave
      const notes: number[] = [];
      const bassIsSeparate = mode === 'bass' || mode === 'bass-chords';
      if (bassIsSeparate) notes.push(step.bassMidi);
      if (mode === 'chords' || mode === 'bass-chords') {
        if (step.isSlash && mode === 'chords') {
          // Inversion voicing: bring the bass note up a whole octave so
          // it sits at the bottom of the chord (not below it), then
          // raise any chord tones that would fall below the bass.
          const bassUp = step.bassMidi + 12;
          notes.push(bassUp);
          for (const iv of chordIntervals) {
            let n = step.rootMidi + iv;
            while (n < bassUp) n += 12;
            notes.push(n);
          }
        } else {
          for (const iv of chordIntervals) notes.push(step.rootMidi + iv);
        }
      }

      const polyphony = Math.max(1, notes.length);
      const vol = Math.max(0.12, 0.28 / Math.sqrt(polyphony));
      // Bass gets a slight boost so it stays audible in bass-chords mode.
      for (let n = 0; n < notes.length; n++) {
        const isBassVoice = bassIsSeparate && n === 0;
        voices.push(
          playNote(midiToFreq(notes[n]), cursor, hold, context, vol * (isBassVoice ? 1.3 : 1)),
        );
      }

      if (onStep) {
        const fireAt = cursor - now;
        const iterationIndex = iter;
        const stepIndex = i;
        const timerId = window.setTimeout(
          () => onStep(stepIndex, iterationIndex),
          Math.max(0, fireAt * 1000),
        );
        timers.push(timerId);
      }
      cursor += dur;
    }
  }

  return {
    stop: () => {
      const ctxNow = context.currentTime;
      const fadeAt = ctxNow + 0.05;
      for (const v of voices) v.stop(fadeAt);
      for (const id of timers) window.clearTimeout(id);
    },
  };
}

// --- Diatonic chord map ----------------------------------------------

// Quality of each diatonic chord in major (scale degrees 1..7).
// I-ii-iii-IV-V-vi-vii° — the five dominant is marked as a `dominant`
// quality so seventh-chord voicings render as V7 when complexity is
// `seventh` or `jazz`. Callers wanting a plain V triad can remap.
export const DIATONIC_MAJOR: ChordQuality[] = [
  'major',    // 1
  'minor',    // 2
  'minor',    // 3
  'major',    // 4
  'dominant', // 5
  'minor',    // 6
  'diminished', // 7
];

export interface DegreeChord {
  rootMidi: number;
  quality: ChordQuality;
  /** Degree number (1..7) for display. */
  degree: number;
}

/**
 * Resolve a scale-degree position in a given key to a concrete chord —
 * root MIDI plus diatonic quality. Degree is 1..7; out-of-range values
 * clamp to the nearest in-scale degree.
 */
export function chordAtDegree(key: string, degree: number): DegreeChord {
  const tonic = keyToRootMidi(key);
  const d = Math.min(7, Math.max(1, Math.floor(degree)));
  const offset = MAJOR_DEGREE_OFFSETS[d] ?? 0;
  return {
    rootMidi: tonic + offset,
    quality: DIATONIC_MAJOR[d - 1] ?? 'major',
    degree: d,
  };
}

/**
 * Build the MIDI pitch for a scale degree in a key — the root of the
 * diatonic chord at that degree, kept inside the tonic's octave. Handy
 * for the Chord Motion tab where we often need just the pitch, not a
 * full chord voicing.
 */
export function degreePitchMidi(key: string, degree: number): number {
  return chordAtDegree(key, degree).rootMidi;
}

// --- Cadence helper --------------------------------------------------

// A short I-IV-V-I cadence used by Chord Motion (Full / Partial
// scaffolding) to prime the tonal centre before each drill. Kept brief
// — four half-note chords at 100bpm total ~4.8 seconds. Uses
// `bass-chords` listening mode so the tonic sits unambiguously in the
// bass. Seventh complexity by default so V reads as V7 (stronger pull).
export async function playCadence(
  key: string,
  opts: { bpm?: number; complexity?: Complexity; speedMultiplier?: number } = {},
): Promise<PlaybackHandle> {
  const bpm = opts.bpm ?? 100;
  const complexity = opts.complexity ?? 'seventh';
  const speedMultiplier = opts.speedMultiplier ?? 1;
  const tonic = keyToRootMidi(key);

  const mk = (degree: number): ProgressionStep => {
    const chord = chordAtDegree(key, degree);
    return {
      rootMidi: chord.rootMidi,
      bassMidi: chord.rootMidi - 12,
      isSlash: false,
      quality: chord.quality,
      beats: 2,
    };
  };

  const steps: ProgressionStep[] = [mk(1), mk(4), mk(5), mk(1)];
  return playProgression(
    steps,
    bpm,
    complexity,
    'bass-chords',
    speedMultiplier,
    1,
    'none',
    tonic,
    true,
  );
}

/**
 * Total duration of a cadence played by `playCadence` with the given
 * tempo/speed. Four half-note chords at `bpm` scaled by the speed
 * multiplier. Matches the internal beats-per-step used above.
 */
export function cadenceDurationSeconds(bpm = 100, speedMultiplier = 1): number {
  const m = Math.max(0.1, speedMultiplier);
  const effBpm = bpm * m;
  const secPerBeat = 60 / effBpm;
  return secPerBeat * 2 * 4; // 4 chords × 2 beats each
}

// --- Drone overlay ---------------------------------------------------

/**
 * Play a sustained tonic pitch that can sit underneath another voice
 * (e.g. a progression) without coupling its schedule to the progression
 * callback. Returns a PlaybackHandle so the caller can cut it short.
 */
export async function playTonicDrone(
  tonicMidi: number,
  durationSeconds: number,
  opts: { volume?: number; octaveShift?: number } = {},
): Promise<PlaybackHandle> {
  const context = await ensureRunning();
  const startAt = context.currentTime + 0.05;
  const volume = opts.volume ?? 0.22;
  const shift = opts.octaveShift ?? -12; // one octave below the chord-root register
  const voice = playNote(midiToFreq(tonicMidi + shift), startAt, durationSeconds, context, volume);
  return {
    stop: () => {
      const now = context.currentTime;
      voice.stop(now + 0.05);
    },
  };
}
