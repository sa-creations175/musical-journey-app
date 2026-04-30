/**
 * Phase 2 step 6g — per-user collapse state for goal rows.
 *
 * Goals home rows have an expanded panel (chart + progress +
 * actions, or umbrella details + children). 6a–6f used local
 * useState per row, which reset on every reload. 6g lifts the
 * state to the page and persists so a row stays where the user
 * left it across sessions.
 *
 * Storage: **localStorage**, not userPrefs / Dexie.
 *
 * Why not userPrefs? userPrefs is a synced table — writes get
 * hooked and queued for Supabase, and every page mount runs
 * `drain()` + `pullAll('replace')` from SyncContext. The pull
 * is bidirectional: in replace mode it deletes local rows not
 * in cloud and bulkPut-overwrites local with cloud. Collapse
 * state isn't worth coordinating across devices, and the round-
 * trip introduces a race where a local write made just before
 * a reload can be wiped or stale-overwritten by the pull. (6g
 * reproduced this in practice.) localStorage is synchronous,
 * survives reloads, and isn't sync'd — exactly the right shape
 * for ephemeral UI state.
 *
 * Defaults differ by row type:
 *   - Umbrella rows default to expanded (subtree visible)
 *   - Regular rows default to collapsed (panel hidden)
 *
 * Storage stores only deviations from default — when the user
 * collapses an umbrella we save 'collapsed'; when they expand a
 * regular row we save 'expanded'; when they toggle back to the
 * default we delete the entry. Keeps the stored map small.
 *
 * Same map covers both views. Collapsing a row in by-timeframe
 * preserves that state when switching to by-module — goal id
 * is the only key.
 */

export type RowCollapseValue = 'collapsed' | 'expanded';
export type RowCollapseState = Record<string, RowCollapseValue>;

export const STORAGE_KEY_ROW_COLLAPSE = 'goals.home.rowCollapse';

/**
 * Resolve whether a row is expanded right now. Reads any stored
 * override; falls back to the row-type default when absent.
 */
export function resolveRowExpanded(
  state: RowCollapseState,
  goalId: string,
  isUmbrella: boolean,
): boolean {
  const override = state[goalId];
  if (override === 'collapsed') return false;
  if (override === 'expanded') return true;
  return defaultExpanded(isUmbrella);
}

/**
 * Toggle the row and return the next state map. When the toggle
 * lands on the default value we delete the override (instead of
 * storing a redundant 'matches default' entry) so the persisted
 * pref stays compact.
 */
export function toggleRowExpanded(
  state: RowCollapseState,
  goalId: string,
  isUmbrella: boolean,
): RowCollapseState {
  const currentlyExpanded = resolveRowExpanded(state, goalId, isUmbrella);
  const nextExpanded = !currentlyExpanded;
  const next: RowCollapseState = { ...state };
  if (nextExpanded === defaultExpanded(isUmbrella)) {
    delete next[goalId];
  } else {
    next[goalId] = nextExpanded ? 'expanded' : 'collapsed';
  }
  return next;
}

/**
 * Defensive deserialization of the stored pref. Drops any
 * entries whose value isn't a recognized override string so a
 * corrupt write can't poison the resolver.
 */
export function parseRowCollapseState(raw: unknown): RowCollapseState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RowCollapseState = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === 'collapsed' || v === 'expanded') out[k] = v;
  }
  return out;
}

function defaultExpanded(isUmbrella: boolean): boolean {
  return isUmbrella;
}

/**
 * Synchronous read from localStorage. Returns the parsed map
 * or {} when nothing is stored / parse fails. Defensive: any
 * exception (Storage unavailable in SSR, JSON parse error,
 * security restriction) yields the empty default rather than
 * crashing the page.
 */
export function loadRowCollapse(): RowCollapseState {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_ROW_COLLAPSE)
      : null;
    if (!raw) return {};
    return parseRowCollapseState(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Synchronous write to localStorage. Silently swallows
 * exceptions (quota / SSR / privacy mode) — collapse state is
 * a quality-of-life feature, not a correctness one.
 */
export function saveRowCollapse(state: RowCollapseState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_ROW_COLLAPSE, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
