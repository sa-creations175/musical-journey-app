/**
 * What band a card is in — two rules, one per kind of module.
 *
 * =====================================================================
 * THE MEAN WAS NEVER THE RULE. THERE ARE TWO RULES.
 *
 * The engine used to average the last ten signals and band the mean.
 * That is not how either half of the app is scored:
 *
 *   MEASURED modules — harmonic fluency, ear training, reading,
 *   production vocabulary — score the percentage right over the last
 *   TWENTY answers on that card.
 *
 *   SELF-RATED modules — shapes & patterns including mental
 *   visualisation, and song repertoire — take the LOWEST of the last
 *   THREE rated reps. Not an average. Three cleans and one struggle is
 *   Needs Work, because the struggle is the thing that has not gone
 *   away.
 *
 * Getting this wrong is not cosmetic: the band picks the multiplier
 * and the ceiling, so a card that should be capped at 2 days drifts to
 * 30 on a rule that is too generous.
 *
 * WHICH RULE APPLIES IS READ FROM THE SIGNALS, NOT THE MODULE NAME.
 * Attempts mean measured, ratings mean self-rated. That is not a
 * shortcut — it is the only thing that gets production right, where
 * the vocabulary deck writes attempts and lessons write ratings under
 * one `production` moduleRef. A module lookup would have to pick one
 * and be wrong about the other.
 * =====================================================================
 */

import type { AccuracyBand } from './bands';
import { bandForAccuracyPercent } from './bands';
import type { Feel } from '../fluencyScale';

/** Answers over which a measured card is scored. */
export const MEASURED_WINDOW = 20;
/** Tries before a measured card has a band at all. */
export const MEASURED_FLOOR = 5;
/** Rated reps over which a self-rated card is scored. */
export const SELF_RATED_WINDOW = 3;
/** Rated reps before a self-rated card has a band at all. */
export const SELF_RATED_FLOOR = 3;

/**
 * A card that has no band yet, and why.
 *
 * `not-started` and `started` are NOT bands and must never be treated
 * as one. Never met is not the same as met-and-not-yet-judged, and
 * neither is the same as scoring badly — a card you have seen twice
 * has not earned Needs Work, it has earned nothing yet.
 */
export type BandVerdict =
  | { kind: 'band'; band: AccuracyBand }
  | { kind: 'started'; tries: number }
  | { kind: 'not-started' };

export const NOT_STARTED: BandVerdict = { kind: 'not-started' };

/** The band, or null when there isn't one. What the scheduler takes. */
export function bandOf(verdict: BandVerdict): AccuracyBand | null {
  return verdict.kind === 'band' ? verdict.band : null;
}

/** What a surface shows. */
export function bandVerdictLabel(verdict: BandVerdict): string {
  switch (verdict.kind) {
    case 'not-started': return 'Not Started';
    case 'started': return 'Started';
    case 'band': return verdict.band;
  }
}

// =====================================================================
// Measured
// =====================================================================

/**
 * Percentage right over the last twenty answers on this card.
 *
 * Under five tries there is no band: a percentage over three answers
 * swings between 67 and 100 on one miss, which is the whole reason the
 * floor exists.
 */
export function measuredVerdict(
  answers: ReadonlyArray<{ correct: boolean }>,
): BandVerdict {
  if (answers.length === 0) return NOT_STARTED;
  if (answers.length < MEASURED_FLOOR) {
    return { kind: 'started', tries: answers.length };
  }
  const window = answers.slice(-MEASURED_WINDOW);
  const correct = window.filter(a => a.correct).length;
  return { kind: 'band', band: bandForAccuracyPercent((correct / window.length) * 100) };
}

// =====================================================================
// Self-rated
// =====================================================================

/**
 * The band each feel maps to when it is the LOWEST of the three.
 *
 * One-to-one and ordinal, which is what makes the rule's worked
 * examples come out:
 *
 *   Struggled anywhere in the three   → lowest 1 → Needs Work
 *   Clean, Clean, Working on it       → lowest 2 → Developing
 *   Clean, Clean, Clean               → lowest 3 → Fluent
 *   In flow, In flow, Clean           → lowest 3 → Fluent
 *   In flow, In flow, In flow         → lowest 4 → Mastered
 */
const BAND_FOR_LOWEST: Record<Feel, AccuracyBand> = {
  1: 'needs-work',
  2: 'developing',
  3: 'fluent',
  4: 'mastered',
};

/** The ceiling practice-only evidence cannot pass. */
const PRACTICE_CEILING: AccuracyBand = 'developing';

/** Where each band sits, worst first — for applying the ceiling. */
const BAND_ORDER: ReadonlyArray<AccuracyBand> = [
  'needs-work', 'developing', 'fluent', 'mastered',
];

/** A rated rep, with the mode that produced it where it is known. */
export interface RatedRep {
  feel: Feel;
  /** True for a test rep, false for a practice one. ABSENT MEANS
   *  LEGACY — written before the modes existed, and never capped. */
  fromTest?: boolean;
}

/**
 * The lowest of the last three rated reps, and which three those are.
 *
 * =====================================================================
 * NOT AN AVERAGE, and the difference is the point. Averaging three
 * cleans and a struggle reads as Fluent; the rule reads it as Needs
 * Work, because a rep you struggled through is evidence that has not
 * been superseded by the two easy ones after it.
 *
 * =====================================================================
 * ONCE TESTED, THE TEST IS THE BAND. PRACTICE STOPS COMPETING.
 *
 * The four states, in the order they are decided:
 *
 *   never tested   practice reps set the band, capped at Developing.
 *                  Practice reaches Developing and no further.
 *   once tested    the last three TEST reps set it. Practice can
 *                  neither raise it nor drag it down.
 *   past due       the same band, marked stale elsewhere. No decay
 *                  happens here — a band is not lowered by time.
 *   tested again   the newer three test reps replace it, up or down.
 *
 * THE REASON PRACTICE IS EXCLUDED RATHER THAN OUTVOTED. If the two
 * shared a three-slot window, three practice reps after a passed test
 * would push the test out of it and demote a Fluent shape for the
 * crime of being practised. Filtering to test reps means the question
 * of how to weigh a practice rep against a test rep never has to be
 * answered, because it is never asked.
 * =====================================================================
 */
export function selfRatedVerdict(
  reps: ReadonlyArray<RatedRep>,
): BandVerdict {
  if (reps.length === 0) return NOT_STARTED;

  // TESTED AT ALL? Then only the tests are looked at. Fewer than three
  // test reps is a test that never completed — it cannot set a band,
  // and the practice path below carries on holding it.
  const tests = reps.filter(r => r.fromTest === true);
  if (tests.length >= SELF_RATED_FLOOR) {
    return { kind: 'band', band: lowestBand(tests.slice(-SELF_RATED_WINDOW)) };
  }

  if (reps.length < SELF_RATED_FLOOR) {
    return { kind: 'started', tries: reps.length };
  }
  const window = reps.slice(-SELF_RATED_WINDOW);
  const band = lowestBand(window);

  // THE CEILING APPLIES UNLESS SOMETHING IN THE WINDOW IS LEGACY.
  //
  // Phrased as "is anything here unknowable" rather than "is
  // everything here practice", and the difference is load-bearing. An
  // ABANDONED TEST leaves one or two test reps in the history — not
  // enough to set a band, so the reader falls through to here — and
  // asking "is everything practice" would answer no and lift the
  // ceiling. Two reps of a test nobody finished would reach Fluent.
  //
  // A legacy entry is different in kind. It was written before the
  // modes existed and its provenance cannot be recovered, so capping
  // it would demote a card on a guess. That is the one case the
  // ceiling stands down for.
  const anyLegacy = window.some(r => r.fromTest === undefined);
  return { kind: 'band', band: anyLegacy ? band : capAt(band, PRACTICE_CEILING) };
}

function lowestBand(window: ReadonlyArray<RatedRep>): AccuracyBand {
  const lowest = window.reduce<Feel>(
    (low, r) => (r.feel < low ? r.feel : low), window[0].feel,
  );
  return BAND_FOR_LOWEST[lowest];
}

function capAt(band: AccuracyBand, ceiling: AccuracyBand): AccuracyBand {
  return BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(ceiling) ? ceiling : band;
}
