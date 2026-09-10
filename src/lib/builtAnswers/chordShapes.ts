/**
 * What a chord is made of, and what counts as the same kind of chord.
 *
 * =====================================================================
 * THE PICKER'S VOCABULARY, IN ONE PLACE.
 *
 * Six card families stop being multiple choice and answer by building
 * the chord instead. They share one picker, so they share one answer to
 * "which qualities exist", "what notes does each one hold" and "which
 * of them count as the same family when the card is graded".
 *
 * Split from the picker component on purpose: every one of these is a
 * fact about music that a test can check without rendering anything,
 * and the grading rules in particular are the part that must not be
 * reasoned about through a DOM.
 *
 * =====================================================================
 * THE EIGHT QUALITIES ARE THE PROTOTYPE'S, NOT THE BRIEF'S.
 *
 * `docs/built-answers-prototype_1.html` offers major, maj7, maj9,
 * minor, min7, min9, 7 and 9. The build brief lists a different eight —
 * major, minor, dominant 7, major 7, minor 7, half-diminished,
 * diminished, sus — and the brief itself says the prototype wins where
 * the two disagree.
 *
 * It is also the set the cards need. No card in these six families
 * answers a diminished, half-diminished or sus chord, so those three
 * tiles could never be right; the ninths are needed, because the
 * progression player's "full voicing" rung names Cmaj9 / G9 / Am9 and
 * has to be able to build one. The divergence is in the report.
 * =====================================================================
 */

import { EXTENDED_QUALITY_OF, extendedShape } from '../extendedVoicings';

/**
 * The suffix a chord's name carries. '' is a plain major triad.
 *
 * =====================================================================
 * THE FIVE ADDED ON 9 SEP 2026 ARE NOT ALL OFFERED AS TILES.
 *
 * `7b9`, `7#9` and `7#9#5` are the altered dominants; `dim7` and
 * `m7b5` are the diminished and the half-diminished. They are here so
 * that a chord this app can NAME is a chord this file can grade — the
 * passes' chords, the Minor 2-5-1's iiø and the two altered-dominant
 * passes all name them, and until now a card asking for one would have
 * had to be graded as if it were a plain dominant.
 *
 * WHICH OF THEM A READER CAN TAP IS A SEPARATE QUESTION, and it is
 * `qualityTilesFor` below: the two altered tiles appear only on a card
 * whose own answer uses one. `dim7` and `m7b5` have no tile on any
 * card today, because no card in the six built-answer families answers
 * one yet.
 * =====================================================================
 */
export type QualityId =
  | '' | 'maj7' | 'maj9' | 'm' | 'm7' | 'm9' | '7' | '9'
  | '7b9' | '7#9' | '7#9#5' | 'dim7' | 'm7b5';

export interface Quality {
  id: QualityId;
  /** What the tile says. */
  label: string;
}

/** The tile row, in the prototype's order. */
export const QUALITIES: ReadonlyArray<Quality> = [
  { id: '', label: 'major' },
  { id: 'maj7', label: 'maj7' },
  { id: 'maj9', label: 'maj9' },
  { id: 'm', label: 'minor' },
  { id: 'm7', label: 'min7' },
  { id: 'm9', label: 'min9' },
  { id: '7', label: '7' },
  { id: '9', label: '9' },
];

/**
 * The tiles the SLASH picker offers — the prototype's shorter row.
 *
 * A slash chord's top half is a triad or a seventh in this deck and
 * never a ninth, so the ninths are not offered there. Same ids, a
 * subset of the list above, so nothing has two names.
 */
export const SLASH_QUALITY_IDS: ReadonlyArray<QualityId> =
  ['', 'maj7', 'm', 'm7', '7'];

/**
 * The two altered-dominant tiles, offered only where a card asks for
 * one.
 *
 * A TILE ROW IS A CLAIM ABOUT WHAT COULD BE RIGHT. Putting 7♭9 and
 * 7♯9♯5 on every card would widen every guess in the deck by two, on
 * cards where neither could ever be the answer — and the tiles that
 * matter would be harder to find for it. So the row is per card, and
 * `qualityTilesFor` is the one place that decides.
 */
export const ALTERED_QUALITIES: ReadonlyArray<Quality> = [
  { id: '7b9', label: '7♭9' },
  { id: '7#9#5', label: '7♯9♯5' },
];

/**
 * The tiles a card offers, given the qualities its own answer uses.
 *
 * The base row is unchanged everywhere it was; a card whose answer
 * holds an altered dominant gets the altered tiles appended, so the
 * chord it is asking for is one the reader can actually build.
 *
 * ONLY THE TILES THE CARD COULD NEED. A card wanting a 7♭9 is offered
 * both altered tiles rather than only that one, because offering
 * exactly the right answer and nothing near it is not a question.
 */
export function qualityTilesFor(
  wanted: ReadonlyArray<QualityId>,
  base: ReadonlyArray<Quality> = QUALITIES,
): ReadonlyArray<Quality> {
  const needsAltered = wanted.some(q => FAMILY_OF[q] === 'dom-alt');
  if (!needsAltered) return base;
  const have = new Set(base.map(q => q.id));
  return [...base, ...ALTERED_QUALITIES.filter(q => !have.has(q.id))];
}

/**
 * Semitones above the root, per quality.
 *
 * THE NINTH IS 14, NOT 2. A ninth sits an octave and a tone above the
 * root and the voicing engine stacks upward from the bass — writing it
 * as 2 would put it under the third and change the chord's shape rather
 * than its spelling.
 */
export const CHORD_INTERVALS: Readonly<Record<QualityId, ReadonlyArray<number>>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  // THE SAME SHAPES CHORD RECOGNITION TEACHES, in this file's own
  // convention: an altered ninth is written above the octave (13 for
  // the ♭9, 15 for the ♯9) for the same reason the plain ninth is 14 —
  // the voicing engine stacks upward, and writing it as 1 would put it
  // under the third.
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7#9#5': [0, 4, 8, 10, 15],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
};

/**
 * Which family a quality belongs to, for grading.
 *
 * EXTENSIONS NEVER FAIL AN ANSWER. A reader who builds Cmaj7 where the
 * card wanted C has heard the chord right; a reader who builds Cm has
 * not. So the grade compares the family, and maj7 is a major chord, m7
 * a minor one, and 7 and 9 dominants.
 */
/**
 * =====================================================================
 * THE COLLAPSE STOPS AT THE ALTERED DOMINANTS. Silas's ruling of
 * 9 Sep 2026.
 *
 * Every dominant used to be one family, so a card asking for a 7♭9
 * would have accepted a plain 7 — and a 7♭9 and a 7♯9♯5 would have
 * answered each other. They are different sounds. Being able to hear
 * which altered dominant is sounding is the skill those cards exist to
 * test, and a grade that cannot tell them apart is not testing it.
 * =====================================================================
 */
export type ChordFamily =
  | 'maj' | 'min' | 'dom' | 'dom-alt' | 'dim' | 'half-dim';

export const FAMILY_OF: Readonly<Record<QualityId, ChordFamily>> = {
  '': 'maj', maj7: 'maj', maj9: 'maj',
  m: 'min', m7: 'min', m9: 'min',
  '7': 'dom', '9': 'dom',
  '7b9': 'dom-alt', '7#9': 'dom-alt', '7#9#5': 'dom-alt',
  dim7: 'dim',
  m7b5: 'half-dim',
};

/**
 * Which families are accepted where the card wants one.
 *
 * A DOMINANT ACCEPTS A PLAIN MAJOR, and only in that direction. "The
 * 1 5 6 4 in C" wants a G on the 5 and the card's seventh-chord reading
 * is G7; a reader who builds G has built the chord the card names, and
 * one who builds G7 has built the chord it becomes. Neither is wrong.
 * A major does NOT accept a dominant: on the 1 of a 2 5 1 a C7 is a
 * different chord doing a different job.
 */
export const ACCEPTS: Readonly<Record<ChordFamily, ReadonlyArray<ChordFamily>>> = {
  maj: ['maj'],
  min: ['min'],
  dom: ['dom', 'maj'],
  // AN ALTERED DOMINANT ACCEPTS ITS OWN FAMILY AND NOTHING ELSE — and
  // then `familyMatches` narrows even that to the exact chord, below.
  // A plain 7 does not answer a 7♭9: the alteration is the chord.
  'dom-alt': ['dom-alt'],
  dim: ['dim'],
  'half-dim': ['half-dim'],
};

/**
 * Whether a built quality answers a wanted one.
 *
 * AN ALTERED TARGET IS GRADED EXACTLY, which is the one place the
 * family is not the whole answer. 7♭9, 7♯9 and 7♯9♯5 share a family so
 * that a plain dominant fails against any of them — but they do not
 * answer each other, because they are three different sounds and
 * telling them apart is what the card is for.
 *
 * The direction still matters, as it does for a plain dominant
 * accepting a major: an altered target demands its exact quality, and
 * an altered build against a PLAIN dominant target fails on the family
 * check above rather than on this line.
 */
export function familyMatches(wanted: QualityId, built: QualityId): boolean {
  if (FAMILY_OF[wanted] === 'dom-alt') return wanted === built;
  return ACCEPTS[FAMILY_OF[wanted]].includes(FAMILY_OF[built]);
}

/** The triad under a seventh or ninth chord — the "triads" rung.
 *
 *  AN ALTERED DOMINANT THINS TO A PLAIN MAJOR TRIAD, the same ruling
 *  the ear-training ladder follows: the rung is what the hand plays
 *  there, and no hand plays a ♭9 in a triad. The half-diminished thins
 *  to the diminished triad under it; the dim7 has no triad rung of its
 *  own and keeps its own shape. */
export const TRIAD_OF: Readonly<Partial<Record<QualityId, QualityId>>> = {
  maj7: '', maj9: '', m7: 'm', m9: 'm', '7': '', '9': '',
  '7b9': '', '7#9': '', '7#9#5': '',
};

/** The ninth over a seventh chord — the "full voicing" rung.
 *
 *  THE ALTERED DOMINANTS ARE ALREADY THERE. Their ♭9 or ♯9 IS the
 *  ninth, so adding a natural one would be adding a second ninth a
 *  semitone away and voicing a chord nobody asked for. */
export const NINTH_OF: Readonly<Partial<Record<QualityId, QualityId>>> = {
  maj7: 'maj9', m7: 'm9', '7': '9',
};

/** Whether a quality has a seventh in it. Triads have no 3rd
 *  inversion and no rootless form, which is what this decides. */
export function hasSeventh(q: QualityId): boolean {
  return CHORD_INTERVALS[q].length >= 4;
}

/** How many inversions a quality has — a triad has three. */
export function inversionCount(q: QualityId): number {
  return Math.min(CHORD_INTERVALS[q].length, 4);
}

/**
 * =====================================================================
 * THE THICKNESS LADDER — the same five words the Shapes & Patterns
 * 2 5 1 drill already uses, so a reader meets one vocabulary.
 *
 * Each rung adds a note. "Bass only" is the root alone underneath;
 * "triads" is the plain triad in the hand; "guide tones" is the 3 and
 * the 7, which is what a comping hand actually plays; "seventh chords"
 * is 3 5 7; "full voicing" is 3 5 7 9.
 *
 * FULL NEVER INVENTS A NINTH THE READER DID NOT CHOOSE. On a triad
 * there is no seventh to build on, so the top rung stacks the octave
 * instead — the prototype's own rule.
 * =====================================================================
 */
export type Thickness = 'bass' | 'triads' | 'guide' | 'seventh' | 'full';

export interface ThicknessOption { id: Thickness; label: string }

export const THICKNESSES: ReadonlyArray<ThicknessOption> = [
  { id: 'bass', label: 'Bass only' },
  { id: 'triads', label: 'Triads' },
  { id: 'guide', label: 'Guide tones' },
  { id: 'seventh', label: 'Seventh chords' },
  { id: 'full', label: 'Full voicing' },
];

/** How a chord is laid out between the hands. */
export type Voicing = 'one' | 'both' | 'rootless';

export interface VoicingOption { id: Voicing; label: string }

export const VOICINGS: ReadonlyArray<VoicingOption> = [
  { id: 'one', label: 'One hand' },
  { id: 'both', label: 'Both hands' },
  { id: 'rootless', label: 'Rootless, root in the bass' },
];

/** Whether a layout puts the root in the bass rather than the hand. */
export function hasBass(v: Voicing | Thickness): boolean {
  return v !== 'one';
}

/**
 * The full-voicing rung of one quality, or null.
 *
 * =====================================================================
 * THE TOP RUNG IS SILAS'S, AND IT IS READ, NOT REBUILT.
 *
 * `lib/extendedVoicings` holds his notes for every extended chord this
 * app plays. This rung used to stack 3-5-7-9 by rule, which is right
 * for the major and the minor and WRONG for the dominant: Silas's
 * dominant extended voicing holds the 13 where the rule put the 5.
 * Three files each had their own idea of that and one of them has to be
 * the answer, so this one asks.
 *
 * THE A SHAPE, because a card with no position control is playing the
 * ABA run's outer chords, and A is what those take. The B shape and the
 * runs arrive with the shared player's Compare row.
 *
 * NULL for a quality the notes do not cover — the caller keeps its own
 * rule there rather than being handed a chord Silas never wrote.
 */
function extendedHand(q: QualityId): number[] | null {
  const named = EXTENDED_QUALITY_OF[q];
  if (named === undefined) return null;
  const shape = extendedShape(named, 'A');
  // The left hand's extra notes are the BASS's, not the hand's — the
  // half-diminished holds its 11 down there — so only the right hand
  // is this function's answer.
  return shape === null ? null : [...shape.right];
}

/**
 * The notes the HAND plays, as semitones above the chord root.
 *
 * Takes either a hand layout (while the reader is building) or a
 * thickness rung (once the player is driving), because both answer the
 * same question and a card is only ever using one of them.
 */
export function handTones(q: QualityId, mode: Voicing | Thickness): number[] {
  const iv = CHORD_INTERVALS[q];
  const seventh = hasSeventh(q);
  switch (mode) {
    case 'one':
    case 'both':
      return [...iv];
    case 'rootless':
      return seventh ? iv.slice(1) : [...iv];
    case 'bass':
      return [];
    case 'triads':
      return iv.slice(0, 3);
    case 'guide':
      return seventh ? [iv[1], iv[3]] : [iv[1], iv[2]];
    case 'seventh':
      return seventh ? [iv[1], iv[2], iv[3]] : iv.slice(0, 3);
    case 'full': {
      const extended = extendedHand(q);
      if (extended !== null) return extended;
      // A QUALITY THE NOTES DO NOT COVER KEEPS ITS OWN NINTH RATHER
      // THAN BEING GIVEN ONE. A 7♭9 stacked 3-5-7 and then handed a 14
      // loses the ♭9 that IS the chord and gains a natural 9 a semitone
      // off it — the ruling `NINTH_OF` already states, applied here
      // where the rung is actually built.
      if (seventh) {
        return iv.length > 4 ? iv.slice(1) : [iv[1], iv[2], iv[3], 14];
      }
      return [iv[1], iv[2], iv[0] + 12];
    }
  }
}
