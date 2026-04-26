/**
 * Prompts library — centralized orchestration for Phase 1 (Q10).
 *
 * Public API:
 *
 *   queue.ts       enqueue, markShown, markDismissed, markEngaged,
 *                  markExpired, findByType
 *   orchestrator   selectNextPrompts (tier + cap + suppression)
 *   events.ts      ensureGoalsNudge, recordVacationReturn,
 *                  recordEndOfMonth
 *   types.ts       PROMPT_TYPE, DAILY_CAP, ACTIVE_SESSION_WINDOW_MS,
 *                  TIER_PRIORITY, RE_PROMPT_AFTER_MS
 *
 * Phase 1 verifies orchestration via dev console / programmatic
 * checks (the user-facing Settings UI for queue inspection + mute
 * toggles is deferred to Phase 7). To support that, this barrel
 * also exposes the API on `window.prompts` in dev builds.
 */

export {
  enqueue,
  findByType,
  markDismissed,
  markEngaged,
  markExpired,
  markShown,
} from './queue';

export {
  countShownToday,
  isAnySessionActive,
  selectNextPrompts,
  startOfLocalDay,
} from './orchestrator';

export {
  ensureGoalsNudge,
  recordEndOfMonth,
  recordVacationReturn,
} from './events';

export {
  ACTIVE_SESSION_WINDOW_MS,
  DAILY_CAP,
  PROMPT_TYPE,
  TIER_PRIORITY,
  type PromptType,
} from './types';

// Dev-only: expose the prompts API on window.prompts for console
// debugging. Stripped from production by Vite (the import.meta.env
// .DEV branch folds to `if (false)` and tree-shakes). Mirrors the
// pattern in src/lib/db.ts that exposes the Dexie instance.
if (import.meta.env.DEV) {
  void import('./queue').then(async queue => {
    const orchestrator = await import('./orchestrator');
    const events = await import('./events');
    const types = await import('./types');
    (window as unknown as { prompts: Record<string, unknown> }).prompts = {
      ...queue,
      ...orchestrator,
      ...events,
      ...types,
    };
  });
}
