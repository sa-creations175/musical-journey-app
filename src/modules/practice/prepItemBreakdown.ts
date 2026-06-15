/**
 * Prep-screen per-item breakdown (prep-flow redesign).
 *
 * Splits a block's adjusted drill budget across its itemRefs so the
 * prep card can show "what's coming" item-by-item with a time share.
 *
 * Shares are WEIGHTED by each item's canonical per-cell time where
 * known (scales: natural-minor rides the 90s drill window, 3× the
 * 30s maintenance pass; chord shapes: the fluid all-inversion run is
 * 120s vs 90s) and uniform otherwise. The weighted shares are then
 * scaled to the block's current `adjustedDrillSeconds`, so they:
 *   - track the prep-screen +/- adjustment, and
 *   - always sum to the total drill time the card shows.
 *
 * Returns null when there's nothing useful to render: no items, or a
 * list longer than MAX_BREAKDOWN_ITEMS (a long flashcard queue is
 * noise, not a breakdown — the card shows just the total there).
 */
import { parseScaleItemRef } from '../shapes-and-patterns/scaleSkills';
import { readableItemRefLabel } from './readableItemLabel';
import {
  CHORD_SHAPE_CELL_SECONDS,
  CHORD_SHAPE_FLUID_CELL_SECONDS,
  HANDS_PER_SHAPE_ITEM,
  SCALE_KIND_SECONDS,
} from '../../lib/sessionAlgorithm/timePerAttempt';

export interface PrepItemRow {
  itemRef: string;
  /** Human-readable label (e.g. "C natural minor", "Cmaj7 (major
   *  seventh)"). Falls back to the raw itemRef for formats outside
   *  the S&P labeler. */
  label: string;
  /** This item's share of the block's drill budget, in seconds. */
  seconds: number;
}

export const MAX_BREAKDOWN_ITEMS = 12;

/** Canonical per-cell weight (seconds) for an itemRef — the relative
 *  size of its slice. Unknown formats weight uniformly (1). */
function itemWeight(itemRef: string): number {
  const scale = parseScaleItemRef(itemRef);
  // Floored at 60 to match generation (shapesSplit) — so when the block
  // total is the sum of these floored weights, the split reproduces the
  // exact per-item drill times the runner uses. Scales & chord shapes
  // are drilled left / right / both, so the per-item weight is 3× the
  // per-hand cell time (matches shapesSplit's tripled budget). Voice
  // leading and other refs stay single-pass.
  if (scale) return HANDS_PER_SHAPE_ITEM * Math.max(60, SCALE_KIND_SECONDS[scale.kind]);
  if (itemRef.startsWith('chord-shape:')) {
    return HANDS_PER_SHAPE_ITEM * (itemRef.endsWith(':fluid')
      ? CHORD_SHAPE_FLUID_CELL_SECONDS
      : CHORD_SHAPE_CELL_SECONDS);
  }
  return 1;
}

export function buildPrepItemBreakdown(
  itemRefs: readonly string[] | undefined,
  totalDrillSeconds: number,
  moduleRef?: string,
): PrepItemRow[] | null {
  if (!itemRefs || itemRefs.length === 0) return null;
  if (itemRefs.length > MAX_BREAKDOWN_ITEMS) return null;

  const weights = itemRefs.map(itemWeight);
  // Guard against a degenerate 0 total (shouldn't happen — weights are
  // ≥1 — but keeps the division safe).
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || itemRefs.length;

  return itemRefs.map((itemRef, i) => {
    const share = Math.round((totalDrillSeconds * weights[i]) / totalWeight);
    // Scales carry a 60s minimum per item — the in-session runner and
    // the prep card use the same floored value so they always agree.
    const isScale = parseScaleItemRef(itemRef) !== null;
    return {
      itemRef,
      label: readableItemRefLabel(moduleRef, itemRef),
      seconds: isScale ? Math.max(60, share) : share,
    };
  });
}
