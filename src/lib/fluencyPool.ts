/**
 * How big a testing pool has to be before a drill counts.
 *
 * ─── One sentence, three surfaces ────────────────────────────────────
 *
 * This rule is stated by the dashboard's legibility panel, by the
 * notice inside a drill that has narrowed too far, and by the prompt
 * that fires when a row is tapped whose pool is under the minimum. It
 * was worded differently in each of them — "fewer than 4 items don't
 * count toward fluency tiers", "with fewer than 4 items selected those
 * attempts stay out of the accuracy score" — and three phrasings of one
 * rule read as three rules, so the reader has to work out whether they
 * are the same thing before they can act on any of them.
 *
 * The sentence lives here and the surfaces render it. Adding a fourth
 * place the rule appears should mean importing this, not writing it out
 * again in that file's own voice.
 *
 * The number is interpolated rather than typed into the sentence, so
 * the threshold and the words describing it cannot drift apart.
 */

/**
 * Distinct items a pool needs before its attempts count toward
 * accuracy.
 *
 * Under this, an attempt logs `excludeFromFluency`: it still counts
 * toward coverage, recency, streaks and the daily goal, because the
 * practice happened. It is held out of the accuracy score alone, where
 * a pool this small would inflate the percentage — a guess between
 * three items is right one time in three, and short-term recall
 * carries most of the rest.
 *
 * THE RULE IS ABOUT HOW FEW ITEMS YOU WERE CHOOSING BETWEEN, not about
 * who chose them. A pool the dashboard sends is a pool like any other.
 */
export const FLUENCY_POOL_MINIMUM = 4;

/** The sentence. Rendered verbatim wherever the rule is stated. */
export const FLUENCY_POOL_RULE =
  `A drill needs at least ${FLUENCY_POOL_MINIMUM} items in the testing pool `
  + 'to count toward your accuracy score.';

/**
 * Whether a pool of this size counts toward accuracy.
 *
 * Takes the number of DISTINCT items. Every caller builds its pool with
 * `new Set(...)`, so sizing this off an array that can hold the same
 * key twice would report a pool of four while drilling one item.
 */
export function poolCountsTowardAccuracy(distinctItems: number): boolean {
  return distinctItems >= FLUENCY_POOL_MINIMUM;
}
