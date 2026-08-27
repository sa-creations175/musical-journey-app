/**
 * The join between a stored `spacingState` row and the scheduler's
 * view of a card, plus how a row earns its band.
 */

import type { SpacingState } from '../db';
import type { AccuracyBand } from './bands';
import type { SpacingCardState } from './engine';
import {
  NOT_STARTED, bandOf, measuredVerdict, selfRatedVerdict, type BandVerdict,
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
  const reps: Array<{ feel: Feel }> = [];
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
      reps.push({ feel });
    }
    // 'recency' carries no verdict at all — expression items have no
    // correctness — and is skipped rather than counted as a zero.
  }

  if (answers.length > 0) return measuredVerdict(answers);
  if (reps.length > 0) return selfRatedVerdict(reps);
  return NOT_STARTED;
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
