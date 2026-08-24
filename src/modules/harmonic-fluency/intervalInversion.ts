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
