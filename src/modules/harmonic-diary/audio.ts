import { playChordBlocked } from '../../lib/audio';
import { parseSkillId, type SkillRecord } from '../skills/registry';
import { QUALITY_INTERVALS } from '../shapes-and-patterns/catalog';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import {
  playProgressionById,
  playMotionById,
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

/** Best-effort: play the musical element that a skill points at. */
export async function playSkillAudio(skill: SkillRecord | undefined): Promise<void> {
  if (!skill) return;
  try {
    const parsed = parseSkillId(skill.skillId);
    if (!parsed) return;

    // Chord-quality flashcards / chord-recognition items → play a
    // middle-C rooted voicing of the quality.
    if (parsed.moduleId === 'chord-recognition') {
      const intervals = QUALITY_INTERVALS[parsed.itemId] ?? QUALITY_INTERVALS.maj;
      await playChordBlocked(60, intervals, 1.0, 1.2);
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
      await playChordBlocked(rootMidi, intervals, 1.0, 1.2);
      return;
    }

    // Intervals — ear training + legacy interval descriptions.
    if (parsed.moduleId === 'intervals') {
      const seed = INTERVAL_SEEDS.find(s => s.id === parsed.itemId) ?? INTERVAL_SEEDS.find(s => s.semitones > 0);
      if (!seed) return;
      const root = 60;
      // Ascending two-note interval: root, then the target note.
      await playChordBlocked(root, [0], 1.0, 0.5);
      await playChordBlocked(root, [seed.semitones], 1.0, 0.8);
      return;
    }

    // Modes — play a major-scale stack as a placeholder until we
    // thread full mode interval data through the audio layer.
    if (parsed.moduleId === 'scales-modes') {
      await playChordBlocked(60, [0, 2, 4, 5, 7, 9, 11], 1.0, 1.4);
      return;
    }

    // Chord progressions — full progression (`:item:`) or two-chord
    // motion (`:motion:`). Both resolve their content (catalog entry
    // / MOTION_DEFS table) inside the helper and play via the shared
    // progressionTheory.playProgression engine.
    if (parsed.moduleId === 'chord-progressions') {
      if (parsed.subtype === 'item') {
        await playProgressionById(parsed.itemId);
        return;
      }
      if (parsed.subtype === 'motion') {
        await playMotionById(parsed.itemId);
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
