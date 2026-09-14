/**
 * What a card wants BUILT, rather than picked from four options.
 *
 * =====================================================================
 * READ OFF `axis`, NEVER OFF THE QUESTION TEXT.
 *
 * The rule `facets.ts` and `cardAudio.ts` both state, followed here for
 * the same reason: every generator holds these values a moment before
 * it writes the card, and parsing a prompt back into its parts is how a
 * ♭ went missing once already. A card with no `axis` has not said what
 * it is about and gets the ordinary four buttons.
 *
 * =====================================================================
 * AND DERIVED FROM THE SAME LISTS THE CARD WAS WRITTEN FROM.
 *
 * `progressionVoicing`, `SLASH_SHAPES`, `majorPentatonic` and
 * `minorPentatonic` are what the questions and answers were generated
 * out of. Restating "a 2 5 1 is 2m7 5(7) 1maj7" here would be a second
 * copy that could disagree with the card it is grading — which is a
 * card marked wrong for being right.
 *
 * =====================================================================
 * A TARGET IS NOT A GRADE. Nothing here compares anything; it says what
 * the right answer is. `grade.ts` does the comparing, and the split is
 * what lets both halves be read on their own.
 * =====================================================================
 */
import { pitchClassOf } from '../../../lib/spelling';
import type { QualityId } from '../../../lib/builtAnswers/chordShapes';
import { CHORD_INTERVALS } from '../../../lib/builtAnswers/chordShapes';
import type { Flashcard } from '../catalog';
import {
  SLASH_SHAPES, degreeAsciiOrNull, noteLabel, progressionVariation,
  progressionVoicing,
} from '../catalogExpansions';
import { majorPentatonic, minorPentatonic, relativeMinorRoot } from '../pentatonics';
import { SPELL_SCALES, spellChord, type SpellScale } from '../spellChordCards';

/** One chord of a progression, as the card wants it. */
export interface TargetChord {
  /** The degree of the key it is built on — '2', '5', 'b7'. */
  degree: string;
  rootPc: number;
  /** The quality the card's answer expects. */
  quality: QualityId;
  /** The chord as the card's own answer names it — "Cm7". */
  name: string;
}

export type BuiltTarget =
  | {
    kind: 'progression';
    /** The key the progression is in, for the orienting tonic. */
    keyPc: number;
    keyName: string;
    chords: TargetChord[];
    /**
     * The other version of this progression, where it has one.
     *
     * NOT PART OF THE ANSWER. The card grades the roots and families of
     * the chords above; this is something the reveal can play beside
     * them so a reader can hear what the 6 does when it is a dominant.
     */
    variation?: { index: number; quality: QualityId; label: string };
  }
  | {
    kind: 'scale';
    /** The root the scale is named from. */
    rootPc: number;
    rootName: string;
    /** The five or seven pitch classes. */
    pcs: number[];
    /** Whether the FIRST tap has to be the root — the lick wording. */
    rootFirst: boolean;
    /** The key the card is asked in, which is what the drone holds. */
    dronePc: number;
    /** The home chord of that key. */
    homePcs: number[];
  }
  | {
    kind: 'root';
    rootPc: number;
    rootName: string;
    /** Whether the answer names a minor key — decides which scale the
     *  reveal lights and which chord the player sounds. */
    minor: boolean;
    /** The whole scale of the answer's key, lit on reveal. */
    pcs: number[];
    homePcs: number[];
  }
  | {
    kind: 'signature';
    count: number;
    direction: 'sharps' | 'flats';
    /**
     * The key the question is about, and its scale.
     *
     * THE ANSWER IS A NUMBER AND THE REVEAL IS A KEY. "The key of G
     * major has _____ sharps" is graded on the count, but what a
     * reader should be looking at afterwards is the scale with its one
     * sharp in it — the prototype's own rule for the sibling card, in
     * its words: "the flats in it are the black keys you can count".
     */
    keyPc: number;
    keyName: string;
    pcs: number[];
    homePcs: number[];
  }
  | {
    kind: 'slash';
    shapeId: string;
    keyPc: number;
    keyName: string;
    chordRootPc: number;
    quality: QualityId;
    bassPc: number;
    /** The chord over the note, as the card's answer names it. */
    name: string;
  }
  | {
    /**
     * Spell the chord in a key (Silas, 14 Sep 2026): tap its notes.
     * Graded on pitch class, any octave, nothing extra.
     */
    kind: 'spell';
    keyPc: number;
    keyName: string;
    rootPc: number;
    quality: QualityId;
    /** "Eø" — the chord as the card's answer names it. */
    name: string;
    pcs: number[];
    /** The chord placed on the board, for the reveal and the player. */
    voicing: number[];
  };

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const scaleOf = (rootPc: number, steps: ReadonlyArray<number>) =>
  steps.map(s => (rootPc + s) % 12);

const str = (v: string | number | undefined): string | undefined =>
  v === undefined ? undefined : String(v);

/** The pitch class of a degree of a key, or null where the degree
 *  cannot be spelled from that root. */
function degreePc(root: string, degree: string): number | null {
  const ascii = degreeAsciiOrNull(root, degree);
  return ascii === null ? null : pitchClassOf(ascii);
}

/** A triad on the 1, for the orienting chord. */
const triadOn = (rootPc: number, minor: boolean) =>
  CHORD_INTERVALS[minor ? 'm' : ''].map(t => (rootPc + t) % 12);

/**
 * What this card wants built, or null where it stays multiple choice.
 *
 * NULL IS THE DEFAULT AND MOST CARDS TAKE IT. `renderAnswerSurface`
 * returning null leaves the four buttons, which is what every family
 * outside these six still uses.
 */
export function builtTargetFor(card: Flashcard): BuiltTarget | null {
  const axis = card.axis;
  if (axis === undefined) return null;
  const key = str(axis.key);
  const shape = str(axis.shape);

  switch (card.category) {
    case 'progressions': {
      if (key === undefined || shape === undefined) return null;
      const voicing = progressionVoicing(shape);
      if (voicing === null) return null;
      const keyPc = pitchClassOf(key);
      if (keyPc === null) return null;
      const chords: TargetChord[] = [];
      for (const [degree, quality] of voicing) {
        const rootPc = degreePc(key, degree);
        const ascii = degreeAsciiOrNull(key, degree);
        // A degree this key cannot spell means the card cannot be
        // built; it keeps its buttons rather than grading against a
        // chord nobody can name.
        if (rootPc === null || ascii === null) return null;
        if (!(quality in CHORD_INTERVALS)) return null;
        chords.push({
          degree,
          rootPc,
          quality: quality as QualityId,
          name: `${noteLabel(ascii)}${quality}`,
        });
      }
      const other = progressionVariation(shape);
      // A version naming a quality this deck cannot build, or a chord
      // the progression does not have, is not offered — the same
      // refusal the chords themselves take above.
      const usable = other !== undefined && other !== null
        && other.quality in CHORD_INTERVALS && other.index < chords.length;
      return {
        kind: 'progression',
        keyPc,
        keyName: noteLabel(key),
        chords,
        ...(usable
          ? {
            variation: {
              index: other.index,
              quality: other.quality as QualityId,
              label: other.label,
            },
          }
          : {}),
      };
    }

    case 'slash-chords': {
      if (key === undefined || shape === undefined) return null;
      const slash = SLASH_SHAPES.find(s => s.id === shape);
      if (slash === undefined) return null;
      const keyPc = pitchClassOf(key);
      const chordRootPc = degreePc(key, slash.chord);
      const bassPc = degreePc(key, slash.bass);
      const chordAscii = degreeAsciiOrNull(key, slash.chord);
      const bassAscii = degreeAsciiOrNull(key, slash.bass);
      if (keyPc === null || chordRootPc === null || bassPc === null
        || chordAscii === null || bassAscii === null) return null;
      if (!(slash.quality in CHORD_INTERVALS)) return null;
      return {
        kind: 'slash',
        shapeId: slash.id,
        keyPc,
        keyName: noteLabel(key),
        chordRootPc,
        quality: slash.quality as QualityId,
        bassPc,
        name: `${noteLabel(chordAscii)}${slash.quality}/${noteLabel(bassAscii)}`,
      };
    }

    case 'pentatonic-scales': {
      const root = str(axis.root);
      if (root === undefined || shape === undefined) return null;
      /**
       * THE LICK CARD IS ASKED IN A MAJOR KEY AND ANSWERED IN ITS
       * RELATIVE MINOR. "You're in the key of A♭ major. Which minor
       * pentatonic fits?" answers F minor pentatonic — so the scale is
       * F's and the DRONE is A♭'s, which is the prototype's own rule
       * ("the scale sitting on the key, never the root of the scale").
       */
      const scaleRoot = shape === 'lick' ? relativeMinorRoot(root) : root;
      if (scaleRoot === null) return null;
      const notes = shape === 'major'
        ? majorPentatonic(scaleRoot)
        : minorPentatonic(scaleRoot);
      if (notes === null) return null;
      const pcs: number[] = [];
      for (const n of notes) {
        const pc = pitchClassOf(n);
        if (pc === null) return null;
        pcs.push(pc);
      }
      const rootPc = pitchClassOf(scaleRoot);
      const keyPc = pitchClassOf(root);
      if (rootPc === null || keyPc === null) return null;
      return {
        kind: 'scale',
        rootPc,
        rootName: noteLabel(scaleRoot),
        pcs,
        rootFirst: shape === 'lick',
        dronePc: keyPc,
        // The lick card is asked in a major key; the notes cards name
        // the scale's own root, and a minor pentatonic sits on a minor
        // chord.
        homePcs: triadOn(keyPc, shape === 'minor'),
      };
    }

    case 'key-signatures': {
      const ask = str(axis.ask);
      if (key === undefined || ask === undefined) return null;
      const keyPc = pitchClassOf(key);
      if (keyPc === null) return null;

      /**
       * THE COUNT CARD IS THE ONE THE PROTOTYPE DOES NOT DRAW.
       *
       * "The key of G major has _____ sharps" answers with a number and
       * a direction, so it gets the count picker the brief describes;
       * the prototype's Key signature tab is the other shape, "The
       * major key with 3 flats is _____", which answers with a key.
       * They are two cards, not a disagreement.
       */
      if (ask === 'count') {
        const sharps = SHARP_COUNT[keyPc];
        const flats = FLAT_COUNT[key];
        const shown = {
          keyPc,
          keyName: noteLabel(key),
          pcs: scaleOf(keyPc, MAJOR),
          homePcs: triadOn(keyPc, false),
        };
        if (flats !== undefined) {
          return { kind: 'signature', count: flats, direction: 'flats', ...shown };
        }
        if (sharps !== undefined) {
          return { kind: 'signature', count: sharps, direction: 'sharps', ...shown };
        }
        return null;
      }

      // The three that answer with a key: the relative pair either way,
      // and the count-to-key twins.
      const minor = ask === 'relative' || ask === 'minor key';
      const answerRoot = ask === 'relative'
        // The relative minor sits on the 6 of the major scale.
        ? degreeAsciiOrNull(key, '6')
        : ask === 'relative major'
          // Asked FROM the minor: the card's key is the major, and the
          // question names its 6.
          ? key
          : ask === 'major key'
            ? key
            : ask === 'minor key'
              ? degreeAsciiOrNull(key, '6')
              : null;
      if (answerRoot === null) return null;
      const rootPc = pitchClassOf(answerRoot);
      if (rootPc === null) return null;
      return {
        kind: 'root',
        rootPc,
        rootName: noteLabel(answerRoot),
        minor,
        pcs: scaleOf(rootPc, minor ? NATURAL_MINOR : MAJOR),
        homePcs: triadOn(rootPc, minor),
      };
    }

    case 'chord-construction': {
      // SPELL THE CHORD. The hand-written fact cards carry no axis and
      // keep their four buttons.
      const degree = str(axis.degree);
      const scale = str(axis.scale);
      if (key === undefined || degree === undefined || scale === undefined) return null;
      if (!(SPELL_SCALES as readonly string[]).includes(scale)) return null;
      const chord = spellChord(key, degree, scale as SpellScale);
      const keyPc = pitchClassOf(key);
      const rootPc = pitchClassOf(chord.rootAscii);
      if (keyPc === null || rootPc === null) return null;
      // AROUND MIDDLE C: the root in the octave from G below it.
      const bottom = 60 + rootPc - (rootPc > 6 ? 12 : 0);
      return {
        kind: 'spell',
        keyPc,
        keyName: noteLabel(key),
        rootPc,
        quality: chord.quality,
        name: chord.symbol,
        pcs: chord.pcs,
        voicing: CHORD_INTERVALS[chord.quality].map(t => bottom + t),
      };
    }

    default:
      return null;
  }
}

/**
 * How many sharps or flats each key carries.
 *
 * BY KEY NAME FOR THE FLAT SIDE and by pitch class for the sharp,
 * because F♯ major and G♭ major are one pitch class and two answers —
 * six sharps and six flats. The flat table is consulted first for that
 * reason, so G♭ is never reported as six sharps.
 */
const FLAT_COUNT: Readonly<Record<string, number>> = {
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6,
};
const SHARP_COUNT: Readonly<Record<number, number>> = {
  0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6,
};
