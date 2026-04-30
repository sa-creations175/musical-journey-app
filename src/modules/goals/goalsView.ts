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
 * The selected view persists across reloads via the userPref
 * `goals.home.activeView`. `parseGoalsView` is the defensive
 * deserializer for that pref read — anything unrecognized
 * (legacy strings, partial writes, malformed JSON) snaps back
 * to 'timeframe' so a corrupt pref can't strand the user on a
 * non-existent view.
 */

export type GoalsView = 'timeframe' | 'module';

export const PREF_GOALS_ACTIVE_VIEW = 'goals.home.activeView';
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
