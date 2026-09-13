import { playNoteSequence, playBlocked, type NoteEvent } from '../../lib/musicalPlayback';
import { playPanel, playRolled } from '../../lib/builtAnswers/play';
import { parseSkillId, type SkillRecord } from '../skills/registry';
import { QUALITY_INTERVALS } from '../shapes-and-patterns/catalog';
import { CHORD_SEEDS } from '../ear-training/chord-recognition/seed';
import {
  extendedShape, type ExtendedQuality, type ExtendedShape,
} from '../../lib/extendedVoicings';
import { DEFAULT_PLAYER_SETTINGS } from '../../lib/player/settings';
import type { PlayerChord } from '../../lib/player/voices';
import { bassLine, voicingsOf } from '../../lib/builtAnswers/voiceLeading';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { modeById } from '../ear-training/scales-modes/catalog';
import {
  playProgressionById,
  playMotionById,
  type DiaryPlaybackMode,
} from '../ear-training/chord-progressions/diaryPlayback';

// Diary entries include small play affordances that preview the
// musical element — a chord, interval, mode, or progression —
// through the shared synth. The diary is about feeling, not drilling,
// so the playback aesthetic differs from the source-module quizzes:
// slower tempo, light legato, anchored in the warm middle register
// of the keyboard.
//
// When the skill doesn't map cleanly to a playable shape (songs,
// drill skills, mental-viz etc.) the helper no-ops gracefully rather
// than synthesising silence or the wrong thing.

// ── Diary playback aesthetic constants ──────────────────────────────
//
// One BPM applies to all diary previews so chords, interval melodic
// playback and progressions share the same "feel."
// 50 BPM matches the user's tuned-by-ear pace from the source ear-
// training modules — each beat is 1.2 seconds, giving notes room to
// register. The diary's "feeling-first" purpose calls for this slower
// rate than typical drill tempos. 0.25 overlap gives notes a gentle
// piano-like ring (each note's release extends 25% past the next
// note's onset), away from the metronome-perfect drill aesthetic.
//
// THE OVERLAP IS THE INTERVALS' NOW, AND ONLY THEIRS. It used to shape
// the diary's chord and progression arpeggios too; those retired on
// 10 Sep 2026 into the shared player, whose runs (Play as, 12 Sep)
// release each note just after the next one sounds.

const DIARY_BPM = 50;
const DIARY_OVERLAP = 0.25;

// Single-chord previews (chord-recognition + shapes-and-patterns
// chord-shape) span 2 beats = 2.4 seconds at DIARY_BPM when blocked.
// Broken rolls at a fixed three quarters of a beat instead, so a
// 4-note chord takes 3 beats to state and this figure is its floor
// rather than its budget.
const SINGLE_CHORD_BEATS = 2;

// Modes have 7+ notes so a blocked one sits longer and feels more
// contemplative: 4 beats × 1.2 s/beat = 4.8 s. A broken mode rolls at
// the fixed spacing like everything else, so an 8-tone scale runs 6
// beats and this figure is again its floor.
const MODE_BEATS = 4;

// Register anchoring keeps chord previews in the "warm middle
// register" of the piano. Lowest note never goes below C3 (MIDI 48);
// highest note targets at-or-just-above middle C. Synthesised audio
// thins out below C3, so this floor keeps the diary's emotional
// resonance regardless of the user's playback device.
const DIARY_REGISTER_FLOOR_MIDI = 48; // C3
const DIARY_REGISTER_CEILING_MIDI = 72; // C5

// Intervals get a tighter floor than chords. Two-note intervals lack
// the upper voicing structure that balances a chord's bass; if the
// lower note sits in the deep register, the interval's emotional
// colour gets muddied. Anchoring at A3 (MIDI 57) puts the lower
// note in the warm middle and lets the upper note rise naturally
// into the brightest emotional zone.
const DIARY_INTERVAL_FLOOR_MIDI = 57; // A3

const NOTE_BASES: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64,
  F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68, A: 69,
  'A#': 70, Bb: 70, B: 71,
};

// Each mode's natural root within the C-major parent scale.
// The seven modes of the major scale land on C, D, E, F, G, A, B
// respectively. The
// minor variants (harmonic, melodic) ride on A (parallel to Aeolian)
// since they're typically taught as altered natural-minor scales.
//
// Wired to mode.parentScalePosition so adding new modes to the
// catalog only requires picking a position; no code change here.
const PARENT_POSITION_MIDI: Record<number, number> = {
  1: 60, // C — Ionian
  2: 62, // D — Dorian
  3: 64, // E — Phrygian
  4: 65, // F — Lydian
  5: 67, // G — Mixolydian
  6: 69, // A — Aeolian
  7: 71, // B — Locrian
  8: 69, // A — Harmonic minor
  9: 69, // A — Melodic minor
};

export type DiaryPlayMode = DiaryPlaybackMode; // re-export for callers

export interface PlaySkillAudioOpts {
  /** Per-card playback mode for chord, progression, and mode entries.
   *  Intervals ignore this — direction lives on the skillId subtype.
   *  Defaults to 'blocked'. */
  mode?: DiaryPlayMode;
}

/** Best-effort: play the musical element that a skill points at. */
export async function playSkillAudio(
  skill: SkillRecord | undefined,
  opts: PlaySkillAudioOpts = {},
): Promise<void> {
  if (!skill) return;
  const mode: DiaryPlayMode = opts.mode ?? 'blocked';
  try {
    const parsed = parseSkillId(skill.skillId);
    if (!parsed) return;

    // Chord-quality flashcards / chord-recognition items → play the
    // chord with the diary's register anchor + tempo. Two modes:
    // blocked, and the app's one broken — rolled up.
    if (parsed.moduleId === 'chord-recognition') {
      const voicing = diaryChordRecognitionVoicing(parsed.itemId);
      if (voicing === null) {
        // AN ITEM THE SEED DOES NOT HAVE PLAYS NOTHING, never a major
        // triad standing in for it — which is what every extended chord
        // used to sound like. See `diaryChordRecognitionVoicing`.
        console.warn('[diary-audio] no chord-recognition item', parsed.itemId);
        return;
      }
      await playVoicing(voicing, mode);
      return;
    }

    // Shape-and-pattern chord-shape drills → register-anchor by the
    // chord's actual root letter (Cmaj7, Fmaj7, etc.) so the user
    // hears the voicing in a comparable warm zone regardless of key.
    if (parsed.moduleId === 'shapes-and-patterns' && parsed.subtype === 'chord-shape') {
      const shape = diaryChordShape(parsed.itemId);
      if (shape === null) {
        console.warn('[diary-audio] no chord shape for', parsed.itemId);
        return;
      }
      await playVoicing(
        diaryPlayerChord(shape.pitchClass, shape.intervals, null, parsed.itemId),
        mode,
      );
      return;
    }

    // Intervals — direction comes from the skillId subtype (asc /
    // desc / harmonic), not from the per-card mode. asc/desc play
    // melodically (one note then the other); harmonic plays both
    // notes simultaneously. Intervals use a higher register floor
    // than chords (A3 vs C3) so the two-note relationship rings in
    // the emotionally-bright middle zone instead of getting muddy.
    if (parsed.moduleId === 'intervals') {
      const seed = INTERVAL_SEEDS.find(s => s.id === parsed.itemId) ?? INTERVAL_SEEDS.find(s => s.semitones > 0);
      if (!seed) return;
      const intervals = [0, seed.semitones];
      const rootMidi = diaryRegisterRoot(intervals, 0, DIARY_INTERVAL_FLOOR_MIDI);
      const subtype = parsed.subtype;
      if (subtype === 'harmonic') {
        await playBlocked(rootMidi, intervals, SINGLE_CHORD_BEATS, DIARY_BPM);
        return;
      }
      const notesAsc: NoteEvent[] = [
        { semitones: 0, beats: 1 },
        { semitones: seed.semitones, beats: 1 },
      ];
      const notes = subtype === 'desc' ? [...notesAsc].reverse() : notesAsc;
      await playNoteSequence(rootMidi, notes, DIARY_BPM, { overlap: DIARY_OVERLAP });
      return;
    }

    // Modes — use the mode's actual scaleIntervals (which include
    // the octave on top, per the catalog) so each mode sounds
    // distinct, and the natural-position root from the C-major
    // parent scale so the mode rings in its own key. Broken rolls
    // 0→12, the octave on top; blocked stacks all 8 tones
    // simultaneously.
    if (parsed.moduleId === 'scales-modes') {
      const modeData = modeById(parsed.itemId);
      if (!modeData) return;
      const naturalRoot = PARENT_POSITION_MIDI[modeData.parentScalePosition] ?? 60;
      const pitchClass = ((naturalRoot % 12) + 12) % 12;
      const rootMidi = diaryRegisterRoot(modeData.scaleIntervals, pitchClass);
      await playChord(rootMidi, modeData.scaleIntervals, mode, MODE_BEATS);
      return;
    }

    // Chord progressions — full progression (`:item:`) or two-chord
    // motion (`:motion:`). The mode is forwarded and becomes the
    // shared player's attack; both values go down one path.
    if (parsed.moduleId === 'chord-progressions') {
      if (parsed.subtype === 'item') {
        await playProgressionById(parsed.itemId, { mode });
        return;
      }
      if (parsed.subtype === 'motion') {
        await playMotionById(parsed.itemId, { mode });
        return;
      }
    }

    // Songs / harmonic-fluency cards / anything else: no preview
    // for now — those are handled by their own modules' audio paths.
    return;
  } catch (err) {
    // Audio failure is non-fatal — the button's click just no-ops —
    // but surface the error so silent failures don't hide in the
    // catch forever (the reason the progressions bug went unnoticed).
    console.warn('[diary-audio] playback failed', err);
  }
}

/**
 * Pick the lowest octave for `pitchClass` such that the resulting
 * root keeps the lowest note ≥ `floorMidi` (defaults to the chord
 * floor at C3). If the highest tone would push above C5
 * (DIARY_REGISTER_CEILING_MIDI), drop one octave at a time — but
 * never below the floor; super-extended voicings whose span exceeds
 * CEILING − floor will accept the overflow on top rather than violate
 * the floor.
 *
 * `intervals` are semitone offsets from the root; `pitchClass` is the
 * desired root's MIDI value modulo 12 (0 = C, 5 = F, etc.). Pass a
 * different `floorMidi` for content with its own anchoring needs —
 * intervals use A3 (57) instead of C3 (48) so the two-note shape
 * doesn't sink into the bass.
 */
function diaryRegisterRoot(
  intervals: number[],
  pitchClass: number,
  floorMidi: number = DIARY_REGISTER_FLOOR_MIDI,
): number {
  const highest = Math.max(0, ...intervals);
  let root = ((pitchClass % 12) + 12) % 12;
  while (root < floorMidi) root += 12;
  while (
    root + highest > DIARY_REGISTER_CEILING_MIDI
    && root - 12 >= floorMidi
  ) {
    root -= 12;
  }
  return root;
}

/**
 * Render a chord, scale stack, or any interval set — struck together or
 * rolled. `beats` controls the blocked time budget — pass
 * SINGLE_CHORD_BEATS for chords, MODE_BEATS for scale stacks.
 *
 * =====================================================================
 * THE DIARY NO LONGER HAS AN ARPEGGIO OF ITS OWN.
 *
 * It used to spread a chord's tones evenly across the beat budget, so
 * "ascending" on a three-note chord and on an eight-note scale were
 * different speeds — the budget was fixed and the note count was not.
 * The app's one broken mode rolls at a fixed spacing instead, so a
 * thicker chord takes longer to state, which is what it does under a
 * hand. Silas's ruling of 10 Sep 2026.
 * =====================================================================
 */
async function playChord(
  rootMidi: number,
  intervals: number[],
  mode: DiaryPlayMode,
  beats: number = SINGLE_CHORD_BEATS,
): Promise<void> {
  if (mode === 'blocked') {
    await playBlocked(rootMidi, intervals, beats, DIARY_BPM);
    return;
  }
  await playRolled(intervals, { bpm: DIARY_BPM, beats, rootMidi });
}

// =====================================================================
// ONE SOURCE FOR A CHORD'S NOTES. Silas's ruling of 10 Sep 2026.
//
// The diary played a chord-recognition entry from the shapes catalog's
// QUALITY_INTERVALS, keyed by the entry's id — and chord recognition's
// ids (`maj13`, `dom7sus4`, `dom7b9`, `min6_9`, …) are not that
// table's keys. Every miss fell back to a major triad, so eleven
// different chords sounded as C E G: "the major 9(13), the dom7sus4,
// the dom9(13) all sound the exact same." (Two of those three cards
// were retired on 11 Sep 2026 — see the head of chord recognition's
// `seed.ts` — so the quote is a record of the bug, not of the catalog.)
//
// Now a chord-recognition entry reads the list Chord Recognition itself
// plays from — the seed's `intervals` — and a miss plays nothing.
// =====================================================================

/**
 * Silas's own shapes, for the entries whose chord they voice.
 *
 * A SHAPE IS USED ONLY WHERE IT IS THAT CHORD. The maj9, m9, 7♯9♯5,
 * m6/9 and dim7 shapes carry exactly the seed's notes. The two 13
 * chords are played with the 5th left out (Silas, 11 Sep 2026), and
 * they take the SAME routing Chord Recognition gives them, so a 13
 * sounds the same in the diary as it does in the quiz. His m7♭5 shape
 * adds an 11 the plain m7♭5 does not have, so the m7♭5 entry keeps the
 * seed's stack rather than sounding a chord it is not. Every other
 * entry has no shape and plays the seed's stack.
 */
const SHAPE_FOR_ITEM: Readonly<Record<string, ExtendedQuality>> = {
  dim7: 'dim7',
  'dom7#9#5': 'dom7#9#5',
  dom13: 'dom9-13',
  maj9: 'maj9',
  maj13: 'maj13',
  min9: 'm9',
  min6_9: 'm6-9',
};

/**
 * One chord as the shared player takes it: the root in the bass by the
 * app's own bass rule, and the hand above it.
 *
 * =====================================================================
 * EVERY DIARY CHORD THROUGH THE SHARED PLAYER, IN ONE REGISTER. Silas's
 * ruling of 10 Sep 2026. A shaped chord used to go through the player
 * and a stacked one through the diary's own middle-register stack, so
 * the two sat in different places — a maj9 and a maj13 on the same C
 * with their roots an octave apart. Now both take the bass `bassLine`
 * gives any first chord, and the hand is either Silas's shape above it
 * or the seed's other notes, stacked in their own order inside the
 * hand's window (`voicingsOf`). The player's Forward bass applies as
 * everywhere else.
 * =====================================================================
 */
function diaryPlayerChord(
  rootPc: number,
  intervals: ReadonlyArray<number>,
  shape: ExtendedShape | null,
  name: string,
): PlayerChord {
  const bass = (bassLine([rootPc], [])[0] as number);
  if (shape !== null) {
    // The shape as written, from the root an octave over the bass; any
    // second left-hand note sits with the bass.
    const handRoot = bass - shape.left[0] + 12;
    return {
      bass: bass + shape.left[0],
      hand: [
        ...shape.left.slice(1).map(iv => bass + iv),
        ...shape.right.map(iv => handRoot + iv),
      ].sort((a, b) => a - b),
      rootPc,
      name,
    };
  }
  // THE SEED'S NOTES IN THEIR OWN ORDER, the root left to the bass: an
  // add2 stacks D E G and an add9 E G D, so the two stay two sounds.
  const tones = intervals.filter(iv => iv % 12 !== 0).map(iv => (rootPc + iv) % 12);
  const hand = tones.length === 0 ? [] : (voicingsOf(tones, 0)[0] ?? []);
  return { bass, hand, rootPc, name };
}

/**
 * A chord-recognition entry as the shared player plays it, C-rooted by
 * the diary's convention. Null for an id the seed does not have.
 */
export function diaryChordRecognitionVoicing(itemId: string): PlayerChord | null {
  const seed = CHORD_SEEDS.find(c => c.id === itemId);
  if (seed === undefined) return null;
  const named = SHAPE_FOR_ITEM[itemId];
  const shape: ExtendedShape | null = named === undefined ? null : extendedShape(named, 'A');
  return diaryPlayerChord(0, seed.intervals, shape, seed.name);
}

/**
 * A shapes-and-patterns chord-shape entry: its quality and root, read
 * from the entry's id (`maj7:F`) — never from its display name, which a
 * reader can rename. Null for a quality the shapes catalog does not
 * have: no silent major triad.
 */
export function diaryChordShape(itemId: string): { intervals: number[]; pitchClass: number } | null {
  const [quality, key] = itemId.split(':');
  const intervals = QUALITY_INTERVALS[quality];
  const base = key === undefined ? undefined : NOTE_BASES[key];
  if (intervals === undefined || base === undefined) return null;
  return { intervals: [...intervals], pitchClass: base % 12 };
}

/** Sound one chord through the shared player, struck together or run
 *  upward as the entry's button says. */
async function playVoicing(chord: PlayerChord, mode: DiaryPlayMode): Promise<void> {
  await playPanel([chord], {
    ...DEFAULT_PLAYER_SETTINGS,
    bpm: DIARY_BPM,
    playAs: mode === 'blocked' ? 'together' : 'up',
  }, { loop: 1, beats: SINGLE_CHORD_BEATS });
}
