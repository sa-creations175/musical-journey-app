import { progressionById, type ChordQuality } from './catalog';
import {
  keyToRootMidi,
  numeralOffset,
  parseSlashChord,
  voicingFor,
} from './progressionTheory';
import { playNoteSequence, type NoteEvent } from '../../../lib/musicalPlayback';
import { playPanel } from '../../../lib/builtAnswers/play';
import { DEFAULT_PLAYER_SETTINGS } from '../../../lib/player/settings';
import { progressionChords } from './progressionChords';

// Shared defaults for diary-triggered playback. Single-shot (no loop),
// middle register, seventh complexity so the chord colour matches how
// the quizzes sound, bass-and-chords listening mode for a full preview.
//
// 50 BPM matches the user's tuned-by-ear pace from the source ear-
// training modules — slower than typical drill tempos because the
// diary is feeling-first, not skill-first. At 50 BPM each "beat" in
// the catalog's durationPattern is 1.2 seconds, so a progression like
// 1-4-5 with [1,1,1] takes 3.6s. The 12-bar blues'
// [4,4,4,4,2,2,2,2,1,1,1,1] preserves its turnaround acceleration
// intact at the slower pace.
const DEFAULT_KEY = 'C';
const DEFAULT_BPM = 50;
const DEFAULT_COMPLEXITY = 'seventh' as const;
// `DEFAULT_LISTENING` AND `DEFAULT_TONIC_CONTEXT` WERE HERE. Both were
// arguments to this module's own sequencer: bass and chords together,
// and a single low tonic in front. The shared panel does both by
// default — bass and chords is its Listen to, and one low note is what
// `orientPc` plays — so the two constants had nothing left to say.

/** Same legato amount as the rest of the diary's arpeggio playback so
 *  chord-internal arpeggios feel consistent across single-chord and
 *  progression entries. Notes ring 25% past the next note's onset. */
const DIARY_ARPEGGIO_OVERLAP = 0.25;

export type DiaryPlaybackMode = 'blocked' | 'asc' | 'desc';

export interface DiaryPlaybackOpts {
  key?: string;
  bpm?: number;
  /** Per-chord rendering. 'blocked' plays each chord as a simultaneous
   *  block (the default — preserves the original diary behaviour and
   *  uses playProgression with bass-chords). 'asc' / 'desc' arpeggiates
   *  each chord WITHIN its allotted beats so the total duration of the
   *  progression / motion stays consistent across modes. */
  mode?: DiaryPlaybackMode;
}

/**
 * Preview a progression from the shared catalog at a sensible diary
 * default: key C, ~100 BPM, seventh complexity. Used by the Harmonic
 * Diary play button; the full quiz uses its own per-round config.
 *
 * 'blocked' mode mirrors ChordProgressionsQuiz's playWith() — bass +
 * chord layered, optional tonic prime. 'asc' / 'desc' arpeggiates each
 * chord within its allotted beats (catalog `durationPattern[i]`),
 * preserving total progression time across modes.
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
  const mode = opts.mode ?? 'blocked';
  const rootMidi = keyToRootMidi(key);

  if (mode === 'blocked') {
    // ONE TAP, ONE SOUND, THROUGH THE SHARED PLAYER. The diary is a
    // thin adapter over other people's players — the playback audit's
    // own words — and this is the half of it that is a progression.
    // `progressionChords` is the same builder Key Detection uses, so
    // an entry sounds here exactly as it does there.
    await playPanel(
      progressionChords(
        prog.numerals.map((numeral, i) => ({
          numeral,
          quality: prog.chordQualities[i] ?? 'major',
          beats: prog.durationPattern[i] ?? 1,
        })),
        rootMidi,
        {
          complexity: DEFAULT_COMPLEXITY,
          requiresDominant: prog.requiresDominant ?? false,
        },
      ),
      { ...DEFAULT_PLAYER_SETTINGS, bpm },
      // A SINGLE LOW TONIC IN FRONT, which is what `singleNote` meant
      // here and what the panel plays everywhere else.
      { orientPc: ((rootMidi % 12) + 12) % 12, loop: 1 },
    );
    return;
  }

  // Arpeggio path: walk every chord, build a NoteEvent[] that fills
  // each chord's beat allotment with its voicing tones (low-to-high
  // for asc, reversed for desc). The cumulative `beats` across notes
  // matches the original durationPattern total so total time is
  // preserved across modes.
  const notes = buildArpeggioSequence({
    chordRootSemis: prog.numerals.map(n => numeralOffset(parseSlashChord(n).chord)),
    qualities: prog.chordQualities,
    perStepBeats: prog.numerals.map((_, i) => prog.durationPattern[i] ?? 1),
    requiresDominant: prog.requiresDominant ?? false,
    direction: mode,
  });
  await playNoteSequence(rootMidi, notes, bpm, { overlap: DIARY_ARPEGGIO_OVERLAP });
}

/**
 * Helper: convert a list of chord steps + qualities + per-step beat
 * counts into a flat NoteEvent[] that arpeggiates each chord (low→high
 * for 'asc', high→low for 'desc') over its allotted span. Each chord
 * occupies exactly `perStepBeats[i]` beats regardless of how many
 * notes it has — note durations adjust to fill the time evenly.
 */
function buildArpeggioSequence(args: {
  chordRootSemis: number[];
  qualities: ChordQuality[];
  perStepBeats: number[];
  requiresDominant: boolean;
  direction: 'asc' | 'desc';
}): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let i = 0; i < args.chordRootSemis.length; i++) {
    const intervals = voicingFor(
      args.qualities[i] ?? 'major',
      DEFAULT_COMPLEXITY,
      args.requiresDominant,
    );
    // voicingFor returns intervals in ascending order from the chord
    // root, so absolute semitones above the key tonic are already
    // ascending. Reverse for descending.
    const orderedIntervals = args.direction === 'desc' ? [...intervals].reverse() : intervals;
    const chordBeats = args.perStepBeats[i];
    const beatsPerNote = chordBeats / orderedIntervals.length;
    for (const iv of orderedIntervals) {
      out.push({
        semitones: args.chordRootSemis[i] + iv,
        beats: beatsPerNote,
      });
    }
  }
  return out;
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
 *
 * The motion's named direction (e.g. '5-to-1-desc') is independent of
 * the playback mode the user picks: a desc motion played in 'asc'
 * arpeggio mode still has chord 2 sitting below chord 1, but each of
 * those chords is rendered low→high internally.
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
  const mode = opts.mode ?? 'blocked';
  const rootMidi = keyToRootMidi(key);

  const chord1RootSemis = numeralOffset(def.numerals[0]);
  let chord2RootSemis = numeralOffset(def.numerals[1]);

  // Honour the named-direction hint by octave-shifting the second
  // chord when the natural voicing would go the wrong way. This
  // applies BOTH to blocked playback (so the chord block sounds in
  // the named direction) and arpeggio playback (so the second chord's
  // arpeggio sits in the right register relative to the first).
  // 'deceptive' deliberately doesn't nudge — the surprise is in the
  // chord quality (V → vi minor), not the register.
  if (def.direction === 'desc' && chord2RootSemis > chord1RootSemis) chord2RootSemis -= 12;
  else if (def.direction === 'asc' && chord2RootSemis < chord1RootSemis) chord2RootSemis += 12;

  const requiresDominant = def.qualities.includes('dominant');

  if (mode === 'blocked') {
    // THE SAME BUILDER AS EVERY OTHER PASSAGE. A motion is two chords,
    // and its own octave nudge has already been applied above — which
    // is why the numerals are handed over already shifted rather than
    // re-derived here.
    const chords = progressionChords(
      [
        { numeral: def.numerals[0], quality: def.qualities[0], beats: 2 },
        { numeral: def.numerals[1], quality: def.qualities[1], beats: 2 },
      ],
      rootMidi,
      { complexity: DEFAULT_COMPLEXITY, requiresDominant },
    );
    // THE NUDGE, APPLIED TO WHAT WAS BUILT. `progressionChords` places
    // a chord from its own numeral; the direction hint is this drill's
    // and moves the second chord's whole voicing an octave.
    const shift = chord2RootSemis - numeralOffset(def.numerals[1]);
    const shifted = shift === 0 ? chords : [
      chords[0],
      {
        ...chords[1],
        hand: chords[1].hand.map(m => m + shift),
        bass: chords[1].bass === null ? null : chords[1].bass + shift,
      },
    ];
    await playPanel(shifted, { ...DEFAULT_PLAYER_SETTINGS, bpm }, {
      orientPc: ((rootMidi % 12) + 12) % 12, loop: 1,
    });
    return;
  }

  const notes = buildArpeggioSequence({
    chordRootSemis: [chord1RootSemis, chord2RootSemis],
    qualities: def.qualities,
    perStepBeats: [2, 2],
    requiresDominant,
    direction: mode,
  });
  await playNoteSequence(rootMidi, notes, bpm, { overlap: DIARY_ARPEGGIO_OVERLAP });
}
