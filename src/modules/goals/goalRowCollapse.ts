/**
 * Phase 2 step 6g — per-user collapse state for goal rows.
 *
 * Goals home rows have an expanded panel (chart + progress +
 * actions, or umbrella details + children). 6a–6f used local
 * useState per row, which reset on every reload. 6g lifts the
 * state to the page and persists it via userPref so a row stays
 * where the user left it across sessions.
 *
 * Defaults differ by row type:
 *   - Umbrella rows default to expanded (subtree visible)
 *   - Regular rows default to collapsed (panel hidden)
 *
 * The pref stores only the deviations from default — when the
 * user collapses an umbrella we save 'collapsed'; when they
 * expand a regular row we save 'expanded'; when they toggle
 * back to the default we delete the entry. Keeps the stored
 * map small even after months of use.
 *
 * Same map covers both the by-timeframe and by-module views.
 * If the user collapses a row in one view, switching views
 * preserves that state — the goal id is the only key.
 */

export type RowCollapseValue = 'collapsed' | 'expanded';
export type RowCollapseState = Record<string, RowCollapseValue>;

export const PREF_GOALS_ROW_COLLAPSE = 'goals.home.rowCollapse';

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
