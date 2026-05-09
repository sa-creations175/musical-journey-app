import { db, type Goal } from '../../lib/db';

/**
 * Find the active yearly anchor goal for the given module. Returns
 * null when no active yearly goal includes the module in its
 * `relatedModules` — the suggestion flow uses this to block entry
 * and route the user to YearlyAnchorFlow first, since every
 * weekly / monthly / quarterly goal auto-connects to its module's
 * yearly anchor.
 *
 * When multiple eligible anchors exist (rare — usually only one
 * yearly goal per module is active at a time), returns the most
 * recently-started one. Sort key is `startDate` rather than
 * `created_at` so a yearly goal whose period started later is
 * considered the "current" anchor even if it was created earlier.
 */
export async function findAnchorGoalForModule(moduleId: string): Promise<Goal | null> {
  const candidates = await db.goals
    .where('scope').equals('yearly')
    .filter(g => g.status === 'active' && g.relatedModules.includes(moduleId))
    .toArray();
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.startDate - a.startDate);
  return candidates[0];
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
