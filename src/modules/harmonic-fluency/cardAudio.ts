/**
 * What a card SOUNDS LIKE — one description, every family.
 *
 * =====================================================================
 * SOUND IS THE POINT OF THIS MODULE, NOT DECORATION ON IT (ruling 33).
 *
 * Two of thirteen families could be heard. A slash chord is a SOUND
 * before it is a notation, a 2 5 1 is a sound, a pentatonic is a sound,
 * and a reader who could only read them was learning the writing rather
 * than the thing written down.
 *
 * =====================================================================
 * ONE SHAPE EVERYWHERE: THE TONIC CHORD, THEN THE MATERIAL.
 *
 * The key's own chord first, to orient, then whatever the card is
 * about. That is not a lead-in for its own sake — `degreeAudio` makes
 * the argument at length and it holds for every family here. D and F♯
 * alone are a major third in any key; after a D chord they are the 1
 * and the 3. Play a G/B with nothing before it and it is a chord; play
 * it after a C, and it is the 5 with the leading tone underneath, which
 * is the fact the card is teaching.
 *
 * =====================================================================
 * WHAT IS ALLOWED TO DIFFER, AND NOTHING ELSE MAY.
 *
 * 1. THE MATERIAL. That is the whole per-family decision and it is the
 *    switch below — nothing else about playback forks on category.
 * 2. WHETHER THERE IS AN ORIENTING CHORD AT ALL. Enharmonic cards name
 *    no key: "is ♯4 the same sound as ♭5" is a question about two
 *    NAMES, and a key would answer a question it did not ask. Ruling 33
 *    says the same in its own words — for a note, "play the pitch once
 *    (one sound is the point)".
 * 3. THE REGISTER OF HOME. A keyed card sounds at its key's own root,
 *    which is what `keyToRootMidi` gives. Number System Math has no key
 *    — "in ANY major key" — so it keeps the middle-C home it has always
 *    sounded in.
 * 4. WHERE THE CONTROL SITS on the card. `CardPlayback` is one
 *    component either way; the degree-and-note card puts it under its
 *    keyboard and everything else puts it under the explanation.
 * 5. WHICH ROOT A CARD ORIENTS ON (ruling 38). Everywhere else it is
 *    the card's key. A MODE orients on the mode's own root — B♭ major
 *    for "the mode of E♭ major starting on B♭", not E♭ — because a mode
 *    only sounds like itself when its own note is home. Play the parent
 *    chord and B♭ Mixolydian is just E♭ major with an odd starting
 *    note, which is the misunderstanding the category exists to correct.
 * 6. A HELD ROOT UNDER THE MATERIAL (ruling 38), which only the mode
 *    cards have. Same reason: the drone is what keeps the ear on the
 *    mode's own tonic while the scale walks away from it.
 *
 * Not on that list, and therefore shared: the tempo, the speed setting,
 * the tonic-context preference, the button, its label, stopping on
 * unmount, and reveal-side-only.
 *
 * =====================================================================
 * READ OFF `axis`, NEVER OFF THE QUESTION TEXT.
 *
 * The same rule `facets.ts` follows. Every generator holds these values
 * a moment before it writes the card; parsing a prompt back into its
 * parts is how a ♭ went missing once already. A card with no `axis` has
 * not said what it is about and gets no sound — which is why the
 * hand-written C slash cards and the prose cards are silent, and why
 * that is a statement rather than an oversight.
 * =====================================================================
 */
import type { Flashcard } from './catalog';
import { keyToRootMidi } from '../ear-training/chord-progressions/progressionTheory';
import { DEGREE_BY_ID } from './chromaticDegrees';
import { SLASH_SHAPES } from './catalogExpansions';
import { INTERVAL_QUALITIES, type Direction } from './scaleDegreeQuality';

/**
 * One thing sounded at one time — a chord, or a single note when there
 * is one number in it.
 *
 * Semitones above the sound's own root, so the whole description
 * transposes by moving one number.
 */
export interface SoundStep {
  semitones: readonly number[];
  /** Beats, at this file's one tempo. */
  beats: number;
}

export interface CardSound {
  /** MIDI the semitones below are counted from. */
  rootMidi: number;
  /**
   * The orienting chord, as semitones from `rootMidi` — or null when
   * the card names no key. See the allowed-to-differ list.
   */
  orient: readonly number[] | null;
  /** What the card is about. */
  steps: readonly SoundStep[];
  /**
   * A note held under the whole of `steps`, as semitones from
   * `rootMidi`. Absent everywhere but the mode cards — see entry 6 of
   * the allowed-to-differ list.
   */
  pedal?: number;
}

/**
 * Beats per step and the tempo they are counted at.
 *
 * SLOW, AND THE SAME SLOW `degreeAudio` ALREADY USES. The point is to
 * place a sound against a reference, not to hear a phrase played well.
 */
export const CARD_AUDIO_BPM = 60;
const STEP_BEATS = 1;
/** A chord wants longer than a single note to be heard as a chord. */
const CHORD_BEATS = 2;

/** Where a card with no key sounds. `degreeAudio`'s own home, kept so
 *  Number System Math is not transposed by being shared. */
const KEYLESS_MIDI = 60;

/** Semitones above the tonic, per scale degree — including the
 *  extensions the enharmonic interval cards name. */
const SEMI_BY_DEGREE: Readonly<Record<string, number>> = {
  '1': 0, 'b2': 1, '2': 2, '#2': 3, 'b3': 3, '3': 4, 'b4': 4, '4': 5,
  '#4': 6, 'b5': 6, '5': 7, '#5': 8, 'b6': 8, '6': 9, 'bb7': 9, 'b7': 10,
  '7': 11, 'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18, 'b13': 20,
  '13': 21,
};

/** Chords, as semitones above their own root. */
const MAJ: readonly number[] = [0, 4, 7];
const MIN: readonly number[] = [0, 3, 7];
const MAJ7: readonly number[] = [0, 4, 7, 11];
const MIN7: readonly number[] = [0, 3, 7, 10];
const DOM7: readonly number[] = [0, 4, 7, 10];

/** A chord built on a degree of the key, as semitones from the key. */
function on(degree: string, chord: readonly number[]): SoundStep {
  const root = SEMI_BY_DEGREE[degree] ?? 0;
  return { semitones: chord.map(i => root + i), beats: CHORD_BEATS };
}

/** One note, as semitones from the key. */
function note(semitones: number): SoundStep {
  return { semitones: [semitones], beats: STEP_BEATS };
}

/** 1, ♭3, 4, 5, ♭7 and 1, 2, 3, 5, 6 — the two pentatonic shapes, in
 *  semitones. Held here rather than read from `pentatonics.ts`, whose
 *  tables are (letter steps, semitones) pairs for SPELLING; sound has
 *  no letters. */
const MINOR_PENT_SEMIS: readonly number[] = [0, 3, 5, 7, 10];
const MAJOR_PENT_SEMIS: readonly number[] = [0, 2, 4, 7, 9];

/** Semitones above the tonic, per degree of the major scale. */
const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/**
 * A mode, as semitones above ITS OWN root: seven notes and the octave.
 *
 * ROTATED OUT OF THE MAJOR SCALE rather than listed. Seven hand-written
 * rows would be seven chances to mistype a mode, and the whole claim the
 * category makes is that they ARE the major scale started somewhere
 * else — a table would state that claim twice and could disagree with
 * itself.
 */
function modeSemitones(startingDegree: number): readonly number[] | null {
  const from = MAJOR_SCALE[startingDegree - 1];
  if (from === undefined) return null;
  const scale = MAJOR_SCALE.map(
    (_, i) => ((MAJOR_SCALE[(startingDegree - 1 + i) % 7] - from) % 12 + 12) % 12,
  );
  // THE OCTAVE IS THE EIGHTH NOTE, not a flourish. A mode heard without
  // it ends in mid-air on the ♭7 or the 7, which is the one note that
  // most tells the modes apart — and landing back on the root is what
  // makes the ear hear the whole thing as one scale.
  return [...scale, 12];
}

/** Whether a mode's own third is major or minor — which decides the
 *  chord it orients on. Locrian's third is minor, and its diminished
 *  fifth is not what a one-chord orientation is for. */
function modeTriad(semitones: readonly number[]): readonly number[] {
  return semitones[2] === 4 ? MAJ : MIN;
}

type Axis = Readonly<Record<string, string | number>> | undefined;

function str(v: string | number | undefined): string | undefined {
  return v === undefined ? undefined : String(v);
}

function num(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** The pitch class an enharmonic NOTE spelling names — "F#", "Cb". */
function noteSemitones(name: string): number | undefined {
  const LETTER: Readonly<Record<string, number>> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  const base = LETTER[name[0]?.toUpperCase() ?? ''];
  if (base === undefined) return undefined;
  let semis = base;
  for (const ch of name.slice(1)) {
    if (ch === '#' || ch === '♯') semis += 1;
    else if (ch === 'b' || ch === '♭') semis -= 1;
    else return undefined;
  }
  return ((semis % 12) + 12) % 12;
}

/**
 * The five notes of a pentatonic, ascending from its root.
 *
 * Which five depends on the card's own claim: a minor card is the
 * minor shape, a major card the major one — and the RELATIVE card is
 * the major shape, because its root is a major root and its whole point
 * is that the two shapes are one set of notes.
 */
function pentatonicSemis(shape: string | undefined): readonly number[] {
  return shape === 'minor' ? MINOR_PENT_SEMIS : MAJOR_PENT_SEMIS;
}

/**
 * What one card sounds like, or null when it has not said enough to
 * make a sound out of.
 */
export function cardSound(card: Flashcard): CardSound | null {
  const axis = (card as Flashcard & { axis?: Axis }).axis;
  const key = str(axis?.key);
  const keyed = (steps: readonly SoundStep[], orientChord = MAJ): CardSound | null =>
    key === undefined || steps.length === 0
      ? null
      : { rootMidi: keyToRootMidi(key), orient: orientChord, steps };

  switch (card.category) {
    // --- The two that already had a play control ---------------------

    case 'scale-degree-math': {
      // NO KEY, BY CONSTRUCTION — "in any major key". Home is middle C
      // and the material is where you start and where you land, which
      // is what `degreeAudio` has always played.
      const from = Number(axis?.degree);
      const movement = str(axis?.movement);
      const landing = movementLanding(from, movement);
      if (landing === null) return null;
      return {
        rootMidi: KEYLESS_MIDI,
        orient: MAJ,
        steps: [note(landing.start), note(landing.land)],
      };
    }

    case 'degree-notes': {
      // THE NOTE, AND ONLY THE NOTE. It used to sound the key's root
      // and then the note; the orienting CHORD says the same thing
      // better, and a root struck twice in a row is a root struck
      // twice in a row.
      const semis = DEGREE_BY_ID.get(String(axis?.degree))?.semitones;
      return semis === undefined ? null : keyed([note(semis)]);
    }

    // --- The families ruling 33 gave a voice to ----------------------

    case 'slash-chords': {
      // THE CHORD WITH THE NAMED BASS UNDER IT, which is the whole
      // notation: G/B is not a G, it is a G with a B in the bass, and
      // the bass is what a reader is being asked to hear.
      const shape = SLASH_SHAPES.find(s => s.id === str(axis?.shape));
      if (shape === undefined) return null;
      const chordRoot = SEMI_BY_DEGREE[shape.chord] ?? 0;
      const triad = shape.quality === 'm' ? MIN : MAJ;
      const bass = (SEMI_BY_DEGREE[shape.bass] ?? 0) - 12;
      return keyed([{
        semitones: [bass, ...triad.map(i => chordRoot + i)],
        beats: CHORD_BEATS,
      }]);
    }

    case 'functional-harmony': {
      // THE CHORDS THE CARD'S OWN EXPLANATION NAMES, in its order.
      // 5 of 5 and 5 of 6 are each a two-chord move — the secondary
      // dominant and what it points at — and playing the dominant
      // alone would leave out the half that makes it secondary.
      switch (str(axis?.shape)) {
        case 'ii-V-I':
          return keyed([on('2', MIN7), on('5', DOM7), on('1', MAJ7)]);
        case 'V/V':
          return keyed([on('2', DOM7), on('5', DOM7)]);
        case 'V/vi':
          return keyed([on('3', DOM7), on('6', MIN)]);
        default:
          return null;
      }
    }

    case 'progressions':
      return str(axis?.shape) === '1-5-6-4'
        ? keyed([on('1', MAJ), on('5', MAJ), on('6', MIN), on('4', MAJ)])
        : null;

    case 'pentatonic-scales': {
      // THE FIVE NOTES ASCENDING, over the root's own chord — minor
      // for a minor card, because the tonic chord of a minor
      // pentatonic's key is a minor one.
      const root = str(axis?.root);
      if (root === undefined) return null;
      const shape = str(axis?.shape);
      return {
        rootMidi: keyToRootMidi(root),
        orient: shape === 'minor' ? MIN : MAJ,
        steps: pentatonicSemis(shape).map(note),
      };
    }

    case 'key-signatures': {
      // HOME, THEN THE MINOR IT IS RELATED TO. The relative sits on
      // the 6; the parallel sits on the same root. Two chords is the
      // whole card.
      const relation = str(axis?.relation);
      if (relation === 'relative') return keyed([on('6', MIN)]);
      if (relation === 'parallel') return keyed([on('1', MIN)]);
      return null;
    }

    case 'enharmonic-equivalents': {
      // NO ORIENTING CHORD. The card names no key, and "one sound is
      // the point" — see the allowed-to-differ list.
      if (str(axis?.kind) === 'note') {
        const semis = noteSemitones(str(axis?.spelling) ?? '');
        return semis === undefined
          ? null
          : { rootMidi: KEYLESS_MIDI, orient: null, steps: [note(semis)] };
      }
      if (str(axis?.kind) === 'interval') {
        const semis = SEMI_BY_DEGREE[str(axis?.spelling) ?? ''];
        return semis === undefined
          ? null
          : { rootMidi: KEYLESS_MIDI, orient: null, steps: [note(0), note(semis)] };
      }
      return null;
    }

    case 'modes': {
      // THE MODE'S OWN ROOT IS HOME, NOT THE PARENT KEY'S (ruling 38).
      // B♭ major, then B♭ C D E♭ F G A♭ B♭ over a held B♭ — play E♭
      // instead and the card teaches that B♭ Mixolydian is E♭ major
      // with an odd starting note, which is exactly the
      // misunderstanding the category exists to correct.
      const degree = Number(axis?.degree);
      const semitones = modeSemitones(degree);
      if (key === undefined || semitones === null) return null;
      const modeRoot = keyToRootMidi(key) + MAJOR_SCALE[degree - 1];
      return {
        // Folded back into the register `keyToRootMidi` works in, so a
        // mode on the 7 does not sound an octave above one on the 1.
        rootMidi: 48 + (modeRoot % 12),
        orient: modeTriad(semitones),
        steps: semitones.map(note),
        // UNDERNEATH, an octave down. The scale walks away from its own
        // tonic and the drone is what keeps the ear on it.
        pedal: -12,
      };
    }

    case 'intervals': {
      // THE TWO NOTES, ASCENDING, NOTHING IN FRONT (ruling 38). The
      // card names two notes and asks what the distance between them
      // is; a key would answer a question it did not ask, and there is
      // no key in the card to take one from.
      const from = str(axis?.from);
      const semitones = num(axis?.semitones);
      if (from === undefined || semitones === undefined) return null;
      const root = keyToRootMidi(from);
      return { rootMidi: root, orient: null, steps: [note(0), note(semitones)] };
    }

    // NOTHING FOR THE REST, AND THAT IS THE HONEST ANSWER. Diatonic
    // Chord Qualities, Chord Construction and Ear-Theory Crossover
    // carry no coordinates at all — a prose card about how a chord
    // feels has no key and no notes — so they are named in the report
    // rather than given a sound nobody ruled on.
    default:
      return null;
  }
}

/**
 * Where a Number System Math card starts and lands, in semitones.
 *
 * Derived from the movement's own quality and direction rather than
 * from the answer text — the same values `degreeAudio` computed from
 * the card's arguments, taken from the coordinate instead so one
 * function covers every family.
 */
function movementLanding(
  fromDegree: number,
  movement: string | undefined,
): { start: number; land: number } | null {
  if (!Number.isFinite(fromDegree) || movement === undefined) return null;
  const [direction, qualityId] = movement.split(':') as [Direction, string];
  const quality = INTERVAL_QUALITIES.find(q => q.id === qualityId);
  if (quality === undefined) return null;
  const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
  const start = MAJOR_SEMITONES[fromDegree - 1];
  if (start === undefined) return null;
  const sign = direction === 'up' ? 1 : -1;
  return { start, land: start + sign * quality.semitones };
}

/** Whether a card can be heard at all. What the drill asks before it
 *  draws a play button. */
export function hasSound(card: Flashcard): boolean {
  return cardSound(card) !== null;
}
