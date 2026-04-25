import { progressionById, type ChordQuality } from './catalog';
import {
  keyToRootMidi,
  numeralOffset,
  parseSlashChord,
  playProgression,
  type ProgressionStep,
} from './progressionTheory';

// Shared defaults for diary-triggered playback. Single-shot (no loop),
// middle register, seventh complexity so the chord colour matches how
// the quizzes sound, bass-and-chords listening mode for a full preview.
const DEFAULT_KEY = 'C';
const DEFAULT_BPM = 100;
const DEFAULT_COMPLEXITY = 'seventh' as const;
const DEFAULT_LISTENING = 'bass-chords' as const;
const DEFAULT_TONIC_CONTEXT = 'singleNote' as const;

export interface DiaryPlaybackOpts {
  key?: string;
  bpm?: number;
}

/**
 * Preview a progression from the shared catalog at a sensible diary
 * default: key C, ~100 BPM, seventh complexity, bass + chords. Used
 * by the Harmonic Diary play button; the full quiz uses its own
 * per-round config.
 *
 * Mirrors the step-build logic in ChordProgressionsQuiz.tsx's playWith()
 * so the two surfaces stay visually/audibly consistent.
 */
export async function playProgressionById(
  id: string,
  opts: DiaryPlaybackOpts = {},
): Promise<void> {
  const prog = progressionById(id);
  if (!prog) {
    console.warn(`[diary-audio] progression "${id}" not in catalog`);
    return;
  }
  const key = opts.key ?? DEFAULT_KEY;
  const bpm = opts.bpm ?? DEFAULT_BPM;
  const rootMidi = keyToRootMidi(key);
  const steps: ProgressionStep[] = prog.numerals.map((numeral, i) => {
    const parsed = parseSlashChord(numeral);
    const chordRootMidi = rootMidi + numeralOffset(parsed.chord);
    const isSlash = parsed.bassOffset !== undefined;
    const bassMidi = isSlash
      ? (rootMidi + parsed.bassOffset!) - 12
      : chordRootMidi - 12;
    return {
      rootMidi: chordRootMidi,
      bassMidi,
      isSlash,
      quality: prog.chordQualities[i] ?? 'major',
      beats: prog.durationPattern[i] ?? 1,
    };
  });
  await playProgression(
    steps,
    bpm,
    DEFAULT_COMPLEXITY,
    DEFAULT_LISTENING,
    1.0,
    1,
    DEFAULT_TONIC_CONTEXT,
    rootMidi,
    prog.requiresDominant ?? false,
  );
}

// --- Chord motion starters -----------------------------------------
//
// The Harmonic Diary seeds 12 two-chord motion entries (`starters.ts`
// MOTIONS[]). Each id here maps to the concrete numerals + qualities
// the preview should play. Direction ('asc' / 'desc' / 'deceptive')
// nudges the target chord's octave so the motion sounds in the
// direction its name promises — e.g. 1 → vi with direction 'desc'
// drops vi an octave so the motion actually descends rather than
// rising to the vi above the tonic.

interface MotionDef {
  numerals: [string, string];
  qualities: [ChordQuality, ChordQuality];
  direction: 'asc' | 'desc' | 'deceptive';
}

const MOTION_DEFS: Record<string, MotionDef> = {
  '1-to-5-asc':        { numerals: ['I', 'V'],      qualities: ['major', 'dominant'], direction: 'asc' },
  '5-to-1-desc':       { numerals: ['V', 'I'],      qualities: ['dominant', 'major'], direction: 'desc' },
  '1-to-4-asc':        { numerals: ['I', 'IV'],     qualities: ['major', 'major'],    direction: 'asc' },
  '4-to-1-desc':       { numerals: ['IV', 'I'],     qualities: ['major', 'major'],    direction: 'desc' },
  '1-to-6m-desc':      { numerals: ['I', 'vi'],     qualities: ['major', 'minor'],    direction: 'desc' },
  '6m-to-1-asc':       { numerals: ['vi', 'I'],     qualities: ['minor', 'major'],    direction: 'asc' },
  '2-to-5-asc':        { numerals: ['ii', 'V'],     qualities: ['minor', 'dominant'], direction: 'asc' },
  '5-to-6m-deceptive': { numerals: ['V', 'vi'],     qualities: ['dominant', 'minor'], direction: 'deceptive' },
  '4-to-5-asc':        { numerals: ['IV', 'V'],     qualities: ['major', 'dominant'], direction: 'asc' },
  '6m-to-4-desc':      { numerals: ['vi', 'IV'],    qualities: ['minor', 'major'],    direction: 'desc' },
  'b7-to-1-asc':       { numerals: ['bVII', 'I'],   qualities: ['major', 'major'],    direction: 'asc' },
  'b6-to-b7-asc':      { numerals: ['bVI', 'bVII'], qualities: ['major', 'major'],    direction: 'asc' },
};

/**
 * Preview a two-chord motion starter at diary defaults. Respects the
 * named direction (asc / desc / deceptive) by octave-shifting the
 * target chord when the natural voicing would go the wrong way.
 */
export async function playMotionById(
  id: string,
  opts: DiaryPlaybackOpts = {},
): Promise<void> {
  const def = MOTION_DEFS[id];
  if (!def) {
    console.warn(`[diary-audio] motion "${id}" not in MOTION_DEFS`);
    return;
  }
  const key = opts.key ?? DEFAULT_KEY;
  const bpm = opts.bpm ?? DEFAULT_BPM;
  const rootMidi = keyToRootMidi(key);

  const chord1Root = rootMidi + numeralOffset(def.numerals[0]);
  let chord2Root = rootMidi + numeralOffset(def.numerals[1]);

  // Honour the direction hint. 'deceptive' intentionally doesn't nudge
  // — the surprise is in the chord quality (V → vi minor), not the
  // octave.
  if (def.direction === 'desc' && chord2Root > chord1Root) chord2Root -= 12;
  else if (def.direction === 'asc' && chord2Root < chord1Root) chord2Root += 12;

  const steps: ProgressionStep[] = [
    { rootMidi: chord1Root, bassMidi: chord1Root - 12, isSlash: false, quality: def.qualities[0], beats: 2 },
    { rootMidi: chord2Root, bassMidi: chord2Root - 12, isSlash: false, quality: def.qualities[1], beats: 2 },
  ];

  await playProgression(
    steps,
    bpm,
    DEFAULT_COMPLEXITY,
    DEFAULT_LISTENING,
    1.0,
    1,
    DEFAULT_TONIC_CONTEXT,
    rootMidi,
    def.qualities.includes('dominant'),
  );
}
