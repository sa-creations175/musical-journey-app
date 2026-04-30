/**
 * Phase 2 step 6d — Goals home view-mode primitives.
 *
 * The Goals page has a segmented pill toggle just below the
 * header that switches between two views:
 *
 *   - 'timeframe' (default) — action view. Layers by scope
 *     (week / month / quarter / year / 2-3yr / lifetime).
 *     Current behavior; what 6a-6c built.
 *
 *   - 'module' — intentional view. Module is top-level, scope
 *     cascades inside. Built in step 6f.
 *
 * Storage: **localStorage**, not userPrefs / Dexie. Same
 * rationale as `goalRowCollapse.ts` — userPrefs is a synced
 * table, and the SyncContext drain + pullAll('replace') race
 * can wipe local writes that haven't reached Supabase yet
 * (reproduced in 6h.1: flip view → reload immediately →
 * previous selection comes back). View choice is per-device
 * UI state, not data worth coordinating across devices.
 *
 * `parseGoalsView` is the defensive deserializer — anything
 * unrecognized (legacy strings, partial writes, malformed
 * JSON) snaps back to 'timeframe' so a corrupt pref can't
 * strand the user on a non-existent view.
 */

export type GoalsView = 'timeframe' | 'module';

export const STORAGE_KEY_GOALS_ACTIVE_VIEW = 'goals.home.activeView';
export const DEFAULT_GOALS_VIEW: GoalsView = 'timeframe';

/**
 * Coerce an arbitrary stored value to a valid GoalsView.
 * Anything unrecognized falls back to the default. Handles:
 *   - null / undefined (first-visit, never persisted)
 *   - strings other than 'timeframe' / 'module'
 *   - non-string inputs (object / number / boolean — defensive)
 */
export function parseGoalsView(raw: unknown): GoalsView {
  if (raw === 'timeframe' || raw === 'module') return raw;
  return DEFAULT_GOALS_VIEW;
}

/**
 * Synchronous read from localStorage. Returns the parsed view
 * or the default when nothing is stored / parse fails. Defensive:
 * any exception (Storage unavailable in SSR, security
 * restriction) yields the default rather than crashing.
 */
export function loadGoalsView(): GoalsView {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_GOALS_ACTIVE_VIEW)
      : null;
    return parseGoalsView(raw);
  } catch {
    return DEFAULT_GOALS_VIEW;
  }
}

/**
 * Synchronous write to localStorage. Silently swallows
 * exceptions — view selection is QoL, not correctness.
 */
export function saveGoalsView(view: GoalsView): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_GOALS_ACTIVE_VIEW, view);
  } catch {
    /* ignore */
  }
}
