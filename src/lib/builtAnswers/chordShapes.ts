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

/** The suffix a chord's name carries. '' is a plain major triad. */
export type QualityId = '' | 'maj7' | 'maj9' | 'm' | 'm7' | 'm9' | '7' | '9';

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
};

/**
 * Which family a quality belongs to, for grading.
 *
 * EXTENSIONS NEVER FAIL AN ANSWER. A reader who builds Cmaj7 where the
 * card wanted C has heard the chord right; a reader who builds Cm has
 * not. So the grade compares the family, and maj7 is a major chord, m7
 * a minor one, and 7 and 9 dominants.
 */
export type ChordFamily = 'maj' | 'min' | 'dom';

export const FAMILY_OF: Readonly<Record<QualityId, ChordFamily>> = {
  '': 'maj', maj7: 'maj', maj9: 'maj',
  m: 'min', m7: 'min', m9: 'min',
  '7': 'dom', '9': 'dom',
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
};

/** Whether a built quality answers a wanted one. */
export function familyMatches(wanted: QualityId, built: QualityId): boolean {
  return ACCEPTS[FAMILY_OF[wanted]].includes(FAMILY_OF[built]);
}

/** The triad under a seventh or ninth chord — the "triads" rung. */
export const TRIAD_OF: Readonly<Partial<Record<QualityId, QualityId>>> = {
  maj7: '', maj9: '', m7: 'm', m9: 'm', '7': '', '9': '',
};

/** The ninth over a seventh chord — the "full voicing" rung. */
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
    case 'full':
      return seventh ? [iv[1], iv[2], iv[3], 14] : [iv[1], iv[2], iv[0] + 12];
  }
}
