/**
 * What a diary card sounds: its notes, for the player panel.
 *
 * =====================================================================
 * THE PANEL PLAYS; THIS ONLY SAYS WHAT.
 *
 * A card's ▶ opens the diary's player panel (Silas's spec of 12 Sep
 * 2026, §1), and the panel is the shared player: its transport, its Play
 * as, its keyboard. So the diary no longer sounds anything itself. What
 * it still owns is the answer to "what is this card": a chord, a scale,
 * an interval, or a progression, as notes the panel can play and light.
 *
 * THE NOTES ARE THE ONES THE CARD ALWAYS PLAYED. Every register rule
 * below came from the card buttons' own playback and moved here
 * unchanged, so a card sounds in the panel where it sounded before.
 * =====================================================================
 *
 * Cards with nothing to hear (songs, drills, Harmonic Fluency cards,
 * mental visualisation) answer null, and get no ▶.
 */
import { parseSkillId, type SkillRecord } from '../skills/registry';
import { CHORD_QUALITY_BY_ID, QUALITY_INTERVALS } from '../shapes-and-patterns/catalog';
import { CHORD_SEEDS } from '../ear-training/chord-recognition/seed';
import {
  extendedShape, type ExtendedQuality, type ExtendedShape,
} from '../../lib/extendedVoicings';
import type { PlayAs } from '../../lib/player/settings';
import type { PlayerChord } from '../../lib/player/voices';
import { bassLine, voicingsOf } from '../../lib/builtAnswers/voiceLeading';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { modeById } from '../ear-training/scales-modes/catalog';
import {
  motionChordsById, progressionChordsById,
} from '../ear-training/chord-progressions/diaryPlayback';

// Register anchoring keeps chord and scale cards in the "warm middle
// register" of the piano. Lowest note never goes below C3 (MIDI 48);
// highest note targets at-or-just-above middle C. Synthesised audio
// thins out below C3, so this floor keeps the diary's emotional
// resonance regardless of the user's playback device.
const DIARY_REGISTER_FLOOR_MIDI = 48; // C3
const DIARY_REGISTER_CEILING_MIDI = 72; // C5

// Intervals get a tighter floor than chords. Two-note intervals lack
// the upper voicing structure that balances a chord's bass; if the
// lower note sits in the deep register, the interval's emotional
// colour gets muddied. Anchoring at A3 (MIDI 57) puts the lower note in
// the warm middle and lets the upper note rise naturally into the
// brightest emotional zone.
const DIARY_INTERVAL_FLOOR_MIDI = 57; // A3

const NOTE_BASES: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64,
  F: 65, 'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68, A: 69,
  'A#': 70, Bb: 70, B: 71,
};

// Each mode's natural root within the C-major parent scale. The seven
// modes of the major scale land on C, D, E, F, G, A, B respectively.
// The minor variants (harmonic, melodic) ride on A (parallel to
// Aeolian) since they're typically taught as altered natural-minor
// scales. Wired to mode.parentScalePosition so adding new modes to the
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

/** Which way an interval card plays: its skill id says. */
export type IntervalDirection = 'asc' | 'desc' | 'harmonic';

/** One card's sound. */
export type CardSound =
  | {
    kind: 'chord';
    chord: PlayerChord;
    rootPc: number;
    /** The Chord Recognition seed id where the chord is one of the
     *  seed's, else the shapes catalog's own id. */
    qualityId: string;
    /** What the chord is called, without its root: "Major 9". */
    qualityName: string;
  }
  | { kind: 'scale'; notes: number[]; rootPc: number; modeId: string }
  | {
    kind: 'interval';
    notes: number[];
    rootPc: number;
    semitones: number;
    direction: IntervalDirection;
  }
  | { kind: 'progression'; chords: PlayerChord[]; keyPc: number; names: string[] };

/**
 * Pick the lowest octave for `pitchClass` such that the resulting root
 * keeps the lowest note ≥ `floorMidi` (defaults to the chord floor at
 * C3). If the highest tone would push above C5, drop one octave at a
 * time — but never below the floor; super-extended voicings whose span
 * exceeds CEILING − floor will accept the overflow on top rather than
 * violate the floor.
 */
function diaryRegisterRoot(
  intervals: ReadonlyArray<number>,
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

// =====================================================================
// ONE SOURCE FOR A CHORD'S NOTES. Silas's ruling of 10 Sep 2026.
//
// The diary played a chord-recognition entry from the shapes catalog's
// QUALITY_INTERVALS, keyed by the entry's id — and chord recognition's
// ids (`maj13`, `dom7sus4`, `dom7b9`, `min6_9`, …) are not that table's
// keys. Every miss fell back to a major triad, so eleven different
// chords sounded as C E G. Now a chord-recognition entry reads the list
// Chord Recognition itself plays from — the seed's `intervals` — and a
// miss plays nothing.
// =====================================================================

/**
 * Silas's own shapes, for the entries whose chord they voice.
 *
 * A SHAPE IS USED ONLY WHERE IT IS THAT CHORD. The maj9, m9, 7♯9♯5,
 * m6/9 and dim7 shapes carry exactly the seed's notes. The two 13
 * chords are played with the 5th left out (Silas, 11 Sep 2026), and
 * they take the SAME routing Chord Recognition gives them. His m7♭5
 * shape adds an 11 the plain m7♭5 does not have, so the m7♭5 entry
 * keeps the seed's stack rather than sounding a chord it is not.
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
 * ruling of 10 Sep 2026. Both a shaped and a stacked chord take the bass
 * `bassLine` gives any first chord, and the hand is either Silas's shape
 * above it or the seed's other notes, stacked in their own order inside
 * the hand's window (`voicingsOf`). The player's Forward bass applies as
 * everywhere else.
 * =====================================================================
 */
export function diaryPlayerChord(
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

/** The shapes catalog's one id that Chord Recognition spells otherwise. */
const SEED_ID_FOR_SHAPE: Readonly<Record<string, string>> = { mmaj7: 'minMaj7' };

/** What a card sounds, or null where it has nothing to hear. */
export function cardSound(skillId: string): CardSound | null {
  const parsed = parseSkillId(skillId);
  if (parsed === null) return null;
  const { moduleId, subtype, itemId } = parsed;

  if (moduleId === 'chord-recognition') {
    const seed = CHORD_SEEDS.find(s => s.id === itemId);
    const chord = diaryChordRecognitionVoicing(itemId);
    if (seed === undefined || chord === null) return null;
    return { kind: 'chord', chord, rootPc: 0, qualityId: seed.id, qualityName: seed.name };
  }

  if (moduleId === 'shapes-and-patterns' && subtype === 'chord-shape') {
    const shape = diaryChordShape(itemId);
    if (shape === null) return null;
    const [quality] = itemId.split(':');
    const seed = CHORD_SEEDS.find(s => s.id === (SEED_ID_FOR_SHAPE[quality] ?? quality));
    return {
      kind: 'chord',
      chord: diaryPlayerChord(shape.pitchClass, shape.intervals, null, itemId),
      rootPc: shape.pitchClass,
      qualityId: seed?.id ?? quality,
      qualityName: seed?.name ?? CHORD_QUALITY_BY_ID.get(quality)?.label ?? quality,
    };
  }

  // Intervals — direction comes from the skillId subtype (asc / desc /
  // harmonic). A legacy description entry has no direction of its own
  // and plays ascending, as its button always did.
  if (moduleId === 'intervals') {
    const seed = INTERVAL_SEEDS.find(s => s.id === itemId)
      ?? INTERVAL_SEEDS.find(s => s.semitones > 0);
    if (seed === undefined) return null;
    const root = diaryRegisterRoot([0, seed.semitones], 0, DIARY_INTERVAL_FLOOR_MIDI);
    return {
      kind: 'interval',
      notes: [root, root + seed.semitones],
      rootPc: root % 12,
      semitones: seed.semitones,
      direction: subtype === 'desc' ? 'desc' : subtype === 'harmonic' ? 'harmonic' : 'asc',
    };
  }

  // Modes — the mode's own scaleIntervals, octave on top, from its
  // natural root in the C-major parent scale.
  if (moduleId === 'scales-modes') {
    const mode = modeById(itemId);
    if (mode === undefined) return null;
    const pitchClass = (PARENT_POSITION_MIDI[mode.parentScalePosition] ?? 60) % 12;
    const root = diaryRegisterRoot(mode.scaleIntervals, pitchClass);
    return {
      kind: 'scale',
      notes: mode.scaleIntervals.map(iv => root + iv),
      rootPc: pitchClass,
      modeId: mode.id,
    };
  }

  if (moduleId === 'chord-progressions' && (subtype === 'item' || subtype === 'motion')) {
    const built = subtype === 'item' ? progressionChordsById(itemId) : motionChordsById(itemId);
    return built === null ? null : { kind: 'progression', ...built };
  }

  return null;
}

/**
 * Where Play as opens for a card.
 *
 * INTERVALS OPEN ON THE DIRECTION THE CARD NAMES (spec §6): ascending on
 * Up, descending on Down, a harmonic interval on Together. Every other
 * card opens on Together (spec §8).
 */
export function openingPlayAs(sound: CardSound): PlayAs {
  if (sound.kind !== 'interval') return 'together';
  return sound.direction === 'asc' ? 'up' : sound.direction === 'desc' ? 'down' : 'together';
}

/** The card's own title: the skill's name, or its id made readable. */
export function diaryCardTitle(skillId: string, skill: SkillRecord | undefined): string {
  if (skill !== undefined) return skill.name;
  const parsed = parseSkillId(skillId);
  return parsed === null ? skillId : parsed.itemId.replace(/[-_]/g, ' ');
}
