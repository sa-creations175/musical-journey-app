/**
 * The wrong answers in the pattern-recognition bonus round.
 *
 * =====================================================================
 * NEIGHBOURING TIERS FIRST, THE WHOLE CATALOG WHEN THAT IS NOT ENOUGH.
 *
 * The round plays a progression the reader has just named chord by
 * chord and asks them to name the SHAPE. Its decoys were drawn from
 * the tiers either side of the answer's own, which was a good rule
 * against sixty-nine progressions: a decoy from two tiers away was a
 * genre away and read as obviously wrong.
 *
 * The catalog cut of 9 Sep 2026 left eight progressions across three
 * tiers, and the tier-3 entry has exactly one neighbour. Under the old
 * rule that round offered two options and a coin flip, which grades as
 * pattern recognition and is not.
 *
 * So the preference is unchanged and a fallback is added: when the
 * neighbouring tiers cannot fill the round, take from the catalog
 * entire. It widens only when it has to, and it is a pure function so
 * the boundary can be tested rather than reasoned about.
 * =====================================================================
 */
import type { Progression } from './catalog';

/** Wrong answers offered beside the right one. Five options in all. */
export const PATTERN_DECOY_COUNT = 4;

/**
 * The pool the decoys are drawn from — still unshuffled, so the caller
 * shuffles once and slices.
 */
export function patternDecoyPool(
  active: Progression,
  all: ReadonlyArray<Progression>,
): Progression[] {
  const others = all.filter(p => p.id !== active.id);
  const near = others.filter(p => Math.abs(p.tier - active.tier) <= 1);
  return near.length >= PATTERN_DECOY_COUNT ? near : others;
}
