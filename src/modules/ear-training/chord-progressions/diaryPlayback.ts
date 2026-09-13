import { progressionById, type ChordQuality } from './catalog';
import { keyToRootMidi, numeralOffset } from './progressionTheory';
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

/**
 * Struck together, or run upward: the diary card's two buttons.
 *
 * =====================================================================
 * THE DIARY'S OWN ARPEGGIO IS GONE, AND THIS IS THE PLAYER'S PLAY AS.
 *
 * It used to be `'blocked' | 'asc' | 'desc'`, and the two arpeggio
 * values ran a sequencer of their own, spreading each chord's tones
 * across its beats with no bass, no hand balance and no relation to the
 * tempo the rest of the app plays at.
 *
 * So a mode is which Play as the shared player is handed: blocked is
 * Together, broken is Up — the direction the card's ↑ has always meant.
 * Both go down the same path, so a progression sounds here exactly as
 * it does everywhere else. The card's buttons give way to the diary's
 * player panel, which carries the whole Play as row, in a later commit.
 * =====================================================================
 */
export type DiaryPlaybackMode = 'blocked' | 'broken';

export interface DiaryPlaybackOpts {
  key?: string;
  bpm?: number;
  /** Per-chord rendering: struck together, or run upward. Defaults to
   *  blocked. */
  mode?: DiaryPlaybackMode;
}

/** The player's settings for a diary preview, at the diary's tempo and
 *  with the chosen Play as. Everything else is the panel's default,
 *  which is the point of there being a panel. */
function diarySettings(bpm: number, mode: DiaryPlaybackMode) {
  return {
    ...DEFAULT_PLAYER_SETTINGS,
    bpm,
    playAs: mode === 'blocked' ? 'together' as const : 'up' as const,
  };
}

/**
 * Preview a progression from the shared catalog at a sensible diary
 * default: key C, 50 BPM, seventh complexity. Used by the Harmonic
 * Diary play button.
 *
 * BOTH MODES GO THROUGH THE SHARED PLAYER, which is where the bass,
 * the hand balance and the tonic lead-in come from. The mode chooses
 * the attack and nothing else — see `DiaryPlaybackMode` above.
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

  // ONE TAP, ONE SOUND, THROUGH THE SHARED PLAYER. The diary is a
  // thin adapter over other people's players — the playback audit's
  // own words — and this is the half of it that is a progression.
  // `progressionChords` is the same builder Key Detection uses, so
  // an entry sounds here exactly as it does there.
  //
  // BOTH MODES COME DOWN THIS PATH. Blocked and broken differ by the
  // attack in the settings and by nothing else, so the diary cannot
  // drift from the quiz on what a rolled chord sounds like.
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
    diarySettings(bpm, mode),
    // A SINGLE LOW TONIC IN FRONT, which is what `singleNote` meant
    // here and what the panel plays everywhere else.
    { orientPc: ((rootMidi % 12) + 12) % 12, loop: 1 },
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

  {
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
    await playPanel(shifted, diarySettings(bpm, mode), {
      orientPc: ((rootMidi % 12) + 12) % 12, loop: 1,
    });
  }
}
