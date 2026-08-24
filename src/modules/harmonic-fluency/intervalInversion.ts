/**
 * Interval inversion — the pairing rule, in one place.
 *
 * ---------------------------------------------------------------
 * WHY THIS IS A MODULE AND NOT THREE LITERALS.
 *
 * Two callers need the same fact: the scale-degree-math explanations,
 * which show the shortcut only where it saves a count, and the interval
 * inversion cards that drill the pairing directly. A second copy of
 * "9" would be a second definition of the relationship, and the two
 * would agree right up until one moved.
 *
 * It also makes the rule TESTABLE AS A RULE. A test can move
 * `INTERVAL_PAIR_SUM` and assert that which cards carry a shortcut
 * follows — which is the only way to tell a derived decision from a
 * hardcoded list of [5, 6, 7]. The two are indistinguishable while they
 * agree, and the list is the one that goes wrong.
 * ---------------------------------------------------------------
 */

/**
 * Inverted pairs sum to this: 2↔7, 3↔6, 4↔5.
 *
 * Nine rather than eight because both ends count the degree they sit
 * on — the same off-by-one that makes an interval move n − 1 steps.
 */
export const INTERVAL_PAIR_SUM = 9;

/** The interval an interval becomes when turned upside down. */
export function invertedOrdinal(ordinal: number): number {
  return INTERVAL_PAIR_SUM - ordinal;
}

/**
 * Whether inverting SAVES a count.
 *
 * Strictly smaller, never merely different. On a 2nd the inversion is a
 * 7th — six steps and a wrap in place of one step — so offering it
 * there is not a shortcut, it is a longer route wearing the word. True
 * for 5ths, 6ths and 7ths, and derived from the comparison rather than
 * listed, so it moves if the pairing ever does.
 */
export function invertsSmaller(ordinal: number): boolean {
  return invertedOrdinal(ordinal) < ordinal;
}

/**
 * The thirteen intervals within an octave, with their qualities.
 *
 * ---------------------------------------------------------------
 * ONE TABLE, NOT THREE.
 *
 * This lived as a private `INTERVAL_NAMES` inside `catalog.ts`, and
 * `ear-training/intervals/seed.ts` holds the same thirteen again with
 * anchors attached. Building the inversion cards off either of those
 * would have put a third copy in play — and the whole reason these
 * cards exist is that inversion is one relationship, not several.
 *
 * So the table moved here, beside the rule that reads it, and
 * `catalog.ts` imports it. `seed.ts` keeps its own because it carries
 * per-direction anchors this does not; a test asserts the two agree on
 * membership.
 * ---------------------------------------------------------------
 */
export interface IntervalName {
  semitones: number;
  name: string;
}

export const INTERVAL_NAMES: ReadonlyArray<IntervalName> = [
  { semitones: 0,  name: 'Unison' },
  { semitones: 1,  name: 'minor 2nd' },
  { semitones: 2,  name: 'Major 2nd' },
  { semitones: 3,  name: 'minor 3rd' },
  { semitones: 4,  name: 'Major 3rd' },
  { semitones: 5,  name: 'Perfect 4th' },
  { semitones: 6,  name: 'Tritone' },
  { semitones: 7,  name: 'Perfect 5th' },
  { semitones: 8,  name: 'minor 6th' },
  { semitones: 9,  name: 'Major 6th' },
  { semitones: 10, name: 'minor 7th' },
  { semitones: 11, name: 'Major 7th' },
  { semitones: 12, name: 'Octave' },
];

/**
 * Semitones in an octave. The SECOND way of counting an inversion —
 * partners sum to 12 here and to `INTERVAL_PAIR_SUM` in ordinals.
 *
 * Both are true and neither can be dropped: the card list is derived
 * from semitones, because that is what distinguishes a minor 3rd from
 * a major 3rd, and `iv-inv-sum` teaches the ordinal rule, because that
 * is the one a player counts on their fingers. A test asserts the two
 * agree card by card, so a change to either surfaces instead of
 * sitting there.
 */
export const SEMITONES_PER_OCTAVE = 12;

/** The interval an interval becomes, by semitones. */
export function invertedSemitones(semitones: number): number {
  return SEMITONES_PER_OCTAVE - semitones;
}

const BY_SEMITONES = new Map(INTERVAL_NAMES.map(i => [i.semitones, i]));

/** Name for a semitone count, or undefined outside 0–12. */
export function intervalNameAt(semitones: number): string | undefined {
  return BY_SEMITONES.get(semitones)?.name;
}

/**
 * The pairs, derived — never a written list.
 *
 * Returns the six reciprocal pairs and the one self-inverse, which is
 * the whole shape of the fact: 6 x 2 leaves the tritone over, and that
 * remainder IS the tritone splitting the octave in half.
 */
export function inversionPairs(): {
  pairs: Array<[IntervalName, IntervalName]>;
  selfInverse: IntervalName[];
} {
  const pairs: Array<[IntervalName, IntervalName]> = [];
  const selfInverse: IntervalName[] = [];
  const seen = new Set<number>();
  for (const iv of INTERVAL_NAMES) {
    if (seen.has(iv.semitones)) continue;
    const partnerSem = invertedSemitones(iv.semitones);
    const partner = BY_SEMITONES.get(partnerSem);
    if (partner === undefined) continue;
    seen.add(iv.semitones);
    seen.add(partnerSem);
    if (partnerSem === iv.semitones) selfInverse.push(iv);
    else pairs.push([iv, partner]);
  }
  return { pairs, selfInverse };
}

/** The ordinal a name carries — "minor 3rd" is 3, Unison 1, Octave 8.
 *  Read off the NAME, so it cannot drift from what the card says. */
export function ordinalOfName(name: string): number | undefined {
  if (name === 'Unison') return 1;
  if (name === 'Octave') return 8;
  if (name === 'Tritone') return undefined;   // aug 4th or dim 5th
  const m = name.match(/(\d)(?:nd|rd|th)/);
  return m ? Number(m[1]) : undefined;
}

/**
 * "a" or "an", decided by SOUND rather than by a vowel list.
 *
 * Interval names are the only place this deck needs it, and both
 * callers are interval names: "an augmented 4th", "a minor 6th". Kept
 * here rather than copied into the second caller — two copies of one
 * rule is how "a augmented 4th" ships.
 */
export function article(name: string): string {
  return /^[AEIO]/i.test(name) ? 'an' : 'a';
}
