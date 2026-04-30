import type { GoalScope } from '../../lib/db';

/**
 * Phase 2 step 6h.2 — Goals home layer-level prefs.
 *
 * Two per-device UI prefs:
 *
 *   - `goals.home.layerCollapse` — per-scope override of the
 *     default collapsed/expanded state (week / month / quarter
 *     / year / 2-3yr / lifetime). Empty entry → use the default
 *     resolution (`effectiveCollapsed` in Goals.tsx).
 *
 *   - `goals.home.hiddenLayers` — array of scope ids the user
 *     fully hid via the Customize panel.
 *
 * Storage: **localStorage**, not userPrefs / Dexie. Same
 * rationale as `goalsView.ts` and `goalRowCollapse.ts` —
 * userPrefs is a synced table; the SyncContext drain +
 * pullAll('replace') race wipes local writes on rapid reload.
 * Layer-level UI state isn't worth coordinating across devices.
 *
 * `parseX` helpers are defensive deserializers — anything
 * unrecognized falls through, so corrupt / legacy / partial
 * stored values can't crash the page.
 */

export type LayerCollapseOverrides = Partial<
  Record<GoalScope, 'collapsed' | 'expanded'>
>;

export const STORAGE_KEY_LAYER_COLLAPSE = 'goals.home.layerCollapse';
export const STORAGE_KEY_HIDDEN_LAYERS = 'goals.home.hiddenLayers';

const VALID_SCOPES: ReadonlySet<GoalScope> = new Set<GoalScope>([
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'two_to_three_year',
  'lifetime',
]);

// ── layer collapse ────────────────────────────────────────────

/**
 * Coerce arbitrary input to a LayerCollapseOverrides map. Drops
 * entries whose key isn't a known scope or whose value isn't a
 * recognized override string.
 */
export function parseLayerCollapse(raw: unknown): LayerCollapseOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LayerCollapseOverrides = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_SCOPES.has(k as GoalScope)) continue;
    if (v === 'collapsed' || v === 'expanded') {
      out[k as GoalScope] = v;
    }
  }
  return out;
}

export function loadLayerCollapse(): LayerCollapseOverrides {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_LAYER_COLLAPSE)
      : null;
    if (!raw) return {};
    return parseLayerCollapse(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveLayerCollapse(state: LayerCollapseOverrides): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_LAYER_COLLAPSE, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// ── hidden layers ─────────────────────────────────────────────

/**
 * Coerce arbitrary input to a GoalScope[] of hidden layers.
 * Filters out non-string entries and unrecognized scope ids.
 * Dedupes (a corrupt write can't make the same layer appear
 * twice in the array).
 */
export function parseHiddenLayers(raw: unknown): GoalScope[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<GoalScope>();
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    if (VALID_SCOPES.has(v as GoalScope)) {
      seen.add(v as GoalScope);
    }
  }
  return [...seen];
}

export function loadHiddenLayers(): GoalScope[] {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_HIDDEN_LAYERS)
      : null;
    if (!raw) return [];
    return parseHiddenLayers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveHiddenLayers(layers: GoalScope[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_HIDDEN_LAYERS, JSON.stringify(layers));
  } catch {
    /* ignore */
  }
}
