import { playChordBlocked } from '../../lib/audio';
import { playNoteSequence, playBlocked, type NoteEvent } from '../../lib/musicalPlayback';
import { parseSkillId, type SkillRecord } from '../skills/registry';
import { QUALITY_INTERVALS } from '../shapes-and-patterns/catalog';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import {
  playProgressionById,
  playMotionById,
  type DiaryPlaybackMode,
} from '../ear-training/chord-progressions/diaryPlayback';

// Diary entries include a small play button that previews the
// musical element — a chord, interval, mode, or progression —
// through the shared synth. This keeps the diary feeling alive
// without a full ear-training quiz around it.
//
// When the skill doesn't map cleanly to a playable shape (songs,
// drill skills, mental-viz etc.) the helper no-ops gracefully rather
// than synthesising silence or the wrong thing.

const NOTE_BASES: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64,
  F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68, A: 69,
  'A#': 70, Bb: 70, B: 71,
};

// Total time a single-chord blocked block spans, matching the legacy
// playChordBlocked(..., 1.2) duration. Reused as the time budget for
// asc/desc arpeggios so all three modes feel like the same "weight"
// of preview.
const SINGLE_CHORD_BPM = 100;
const SINGLE_CHORD_BEATS = 2; // 2 beats at 100 BPM = 1.2 seconds total

export type DiaryPlayMode = DiaryPlaybackMode; // re-export for callers

export interface PlaySkillAudioOpts {
  /** Per-card playback mode for chord and progression entries.
   *  Intervals ignore this — direction lives on the skillId subtype.
   *  Modes (scales-modes) ignore it pending the proper mode-aware
   *  preview. Defaults to 'blocked'. */
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

    // Chord-quality flashcards / chord-recognition items → play a
    // middle-C rooted voicing of the quality. Three modes: blocked
    // (all notes at once), asc (low→high arpeggio), desc (high→low).
    // Asc/desc spread the same total time across the chord tones.
    if (parsed.moduleId === 'chord-recognition') {
      const intervals = QUALITY_INTERVALS[parsed.itemId] ?? QUALITY_INTERVALS.maj;
      await playChord(60, intervals, mode);
      return;
    }

    // Shape-and-pattern chord-shape drills → same thing, using the
    // quality suffix encoded in the DrillSkill.
    if (parsed.moduleId === 'shapes-and-patterns' && parsed.subtype === 'chord-shape') {
      // Label is e.g. "Cmaj7 (major seventh)"; pull the root.
      const root = /^([A-G][b#]?)/.exec(skill.name)?.[1];
      const quality = /\(([^)]+)\)/.exec(skill.name)?.[1] ?? 'maj';
      const rootMidi = root ? NOTE_BASES[root] ?? 60 : 60;
      const qualityId = qualityIdFromLabel(quality);
      const intervals = QUALITY_INTERVALS[qualityId] ?? QUALITY_INTERVALS.maj;
      await playChord(rootMidi, intervals, mode);
      return;
    }

    // Intervals — direction comes from the skillId subtype (asc /
    // desc / harmonic), not from the per-card mode (intervals only
    // have a single play button — direction is part of the entry's
    // identity). The asc/desc subtypes play melodically (one note
    // then the other); harmonic plays both notes simultaneously.
    if (parsed.moduleId === 'intervals') {
      const seed = INTERVAL_SEEDS.find(s => s.id === parsed.itemId) ?? INTERVAL_SEEDS.find(s => s.semitones > 0);
      if (!seed) return;
      const root = 60;
      const subtype = parsed.subtype;
      if (subtype === 'harmonic') {
        // Both notes simultaneously, held for the same total time as
        // a melodic interval would take.
        await playBlocked(root, [0, seed.semitones], SINGLE_CHORD_BEATS, SINGLE_CHORD_BPM);
        return;
      }
      // 'asc' (default), 'desc', or any other subtype falls through
      // to a melodic two-note line. Order the notes by direction.
      const notesAsc: NoteEvent[] = [
        { semitones: 0, beats: 1 },
        { semitones: seed.semitones, beats: 1 },
      ];
      const notes = subtype === 'desc' ? [...notesAsc].reverse() : notesAsc;
      await playNoteSequence(root, notes, SINGLE_CHORD_BPM);
      return;
    }

    // Modes — play a major-scale stack as a placeholder until we
    // thread full mode interval data through the audio layer.
    // (Filed as a roadmap item; mode-specific preview is out of
    // scope for the blocked/asc/desc work.)
    if (parsed.moduleId === 'scales-modes') {
      await playChordBlocked(60, [0, 2, 4, 5, 7, 9, 11], 1.0, 1.4);
      return;
    }

    // Chord progressions — full progression (`:item:`) or two-chord
    // motion (`:motion:`). Mode is forwarded so the helper can decide
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
 * Render a single chord in one of three modes, keeping total preview
 * time consistent so cards feel uniform regardless of mode choice.
 */
async function playChord(
  rootMidi: number,
  intervals: number[],
  mode: DiaryPlayMode,
): Promise<void> {
  if (mode === 'blocked') {
    await playBlocked(rootMidi, intervals, SINGLE_CHORD_BEATS, SINGLE_CHORD_BPM);
    return;
  }
  // Arpeggio: spread the same beat budget across the chord tones.
  // intervals are already in ascending order (chord-tone convention),
  // so 'asc' uses them as-is and 'desc' reverses.
  const ordered = mode === 'desc' ? [...intervals].reverse() : intervals;
  const beatsPerNote = SINGLE_CHORD_BEATS / ordered.length;
  const notes: NoteEvent[] = ordered.map(iv => ({ semitones: iv, beats: beatsPerNote }));
  await playNoteSequence(rootMidi, notes, SINGLE_CHORD_BPM);
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
