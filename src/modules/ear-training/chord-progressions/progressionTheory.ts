import { ensureRunning, midiToFreq, playNote } from '../../../lib/audio';
import { CHORD_SEEDS } from '../chord-recognition/seed';
import type { ChordQuality } from './catalog';
import { DEFAULT_SPELLING, pitchClassOf, spellNote, type Spelling } from '../../../lib/spelling';
import {
  extendedShape, extendedTones, type ExtendedQuality,
} from '../../../lib/extendedVoicings';

export const KEYS: readonly string[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
];

// Root MIDI for each key using a comfortable C3..B3 range. Picking a
// root here keeps extended jazz voicings from shooting too high.
export function keyToRootMidi(key: string): number {
  // Was two local lookup tables tried in turn. `pitchClassOf` accepts
  // both alphabets and the ♭ / ♯ signs, so a name that has been through
  // a display path still resolves — and there is one table instead of
  // two that could disagree. Unknown input still lands on C3.
  return 48 + (pitchClassOf(key) ?? 0);
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
/**
 * The intervals of one chord-recognition quality, by its id.
 *
 * =====================================================================
 * DEFINED ONCE, IN THE LIBRARY THAT ALREADY HELD THEM.
 *
 * `CHORD_SEEDS` is where this app says what a Dom7b9 is made of, and
 * a second copy here would be a second answer to the same question —
 * the kind that agrees for a year and then does not. So the altered
 * dominants read their top rung off that library.
 *
 * It THROWS on an unknown id rather than falling back. A silent
 * fallback would voice the wrong chord, and a progression sounding a
 * plain dominant where the catalog said 7♯9♯5 is a mistake the ear
 * would have to catch.
 * =====================================================================
 */
function seedIntervals(id: string): number[] {
  const seed = CHORD_SEEDS.find(s => s.id === id);
  if (!seed) throw new Error(`no chord-recognition seed for "${id}"`);
  return [...seed.intervals];
}

/**
 * The top rung of one quality, out of Silas's notes.
 *
 * =====================================================================
 * THE JAZZ RUNG IS A VOICING, AND SILAS WROTE THE VOICINGS DOWN.
 *
 * `lib/extendedVoicings` is that transcription and it is now the one
 * place this app says what an extended chord holds. Two of these rows
 * were already right and one was not: the dominant's jazz rung stacked
 * 0-4-7-10-14, and Silas's dominant 9(13) holds the 13 where that has
 * the 5 — `G + [B, E, F, A]`, which is 0-4-9-10-14. The half-diminished
 * gains its 11 and the two-note left hand that comes with it.
 *
 * THE A SHAPE, because the rung has no position control: A is what the
 * outer chords of the ABA run take, and a run is the shared player's to
 * offer.
 *
 * IT THROWS on a quality it was asked for and cannot find, for the same
 * reason `seedIntervals` does — a fallback here would sound a chord the
 * notes do not contain.
 * =====================================================================
 */
function extendedIntervals(named: ExtendedQuality): number[] {
  const shape = extendedShape(named, 'A');
  if (!shape) throw new Error(`no A-position extended voicing for "${named}"`);
  return extendedTones(shape);
}

const VOICINGS: Record<ChordQuality, Record<Complexity, number[]>> = {
  major:      { triad: [0, 4, 7],     seventh: [0, 4, 7, 11],  jazz: extendedIntervals('maj9') },
  minor:      { triad: [0, 3, 7],     seventh: [0, 3, 7, 10],  jazz: extendedIntervals('m9') },
  dominant:   { triad: [0, 4, 7],     seventh: [0, 4, 7, 10],  jazz: extendedIntervals('dom9-13') },
  // THE ALTERED TONES LIVE ON THE TOP RUNG ONLY, which is Silas's
  // ruling of 9 Sep 2026 and is also what the ladder already means
  // everywhere else: "triads" is the plain major triad the hand would
  // play under any dominant, "7ths" is the dominant seventh, and the
  // ♭9 or the ♯9♯5 arrives with "full voicing". A reader on the
  // triads rung is not being told the chord is a plain major; they are
  // being played the rung they asked for.
  //
  // THE ♭9 IS THE ONE ALTERED DOMINANT SILAS'S NOTES DO NOT WRITE OUT
  // on its own — they give the 7♯9♯5 and, inside the minor 2 5 1, the
  // 7♯5 and the 7(♭9♯9♭13) — so the plain ♭9 keeps reading the
  // chord-recognition seed. A test asserts the 7♯9♯5's two sources
  // still agree, which is what that seed is for.
  dom7b9:     { triad: [0, 4, 7],     seventh: [0, 4, 7, 10],  jazz: seedIntervals('dom7b9') },
  'dom7#9#5': { triad: [0, 4, 7],     seventh: [0, 4, 7, 10],  jazz: extendedIntervals('dom7#9#5') },
  diminished: { triad: [0, 3, 6],     seventh: [0, 3, 6, 9],   jazz: [0, 3, 6, 9] },
  // THE HALF-DIMINISHED IS THE m7♭5(11) — Silas's `[1 + 11] + [♯4, ♭7,
  // ♭3]`, left hand and right hand run together, because this rung
  // sounds one list of intervals over one root.
  'half-dim': { triad: [0, 3, 6, 10], seventh: [0, 3, 6, 10],  jazz: extendedIntervals('m7b5-11') },
  augmented:  { triad: [0, 4, 8],     seventh: [0, 4, 8, 10],  jazz: [0, 4, 8, 10, 14] },
};

/**
 * Every quality that behaves as a dominant.
 *
 * `requiresDominant` bumps a triad-rung dominant up to a seventh so the
 * tritone survives on progressions whose theory needs it. That check
 * used to read `quality === 'dominant'`, which would have quietly left
 * the two altered dominants as plain major triads on exactly the
 * progressions that most need not to be.
 */
const DOMINANT_QUALITIES: ReadonlySet<ChordQuality> =
  new Set<ChordQuality>(['dominant', 'dom7b9', 'dom7#9#5']);

function effectiveComplexity(
  quality: ChordQuality,
  complexity: Complexity,
  requiresDominant: boolean,
): Complexity {
  if (requiresDominant && DOMINANT_QUALITIES.has(quality) && complexity === 'triad') {
    return 'seventh';
  }
  return complexity;
}

/**
 * The intervals to sound for a quality at a rung.
 *
 * A COPY, BECAUSE THE TABLE IS SHARED AND MUTABLE. `VOICINGS` holds one
 * array per quality × rung and this used to hand the caller that very
 * array; a caller that pushed onto it — adding an octave, say — would
 * have changed what every later playback of that chord sounds like, for
 * the life of the tab. Noticed while wiring the altered dominants,
 * whose top rung is read out of the chord-recognition library.
 */
export function voicingFor(
  quality: ChordQuality,
  complexity: Complexity,
  requiresDominant = false,
): number[] {
  return [...VOICINGS[quality][effectiveComplexity(quality, complexity, requiresDominant)]];
}

// Human-friendly chord name used on the final reveal ("In C: C → G → Am → F").
//
// Was a hardcoded FLAT-ONLY table. Correct under the app's flats
// default, and wrong the moment the user picks sharps — an absence
// rather than a mis-thread, but one that only shows when the setting
// moves, which is why it rides this sweep rather than shipping alone.
function noteName(midi: number, spelling: Spelling): string {
  return spellNote(((midi % 12) + 12) % 12, spelling);
}

const QUALITY_SUFFIX: Record<ChordQuality, { triad: string; seventh: string; jazz: string }> = {
  major:      { triad: '',    seventh: 'maj7',  jazz: 'maj9' },
  minor:      { triad: 'm',   seventh: 'm7',    jazz: 'm9' },
  dominant:   { triad: '',    seventh: '7',     jazz: '9' },
  // The name follows the sound up the ladder, as every other row's
  // does: no reader is shown "G7♭9" over a plain major triad.
  dom7b9:     { triad: '',    seventh: '7',     jazz: '7b9' },
  'dom7#9#5': { triad: '',    seventh: '7',     jazz: '7#9#5' },
  diminished: { triad: '°',   seventh: '°7',    jazz: '°7' },
  'half-dim': { triad: 'ø7',  seventh: 'ø7',    jazz: 'ø7' },
  augmented:  { triad: '+',   seventh: '+7',    jazz: '+9' },
};

export function chordDisplay(
  rootMidi: number,
  quality: ChordQuality,
  complexity: Complexity,
  opts: { requiresDominant?: boolean; slashBassMidi?: number } = {},
  spelling: Spelling = DEFAULT_SPELLING,
): string {
  const eff = effectiveComplexity(quality, complexity, opts.requiresDominant ?? false);
  const base = `${noteName(rootMidi, spelling)}${QUALITY_SUFFIX[quality][eff]}`;
  return opts.slashBassMidi !== undefined
    ? `${base}/${noteName(opts.slashBassMidi, spelling)}`
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

/**
 * The tonic-priming settings now live in `lib/musicalPlayback.ts`,
 * beside `playNoteSequence`, and are re-exported here so this module's
 * existing importers do not have to care.
 *
 * WHY THEY MOVED. Harmonic fluency needs the same lead-in — a card
 * asking "2 down a minor 6th" has to establish the key before it plays
 * the two degrees, or the answer is an interval rather than a scale
 * position. Importing them from a chord-progressions file would be a
 * cross-module reach for a fact neither module owns; both already sit
 * on `lib/musicalPlayback.ts`, so that is where one definition goes.
 * Same reasoning that moved INTERVAL_NAMES out of the catalog.
 */
import {
  TONIC_DURATION, TONIC_GAP, tonicLeadInSeconds, type TonicContext,
} from '../../../lib/musicalPlayback';

export { TONIC_DURATION, TONIC_GAP, tonicLeadInSeconds, type TonicContext };

/**
 * A stop handle for anything this module schedules.
 *
 * THE SEQUENCER IT BELONGED TO IS GONE — `playProgression` was this
 * module's own three-mode sequencer and every surface that called it now
 * calls the shared player. The handle stays because `playTonicDrone`
 * below still returns one.
 */
export interface PlaybackHandle {
  stop: () => void;
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
