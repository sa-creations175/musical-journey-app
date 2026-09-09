/**
 * Interval names, and what an interval becomes turned upside down.
 *
 * ---------------------------------------------------------------
 * ONE TABLE, NOT THREE.
 *
 * `INTERVAL_NAMES` lived as a private list inside `catalog.ts`, and
 * `ear-training/intervals/seed.ts` holds the same thirteen again with
 * anchors attached. A second copy is a second definition, and the two
 * agree right up until one moves — so the table sits here, beside the
 * inversion rule that reads it, and `catalog.ts` imports it. `seed.ts`
 * keeps its own because it carries per-direction anchors this does
 * not; a test asserts the two agree on membership.
 *
 * ---------------------------------------------------------------
 * THE ORDINAL HALF OF THIS MODULE IS GONE (9 Sep 2026).
 *
 * `INTERVAL_PAIR_SUM`, `invertedOrdinal`, `invertsSmaller`,
 * `inversionPairs` and `ordinalOfName` stood here to build fifteen
 * fact cards — "a Major 3rd inverted is a _____", "an interval and its
 * inversion always add up to _____". Silas's ruling: the skill is the
 * relationship between two notes ON THE KEYBOARD, both ways, and the
 * interval grid already asks both directions of every pair. "Adds up
 * to 9" is explanation, not a test.
 *
 * So the inversion survives as one function counted in SEMITONES,
 * which is what every remaining caller wants: the grid's reveal names
 * the flip of the interval it just asked about. The ordinal arithmetic
 * had no reader left once the cards went.
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

/** Semitones in an octave — the unit an inversion is counted in.
 *  Partners sum to 12: a minor 3rd (3) and a Major 6th (9). */
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
