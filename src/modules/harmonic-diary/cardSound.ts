/**
 * What a diary card sounds: its notes, for the player panel, and the
 * notes the panel's rows turn them into.
 *
 * =====================================================================
 * THE PANEL PLAYS; THIS ONLY SAYS WHAT.
 *
 * A card's ▶ opens the diary's player panel (Silas's spec of 12 Sep
 * 2026, §1), and the panel is the shared player: its transport, its Play
 * as, its keyboard. So the diary no longer sounds anything itself. What
 * it still owns is the answer to "what is this card": a chord, a scale,
 * an interval, or a progression, as notes the panel can play and light —
 * and, since the panel's Root, Colour, Mode, Interval and Inversion rows
 * (§4), what those notes become when a row is tapped.
 *
 * ONE BUILDER FOR BOTH. The card's own chord is the lab's chord at the
 * card's root, quality and root position, so the rows start exactly
 * where the card is and Back to the card is a return, not a rebuild.
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
import { DEFAULT_PLAYER_SETTINGS, type Hands, type PlayAs } from '../../lib/player/settings';
import { handsForSetting, type PlayerChord } from '../../lib/player/voices';
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

/**
 * The top of the hand when Root or Inversion moves it: A5.
 *
 * THE WALKED PROTOTYPE'S NUMBER. The spec describes chord hands as
 * sitting "from about F3 to F5"; the prototype drops the whole hand an
 * octave once its top note passes A5, and this is that line.
 */
export const LAB_HAND_CEILING = 81;

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
    /** Whether the chord takes Silas's shape where he has one — a Chord
     *  Recognition card does; a Shapes & Patterns card is the catalog's
     *  own stack. */
    shaped: boolean;
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
 *
 * Every one of these has the root alone in the left hand, so the hand
 * the panel's Inversion row turns is exactly his right hand.
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
 *
 * A TRIAD KEEPS ITS ROOT IN THE HAND (spec §4, 12 Sep 2026): C E G over
 * C, not E G over C, on either Hands setting.
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
  const triad = intervals.length <= 3;
  const tones = intervals
    .filter(iv => triad || iv % 12 !== 0)
    .map(iv => (rootPc + iv) % 12);
  const hand = tones.length === 0 ? [] : (voicingsOf(tones, 0)[0] ?? []);
  return { bass, hand, rootPc, name };
}

/**
 * A chord-recognition entry as the shared player plays it, C-rooted by
 * the diary's convention. Null for an id the seed does not have.
 */
export function diaryChordRecognitionVoicing(itemId: string): PlayerChord | null {
  return labChord(0, itemId, 0, 'rootless', true)?.chord ?? null;
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

/** What a quality is called, without its root: the seed's name. */
export function qualityNameOf(qualityId: string): string {
  return CHORD_SEEDS.find(s => s.id === qualityId)?.name
    ?? CHORD_QUALITY_BY_ID.get(qualityId)?.label
    ?? qualityId;
}

/**
 * A chord the panel's rows have moved: a root, a quality, an inversion,
 * under the Hands setting.
 *
 * =====================================================================
 * ROOT TRANSPOSES, AND THE HAND KEEPS ITS SHAPE (spec §4). The chord is
 * built once, at `homePc` — the card's own root — exactly as the card's
 * chord is built, and then the whole hand is moved up to the new root.
 * Built afresh in every key, the app's register rules would put the
 * notes in a different order on some keys; moved, they stand at the same
 * distances everywhere. The bass takes the new root by the bass rule.
 * Where the hand would sit on or under the bass it goes up an octave,
 * and where it would run above `LAB_HAND_CEILING` the WHOLE HAND drops
 * an octave together — never one note, and never down onto the bass.
 *
 * INVERSIONS TURN THE NOTES ACTUALLY IN THE HAND, which is why Hands is
 * applied first: "Root in the right hand" puts the root in the hand and
 * the inversions then turn it with the rest. On a rootless Major 9 the
 * four positions are E G B D · G B D E · B D E G · D E G B.
 * =====================================================================
 *
 * `handSize` is how many notes the hand holds under this setting, which
 * is how many Inversion chips there are (four at most). Null for a
 * quality neither the seed nor the shapes catalog has.
 */
export function labChord(
  rootPc: number,
  qualityId: string,
  inversion: number,
  hands: Hands,
  shaped: boolean,
  /** The root the chord is built at before it is moved — the card's. */
  homePc: number = rootPc,
): { chord: PlayerChord; handSize: number } | null {
  const seed = CHORD_SEEDS.find(s => s.id === qualityId);
  const intervals = shaped || QUALITY_INTERVALS[qualityId] === undefined
    ? seed?.intervals
    : QUALITY_INTERVALS[qualityId];
  if (intervals === undefined) return null;
  const named = shaped ? SHAPE_FOR_ITEM[qualityId] : undefined;
  const shape = named === undefined ? null : extendedShape(named, 'A');
  const built = diaryPlayerChord(homePc, intervals, shape, qualityNameOf(qualityId));
  const [held] = handsForSetting([built], { ...DEFAULT_PLAYER_SETTINGS, hands });
  const handSize = held.hand.length;
  const turns = Math.max(0, Math.min(inversion, handSize - 1, 3));
  const up = (((rootPc - homePc) % 12) + 12) % 12;
  let hand = [...held.hand.slice(turns), ...held.hand.slice(0, turns).map(m => m + 12)]
    .map(m => m + up);
  const homeBass = bassLine([homePc], [])[0] as number;
  const bass = held.bass === null
    ? null
    : held.bass - homeBass + (bassLine([rootPc], [])[0] as number);
  const floor = bass ?? Number.NEGATIVE_INFINITY;
  // THE HAND STAYS OVER THE BASS. A root kept in a triad's hand, on the
  // keys where the hand's window runs out (G♭, G), would otherwise land
  // on the bass's own key; the whole hand goes up an octave instead.
  while (hand.length > 0 && Math.min(...hand) <= floor) {
    hand = hand.map(m => m + 12);
  }
  while (hand.length > 0 && Math.max(...hand) > LAB_HAND_CEILING && Math.min(...hand) - 12 > floor) {
    hand = hand.map(m => m - 12);
  }
  return { chord: { ...held, hand, bass, rootPc }, handSize };
}

/** A mode on a root, in the diary's scale register. */
export function labScaleNotes(rootPc: number, modeId: string): number[] {
  const mode = modeById(modeId);
  if (mode === undefined) return [];
  const root = diaryRegisterRoot(mode.scaleIntervals, rootPc);
  return mode.scaleIntervals.map(iv => root + iv);
}

/** An interval on a root, in the diary's interval register. */
export function labIntervalNotes(rootPc: number, semitones: number): number[] {
  const root = diaryRegisterRoot([0, semitones], rootPc, DIARY_INTERVAL_FLOOR_MIDI);
  return [root, root + semitones];
}

/** What a card sounds, or null where it has nothing to hear. */
export function cardSound(skillId: string): CardSound | null {
  const parsed = parseSkillId(skillId);
  if (parsed === null) return null;
  const { moduleId, subtype, itemId } = parsed;

  if (moduleId === 'chord-recognition') {
    const built = labChord(0, itemId, 0, 'rootless', true);
    if (built === null || !CHORD_SEEDS.some(s => s.id === itemId)) return null;
    return {
      kind: 'chord', chord: built.chord, rootPc: 0,
      qualityId: itemId, qualityName: qualityNameOf(itemId), shaped: true,
    };
  }

  if (moduleId === 'shapes-and-patterns' && subtype === 'chord-shape') {
    const shape = diaryChordShape(itemId);
    if (shape === null) return null;
    const [quality] = itemId.split(':');
    const seedId = SEED_ID_FOR_SHAPE[quality] ?? quality;
    const qualityId = CHORD_SEEDS.some(s => s.id === seedId) ? seedId : quality;
    // THE CATALOG'S OWN STACK, not a shape: a Shapes & Patterns card is
    // the shape the grid drills.
    const built = labChord(shape.pitchClass, qualityId, 0, 'rootless', false)
      ?? { chord: diaryPlayerChord(shape.pitchClass, shape.intervals, null, itemId) };
    return {
      kind: 'chord', chord: built.chord, rootPc: shape.pitchClass,
      qualityId, qualityName: qualityNameOf(qualityId), shaped: false,
    };
  }

  // Intervals — direction comes from the skillId subtype (asc / desc /
  // harmonic). A legacy description entry has no direction of its own
  // and plays ascending, as its button always did.
  if (moduleId === 'intervals') {
    const seed = INTERVAL_SEEDS.find(s => s.id === itemId)
      ?? INTERVAL_SEEDS.find(s => s.semitones > 0);
    if (seed === undefined) return null;
    const notes = labIntervalNotes(0, seed.semitones);
    return {
      kind: 'interval',
      notes,
      rootPc: notes[0] % 12,
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
    return {
      kind: 'scale',
      notes: labScaleNotes(pitchClass, mode.id),
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

// =====================================================================
// THE ROWS' CHIPS, IN SILAS'S ORDER AND WORDS (spec §4).
// =====================================================================

export interface LabChip<Id> {
  id: Id;
  label: string;
}

/** The Colour row's families: the stack ladder, then the colours, each
 *  run of chips a group with a thin separator between. */
const COLOUR_ROWS: Readonly<Record<string, ReadonlyArray<ReadonlyArray<LabChip<string>>>>> = {
  major: [
    [{ id: 'maj', label: 'Major' }, { id: 'maj7', label: 'Major 7' },
      { id: 'maj9', label: 'Major 9' }, { id: 'maj13', label: 'Major 13' }],
    [{ id: 'maj6', label: 'Major 6' }, { id: 'maj6_9', label: '6/9' },
      { id: 'add9', label: 'add9' }, { id: 'add2', label: 'add2' }],
  ],
  minor: [
    [{ id: 'min', label: 'Minor' }, { id: 'min7', label: 'Minor 7' },
      { id: 'min9', label: 'Minor 9' }, { id: 'min11', label: 'Minor 11' }],
    [{ id: 'min6', label: 'Minor 6' }, { id: 'min6_9', label: '6/9' },
      { id: 'minMaj7', label: 'Minor(Maj7)' }],
  ],
  dom: [
    [{ id: 'dom7', label: 'Dominant 7' }, { id: 'dom13', label: '13' }],
    [{ id: 'dom7sus4', label: '7sus4' }],
    [{ id: 'dom7b9', label: '7♭9' }, { id: 'dom7#9', label: '7♯9' },
      { id: 'dom7#9#5', label: '7♯9♯5' }],
  ],
  dim: [
    [{ id: 'dim', label: 'Diminished' }, { id: 'm7b5', label: 'Half-dim 7' },
      { id: 'dim7', label: 'Diminished 7' }],
  ],
  sus: [[{ id: 'sus2', label: 'Sus2' }, { id: 'sus4', label: 'Sus4' }]],
  aug: [[{ id: 'aug', label: 'Augmented' }]],
};

/** What the Colour row's label calls each family. */
export const FAMILY_NAME: Readonly<Record<string, string>> = {
  major: 'Major', minor: 'Minor', dom: 'Dominant', dim: 'Diminished', sus: 'Sus', aug: 'Augmented',
};

/**
 * The Colour row for a quality's family.
 *
 * ONLY WHAT CHORD RECOGNITION HAS: a chip whose chord the seed does not
 * carry is not drawn, so a chord added there is added here.
 */
export function colourRow(qualityId: string): {
  family: string;
  groups: ReadonlyArray<ReadonlyArray<LabChip<string>>>;
} {
  const family = CHORD_SEEDS.find(s => s.id === qualityId)?.family ?? 'major';
  const has = new Set(CHORD_SEEDS.map(s => s.id));
  const groups = (COLOUR_ROWS[family] ?? [])
    .map(group => group.filter(chip => has.has(chip.id)))
    .filter(group => group.length > 0);
  return { family, groups };
}

/** The Mode row. */
export const MODE_CHIPS: ReadonlyArray<LabChip<string>> = [
  { id: 'ionian', label: 'Ionian' },
  { id: 'dorian', label: 'Dorian' },
  { id: 'phrygian', label: 'Phrygian' },
  { id: 'lydian', label: 'Lydian' },
  { id: 'mixolydian', label: 'Mixolydian' },
  { id: 'aeolian', label: 'Aeolian' },
  { id: 'locrian', label: 'Locrian' },
  { id: 'harmonic-minor', label: 'harmonic minor' },
  { id: 'melodic-minor', label: 'melodic minor' },
];

/** The Interval row, by semitones. */
export const INTERVAL_CHIPS: ReadonlyArray<LabChip<number>> = [
  { id: 1, label: 'minor 2nd' },
  { id: 2, label: 'major 2nd' },
  { id: 3, label: 'minor 3rd' },
  { id: 4, label: 'major 3rd' },
  { id: 5, label: 'perfect 4th' },
  { id: 6, label: 'tritone' },
  { id: 7, label: 'perfect 5th' },
  { id: 8, label: 'minor 6th' },
  { id: 9, label: 'major 6th' },
  { id: 10, label: 'minor 7th' },
  { id: 11, label: 'major 7th' },
  { id: 12, label: 'octave' },
];

/** The Inversion row's chips, by how many turns. */
export const INVERSION_LABELS: ReadonlyArray<string> = ['Root', '1st', '2nd', '3rd'];
