/**
 * One band for a group of rows — the lowest of them.
 *
 * =====================================================================
 * A CELL IS NOT A ROW, AND THREE FILES HAD THEIR OWN ANSWER FOR IT.
 *
 * `bandVerdictForRow` bands ONE spacing row: one item, one hand. Every
 * grid in the app draws squares that cover more than one — a chord
 * square is four inversion states across three hands, a scale square is
 * three hands — so each of them had to decide what a square says when
 * its rows disagree, and each decided separately:
 *
 *   InversionBreakdownPanel  lowest band; Started if any row has none
 *   HeatGrid                 every drilled row acquired, or in progress
 *   MatrixSnapshot           the same rule again, transposed
 *
 * The first is band-shaped and correct. The other two are the retired
 * acquisition vocabulary. This is the first one, extracted, so the
 * grids can take it instead of growing band-shaped copies of the other
 * two — which would be the same bug in new words.
 * =====================================================================
 *
 * LOWEST, NOT FURTHEST, AND THE CHOICE IS THE WHOLE MEANING. A square
 * saying Fluent has to mean every target under it is Fluent, or the
 * word promises something the practice has not done. Furthest reads as
 * high as a square's best target, which makes one good hand hide two
 * untouched ones.
 *
 * A ROW WITH NO BAND IS BELOW EVERY BAND. Not Started and Started are
 * not scores — `banding.ts` is explicit that neither may be treated as
 * one — so a group holding an unjudged row cannot report a band for the
 * whole: the lowest thing present has not been judged yet. That is why
 * the check below is "did every row earn a band", not "what is the
 * lowest band among those that did".
 */

import type { SpacingState } from '../db';
import { bandRank, lowerBand, type AccuracyBand } from './bands';
import { NOT_STARTED, type BandVerdict } from './banding';
import { bandVerdictForRow } from './row';

/** The rows this needs. Anything with a `performanceHistory` will do,
 *  which is what lets tests pass fixtures without building a whole
 *  row. */
export type BandableRow = Pick<SpacingState, 'performanceHistory'>;

/**
 * The verdict for a group of rows, taken as a single square.
 *
 *   no rows at all            Not Started
 *   any row without a band    Started, unless every row is Not Started
 *   every row banded          the lowest of them
 */
export function rollUpVerdict(rows: readonly BandableRow[]): BandVerdict {
  return rollUpVerdicts(rows.map(bandVerdictForRow));
}

/**
 * The verdict for a cell's TARGETS, where a target may have no row.
 *
 * =====================================================================
 * A TARGET WITH NO ROW HAS NOT BEEN STARTED, AND IT STILL COUNTS.
 *
 * `rollUpVerdict` takes the rows that exist. For a square that is the
 * wrong question: a chord square covers four inversion states across
 * three hands whether or not any of them has been drilled, and rolling
 * up only the rows that exist would let one Mastered target speak for
 * eleven untouched ones — the exact failure Lowest is chosen to
 * prevent, arriving through the back door.
 *
 * So the caller enumerates what the square is FOR, and hands over
 * `undefined` for each target it has no row for.
 * =====================================================================
 */
export function rollUpTargets(
  rows: ReadonlyArray<BandableRow | undefined>,
): BandVerdict {
  return rollUpVerdicts(
    rows.map(r => (r === undefined ? NOT_STARTED : bandVerdictForRow(r))),
  );
}

/**
 * The same rule over verdicts that have already been computed.
 *
 * Separate so a caller that already holds per-row verdicts — the chord
 * panel draws each one before rolling them up — does not band every
 * row twice, and so the rule can be tested without a row at all.
 */
export function rollUpVerdicts(
  verdicts: readonly BandVerdict[],
): BandVerdict {
  if (verdicts.length === 0) return NOT_STARTED;

  let lowest: AccuracyBand | null = null;
  let anyUnbanded = false;
  let anyStarted = false;

  for (const v of verdicts) {
    if (v.kind === 'band') {
      lowest = lowest === null ? v.band : lowerBand(lowest, v.band);
      // A banded row has certainly been started; it matters when some
      // OTHER row in the group is the one holding the square back.
      anyStarted = true;
    } else {
      anyUnbanded = true;
      if (v.kind === 'started') anyStarted = true;
    }
  }

  if (anyUnbanded) {
    // `tries: 0` counts SCORING signals, and a square does not have a
    // count of its own — the rows under it each have their own. Same
    // idiom `engagementVerdict` uses for a row whose history holds
    // nothing that scores.
    return anyStarted ? { kind: 'started', tries: 0 } : NOT_STARTED;
  }
  // Unreachable while `anyUnbanded` is false and the list is non-empty
  // — every verdict was a band, so `lowest` was set. Kept as the
  // honest answer rather than a non-null assertion.
  return lowest === null ? NOT_STARTED : { kind: 'band', band: lowest };
}

/**
 * Fluent or Mastered.
 *
 * =====================================================================
 * THE ONE SHORTHAND, AND IT IS SPELLED "Fluent+".
 *
 * Every surface that used to ask "is this acquired" is asking this
 * instead. It is a line drawn across the six words, not a seventh
 * word: "learned" was considered and rejected — it reads as a tier
 * gate and sits too close to the song status Learning.
 *
 * READ OFF THE LADDER RATHER THAN LISTED. `band === 'fluent' || band
 * === 'mastered'` is the same answer today and the wrong one the day a
 * rung is added above Mastered — a new top band would silently fail to
 * count as Fluent+. `ACCURACY_BANDS` is ordered worst to best and
 * `bandRank` reads it, so the line moves with the table.
 *
 * NOT STARTED AND STARTED ARE NEVER FLUENT+, which needs no special
 * case: neither is a band, and only a band has a rank.
 * =====================================================================
 */
export function isFluentPlus(verdict: BandVerdict): boolean {
  return verdict.kind === 'band' && bandRank(verdict.band) >= bandRank('fluent');
}
