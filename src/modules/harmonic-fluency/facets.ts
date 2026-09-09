/**
 * What a card is ABOUT, in words that mean the same thing on every
 * card in the deck.
 *
 * =====================================================================
 * THIS IS NOT `axis`, AND THE DIFFERENCE IS THE POINT.
 *
 * `axis` is a COORDINATE: where a card sits in its own category's
 * Progress Detail grid. It is per-category by design, and its field
 * names are load-bearing for that grid — `HARMONIC_FLUENCY_GRIDS` reads
 * them by name. Nothing here changes it.
 *
 * A FACET is a claim about the card that holds across the whole deck.
 * "This card is about the key of E♭" means the same thing whether it is
 * a named-note card, a mode card or a cadence card, and that is what
 * lets a reader ask for every card about E♭ regardless of which
 * category it lives in.
 *
 * =====================================================================
 * THE TWO COLLISIONS THIS ENDS.
 *
 * `axis.degree` MEANT TWO DIFFERENT THINGS. On Scale Degree Math it is
 * the degree you START on, in no key, with no note anywhere near it.
 * On Named Notes, Reverse Key Pivots and Mode Identification it is the
 * degree that RELATES a key and a note — 5 in "the 5 of E♭ is B♭", 5 in
 * "B♭ is the 5 of which key", 5 in "the mode of E♭ starting on B♭".
 * Those three are one fact asked three ways; the first is a different
 * fact. So the first is `fromDegree` and the other three are `degree`.
 *
 * `axis.shape` MEANT FOUR DIFFERENT THINGS — a cadence, a pentatonic
 * flavour, a named progression and a slash-chord's two degrees. Four
 * vocabularies under one word, which is a filter waiting to gather
 * cards that have nothing to do with each other. Each has its own name
 * here.
 *
 * =====================================================================
 * ONE NOTE ANCHOR, UNDER FOUR OLD NAMES.
 *
 * `axis.note` on tritone pairs, `axis.from` on intervals, `axis.root`
 * on pentatonics and `axis.spelling` on enharmonic notes are all the
 * same claim: the note this question is anchored on. One name here.
 *
 * =====================================================================
 * COMPUTED, NEVER STORED.
 *
 * Facets are derived when the catalog is built and exist only in
 * memory. Nothing is written to a row, no id moves, and there is no
 * migration — which is what makes this safe to ship ahead of every
 * decision still open about the restructure.
 *
 * =====================================================================
 * A CARD WITH NOTHING TO SAY CARRIES NOTHING.
 *
 * Diatonic Chord Qualities, Chord Construction and Ear-Theory Crossover
 * carry no coordinates today, and none are invented for them: a prose
 * card about how a chord feels has no key and no degree, and giving it
 * one to fill the column would make a filter claim it had found
 * something. They are named in the report as the gap they are.
 * =====================================================================
 */
import type { Flashcard } from './catalog';
import { DEGREE_BY_ID } from './chromaticDegrees';
import { LETTERS } from '../reading/pitch';
import { qualityByShape } from './scaleDegreeQuality';
import { movementId } from './scaleDegreeQualityCards';

/**
 * The facets a card may carry. Every one is optional, and every one
 * means exactly what its comment says on every card that has it.
 */
export interface CardFacets {
  // --- The three that hold across categories -------------------------

  /**
   * The named key this card is asked in — "in the key of E♭".
   *
   * The identity spelling, so F♯ and G♭ stay the two different keys the
   * rest of the app treats them as.
   */
  key?: string;

  /**
   * The note this question is anchored on.
   *
   * The subject, not the answer: the C in "tritone of C", the F in "the
   * interval from F to B", the root of a pentatonic scale, the spelling
   * being re-named in an enharmonic pair.
   */
  note?: string;

  /**
   * The chromatic degree that relates a key and a note.
   *
   * The same fact whichever of the three the card asks for — the note,
   * the key, or the mode name that degree produces.
   *
   * NOT a degree in the abstract. Scale Degree Math's starting degree
   * is `fromDegree`, and an enharmonic card comparing the NAMES ♯4 and
   * ♭5 carries neither, because it names no key and no note.
   */
  degree?: string;

  /**
   * How many semitones apart the two notes in this card are.
   *
   * Carried by any card whose subject is a distance, whether or not the
   * card says the number: a tritone card is six semitones because a
   * tritone is, not because it was written down.
   */
  semitones?: number;

  // --- The rest: one category each, named so nothing collides --------

  /** The degree a movement STARTS on, in no key. Scale Degree Math. */
  fromDegree?: number;

  /**
   * The distance itself — a direction and an interval quality, as
   * `movementId` names it.
   *
   * TWO FAMILIES, ONE VOCABULARY (ruling 27). Number System Math holds
   * it because a movement IS its card. Interval Identification holds it
   * because a card asking C up to G is asking about the same distance
   * the movement `up:P5` names — and until both said it the same way,
   * one Distance chip could not reach both. The interval family's is
   * derived from its own two notes: the LETTER count decides the
   * ordinal and the semitone count decides the quality, which is what
   * keeps F up to B an augmented 4th rather than a diminished 5th.
   */
  movement?: string;

  /** Which pentatonic claim — the major, the minor, or how they
   *  relate. Pentatonic Scales. */
  pentatonic?: string;

  /**
   * Which little progression — 2 5 1, 5 of 5, 5 of 6, 1 5 6 4.
   *
   * ONE FACET, NOT TWO (ruling 26). This was `cadence` on Functional
   * Harmony and `progression` on Progression Vocabulary, and the split
   * did not survive being looked at: a 5 1 is a little progression,
   * none of the four is a cadence in the strict sense, and the two
   * secondary dominants never were one at all. Two names for one claim
   * is two rows a reader has to know are the same row.
   */
  progression?: string;

  /** A slash chord's two degrees, as written. Slash Chords. */
  slashDegrees?: string;

  /** Whether a key card is about the relative or the parallel key.
   *  Key Signatures. */
  keyRelation?: string;

  /** Whether an enharmonic pair is two NOTE names or two DEGREE names.
   *  Enharmonic Equivalents. */
  enharmonicKind?: string;

  /** Which enharmonic set — the group of names for one sound.
   *  Enharmonic Equivalents. */
  enharmonicGroup?: string;
}

export type FacetName = keyof CardFacets;

/**
 * The values each facet is allowed to take.
 *
 * =====================================================================
 * THIS IS WHAT MAKES "ONE MEANING" CHECKABLE.
 *
 * A facet means one thing exactly when every card carrying it draws
 * from one vocabulary. Two meanings show up as two vocabularies under
 * one name — which is precisely how `degree` and `shape` went wrong,
 * and neither was visible until someone listed the values side by side.
 *
 * So the vocabularies are declared, and a test asserts the deck never
 * produces a value outside them. The day a generator starts writing a
 * mode name into `degree`, the test says so rather than a filter
 * quietly returning the wrong cards.
 * =====================================================================
 */
export const FACET_VALUES: Readonly<Record<FacetName, readonly (string | number)[]>> = {
  key: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  note: [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'Fb', 'F', 'F#', 'Gb', 'G',
    'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'B#', 'Cb', 'E#',
  ],
  degree: ['1', 'b2', '2', 'b3', '3', '4', '#4', 'b5', '5', 'b6', '6', 'b7', '7'],
  semitones: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  fromDegree: [1, 2, 3, 4, 5, 6, 7],
  // Every movement the degree-math generator walks, as it names them.
  movement: [],
  pentatonic: ['major', 'minor', 'relative'],
  // ONE ROW, FOUR CHIPS (ruling 26). The three that were `cadence`
  // first, in the order the module teaches them, then the one that was
  // already here.
  progression: ['ii-V-I', 'V/V', 'V/vi', '1-5-6-4'],
  slashDegrees: ['1-3', '5-7', '4-5', '6-b7'],
  keyRelation: ['relative', 'parallel'],
  enharmonicKind: ['note', 'interval'],
  // The enharmonic sets, as the generator names them.
  enharmonicGroup: [],
};

/**
 * Facets whose vocabulary is the generator's own list rather than a
 * short set written here.
 *
 * DECLARED AS EXEMPT RATHER THAN LEFT EMPTY, so "no vocabulary" is a
 * statement someone made rather than a list somebody forgot to fill in.
 * The test skips exactly these and no others.
 */
export const OPEN_VOCABULARY: ReadonlySet<FacetName> =
  new Set<FacetName>(['movement', 'enharmonicGroup']);

/** The tritone, in semitones. Named because two card families are
 *  about it and neither writes the number down. */
const TRITONE_SEMITONES = 6;

/** How many letters apart two note names are, upward. */
function letterStepsBetween(from: string, to: string): number | undefined {
  const a = LETTERS.indexOf(from[0]?.toUpperCase() as typeof LETTERS[number]);
  const b = LETTERS.indexOf(to[0]?.toUpperCase() as typeof LETTERS[number]);
  if (a < 0 || b < 0) return undefined;
  return ((b - a) % LETTERS.length + LETTERS.length) % LETTERS.length;
}

/** How far apart two note names are in semitones, upward. */
const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function pitchClass(name: string): number | undefined {
  const base = PITCH_CLASS[name[0]?.toUpperCase() ?? ''];
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
 * The movement an interval card is about — the same id the movement
 * cards carry (ruling 27).
 *
 * ASCENDING, because every card in the family asks ascending and says
 * so in its question. The letter count and the semitone count are read
 * separately for the reason `qualityByShape` gives: derive the name
 * from the semitones alone and F up to B stops being an augmented 4th.
 */
function intervalMovement(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  if (from === undefined || to === undefined) return undefined;
  const steps = letterStepsBetween(from, to);
  const a = pitchClass(from);
  const b = pitchClass(to);
  if (steps === undefined || a === undefined || b === undefined) return undefined;
  const quality = qualityByShape(steps, ((b - a) % 12 + 12) % 12);
  return quality === undefined ? undefined : movementId(quality, 'up');
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

/**
 * What one card is about.
 *
 * READ OFF THE CARD'S OWN COORDINATES, never off its question text. The
 * generators already hold these values a moment before they write the
 * card; parsing a prompt back into its parts is how a ♭ went missing
 * once already, and the catalog says so in terms.
 *
 * Returns undefined where a card carries nothing, so a caller can tell
 * "no facets" from "an empty object I should filter against".
 */
export function facetsFor(card: Flashcard): CardFacets | undefined {
  const axis = (card as Flashcard & { axis?: Axis }).axis;
  const f: CardFacets = {};

  switch (card.category) {
    case 'scale-degree-math':
      // The one place `degree` meant a STARTING degree. It has its own
      // name now, and this category carries no key and no note.
      f.fromDegree = num(axis?.degree);
      f.movement = str(axis?.movement);
      break;

    case 'degree-notes':
      // THE SAME RELATIONSHIP THE THREE BELOW ASK ABOUT, asked three
      // more ways. The key and the degree mean exactly what they mean
      // there; the distance is written down because this is the family
      // that made the tritone gatherable — the ♯4 and the ♭5 are six
      // semitones from their key whether or not the card says so, and
      // that is the claim that puts them beside the interval cards.
      f.key = str(axis?.key);
      f.degree = str(axis?.degree);
      f.semitones = DEGREE_BY_ID.get(String(axis?.degree))?.semitones;
      break;

    case 'named-notes':
    case 'reverse-key-pivots':
    case 'modes':
      // One relationship, three questions. The key and the degree mean
      // the same thing on all three; only the unknown differs.
      f.key = str(axis?.key);
      f.degree = str(axis?.degree);
      break;

    case 'tritone-pairs':
      // SIX SEMITONES, WRITTEN DOWN. The category has known this since
      // it was built and has never said it in data, which is why its
      // twelve cards could not be gathered with the interval card that
      // asks the same thing.
      f.note = str(axis?.note);
      f.semitones = TRITONE_SEMITONES;
      break;

    case 'intervals':
      f.note = str(axis?.from);
      f.semitones = num(axis?.semitones);
      // THE SAME DISTANCE THE MOVEMENT CARDS NAME (ruling 27). Every
      // interval card asks ascending, so the direction is not read off
      // anything — it is what the question says.
      f.movement = intervalMovement(str(axis?.from), str(axis?.to));
      break;

    case 'enharmonic-equivalents':
      f.enharmonicKind = str(axis?.kind);
      f.enharmonicGroup = str(axis?.group);
      // A NOTE spelling is a note. A DEGREE spelling — ♯4 beside ♭5 —
      // is not a `degree` in this model, because it names no key and no
      // note: it is a claim about two NAMES, not about a relationship.
      if (axis?.kind === 'note') f.note = str(axis?.spelling);
      break;

    case 'pentatonic-scales':
      f.note = str(axis?.root);
      f.pentatonic = str(axis?.shape);
      break;

    case 'functional-harmony':
      f.key = str(axis?.key);
      // `progression`, not a `cadence` of its own — see the facet's
      // own comment. The stored values are unchanged, so every link
      // that already named one still resolves.
      f.progression = str(axis?.shape);
      break;

    case 'key-signatures':
      f.key = str(axis?.key);
      f.keyRelation = str(axis?.relation);
      break;

    case 'progressions':
      f.key = str(axis?.key);
      f.progression = str(axis?.shape);
      break;

    case 'slash-chords':
      f.key = str(axis?.key);
      f.slashDegrees = str(axis?.shape);
      break;

    // NOTHING FOR THESE, AND THAT IS THE HONEST ANSWER. Diatonic Chord
    // Qualities, Chord Construction and Ear-Theory Crossover carry no
    // coordinates today. Inventing one would make a filter claim it had
    // found something.
    default:
      break;
  }

  for (const k of Object.keys(f) as FacetName[]) {
    if (f[k] === undefined) delete f[k];
  }
  return Object.keys(f).length === 0 ? undefined : f;
}

/**
 * The deck, with every card's facets attached.
 *
 * ONE PLACE, over the assembled list, rather than sixteen generators
 * each remembering to do it. A generator that stops supplying a
 * coordinate loses its facet here and the vocabulary test still passes
 * — which is why the coverage figures are in the report rather than
 * pinned as a number nobody would think to update.
 */
export function withFacets(cards: readonly Flashcard[]): Flashcard[] {
  return cards.map(card => {
    const facets = facetsFor(card);
    return facets === undefined ? card : { ...card, facets };
  });
}
