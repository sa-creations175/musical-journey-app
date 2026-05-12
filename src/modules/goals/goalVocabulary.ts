import { SONG_METRIC } from './songTarget';

/**
 * Inlined mirror of `SONG_OF_MONTH_METRIC` from
 * src/modules/repertoire/songOfMonth.ts. The repertoire module
 * transitively imports db.ts which touches `window`; goalVocabulary
 * is consumed by pure tests that don't opt into jsdom, so we keep
 * this file dep-free at runtime. Update both sides if either drifts.
 */
const SONG_OF_MONTH_METRIC = 'song_of_month';

/**
 * Goal-vocabulary identification for the Phase 1.6 entry-point swap.
 *
 * The new GoalCreationFlow encodes its targets with a per-module
 * metric vocabulary (e.g., `ear_training_accuracy_overall`,
 * `practice_days_per_cadence`, plus the existing `song_*` metrics).
 * The legacy GoalFormModal uses a generic vocabulary
 * (`items_at_level`, `hours_on_modules`, `count_completed`,
 * `custom`).
 *
 * On edit, the entry-point selector consults `isNewVocabMetric` to
 * route the user to the appropriate modal — new-vocab goals open
 * GoalCreationFlow (decoders preserve all state), old-vocab goals
 * open GoalFormModal (no decoder support, but the old form still
 * round-trips). On create, the new flow is always used.
 *
 * Per the step 14 design call (option B): both modals coexist until
 * old-vocab goals are aged out / migrated.
 */

/** Identifier for the goal-flow card a saved metric belongs to.
 *  null for old-vocab metrics that have no card mapping. */
export type GoalFlowModuleId =
  | 'ear-training'
  | 'harmonic-fluency'
  | 'repertoire'
  | 'shapes-and-patterns'
  | 'production'
  | 'practice-consistency';

export function moduleForMetric(metric: string | null): GoalFlowModuleId | null {
  if (!metric) return null;
  // Source-of-truth from songTarget's SONG_METRIC enum so the metric
  // strings can never drift between encode and decode (WHOLE is
  // 'song_whole_at_level' while KEY and SECTION are '_at_state').
  if (metric === SONG_METRIC.WHOLE || metric === SONG_METRIC.SECTION || metric === SONG_METRIC.KEY) {
    return 'repertoire';
  }
  // Song-of-the-Month queue sentinel — written by Repertoire monthly
  // umbrellas for TBD spotlights and queue slots 2/3. Without this
  // bucket, a TBD-only Repertoire monthly umbrella is invisible in
  // the by-module view because every child's metric returns null and
  // umbrellaModuleId derives the module from its children.
  if (metric === SONG_OF_MONTH_METRIC) return 'repertoire';
  // YearlyAnchorFlow's Songs consistency dimension introduces
  // `repertoire_sessions_per_cadence`. Prefix-route it through the
  // same module bucket as the existing song_* metrics so any future
  // consumer gets a consistent answer.
  if (metric.startsWith('repertoire_'))       return 'repertoire';
  if (metric.startsWith('ear_training_'))     return 'ear-training';
  if (metric.startsWith('harmonic_fluency_')) return 'harmonic-fluency';
  if (metric.startsWith('shapes_'))           return 'shapes-and-patterns';
  if (metric.startsWith('production_'))       return 'production';
  // Practice consistency was an exact-match metric; YearlyAnchorFlow
  // adds three sibling metrics (`practice_weekly_floor_days`,
  // `practice_monthly_floor_days`, `practice_aspiration_days_per_week`)
  // for its three meta-habit questions. Prefix-route covers all four.
  if (metric.startsWith('practice_'))         return 'practice-consistency';
  return null;
}

/** True when the metric belongs to the new GoalCreationFlow's
 *  vocabulary (any of the per-module metrics). False for the legacy
 *  generic metrics — those edit through GoalFormModal. */
export function isNewVocabMetric(metric: string | null): boolean {
  return moduleForMetric(metric) !== null;
}
