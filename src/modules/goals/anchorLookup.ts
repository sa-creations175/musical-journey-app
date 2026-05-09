import { db, type Goal } from '../../lib/db';

/**
 * Find the active yearly anchor goal for the given module. Returns
 * null when no eligible yearly goal exists — the suggestion flow
 * uses this to block entry and route the user to YearlyAnchorFlow
 * first, since every weekly / monthly / quarterly goal
 * auto-connects to the module's TOP-LEVEL yearly anchor.
 *
 * Eligibility hierarchy (prefer in this order):
 *   1. Active yearly UMBRELLA goal whose relatedModules includes
 *      the moduleId. Umbrella status is the canonical "this is the
 *      anchor" marker — Goals.tsx by-module view treats it the same
 *      way (`isUmbrella && scope === 'yearly'`).
 *   2. Top-level (parentGoalId === null) active yearly goal whose
 *      relatedModules includes the moduleId. Covers the
 *      single-target case where the user has a yearly HF goal that
 *      isn't an umbrella because they only set one target.
 *
 * Yearly goals with parentGoalId !== null are child rows under some
 * other umbrella — never anchor candidates. Without this filter,
 * multi-target umbrellas can match their own children (children
 * inherit scope + relatedModules from the parent's baseFields) and
 * a startDate-tiebreak race can return a child instead of the
 * umbrella, mis-anchoring downstream monthly goals.
 *
 * When multiple eligible candidates exist within a tier (rare —
 * usually only one yearly anchor per module is active at a time),
 * returns the most recently-started one.
 */
export async function findAnchorGoalForModule(moduleId: string): Promise<Goal | null> {
  const yearly = await db.goals
    .where('scope').equals('yearly')
    .filter(g => g.status === 'active' && g.relatedModules.includes(moduleId))
    .toArray();
  if (yearly.length === 0) return null;

  // Tier 1: umbrella anchors.
  const umbrellas = yearly.filter(g => g.isUmbrella);
  if (umbrellas.length > 0) {
    umbrellas.sort((a, b) => b.startDate - a.startDate);
    return umbrellas[0];
  }

  // Tier 2: top-level (parentless) non-umbrella yearlies.
  const topLevel = yearly.filter(g => g.parentGoalId === null);
  if (topLevel.length > 0) {
    topLevel.sort((a, b) => b.startDate - a.startDate);
    return topLevel[0];
  }

  // Only child rows of some other umbrella matched. Don't anchor to
  // a child — return null so the caller blocks flow entry.
  return null;
}

/**
 * Find the active monthly goal for the given module. Used by the
 * weekly suggestion flow to derive the weekly target from the
 * current monthly goal's math. Returns null when none exists; the
 * weekly flow blocks entry and prompts the user to set a monthly
 * goal first.
 */
export async function findActiveMonthlyForModule(moduleId: string): Promise<Goal | null> {
  const candidates = await db.goals
    .where('scope').equals('monthly')
    .filter(g => g.status === 'active' && g.relatedModules.includes(moduleId))
    .toArray();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.startDate - a.startDate);
  return candidates[0];
}
