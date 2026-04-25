import { playNoteSequence, playBlocked, type NoteEvent } from '../../lib/musicalPlayback';
import { parseSkillId, type SkillRecord } from '../skills/registry';
import { QUALITY_INTERVALS } from '../shapes-and-patterns/catalog';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
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
// One BPM applies to all diary previews so chord arpeggios, interval
// melodic playback, and progression arpeggios share the same "feel."
// 60 BPM is a slow ballad pace — each beat is a full second, giving
// notes room to register. 0.25 overlap gives notes a gentle
// piano-like ring (each note's release extends 25% past the next
// note's onset), away from the metronome-perfect drill aesthetic.

const DIARY_BPM = 60;
const DIARY_OVERLAP = 0.25;

// Single-chord previews (chord-recognition + shapes-and-patterns
// chord-shape) span 2 beats = 2 seconds at DIARY_BPM. Total time is
// preserved across blocked / asc / desc so the cards feel uniformly
// weighted.
const SINGLE_CHORD_BEATS = 2;

// Register anchoring keeps single-chord and interval previews in the
// "warm middle register" of the piano. Lowest note never goes below
// F2 (MIDI 41); highest note targets at-or-just-above middle C (so
// even extended voicings stay inside the warmth instead of climbing
// into the upper octaves where they thin out).
const DIARY_REGISTER_FLOOR_MIDI = 41; // F2
const DIARY_REGISTER_CEILING_MIDI = 72; // C5

const NOTE_BASES: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64,
  F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68, A: 69,
  'A#': 70, Bb: 70, B: 71,
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
    // chord with the diary's register anchor + tempo. Three modes:
    // blocked, asc (low→high arpeggio), desc (high→low arpeggio).
    if (parsed.moduleId === 'chord-recognition') {
      const intervals = QUALITY_INTERVALS[parsed.itemId] ?? QUALITY_INTERVALS.maj;
      const rootMidi = diaryRegisterRoot(intervals, 0); // C-rooted by convention
      await playChord(rootMidi, intervals, mode);
      return;
    }

    // Shape-and-pattern chord-shape drills → register-anchor by the
    // chord's actual root letter (Cmaj7, Fmaj7, etc.) so the user
    // hears the voicing in a comparable warm zone regardless of key.
    if (parsed.moduleId === 'shapes-and-patterns' && parsed.subtype === 'chord-shape') {
      const root = /^([A-G][b#]?)/.exec(skill.name)?.[1];
      const quality = /\(([^)]+)\)/.exec(skill.name)?.[1] ?? 'maj';
      const baseMidi = root ? NOTE_BASES[root] ?? 60 : 60;
      const pitchClass = ((baseMidi % 12) + 12) % 12;
      const qualityId = qualityIdFromLabel(quality);
      const intervals = QUALITY_INTERVALS[qualityId] ?? QUALITY_INTERVALS.maj;
      const rootMidi = diaryRegisterRoot(intervals, pitchClass);
      await playChord(rootMidi, intervals, mode);
      return;
    }

    // Intervals — direction comes from the skillId subtype (asc /
    // desc / harmonic), not from the per-card mode. asc/desc play
    // melodically (one note then the other); harmonic plays both
    // notes simultaneously. All three share the same register anchor
    // so the relative pitch span feels consistent across the deck.
    if (parsed.moduleId === 'intervals') {
      const seed = INTERVAL_SEEDS.find(s => s.id === parsed.itemId) ?? INTERVAL_SEEDS.find(s => s.semitones > 0);
      if (!seed) return;
      const intervals = [0, seed.semitones];
      const rootMidi = diaryRegisterRoot(intervals, 0); // C-rooted by convention
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

    // Modes — placeholder stays as the major-scale stack (every mode
    // sounds the same — separately filed roadmap item), but playback
    // pattern now respects mode parameter so users can hear the
    // notes blocked, ascending, or descending.
    if (parsed.moduleId === 'scales-modes') {
      // 7-note major-scale placeholder — every mode plays this until
      // the per-mode interval data is threaded through.
      const intervals = [0, 2, 4, 5, 7, 9, 11];
      const rootMidi = diaryRegisterRoot(intervals, 0);
      await playChord(rootMidi, intervals, mode);
      return;
    }

    // Chord progressions — full progression (`:item:`) or two-chord
    // motion (`:motion:`). Mode is forwarded so the helper picks
    // between blocked playback (multi-layer playProgression) and
    // arpeggio playback (single-voice playNoteSequence).
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
 * root keeps the lowest note ≥ F2 (DIARY_REGISTER_FLOOR_MIDI). If the
 * highest tone would push above C5 (DIARY_REGISTER_CEILING_MIDI), drop
 * one octave at a time — but never below the floor; super-extended
 * voicings whose span exceeds CEILING - FLOOR will accept the overflow
 * on top rather than violate the floor.
 *
 * `intervals` are semitone offsets from the root; `pitchClass` is the
 * desired root's MIDI value modulo 12 (0 = C, 5 = F, etc.).
 *
 * Examples (matching the design-doc's stated examples):
 *   diaryRegisterRoot([0,4,7,11], 0)   → 48  (Cmaj7 anchored at C3)
 *   diaryRegisterRoot([0,4,7], 5)      → 41  (F-major triad at F2)
 *   diaryRegisterRoot([0,4,7,11,14,21], 0) → 48  (Cmaj13 still at C3)
 */
function diaryRegisterRoot(intervals: number[], pitchClass: number): number {
  const highest = Math.max(0, ...intervals);
  let root = ((pitchClass % 12) + 12) % 12;
  while (root < DIARY_REGISTER_FLOOR_MIDI) root += 12;
  while (
    root + highest > DIARY_REGISTER_CEILING_MIDI
    && root - 12 >= DIARY_REGISTER_FLOOR_MIDI
  ) {
    root -= 12;
  }
  return root;
}

/**
 * Render a single chord (or scale stack) in one of three modes,
 * keeping total preview time consistent so cards feel uniform
 * regardless of mode choice.
 */
async function playChord(
  rootMidi: number,
  intervals: number[],
  mode: DiaryPlayMode,
): Promise<void> {
  if (mode === 'blocked') {
    await playBlocked(rootMidi, intervals, SINGLE_CHORD_BEATS, DIARY_BPM);
    return;
  }
  // Arpeggio: spread the same beat budget across the chord tones.
  // intervals are conventionally in ascending order, so 'asc' uses
  // them as-is and 'desc' reverses.
  const ordered = mode === 'desc' ? [...intervals].reverse() : intervals;
  const beatsPerNote = SINGLE_CHORD_BEATS / Math.max(1, ordered.length);
  const notes: NoteEvent[] = ordered.map(iv => ({ semitones: iv, beats: beatsPerNote }));
  await playNoteSequence(rootMidi, notes, DIARY_BPM, { overlap: DIARY_OVERLAP });
}

function qualityIdFromLabel(label: string): string {
  const normalised = label.toLowerCase().trim();
  if (normalised.includes('major 7') || normalised === 'maj7') return 'maj7';
  if (normalised.includes('minor 7') && !normalised.includes('b5')) return 'min7';
  if (normalised.includes('dominant 7')) return 'dom7';
  if (normalised.includes('half-diminished') || normalised === 'm7b5') return 'm7b5';
  if (normalised.includes('diminished 7')) return 'dim7';
  if (normalised.includes('minor-major 7')) return 'mmaj7';
  if (normalised === 'major' || normalised.trim() === '') return 'maj';
  if (normalised === 'minor') return 'min';
  if (normalised === 'diminished') return 'dim';
  if (normalised === 'augmented') return 'aug';
  if (normalised === 'sus2') return 'sus2';
  if (normalised === 'sus4') return 'sus4';
  return 'maj';
}
