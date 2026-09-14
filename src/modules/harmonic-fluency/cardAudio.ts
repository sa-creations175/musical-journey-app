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
 * 7. CHORDS UNDER THE MATERIAL (Modal Improvisation). Entry 6 is one
 *    NOTE held under the whole of `steps`; this is a lane of CHORDS,
 *    each held under the stretch of the line above it. The family is
 *    about which notes fit over a chord, so the chord has to be
 *    sounding while they go past — a run played after the chord has
 *    stopped is a different question, and one the reader can answer
 *    from the written scale name alone.
 * 8. THE TEMPO (Modal Improvisation). Everything else here places one
 *    sound against a reference and wants to be slow. This is a phrase
 *    with a shape — four bars, home out and back — and it was walked
 *    and signed off at the prototype's 72 rather than at 60. So
 *    `CardSound.bpm` overrides, and the default stays what every other
 *    family already sounds at.
 *
 * Not on that list, and therefore shared: the speed setting, the
 * tonic-context preference, the button, its label, stopping on
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
import {
  SLASH_SHAPES, degreeAscii, noteLabel, progressionVoicing,
} from './catalogExpansions';
import {
  MINOR_TARGETS, MODAL_CHORDS, modalAnswerScale, modalCardText, type ModalChord,
} from './modalImprovisation';
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

/**
 * One chip of the Hear it strip: what one stretch of the sound is called.
 *
 * =====================================================================
 * THE STRIP SAYS WHAT IT PLAYS (Silas, 13 Sep 2026): "it doesn't tell you
 * what you're hearing at all. That's the gap." So every stretch of a
 * card's sound is named before it plays and lit while it does.
 *
 * READ OFF THE SAME DATA THE SOUND IS BUILT FROM, never a second
 * description: Modal Improvisation writes its bars in the same loop that
 * writes its phrase (below); every other family's are read off `steps`
 * by `soundBars`.
 * =====================================================================
 */
export interface SoundBar {
  /** Large, in mono: the chord ("E7"), or the note or notes. */
  name: string;
  /** Small, under it: the scale ("A melodic minor, from E"), or empty. */
  detail: string;
  /** Whether it carries a note the card's key does not hold. */
  outside: boolean;
  /** The orienting chord, or a stretch of `steps`. */
  lane: 'orient' | 'steps';
  /** Which steps it is, `from` inclusive, `to` exclusive. */
  from: number;
  to: number;
  /** How each of those steps' notes is spelled, for the now line. */
  noteNames: readonly string[];
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
  /**
   * Chords sounded UNDER `steps`, in a lane of their own — same root,
   * same clock, started at the same instant, so entry N here is
   * underneath whatever of the line above it its beats reach.
   *
   * A SECOND LANE RATHER THAN A FIELD ON EACH STEP. A chord that lasts
   * eight notes of a run would otherwise have to be written onto the
   * first of them and read forward, which makes every step's meaning
   * depend on the one before it. Two lists that start together and
   * each carry their own beats cannot drift apart in that way — and a
   * rest is a step with nothing in it, which is what lets the lanes
   * stay level across a gap.
   *
   * `pedal` is the same idea with one note and no rhythm, kept as it
   * is because the mode cards' drone is not a chord and is not
   * re-struck. Absent everywhere but Modal Improvisation — see entry 7
   * of the allowed-to-differ list.
   */
  under?: readonly SoundStep[];
  /**
   * The tempo this card's own material is counted at, when it is not
   * the deck's. See entry 8 of the allowed-to-differ list.
   */
  bpm?: number;
  /**
   * The key the card names, as a pitch class and in words ("C major"):
   * what the Hear it strip marks a note as outside of. Absent where the
   * card names no key.
   */
  keyPc?: number;
  keyName?: string;
  /** The Hear it strip's bars, where the family writes them itself —
   *  Modal Improvisation. See `SoundBar`. */
  bars?: readonly SoundBar[];
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

/** The suffix a generated progression writes, as a chord. The five the
 *  family uses and no more — see `PROGRESSION_SHAPES`. */
const CHORD_BY_QUALITY: Readonly<Record<string, readonly number[]>> = {
  '': MAJ, m: MIN, maj7: MAJ7, m7: MIN7, '7': DOM7,
};

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

/**
 * =====================================================================
 * MODAL IMPROVISATION'S PHRASE, AS THE PROTOTYPE PLAYS IT.
 *
 * Four segments for a borrowed chord and three for an in-key one, each
 * of them a chord with a SCALE RUN over it — never a composed riff.
 * Home and its scale, the card's chord and a run from the answer scale
 * starting on that chord's own root, where it lands and its own scale,
 * home again.
 *
 * THE REGISTER RULE IS THE PROTOTYPE'S AND IS NOT TIDIED. A run sits
 * an octave above middle C when its chord's root is F or below and an
 * octave lower when it is above — so a phrase never climbs away from
 * the hand across four segments. It puts the 5 chord's run underneath
 * home's, which looks odd written down and is what was walked and
 * signed off.
 *
 * A MELODIC MINOR POOL OVER THE DOMINANT, AND A DIATONIC ONE WHERE IT
 * LANDS. A7 into Dm in C draws on D melodic minor — C major with the
 * A7's own third raised — but the Dm it lands on is the 2 of C and
 * takes the notes of C. Two different scales in two neighbouring bars
 * is the fact the family teaches, so the phrase has to play both.
 * =====================================================================
 */
const MEL_MINOR: readonly number[] = [0, 2, 3, 5, 7, 9, 11];

/** The tempo the prototype was signed off at. Entry 8 of the
 *  allowed-to-differ list. */
export const MODAL_IMPROV_BPM = 72;

/** Half a beat a note, so a seven-note scale and its octave fill the
 *  bar the chord underneath is held for. */
const RUN_NOTE_BEATS = 0.5;
/** The breath between one segment and the next — the prototype's own
 *  `beat * 0.3`, carried in both lanes so they stay level. */
const SEGMENT_GAP_BEATS = 0.3;

/** A scale rotated to start on its own Nth degree — the mode of it.
 *  The prototype's `rotate`, which is also `modeSemitones`' argument
 *  made general. */
function rotated(scale: readonly number[], from: number): number[] {
  return scale.slice(from).map(x => x - scale[from])
    .concat(scale.slice(0, from).map(x => x + 12 - scale[from]));
}

/** One chord and the run over it, in the phrase's own terms. */
interface ModalSegment {
  /** Pitch class of the chord's root, 0-11. */
  rootPc: number;
  /** The suffix it carries — '', 'm' or '7'. */
  quality: string;
  /** The scale the run walks, as semitones above that root. */
  scale: readonly number[];
}

/**
 * The chord voicing the prototype plays: the root, its octave, the
 * third above that and the fifth on top, with the seventh added for a
 * dominant.
 */
function modalVoicing(quality: string): number[] {
  const third = quality === 'm' ? 3 : 4;
  const chord = [0, 12, 12 + third, 19];
  return quality === '7' ? [...chord, 22] : chord;
}

/** The four (or three) segments of one card's phrase. */
function modalSegments(keyPc: number, chord: ModalChord): ModalSegment[] {
  const home: ModalSegment = { rootPc: keyPc, quality: '', scale: MAJOR_SCALE };
  if (chord.kind === 'in') {
    const from = Number(chord.degree) - 1;
    return [
      home,
      {
        rootPc: (keyPc + MAJOR_SCALE[from]) % 12,
        quality: chord.quality ?? '',
        scale: rotated(MAJOR_SCALE, from),
      },
      home,
    ];
  }
  const from = Number(chord.target) - 1;
  const targetPc = (keyPc + MAJOR_SCALE[from]) % 12;
  const minor = MINOR_TARGETS.has(chord.target!);
  const answerScale = minor ? MEL_MINOR : MAJOR_SCALE;
  return [
    home,
    // The dominant, over the fifth mode of the scale it points to.
    {
      rootPc: (targetPc + 7) % 12,
      quality: '7',
      scale: rotated(answerScale, 4),
    },
    // Where it lands, over the key's own mode on that degree.
    {
      rootPc: targetPc,
      quality: minor ? 'm' : '',
      scale: minor ? rotated(MAJOR_SCALE, from) : MAJOR_SCALE,
    },
    home,
  ];
}

/** The degrees of a major scale, as the card spells them. Melodic minor's
 *  come from `modalAnswerScale`, which already spells them. */
const MAJOR_DEGREE_NAMES: readonly string[] = ['1', '2', '3', '4', '5', '6', '7'];

/** The key's own mode on each degree, by the name a player uses. */
const MODE_ON_DEGREE: readonly string[] = [
  'major', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'natural minor', 'Locrian',
];

/**
 * What one segment of a Modal Improvisation phrase is called: the chord,
 * the scale it runs and where from, and each note of the run spelled.
 *
 * THE SAME SEGMENTS `modalSegments` BUILDS, in the same order, spelled
 * the way the card spells them (`degreeAscii`, `modalAnswerScale`,
 * `modalCardText`), so the strip cannot name a note the phrase does not
 * play. "C · C major, from C", "E7 · A melodic minor, from E",
 * "Am · A natural minor, from A", "C · C major, home".
 */
function modalBarWords(
  key: string, chord: ModalChord, index: number, count: number,
): { name: string; detail: string; noteNames: readonly string[] } {
  const home = noteLabel(key);
  const run = (spellFrom: string, degrees: readonly string[], rotateBy: number) => {
    const names = degrees.map(d => noteLabel(degreeAscii(spellFrom, d)));
    const turned = [...names.slice(rotateBy), ...names.slice(0, rotateBy)];
    return [...turned, turned[0]];
  };
  if (index === 0 || index === count - 1) {
    return {
      name: home,
      detail: index === 0 ? `${home} major, from ${home}` : `${home} major, home`,
      noteNames: run(key, MAJOR_DEGREE_NAMES, 0),
    };
  }
  const text = modalCardText(key, chord);
  if (chord.kind === 'in') {
    const from = Number(chord.degree) - 1;
    const rootName = text.chordName.slice(0, text.chordName.length - (chord.quality ?? '').length);
    return {
      name: text.chordName,
      detail: `${rootName} ${MODE_ON_DEGREE[from]}, from ${rootName}`,
      noteNames: run(key, MAJOR_DEGREE_NAMES, from),
    };
  }
  const from = Number(chord.target) - 1;
  const target = noteLabel(degreeAscii(key, chord.target!));
  const minor = MINOR_TARGETS.has(chord.target!);
  if (index === 1) {
    const rootName = text.chordName.replace(/7$/, '');
    const answer = modalAnswerScale(key, chord).map(n => n.note);
    const turned = [...answer.slice(4), ...answer.slice(0, 4)];
    return {
      name: text.chordName,
      detail: `${target} ${minor ? 'melodic minor' : 'major'}, from ${rootName}`,
      noteNames: [...turned, turned[0]],
    };
  }
  return minor
    ? {
      name: `${target}m`,
      detail: `${target} ${MODE_ON_DEGREE[from]}, from ${target}`,
      noteNames: run(key, MAJOR_DEGREE_NAMES, from),
    }
    : {
      name: target,
      detail: `${target} major, from ${target}`,
      noteNames: run(degreeAscii(key, chord.target!), MAJOR_DEGREE_NAMES, 0),
    };
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
      : {
        rootMidi: keyToRootMidi(key), orient: orientChord, steps,
        keyPc: keyToRootMidi(key) % 12, keyName: `${noteLabel(key)} major`,
      };

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
      // `case 'ii-V-I'` WAS HERE. The 2-5-1 lives once, in Progression
      // Vocabulary, and `progressionVoicing` plays it from the same
      // shape list the card's own text is written from.
      switch (str(axis?.shape)) {
        case 'V/V':
          return keyed([on('2', DOM7), on('5', DOM7)]);
        case 'V/vi':
          return keyed([on('3', DOM7), on('6', MIN)]);
        default:
          return null;
      }
    }

    case 'progressions': {
      // THE PROGRESSION'S OWN CHORDS, READ OFF THE GENERATOR'S LIST.
      // Eight named progressions across thirteen keys since commit 8,
      // and the degrees and qualities are written down once — in
      // `PROGRESSION_SHAPES`, beside the sentence each card says.
      // The twelve one-offs carry no shape and stay silent, which is
      // the allowed-to-differ list's own entry for them.
      const chords = progressionVoicing(str(axis?.shape));
      return chords === null
        ? null
        : keyed(chords.map(([d, q]) => on(d, CHORD_BY_QUALITY[q])));
    }

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
      // THE SAME PAIR THE OTHER WAY ROUND. "The relative major of F
      // minor" starts at home in F minor and lands on A♭ — so the
      // minor is the orienting chord and the major is the material,
      // which is ruling 33's sentence read from the card's own side.
      if (str(axis?.ask) === 'relative major' && key !== undefined) {
        const minorRoot = 48 + ((keyToRootMidi(key) + 9) % 12);
        return {
          rootMidi: minorRoot,
          orient: MIN,
          // A minor third up from the minor root is the relative major.
          steps: [{ semitones: MAJ.map(i => i + 3), beats: CHORD_BEATS }],
        };
      }
      // THE COUNT AND COUNT-TO-KEY CARDS ARE SILENT, and that is a
      // statement. "G major has one sharp" is a fact about a written
      // signature; there is no sound that is the answer to it, and
      // ruling 33 named no material for one. Listed in the report
      // rather than invented.
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
        keyPc: keyToRootMidi(key) % 12,
        keyName: `${noteLabel(key)} major`,
      };
    }

    case 'modal-improvisation': {
      // NO ORIENTING CHORD, AND THAT IS NOT AN OMISSION. The phrase
      // OPENS at home with its scale — the orientation is the first
      // bar of the music rather than a reference in front of it — and
      // adding one would strike the tonic twice in a row, which is
      // what `degree-notes` above stopped doing for the same reason.
      const chord = MODAL_CHORDS.find(m => m.id === str(axis?.chord));
      if (key === undefined || chord === undefined) return null;
      const rootMidi = keyToRootMidi(key);
      const keyPc = rootMidi - 48;
      const steps: SoundStep[] = [];
      const under: SoundStep[] = [];
      const segments = modalSegments(keyPc, chord);
      const bars: SoundBar[] = [];
      segments.forEach((segment, i) => {
        const from = steps.length;
        // THE RUN, from the chord's root up an octave. The prototype's
        // register rule, kept: a chord rooted above F drops its run an
        // octave so the phrase stays under one hand.
        const base = segment.rootPc > 6 ? 60 : 72;
        const run = [...segment.scale, 12];
        for (const degree of run) {
          steps.push({
            semitones: [base + segment.rootPc + degree - rootMidi],
            beats: RUN_NOTE_BEATS,
          });
        }
        // THE CHORD, held under exactly that many beats, in its own
        // lane. Both lanes start together, so a bar's chord is
        // underneath a bar's notes without either list saying so.
        under.push({
          semitones: modalVoicing(segment.quality)
            .map(v => 48 + segment.rootPc + v - rootMidi),
          beats: run.length * RUN_NOTE_BEATS,
        });
        // THE BAR'S WORDS, from this same segment.
        bars.push({
          ...modalBarWords(key, chord, i, segments.length),
          outside: run.some(d => !MAJOR_SCALE.includes((((segment.rootPc + d - keyPc) % 12) + 12) % 12)),
          lane: 'steps',
          from,
          to: steps.length,
        });
        if (i < segments.length - 1) {
          const rest = { semitones: [], beats: SEGMENT_GAP_BEATS };
          steps.push(rest);
          under.push(rest);
        }
      });
      return {
        rootMidi, orient: null, steps, under, bpm: MODAL_IMPROV_BPM,
        keyPc, keyName: `${noteLabel(key)} major`, bars,
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
