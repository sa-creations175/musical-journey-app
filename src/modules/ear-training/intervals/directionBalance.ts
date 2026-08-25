/**
 * Which directions of an interval are eligible to be served next.
 *
 * =====================================================================
 * THE SELECTOR STARVED THE UNRATED SIDE, AND THE WEIGHTS SAY WHY.
 *
 * `TIER_WEIGHT` is `untouched: 1.0`, `developing: 1.5`, `needsWork:
 * 2.5`. A direction with four attempts is `untouched` and weighs 1.0; a
 * direction with seven and an imperfect record is `developing` or
 * `needsWork` and weighs 1.5–2.5. So the side that had ALREADY crossed
 * the five-attempt rating threshold was drawn up to two and a half
 * times as often as the side still short of it.
 *
 * Unison sat at 7 ascending / 4 descending and octave at 4 / 1 for
 * exactly this reason. Nothing was broken — the weights are about
 * accuracy, and an unrated item has no accuracy to be bad at, so it
 * scores the neutral 1.0 forever while its partner's real misses pull
 * rank.
 *
 * THE RULE IS A FILTER, NOT A TUNED WEIGHT. Within one interval, only
 * the direction(s) with the FEWEST attempts are eligible. There is no
 * multiplier to pick, and no number here for anyone to have to justify
 * later: the rule is a comparison, and it settles itself. From 7/4 the
 * descending side is served until both read 7, and from then on the
 * counts are equal and the tier weights decide exactly as they do now.
 *
 * ACROSS DIRECTIONS OF ONE INTERVAL ONLY. It says nothing about which
 * interval to serve — that stays entirely with the tier weights, so a
 * mastered interval does not start competing with a weak one just
 * because its two sides are level.
 * =====================================================================
 */

/** Attempt counts per direction, for one interval. */
export interface DirectionCounts {
  asc: number;
  desc: number;
}

/**
 * The directions of `candidates` that may be served next.
 *
 * `candidates` is what is already eligible for other reasons — the
 * direction filter, the focus pool, and `directionsFor` having removed
 * a direction that does not exist. This only ever narrows it.
 *
 * Returns the input unchanged when it holds fewer than two directions,
 * or when the counts are equal: EQUAL COUNTS KEEP CURRENT BEHAVIOUR is
 * the whole reason this cannot be written as "always serve `asc` when
 * tied".
 */
export function eligibleDirections<T extends string>(
  candidates: readonly T[],
  countFor: (direction: T) => number,
): readonly T[] {
  if (candidates.length < 2) return candidates;
  const counts = candidates.map(countFor);
  const min = Math.min(...counts);
  const lowest = candidates.filter((_, i) => counts[i] === min);
  // All tied → every candidate survives, which is the same list.
  return lowest.length === candidates.length ? candidates : lowest;
}
