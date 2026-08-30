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
 *   visualisation, and song repertoire — take the LOWEST of three
 *   reps. Not an average. Three cleans and one struggle is Needs Work,
 *   because the struggle is the thing that has not gone away.
 *
 *   WHICH three depends on where the evidence came from. A passed test
 *   is three runs IN A ROW, all Clean or better, and its lowest sets
 *   the band. Practice has no streak: the last three rated reps, and a
 *   ceiling at Developing. See `selfRatedVerdict`.
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
import { bandForAccuracyPercent, bandRank } from './bands';
import { isCleanFeel, type Feel } from '../fluencyScale';

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

/**
 * STARTED MEANS ENGAGED, NOT "SCORED ONCE OR TWICE".
 *
 * =====================================================================
 * The two verdict functions below only ever see signals that SCORE —
 * attempts, and ratings that count toward a band. Everything else the
 * app records about an item was invisible to them, so an item could
 * carry real recorded engagement and still read Not Started.
 *
 * That was not a gap in what the app stores. It stores these already:
 *
 *   · a `rating` entry with `scores: false` — written by
 *     `repertoire/logPractice.ts` for a logged practice session, whose
 *     own comment says it "counts toward coverage and last-touched"
 *     but is kept "out of the rating". `row.ts` then dropped it and
 *     the song read as never touched.
 *   · a `recency` entry — Just Play, Just Produce, the diary. Things
 *     with no verdict to give, which is not the same as no engagement.
 *   · an abandoned test, whose one or two reps score but do not band.
 *
 * So this is the reader catching up with the writers, not a new claim.
 * Not Started returns to meaning what its docstring always said it
 * meant: NEVER MET. Anything else that happened is Started.
 *
 * ONE RULE FOR EVERY MODULE. Shapes, scales, voice-leading, mental
 * visualisation, the chord-progression quiz and repertoire all reach
 * this through `bandVerdictForRow`, and none of them may special-case
 * it — a per-module notion of "engaged" is how two numbers start
 * disagreeing about the same card.
 *
 * `tries` is 0 because it counts SCORING signals and there are none.
 * Same idiom as `InversionBreakdownPanel`, which already builds a
 * `{ kind: 'started', tries: 0 }` for a rolled-up row.
 * =====================================================================
 */
export function engagementVerdict(engagements: number): BandVerdict {
  return engagements > 0 ? { kind: 'started', tries: 0 } : NOT_STARTED;
}

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
 *
 * ALL FOUR ROWS ARE STILL REACHABLE, but no longer by the same route.
 * The first two are practice outcomes now — a streak with a below-Clean
 * run in it is not a passing test, so a test never arrives here with a
 * lowest of 1 or 2. The map stays whole because the practice path uses
 * every row of it, and because a ladder with two rungs sawn off would
 * have to be explained at each of its readers.
 */
export const BAND_FOR_LOWEST: Record<Feel, AccuracyBand> = {
  1: 'needs-work',
  2: 'developing',
  3: 'fluent',
  4: 'mastered',
};

/** The ceiling practice-only evidence cannot pass. */
const PRACTICE_CEILING: AccuracyBand = 'developing';

/** A rated rep, with the mode that produced it where it is known. */
export interface RatedRep {
  feel: Feel;
  /** True for a test rep, false for a practice one. ABSENT MEANS
   *  LEGACY — written before the modes existed, and never capped. */
  fromTest?: boolean;
  /** Which testing session it happened in. ABSENT MEANS UNKNOWABLE —
   *  pre-change history, or a surface with no session. Never treated
   *  as a session that differs; see `sameSession`. */
  sessionId?: string;
}

/**
 * Could these two reps have been in the same testing session?
 *
 * =====================================================================
 * ONLY A KNOWN DIFFERENCE BREAKS A STREAK.
 *
 * `a.sessionId === b.sessionId` would have been wrong in the one
 * direction that matters. Two pre-change reps both carry `undefined`,
 * which compares equal and would silently mean "same session" for
 * every legacy row in the database — an answer this function has no
 * business giving. And a legacy rep next to a new one would compare
 * unequal and break a streak on the arrival of a field, re-banding
 * rows for a reason no user could see.
 *
 * So the question is asked as "is there evidence these are different",
 * and absence is not evidence. Existing history bands exactly as it
 * did; only reps that both know their session can be told apart.
 *
 * Same shape as `fromTest`'s legacy rule two fields up, and for the
 * same reason: a field that did not exist cannot be read as a value.
 * =====================================================================
 */
function sameSession(a: RatedRep, b: RatedRep): boolean {
  if (a.sessionId === undefined || b.sessionId === undefined) return true;
  return a.sessionId === b.sessionId;
}

/**
 * The band, from a passed test where there is one and from practice
 * where there is not.
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
 *   once tested    the last PASSED test sets it. Practice can neither
 *                  raise it nor drag it down.
 *   past due       the same band, marked stale elsewhere. No decay
 *                  happens here — a band is not lowered by time.
 *   tested again   a newer pass replaces it, up or down.
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

  // A PASSED TEST OUTRANKS EVERYTHING. No pass, and the practice path
  // below carries on holding whatever it held — an abandoned or failed
  // test does not demote.
  const won = lastPassedTest(reps);
  if (won !== null) return { kind: 'band', band: lowestBand(won) };

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

/**
 * The three runs of the most recent PASSED test, or null if no test
 * has been passed.
 *
 * =====================================================================
 * A STREAK, NOT A WINDOW — AND THE RESET IS THE WHOLE CHANGE.
 *
 * The rule used to be "the lowest of the last three test reps", with no
 * reset. Under it a bad first run made the rest of the test pointless:
 * rate run one Working on it and the ceiling for the session is
 * Developing, which the user already had, so runs two and three were
 * theatre. Worse, the three did not have to be in a row — a struggle,
 * a clean, a clean and a clean would band on the last three and quietly
 * forget the struggle it was supposed to remember.
 *
 * Now a below-Clean run costs the streak and offers a way back. That
 * cuts both ways and both are intended: a failed run genuinely undoes
 * the two before it, and the user can start again in the same session.
 *
 * WHAT A TEST CAN NOW REACH. Every run in a passing streak is Clean or
 * better, so the lowest is 3 or 4 and a passed test lands on Fluent or
 * Mastered — never lower. That is not a lost capability: a test that
 * would have banded Needs Work is a test that was failed, and a failed
 * test does not demote. It leaves the band where practice had it.
 *
 * THE THIRD CLEAN RUN IS THE PASS, so a completed streak closes and the
 * next clean run begins a new one. Four in a row is a pass and one run
 * into the next test, not a pass measured over four. Scanning forward
 * and keeping the LAST completed streak is what makes "tested again
 * replaces it" true.
 *
 * ONE SESSION IS ENFORCED, BY IDENTITY AND NOT BY TIME. A rep carries
 * the id of the session it happened in, minted once when that session
 * starts and carried through a pause unchanged — so a paused session
 * still passes its test, which is the requirement the field exists for
 * rather than a side benefit. Inferring it from `t` was ruled out and
 * had to be: a whole song takes minutes to play, so any gap constant
 * breaks every real streak on its second run.
 *
 * A rep with no id is pre-change history, and `sameSession` reads that
 * as unknowable rather than as a difference. See it for why.
 * =====================================================================
 */
function lastPassedTest(
  reps: ReadonlyArray<RatedRep>,
): ReadonlyArray<RatedRep> | null {
  let run: RatedRep[] = [];
  let won: RatedRep[] | null = null;
  for (const r of reps) {
    // Practice reps are not in the streak at all. They are not a
    // failure either — practising between two test runs does not break
    // a test, it just is not part of one.
    if (r.fromTest !== true) continue;
    // A NEW SESSION STARTS THE COUNT OVER, wherever the last one got
    // to. Two clean runs on Tuesday and one on Wednesday are not three
    // in a row. Checked against the run's first rep rather than its
    // last so a streak cannot drift across sessions one rep at a time.
    if (run.length > 0 && !sameSession(run[0], r)) run = [];
    if (isCleanFeel(r.feel)) {
      run.push(r);
      if (run.length === SELF_RATED_WINDOW) { won = run; run = []; }
    } else {
      run = [];
    }
  }
  return won;
}

function lowestBand(window: ReadonlyArray<RatedRep>): AccuracyBand {
  const lowest = window.reduce<Feel>(
    (low, r) => (r.feel < low ? r.feel : low), window[0].feel,
  );
  return BAND_FOR_LOWEST[lowest];
}

function capAt(band: AccuracyBand, ceiling: AccuracyBand): AccuracyBand {
  // The ordering is the band table's own — see `bandRank`. This file
  // used to keep a fourth copy of the list.
  return bandRank(band) > bandRank(ceiling) ? ceiling : band;
}
