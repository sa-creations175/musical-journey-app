/**
 * Phase 3 Step 2d — Item weighting.
 *
 * Combines five factors into a single weight per item, used by the
 * algorithm to rank candidate items before allocating block time:
 *
 *   weight = goal-alignment × pace × acquisition × freshness × priority
 *
 * Each factor is a multiplicative deviation from 1.0 (neutral). Items
 * with no signal in a dimension default to 1.0 there.
 *
 *   goal-alignment — scope-driven; weekly goals push hardest, yearly
 *                    goals lift mildly (pace does the rest of the
 *                    work for long-horizon goals).
 *   pace           — from 2c. 1.0 ahead → 2.0 significantly behind.
 *   acquisition    — items in `acquiring` stage get a density lift
 *                    (research: more touches help cement skills early).
 *   freshness      — older-touched items lift; very-recent items
 *                    cool down so the algorithm doesn't keep
 *                    surfacing them in the same day.
 *   priority       — user-declared per-item priority (Comfort / Deep /
 *                    Maintenance). Phase 3 ships with no priority
 *                    UI; default 1.0. Hook is in place for later.
 *
 * All factor constants are exported and calibrated from intuition;
 * real use will inform refinements.
 *
 * Multi-goal items — when an item is referenced by several active
 * goals, the MAX goal-alignment factor wins; we don't compound. The
 * most urgent goal owns the item's priority. Pace factor combines
 * the same way (max across the goals that reference the item).
 */

import type { GoalScope } from '../db';
import type { SpacingRow } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Goal alignment
// ---------------------------------------------------------------------

export const GOAL_ALIGNMENT_FACTOR_WEEKLY = 1.8;
export const GOAL_ALIGNMENT_FACTOR_MONTHLY = 1.4;
export const GOAL_ALIGNMENT_FACTOR_QUARTERLY = 1.2;
export const GOAL_ALIGNMENT_FACTOR_YEARLY = 1.1;
export const GOAL_ALIGNMENT_FACTOR_LONG_HORIZON = 1.05;
export const GOAL_ALIGNMENT_FACTOR_NONE = 1.0;

export function goalAlignmentFactor(scope: GoalScope): number {
  switch (scope) {
    case 'weekly':           return GOAL_ALIGNMENT_FACTOR_WEEKLY;
    case 'monthly':          return GOAL_ALIGNMENT_FACTOR_MONTHLY;
    case 'quarterly':        return GOAL_ALIGNMENT_FACTOR_QUARTERLY;
    case 'yearly':           return GOAL_ALIGNMENT_FACTOR_YEARLY;
    case 'two_to_three_year':
    case 'lifetime':
      return GOAL_ALIGNMENT_FACTOR_LONG_HORIZON;
  }
}

// ---------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------

export const ACQUISITION_FACTOR_ACQUIRING = 1.5;
export const ACQUISITION_FACTOR_NEUTRAL = 1.0;

export function acquisitionFactor(row: SpacingRow | undefined): number {
  if (!row) return ACQUISITION_FACTOR_NEUTRAL;
  return row.acquisitionStage === 'acquiring'
    ? ACQUISITION_FACTOR_ACQUIRING
    : ACQUISITION_FACTOR_NEUTRAL;
}

// ---------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------

export const FRESHNESS_DAYS_RECENT = 1;
export const FRESHNESS_DAYS_NEUTRAL = 4;
export const FRESHNESS_DAYS_AGING = 8;
export const FRESHNESS_DAYS_STALE = 15;

export const FRESHNESS_FACTOR_TOO_RECENT = 0.5;
export const FRESHNESS_FACTOR_NEUTRAL = 1.0;
export const FRESHNESS_FACTOR_AGING = 1.3;
export const FRESHNESS_FACTOR_STALE = 1.6;
export const FRESHNESS_FACTOR_VERY_STALE = 1.8;

/**
 * Freshness lift based on days since the user last engaged with the
 * item. Newer-touched items are slightly cooled (so the algorithm
 * doesn't keep returning to the same item within one session block);
 * older-touched items rise to surface them.
 *
 *   < 1 day   → 0.5  (just touched — back off)
 *   1–3 days  → 1.0  (neutral)
 *   4–7 days  → 1.3  (aging)
 *   8–14 days → 1.6  (stale)
 *   15+ days  → 1.8  (very stale — pull forward)
 *
 * Items the user has never touched (no row, or row with
 * lastEngagedAt = null) are NEUTRAL, not stale — they aren't part of
 * the freshness story. Cold-start ordering (2i) is what surfaces
 * never-touched items.
 */
export function freshnessFactor(
  row: SpacingRow | undefined,
  now: number,
): number {
  if (!row || row.lastEngagedAt === null) return FRESHNESS_FACTOR_NEUTRAL;
  const days = Math.max(0, (now - row.lastEngagedAt) / MS_PER_DAY);
  if (days < FRESHNESS_DAYS_RECENT)  return FRESHNESS_FACTOR_TOO_RECENT;
  if (days < FRESHNESS_DAYS_NEUTRAL) return FRESHNESS_FACTOR_NEUTRAL;
  if (days < FRESHNESS_DAYS_AGING)   return FRESHNESS_FACTOR_AGING;
  if (days < FRESHNESS_DAYS_STALE)   return FRESHNESS_FACTOR_STALE;
  return FRESHNESS_FACTOR_VERY_STALE;
}

// ---------------------------------------------------------------------
// Priority — user-declared per-item priority
// ---------------------------------------------------------------------

export type ItemPriority = 'comfort' | 'deep' | 'maintenance';

export const PRIORITY_FACTOR_DEEP = 1.4;
export const PRIORITY_FACTOR_COMFORT = 1.0;
export const PRIORITY_FACTOR_MAINTENANCE = 0.6;

export function priorityFactor(priority: ItemPriority | undefined): number {
  if (priority === 'deep')        return PRIORITY_FACTOR_DEEP;
  if (priority === 'maintenance') return PRIORITY_FACTOR_MAINTENANCE;
  return PRIORITY_FACTOR_COMFORT;
}

// ---------------------------------------------------------------------
// Scoped-coverage boost
// ---------------------------------------------------------------------

/**
 * Multiplier applied when at least one of the item's contributing
 * goals is a specific-coverage goal (a coverage spec carrying an
 * `itemRefFilter` — see candidateSpecForGoal in candidates.ts).
 *
 * Intent: when the user has an active goal that targets a specific
 * sub-area ("Major triads", "ii–V–I voice-leading", "Workflow
 * Foundations lessons", etc.), the items inside that sub-area
 * should dominate the session — but items OUTSIDE the sub-area
 * still surface at base weight so the user keeps brushing against
 * peripheral skills.
 *
 * The boost lives at the weighting layer, not the filtering layer
 * — both sub-area and non-sub-area items remain in the candidate
 * pool, just at different weights. This is the conscious design
 * call from the May 2026 S&P goal-alignment fix.
 */
export const SCOPED_COVERAGE_BOOST_FACTOR = 3.0;
export const SCOPED_COVERAGE_BOOST_NEUTRAL = 1.0;

// ---------------------------------------------------------------------
// Combined weight
// ---------------------------------------------------------------------

export interface WeightFactors {
  goalAlignment: number;
  pace: number;
  acquisition: number;
  freshness: number;
  priority: number;
  /** Scoped-coverage boost — see SCOPED_COVERAGE_BOOST_FACTOR.
   *  1.0 when no contributing goal is a specific-coverage match,
   *  SCOPED_COVERAGE_BOOST_FACTOR when at least one is. */
  scopedCoverage: number;
}

/** Per-goal contribution to one item's weight. */
export interface GoalContribution {
  scope: GoalScope;
  paceFactor: number;
  /** True when this contribution comes from a specific-coverage
   *  goal whose itemRefFilter matched the item — i.e. the item is
   *  inside the user's active sub-area scope. Default false. */
  viaScopedCoverage?: boolean;
}

export interface WeightContext {
  /** spacingState row for the item, or undefined if untouched. */
  row: SpacingRow | undefined;
  /**
   * Goals that reference this item and their corresponding pace
   * factors (from 2c). Each entry's `scope` drives goal-alignment;
   * `paceFactor` drives pace lift. MAX wins across the array.
   * Empty when no active goal references the item.
   */
  goals: ReadonlyArray<GoalContribution>;
  /** Per-item priority. Phase 3 ships without UI; default undefined → 1.0. */
  priority?: ItemPriority;
  /** Reference time. */
  now: number;
}

export interface WeightResult {
  weight: number;
  factors: WeightFactors;
}

export function weightForItem(ctx: WeightContext): WeightResult {
  const goalAlignment =
    ctx.goals.length === 0
      ? GOAL_ALIGNMENT_FACTOR_NONE
      : Math.max(...ctx.goals.map(g => goalAlignmentFactor(g.scope)));

  const pace =
    ctx.goals.length === 0
      ? 1.0
      : Math.max(...ctx.goals.map(g => g.paceFactor));

  const scopedCoverage = ctx.goals.some(g => g.viaScopedCoverage)
    ? SCOPED_COVERAGE_BOOST_FACTOR
    : SCOPED_COVERAGE_BOOST_NEUTRAL;

  const factors: WeightFactors = {
    goalAlignment,
    pace,
    acquisition: acquisitionFactor(ctx.row),
    freshness: freshnessFactor(ctx.row, ctx.now),
    priority: priorityFactor(ctx.priority),
    scopedCoverage,
  };

  const weight =
    factors.goalAlignment *
    factors.pace *
    factors.acquisition *
    factors.freshness *
    factors.priority *
    factors.scopedCoverage;

  return { weight, factors };
}
