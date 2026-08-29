/**
 * The join between a stored `spacingState` row and the scheduler's
 * view of a card, plus how a row earns its band.
 */

import type { SpacingState } from '../db';
import type { AccuracyBand } from './bands';
import type { SpacingCardState } from './engine';
import {
  bandOf, engagementVerdict, measuredVerdict, selfRatedVerdict,
  type BandVerdict, type RatedRep,
} from './banding';
import { feelForRating, type Feel } from '../fluencyScale';

/**
 * The band a row is currently in.
 *
 * TWO RULES, PICKED BY WHAT THE ROW ACTUALLY HOLDS. Attempt entries
 * mean a measured card and the twenty-answer percentage; rating
 * entries mean a self-rated one and the lowest of the last three. See
 * `banding.ts` for why the choice is read from the signals rather than
 * from the module name.
 */
export function bandVerdictForRow(
  row: Pick<SpacingState, 'performanceHistory'>,
): BandVerdict {
  const history = Array.isArray(row.performanceHistory) ? row.performanceHistory : [];

  const answers: Array<{ correct: boolean }> = [];
  const reps: RatedRep[] = [];
  for (const entry of history) {
    if (entry?.kind === 'attempt' && typeof entry.correct === 'boolean') {
      answers.push({ correct: entry.correct });
    } else if (entry?.kind === 'rating' && typeof entry.rating === 'string') {
      // A rep that does not score is still a rep that HAPPENED — it
      // just does not move the rating. Songs: a logged practice session
      // counts for coverage and last-touched, only a test rates.
      if (entry.scores === false) continue;
      const feel = typeof entry.feel === 'number'
        ? entry.feel as Feel
        : feelForRating(entry.rating as 'flying' | 'cruising' | 'crawling');
      // CARRIED THROUGH ONLY WHEN PRESENT. An entry with no flag is
      // legacy and must stay legacy all the way to the banding rule —
      // coercing it to a boolean here is exactly how a whole database
      // of Fluent cards would quietly become Developing.
      // Same rule for the session id, for the same reason: absent has
      // to reach the banding rule as absent, so it can be read as
      // "cannot be identified" rather than "differs from everything".
      reps.push({
        feel,
        ...(typeof entry.fromTest === 'boolean' ? { fromTest: entry.fromTest } : {}),
        ...(typeof entry.sessionId === 'string' ? { sessionId: entry.sessionId } : {}),
      });
    }
    // 'recency' carries no verdict at all — expression items have no
    // correctness — and is skipped rather than counted as a zero.
    // It still counts as ENGAGEMENT below; a thing with no verdict to
    // give is not a thing that never happened.
  }

  if (answers.length > 0) return measuredVerdict(answers);
  if (reps.length > 0) return selfRatedVerdict(reps);

  // NOTHING HERE SCORES — but something is here.
  //
  // Every entry the two rules above declined to read is still a record
  // that this item was engaged with: a `scores: false` practice
  // session, a `recency` entry, an entry too malformed to classify.
  // The history is the app's own record that something happened, so a
  // non-empty one cannot mean "never met".
  //
  // Deliberately counts the WHOLE history rather than a filtered
  // subset. Filtering would need a list of which kinds count, and that
  // list is the seam a future entry kind gets forgotten at — arriving
  // as Not Started, which is the failure this change exists to fix.
  return engagementVerdict(history.length);
}

/** The band, or null when the card has not earned one. */
export function bandForRow(
  row: Pick<SpacingState, 'performanceHistory'>,
): AccuracyBand | null {
  return bandOf(bandVerdictForRow(row));
}

/**
 * A stored row as the scheduler sees it.
 *
 * A row with no `spacingStage` predates the two-stage engine and reads
 * as maintaining — it has a real interval and real history behind it,
 * and dropping it into a first-exposure tally would re-teach something
 * the reader already knows.
 */
export function cardStateFromRow(row: SpacingState): SpacingCardState {
  return {
    stage: row.spacingStage ?? 'maintaining',
    exposuresDone: row.exposuresDone ?? 0,
    extraExposures: row.extraExposures ?? 0,
    currentWaitDays: row.currentIntervalDays ?? 0,
    lastAnsweredAt: row.lastEngagedAt ?? null,
    nextDueAt: row.nextDueAt ?? null,
  };
}

/** The fields a scheduler result writes back onto the row. */
export function rowFieldsFromCardState(state: SpacingCardState): Partial<SpacingState> {
  return {
    spacingStage: state.stage,
    exposuresDone: state.exposuresDone,
    extraExposures: state.extraExposures,
    currentIntervalDays: state.currentWaitDays,
    lastEngagedAt: state.lastAnsweredAt,
    nextDueAt: state.nextDueAt,
  };
}

/**
 * When this card was last TESTED, or null if it never has been.
 *
 * =====================================================================
 * STALENESS IS MEASURED FROM THE LAST TEST, NOT THE LAST ENGAGEMENT.
 *
 * Otherwise a shape could be practised forever, resetting its schedule
 * every time, and sit there claiming Fluent while never once being
 * re-proved. Practice moves when the shape comes back around; only a
 * test clears the stale marker.
 *
 * Derived rather than stored, because `performanceHistory` already
 * carries the timestamps and a second copy is a second thing to keep
 * in step. The history is capped at twenty entries, so a card tested
 * long ago and practised heavily since can age its test out of the
 * array — that reads as never tested, which errs toward asking for a
 * re-test rather than toward claiming one that cannot be evidenced.
 *
 * The stale MARKER itself is not drawn yet. This is here so the date
 * is right from the first write and nothing needs re-migrating when it
 * is.
 * =====================================================================
 */
export function lastTestAt(
  row: Pick<SpacingState, 'performanceHistory'>,
): number | null {
  const history = Array.isArray(row.performanceHistory) ? row.performanceHistory : [];
  let latest: number | null = null;
  for (const entry of history) {
    if (entry?.kind !== 'rating' || entry.fromTest !== true) continue;
    if (typeof entry.t !== 'number') continue;
    if (latest === null || entry.t > latest) latest = entry.t;
  }
  return latest;
}
