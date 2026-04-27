import { SONG_METRIC } from './songTarget';

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
  if (metric.startsWith('ear_training_'))     return 'ear-training';
  if (metric.startsWith('harmonic_fluency_')) return 'harmonic-fluency';
  if (metric.startsWith('shapes_'))           return 'shapes-and-patterns';
  if (metric.startsWith('production_'))       return 'production';
  if (metric === 'practice_days_per_cadence') return 'practice-consistency';
  return null;
}

/** True when the metric belongs to the new GoalCreationFlow's
 *  vocabulary (any of the per-module metrics). False for the legacy
 *  generic metrics — those edit through GoalFormModal. */
export function isNewVocabMetric(metric: string | null): boolean {
  return moduleForMetric(metric) !== null;
}
