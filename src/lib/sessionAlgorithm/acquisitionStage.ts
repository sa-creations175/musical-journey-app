/**
 * Phase 3 Step 2b — Acquisition stage helpers for the algorithm.
 *
 * The transition logic itself (`new → acquiring → acquired`) lives in
 * Phase 2's `lib/spacingState.ts` — declarative threshold,
 * rating-based threshold, expression no-op, all already implemented
 * and tested. Step 6h reuses that pipeline at session-end via
 * `recordEngagement`.
 *
 * What the Phase 3 algorithm needs that the Phase 2 module doesn't
 * already give it: a small set of pure predicates that handle the
 * "no spacingState row = implicitly new" rule uniformly. Without
 * these, every weighting / candidate / cold-start helper would
 * re-derive the same logic and risk drift.
 *
 * Re-exports the canonical transition functions from spacingState so
 * algorithm code has one import surface.
 */

import type { AcquisitionStage } from '../db';
import type { SpacingRow } from './types';

export {
  computeNextStage,
  nextStageDeclarative,
  nextStageExpression,
  nextStageRatingBased,
  type PerformanceEntry,
} from '../spacingState';

/** Stages that count as "covered" — the user has demonstrated stable
 *  recall. Mirrors `COVERED_STAGES` in goals/progress.ts. Re-exported
 *  here so algorithm code doesn't reach into the goals module. */
export const COVERED_STAGES: ReadonlySet<AcquisitionStage> = new Set([
  'acquired',
  'consolidated',
  'mastered',
]);

/**
 * Resolve a spacingState row (or its absence) to a canonical stage.
 * Items the user has never touched have no row; the algorithm treats
 * them as implicitly `new`.
 */
export function acquisitionStageFor(row: SpacingRow | undefined): AcquisitionStage {
  return row?.acquisitionStage ?? 'new';
}

/** True when the user has begun engaging but hasn't reached the
 *  acquired threshold. Items in this stage get the acquisition-
 *  density lift in Step 2d weighting. */
export function isAcquiring(row: SpacingRow | undefined): boolean {
  return acquisitionStageFor(row) === 'acquiring';
}

/** True when the item has reached `acquired` or higher — counts toward
 *  coverage goals and exits the acquisition-density treatment. */
export function isAcquired(row: SpacingRow | undefined): boolean {
  return COVERED_STAGES.has(acquisitionStageFor(row));
}

/** True when the user has never engaged with this item (no row, or
 *  row stuck at `new`). */
export function isNew(row: SpacingRow | undefined): boolean {
  return acquisitionStageFor(row) === 'new';
}

/**
 * Filter a list of rows to those in the `acquiring` stage. Convenience
 * for the weighting helper in Step 2d, which applies acquisition-
 * density weighting to exactly this set.
 */
export function getAcquiringItems(
  rows: ReadonlyArray<SpacingRow>,
): readonly SpacingRow[] {
  return rows.filter(r => r.acquisitionStage === 'acquiring');
}
