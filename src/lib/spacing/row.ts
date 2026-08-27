/**
 * The join between a stored `spacingState` row and the scheduler's
 * view of a card, plus how a row earns its band.
 */

import type { SpacingState } from '../db';
import { bandForAccuracyPercent, type AccuracyBand } from './bands';
import type { SpacingCardState } from './engine';

/**
 * How many recent signals decide the band.
 *
 * The same window the acquisition rule already uses, and for the same
 * reason: a band is meant to say how the card is going NOW. A lifetime
 * average would let a card that has been wrong all week keep a rating
 * it earned a month ago.
 */
export const BAND_WINDOW = 10;

/**
 * A rating is worth this much when it stands in for a percentage.
 *
 * =====================================================================
 * HALF THE APP DOES NOT HAVE A PERCENTAGE TO BAND.
 *
 * Declarative modules answer right or wrong and produce one honestly.
 * Procedural and integration modules produce Flying / Cruising /
 * Crawling — a judgement, not a score — and the scheduler still needs
 * a band for them, because they are on the same engine.
 *
 * So a rating is mapped to the middle of the band it plainly means:
 * Flying is fluent, Cruising is developing, Crawling is needs-work.
 * Deliberately NOT 100 for Flying — one good day should not put a
 * drill in the band reserved for near-perfect recall, and averaging a
 * window of them can still climb there.
 * ===================================================================== */
export const RATING_PERCENT: Readonly<Record<string, number>> = {
  flying: 90,
  cruising: 70,
  crawling: 30,
};

/**
 * The band a row is currently in, or null when nothing has been
 * recorded that could produce one.
 *
 * Null is not "needs work". A card with no history has not scored
 * badly, it has not scored — and the acquiring stage exists precisely
 * so that nothing needs a band until it has earned one.
 */
export function bandForRow(row: Pick<SpacingState, 'performanceHistory'>): AccuracyBand | null {
  const history = Array.isArray(row.performanceHistory) ? row.performanceHistory : [];
  const scored: number[] = [];
  for (const entry of history) {
    const kind = entry?.kind;
    if (kind === 'attempt' && typeof entry.correct === 'boolean') {
      scored.push(entry.correct ? 100 : 0);
    } else if (kind === 'rating' && typeof entry.rating === 'string') {
      const pct = RATING_PERCENT[entry.rating];
      if (pct !== undefined) scored.push(pct);
    }
    // 'recency' entries carry no verdict and are skipped rather than
    // counted as zero — expression items have no correctness at all.
  }
  if (scored.length === 0) return null;
  const window = scored.slice(-BAND_WINDOW);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  return bandForAccuracyPercent(mean);
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
