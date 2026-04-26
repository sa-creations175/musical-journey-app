import { db, type PromptRecord } from '../db';
import { enqueue, findByType, markExpired } from './queue';
import { PROMPT_TYPE } from './types';

/**
 * High-level event emitters — the surfaces consumers actually call.
 * Each is idempotent: callers can invoke them on every relevant
 * mount / state change without worrying about duplicate rows. This
 * keeps the consumers (GoalsNudgeBanner, VacationManager, etc.)
 * simple and the orchestration logic centralized.
 */

// -------------------------------------------------------------------
// Set-goals nudge — the only Phase 1 user-facing prompt.
// -------------------------------------------------------------------

/**
 * Reconcile the set-goals nudge against the user's current state.
 * Returns the live prompt to render, or null if the banner
 * shouldn't show.
 *
 * Rules (simplified — no persistent cadence):
 *   - If the user has any active goal, expire any live nudges and
 *     return null. The prompt's purpose is moot once goals exist;
 *     the banner is permanently gone until the user is back to
 *     zero goals.
 *   - If a queued or shown nudge already exists, return it. Don't
 *     duplicate logging across renders within a "no-goals state."
 *   - Otherwise enqueue a fresh medium-tier banner nudge and
 *     return it.
 *
 * Dismissal is handled in the banner component via local
 * useState — not persisted to the prompts table. The banner
 * re-shows on every Practice Sessions visit when the user has no
 * active goals; "Maybe later" hides it for the current mount only.
 * The prompt row's purpose is the *shown* log entry (analytics +
 * daily-cap counting), not dismissal tracking.
 */
export async function ensureGoalsNudge(): Promise<PromptRecord | null> {
  const activeGoalCount = await db.goals.where('status').equals('active').count();
  const existing = await findByType(PROMPT_TYPE.SET_GOALS_NUDGE);

  if (activeGoalCount > 0) {
    // Expire any live prompts — the user has set goals, the nudge
    // is no longer relevant. Don't touch dismissed/engaged/expired
    // rows (preserves history for analytics).
    for (const p of existing) {
      if (p.status === 'queued' || p.status === 'shown') {
        await markExpired(p.id);
      }
    }
    return null;
  }

  // No goals — find an existing live row or enqueue a new one.
  const live = existing.find(p => p.status === 'queued' || p.status === 'shown');
  if (live) return live;

  return enqueue({
    promptType: PROMPT_TYPE.SET_GOALS_NUDGE,
    tier: 'medium',
    surface: 'banner',
  });
}

// -------------------------------------------------------------------
// Vacation return — logged-only in Phase 1, surface ships in Phase 7.
// -------------------------------------------------------------------

/**
 * Record that a vacation period has ended so Phase 7's welcome-
 * back surface has something to read. Idempotent per periodId —
 * calling repeatedly for the same period is a no-op.
 */
export async function recordVacationReturn(
  periodId: string,
  returnedAt: number = Date.now(),
): Promise<void> {
  const existing = await findByType(PROMPT_TYPE.VACATION_RETURN);
  const already = existing.some(p => (p.payload?.periodId as string | undefined) === periodId);
  if (already) return;

  await enqueue({
    promptType: PROMPT_TYPE.VACATION_RETURN,
    tier: 'medium',
    surface: 'home_screen',
    payload: { periodId, returnedAt },
  });
}

// -------------------------------------------------------------------
// End-of-month — logged-only in Phase 1, review UI ships in Phase 7.
// -------------------------------------------------------------------

/**
 * Record an end-of-month event for the most recently completed
 * calendar month, if not already recorded. Idempotent per
 * `YYYY-MM` key. Safe to call on any app mount; does nothing
 * mid-month after the prior month has been logged once.
 */
export async function recordEndOfMonth(now: number = Date.now()): Promise<void> {
  const monthKey = priorMonthKey(now);
  const existing = await findByType(PROMPT_TYPE.END_OF_MONTH);
  const already = existing.some(p => (p.payload?.monthKey as string | undefined) === monthKey);
  if (already) return;

  await enqueue({
    promptType: PROMPT_TYPE.END_OF_MONTH,
    tier: 'low',
    surface: 'home_screen',
    payload: { monthKey, recordedAt: now },
  });
}

/** Format the calendar month immediately before `now` (local) as
 *  YYYY-MM. e.g., on May 1 PDT → "2026-04". */
function priorMonthKey(now: number): string {
  const d = new Date(now);
  const prior = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}`;
}
