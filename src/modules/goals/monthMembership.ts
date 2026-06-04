import type { Goal } from '../../lib/db';
import type { MonthBoundary } from './carryover';
import { CARRYOVER_DESCRIPTION_PREFIX } from './carryoverAccept';

/**
 * Single source of truth for "which month does a monthly goal belong
 * to, and does month M have a real plan?"
 *
 * Both PlanMonthBanner (does the current month have a plan?) and the
 * weekly-derivation month gate (resolveDerivationMonth — which month's
 * goals feed this week's plan?) must agree on this definition, so the
 * "Plan your month" prompt and the derivation source can never
 * disagree. The rule lives here and nowhere else — do NOT re-implement
 * a goal→month membership check inline anywhere.
 *
 * Owning month = the goal's window overlaps month M's boundary. A
 * carry-over stub (last month's leftover work continuing forward) is
 * NOT an intentional plan for the month, so it's excluded from the
 * "real goals exist" existence check.
 */

/** A real (non-carry-over) active monthly goal — the kind that counts
 *  as an intentional plan for whatever month it lands in. */
export function isRealMonthlyGoal(g: Goal): boolean {
  return (
    g.scope === 'monthly' &&
    g.status === 'active' &&
    // description is always a string on real rows; guard for safety so
    // a malformed/partial row can't throw in the derivation hot path.
    !(g.description ?? '').startsWith(CARRYOVER_DESCRIPTION_PREFIX)
  );
}

/** Does this goal's [startDate, targetDate] window overlap month M? */
export function goalOverlapsMonth(g: Goal, bounds: MonthBoundary): boolean {
  return g.startDate <= bounds.end && g.targetDate >= bounds.start;
}

/**
 * True when at least one real (non-carry-over) active monthly goal's
 * window overlaps month M. This is the existence predicate behind both
 * "No [Month] goals set yet" (PlanMonthBanner) and "next-month goals
 * exist" (the derivation gate).
 */
export function monthHasRealMonthlyGoals(
  goals: ReadonlyArray<Goal>,
  bounds: MonthBoundary,
): boolean {
  return goals.some(g => isRealMonthlyGoal(g) && goalOverlapsMonth(g, bounds));
}
