/**
 * Phase 2 step 5f — anchor-existence detection.
 *
 * The trigger interstitial in GoalCreationFlow asks "is there
 * already a yearly anchor for the module the user just picked?".
 * Two surfaces consume the answer:
 *
 *   - GoalCreationFlow's goNext (when leaving Step 1) — imperative,
 *     awaits the result before deciding whether to show the
 *     interstitial. Avoids a click-race against the live query.
 *
 *   - Step 6's by-module view (future) — reactive, useLiveQuery.
 *     Drives the permanent dashed "Set a yearly anchor for X"
 *     backstop prompt that sits where the umbrella would live.
 *
 * Detection rule per the design call: an anchor exists when at
 * least one Goal row has `isUmbrella: true`, `scope: 'yearly'`,
 * `status: 'active'`, and the module id in `relatedModules`. The
 * `status` filter means a paused or abandoned anchor doesn't
 * suppress the trigger — the user can declare a fresh anchor in
 * those cases. Year is checked via `targetDate` falling within
 * the current calendar year, so a stale 2025 anchor doesn't
 * suppress a 2026 prompt.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal } from '../../lib/db';
import type { AnchorModuleId } from './YearlyAnchorFlow';

/** Returns true when `targetDate` (epoch ms) falls within the
 *  given calendar year — Jan 1 00:00:00 through Dec 31
 *  23:59:59.999 local time. */
export function targetDateInYear(targetDate: number, year: number): boolean {
  const d = new Date(targetDate);
  return d.getFullYear() === year;
}

/**
 * Pure predicate over a goal-array snapshot. Exists alongside the
 * async/hook variants so unit tests can pin the semantics without
 * Dexie. Both `anchorExistsForModule` and `useAnchorExistsForModule`
 * compose this function.
 */
export function hasActiveAnchorForModule(
  goals: ReadonlyArray<Goal>,
  moduleId: AnchorModuleId,
  year: number,
): boolean {
  return goals.some(g =>
    g.isUmbrella === true
    && g.scope === 'yearly'
    && g.status === 'active'
    && Array.isArray(g.relatedModules)
    && g.relatedModules.includes(moduleId)
    && targetDateInYear(g.targetDate, year)
  );
}

/**
 * Async one-shot check used by GoalCreationFlow's goNext. Reads the
 * full `goals` table and applies the predicate in memory. The table
 * is small (a few dozen goals at most per user) so a full scan is
 * cheap; `isUmbrella` is not indexed in the Dexie schema, so an
 * indexed-query path isn't possible without a schema migration.
 * Schema version bump filed for Phase 7 if real performance metrics
 * show this scan dominates a hot path — for now, fast enough.
 */
export async function anchorExistsForModule(
  moduleId: AnchorModuleId,
  year: number = new Date().getFullYear(),
): Promise<boolean> {
  const all = await db.goals.toArray();
  return hasActiveAnchorForModule(all, moduleId, year);
}

/**
 * Reactive hook for surfaces that want a live answer (Step 6's by-
 * module backstop). Returns `undefined` while loading, then
 * `true`/`false`. Re-runs when any `goals` row changes.
 */
export function useAnchorExistsForModule(
  moduleId: AnchorModuleId | null | undefined,
  year: number = new Date().getFullYear(),
): boolean | undefined {
  return useLiveQuery(async () => {
    if (!moduleId) return false;
    const all = await db.goals.toArray();
    return hasActiveAnchorForModule(all, moduleId, year);
  }, [moduleId, year]);
}
