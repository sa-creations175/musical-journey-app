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
// 50 BPM matches the user's tuned-by-ear pace from the source ear-
// training modules — each beat is 1.2 seconds, giving notes room to
// register. The diary's "feeling-first" purpose calls for this slower
// rate than typical drill tempos. 0.25 overlap gives notes a gentle
// piano-like ring (each note's release extends 25% past the next
// note's onset), away from the metronome-perfect drill aesthetic.

const DIARY_BPM = 50;
const DIARY_OVERLAP = 0.25;

// Single-chord previews (chord-recognition + shapes-and-patterns
// chord-shape) span 2 beats = 2.4 seconds at DIARY_BPM. With a 4-note
// 7th chord that's ~0.6s per note in arpeggio mode — right in the
// 0.5-0.7s sweet spot where individual notes register cleanly.
const SINGLE_CHORD_BEATS = 2;

// Modes have 7+ notes so they need a bigger beat budget than chords
// to give each note comparable room. 4 beats × 1.2 s/beat = 4.8 s for
// a 7-note scale ≈ 0.69s per note in asc/desc — same registration
// pace as a 4-note chord arpeggio. Blocked modes also use this
// budget so they sit longer / feel more contemplative.
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

    // Modes — placeholder stays as the major-scale stack (every mode
    // sounds the same — separately filed roadmap item), but playback
    // pattern now respects mode parameter so users can hear the
    // notes blocked, ascending, or descending. Uses MODE_BEATS so
    // 7-note scale arpeggios get the same per-note registration time
    // as 4-note chord arpeggios.
    if (parsed.moduleId === 'scales-modes') {
      // 7-note major-scale placeholder — every mode plays this until
      // the per-mode interval data is threaded through.
      const intervals = [0, 2, 4, 5, 7, 9, 11];
      const rootMidi = diaryRegisterRoot(intervals, 0);
      await playChord(rootMidi, intervals, mode, MODE_BEATS);
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
 * Render a chord, scale stack, or any interval set in one of three
 * modes, keeping total preview time consistent across modes so cards
 * feel uniformly weighted. `beats` controls the time budget — pass
 * SINGLE_CHORD_BEATS for chords, MODE_BEATS for scale stacks.
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
  // Arpeggio: spread the same beat budget across the tones.
  // intervals are conventionally in ascending order, so 'asc' uses
  // them as-is and 'desc' reverses.
  const ordered = mode === 'desc' ? [...intervals].reverse() : intervals;
  const beatsPerNote = beats / Math.max(1, ordered.length);
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
