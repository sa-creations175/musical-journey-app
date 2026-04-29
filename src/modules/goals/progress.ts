/**
 * Phase 2 step 4 — live progress reads for coverage + accuracy goals.
 *
 * Goal rows render `current_value / target_value`; this module is the
 * read side of that calculation. Lifts the numerator from the canonical
 * data sources rather than relying on manually-maintained
 * `goal.currentValue` updates (Phase 5 will keep the column for
 * point-in-time snapshots / vacation-return diffs, but the live UI
 * reads from here).
 *
 * Scope (Step 4 — "Scope A" per the design call):
 *   - Coverage overall + specific for ET / HF / S&P / Production
 *   - Accuracy overall for ET + HF only
 *   - Accuracy specific → returns `{ kind: 'unsupported' }` (Step 4b
 *     will extend per-subtype mappings once Step 6's goal-row UI
 *     surfaces what's needed)
 *
 * Out of scope (later steps):
 *   - Consistency metrics (sessions/minutes/days per cadence)
 *   - S&P proficiency, song matrix, production lesson-count /
 *     path-completion progress
 *
 * Accuracy semantic: rolling-200 module-wide. Take the most-recent
 * 200 attempts in the relevant moduleId set, exclude
 * `excludeFromFluency`, count correct/total, return percent. Returns
 * null percent when the rolling window has fewer than
 * `MIN_ATTEMPTS_FOR_TIER` (5) attempts — not enough signal for an
 * honest reading. Reflects "how am I doing lately" rather than
 * lifetime aggregate; cheap (one indexed query); easy to swap to a
 * per-item averaged reading later if real use shows volume-skew.
 */

import { db, type AcquisitionStage, type AttemptRecord, type Goal, type SpacingState } from '../../lib/db';
import { MIN_ATTEMPTS_FOR_TIER } from '../../lib/tier';
import { cardById, type FlashcardCategory } from '../harmonic-fluency/catalog';
import { lessonsByPath } from '../production/content/lessons';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
  isCoverageMetric,
  isCoverageOverallMetric,
  isCoverageSpecificMetric,
  type CoverageMetric,
} from './coverageMetrics';

// =====================================================================
// Constants
// =====================================================================

/** Stages that count toward coverage. Per the Phase 2 design call,
 *  `acquired` is the minimum bar for genuine coverage — stable
 *  recall, not just seen once. `consolidated` and `mastered` are
 *  higher stages and trivially also covered. `new` and `acquiring`
 *  do not count. */
export const COVERED_STAGES: ReadonlySet<AcquisitionStage> = new Set([
  'acquired',
  'consolidated',
  'mastered',
]);

/** moduleRefs that compose Ear Training. Mirrors the Step 1b–1c
 *  wiring — each ET submodule writes spacingState rows under its own
 *  MODULE_ID. */
const ET_MODULE_REFS: ReadonlyArray<string> = [
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
];

const HF_MODULE_REF = 'harmonic-fluency';
const SHAPES_MODULE_REF = 'shapes-and-patterns';
const PRODUCTION_MODULE_REF = 'production';

/** moduleIds for the AttemptRecord table. AttemptRecord and
 *  spacingState happen to share names for ET / HF, so the two
 *  constants are the same set — but they refer to different schemas
 *  (db.attempts.moduleId vs db.spacingState.moduleRef), so we keep
 *  the ET set named explicitly per use site. */
const ET_ATTEMPT_MODULE_IDS = ET_MODULE_REFS;

/** Rolling window for module-wide accuracy. Per the Step 4 design
 *  call: 200 most-recent attempts across the module's submodules,
 *  one query, volume-weighted by recent activity. Reflects "how am I
 *  doing lately." */
export const ACCURACY_ROLLING_WINDOW = 200;

/** HF coverage-group id → constituent FlashcardCategory list. Keys
 *  use the kebab-case `group.id` form stored in goal.targetUnit by
 *  the encoder (see HARMONIC_FLUENCY_COVERAGE_GROUPS in
 *  GoalCreationFlow.tsx). Mirrors the camelCase mapping in
 *  moduleItemCounts.ts; kept separate here because the two consumers
 *  key by different domains (UI denominators vs stored
 *  goal.targetUnit). */
const HF_GROUP_CATEGORIES: Record<string, ReadonlyArray<FlashcardCategory>> = {
  'foundational':       ['scale-degree-math', 'named-notes', 'key-signatures'],
  'chord-knowledge':    ['diatonic-qualities', 'chord-construction', 'slash-chords'],
  'functional-applied': ['functional-harmony', 'reverse-key-pivots', 'progressions'],
  'ear-recognition':    ['modes', 'intervals', 'ear-theory'],
};

/** S&P sub-area id → spacingState itemRef prefix. Mirrors
 *  `itemRefForSkill` in shapes-and-patterns/drillModel.ts. */
const SHAPES_AREA_PREFIX: Record<string, string> = {
  'chord_shape_drills': 'chord-shape:',
  'scale_drills':       'scale:',
  'voice_leading':      'vl:',
};

// =====================================================================
// Types
// =====================================================================

export interface AccuracyResult {
  correct: number;
  total: number;
  /** 0–100 integer when `total >= MIN_ATTEMPTS_FOR_TIER` (5), null
   *  otherwise — not enough signal to give an honest reading. */
  percent: number | null;
}

export type GoalProgressKind = 'coverage' | 'accuracy' | 'unsupported';

export interface GoalProgress {
  kind: GoalProgressKind;
  /** Numerator. Coverage = covered count; accuracy = percent (0–100,
   *  may be null when not enough signal); unsupported = null. */
  current: number | null;
  /** Denominator. Coverage = item count; accuracy = target percent.
   *  Reflects `goal.targetValue`. */
  target: number;
  /** Diagnostic — which helper produced this reading. Useful for
   *  logging and dev surfaces; UI doesn't need to render it. */
  source?: string;
}

// =====================================================================
// Coverage primitives
// =====================================================================

/**
 * Count spacingState rows at acquired+ stage matching the moduleRef
 * filter and (optionally) an itemRef predicate. Loads the matching
 * moduleRef rows in a single Dexie query, then filters by stage and
 * by the optional predicate in memory — the dataset is small (max
 * ~600 rows total) and Dexie's `acquisitionStage` index is single-
 * column, so a compound moduleRef-and-stage query would need a
 * separate index pass.
 */
export async function countCoveredSpacingRows(
  moduleRefs: ReadonlyArray<string>,
  itemRefPredicate?: (itemRef: string) => boolean,
): Promise<number> {
  if (moduleRefs.length === 0) return 0;
  const rows: SpacingState[] = await db.spacingState
    .where('moduleRef')
    .anyOf(moduleRefs as string[])
    .toArray();
  let count = 0;
  for (const r of rows) {
    if (!COVERED_STAGES.has(r.acquisitionStage)) continue;
    if (itemRefPredicate && !itemRefPredicate(r.itemRef)) continue;
    count += 1;
  }
  return count;
}

// =====================================================================
// Coverage by metric id
// =====================================================================

/**
 * Resolve a coverage metric id (+ optional sub-area id from
 * goal.targetUnit) to a count of acquired+ items. Routes internally
 * through `countCoveredSpacingRows` with the right moduleRefs and
 * itemRef filter for each module.
 *
 * Returns 0 for unrecognised sub-area strings on *_specific metrics
 * — defensive against goal records written before a future schema
 * change. The caller (goal row UI) should still render "0 / N"
 * rather than crashing.
 */
export async function getCoverageCount(
  metric: CoverageMetric,
  subArea?: string | null,
): Promise<number> {
  // Overall variants — full module coverage
  if (metric === COVERAGE_OVERALL_METRIC.EAR_TRAINING) {
    return countCoveredSpacingRows(ET_MODULE_REFS);
  }
  if (metric === COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY) {
    return countCoveredSpacingRows([HF_MODULE_REF]);
  }
  if (metric === COVERAGE_OVERALL_METRIC.SHAPES) {
    return countCoveredSpacingRows([SHAPES_MODULE_REF]);
  }
  if (metric === COVERAGE_OVERALL_METRIC.PRODUCTION) {
    return countCoveredSpacingRows([PRODUCTION_MODULE_REF]);
  }

  // Specific variants — sub-area scoped coverage
  if (metric === COVERAGE_SPECIFIC_METRIC.EAR_TRAINING) {
    // ET sub-area ids match moduleRefs directly (intervals,
    // chord-recognition, chord-progressions, scales-modes), so the
    // filter is a single moduleRef in the anyOf set.
    if (!subArea || !ET_MODULE_REFS.includes(subArea)) return 0;
    return countCoveredSpacingRows([subArea]);
  }
  if (metric === COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY) {
    if (!subArea) return 0;
    const categories = HF_GROUP_CATEGORIES[subArea];
    if (!categories) return 0;
    const categorySet = new Set<FlashcardCategory>(categories);
    return countCoveredSpacingRows([HF_MODULE_REF], itemRef => {
      const card = cardById(itemRef);
      return card ? categorySet.has(card.category) : false;
    });
  }
  if (metric === COVERAGE_SPECIFIC_METRIC.SHAPES) {
    if (!subArea) return 0;
    const prefix = SHAPES_AREA_PREFIX[subArea];
    if (!prefix) return 0;
    return countCoveredSpacingRows([SHAPES_MODULE_REF], itemRef => itemRef.startsWith(prefix));
  }
  if (metric === COVERAGE_SPECIFIC_METRIC.PRODUCTION) {
    if (!subArea) return 0;
    const lessonIds = new Set(lessonsByPath(subArea).map(l => l.id));
    if (lessonIds.size === 0) return 0;
    return countCoveredSpacingRows([PRODUCTION_MODULE_REF], itemRef => lessonIds.has(itemRef));
  }

  // Type system protects against this; runtime guard is defensive.
  return 0;
}

// =====================================================================
// Accuracy primitives
// =====================================================================

/**
 * Module-wide accuracy over the most recent N attempts (default
 * `ACCURACY_ROLLING_WINDOW` = 200). Excludes attempts flagged
 * `excludeFromFluency`. An optional `attemptFilter` narrows further
 * (used by the *_specific variants when they ship).
 *
 * Returns `{ percent: null }` when the eligible window has fewer
 * than `MIN_ATTEMPTS_FOR_TIER` (5) attempts — same threshold the
 * existing per-item FluencyTracker uses to stop showing "untouched"
 * accuracy. Honest about insufficient signal.
 *
 * Implementation note: queries by `moduleId` (compound index
 * unavailable for `[moduleId+timestamp]`), pulls all matching rows,
 * sorts and slices in memory. Attempt volumes are bounded — even at
 * 100 attempts/day for a year, still ~36k rows per module — and
 * Dexie's `where().anyOf()` short-circuits the irrelevant moduleIds.
 */
export async function moduleAccuracy(
  moduleIds: ReadonlyArray<string>,
  opts: { window?: number; attemptFilter?: (a: AttemptRecord) => boolean } = {},
): Promise<AccuracyResult> {
  if (moduleIds.length === 0) return { correct: 0, total: 0, percent: null };
  const window = opts.window ?? ACCURACY_ROLLING_WINDOW;
  const all: AttemptRecord[] = await db.attempts
    .where('moduleId')
    .anyOf(moduleIds as string[])
    .toArray();
  const eligible = all.filter(a => {
    if (a.excludeFromFluency) return false;
    if (opts.attemptFilter && !opts.attemptFilter(a)) return false;
    return true;
  });
  // Sort by timestamp desc, take most-recent `window`
  eligible.sort((a, b) => b.timestamp - a.timestamp);
  const recent = eligible.slice(0, window);
  const correct = recent.filter(a => a.correct).length;
  const total = recent.length;
  const percent = total >= MIN_ATTEMPTS_FOR_TIER
    ? Math.round((correct / total) * 100)
    : null;
  return { correct, total, percent };
}

// =====================================================================
// Accuracy by metric id (Scope A: overall only)
// =====================================================================

/**
 * Ear Training accuracy. Step 4 ships overall-only; specific scopes
 * (intervals direction, chord-recognition tier, chord-progressions
 * subtype, scales-modes mode-vs-minor) need per-subtype attempt
 * filters that depend on Step 6's UI to define what's needed and
 * land in Step 4b.
 */
export async function getEarTrainingAccuracy(
  scope: 'overall',
): Promise<AccuracyResult> {
  if (scope !== 'overall') {
    // Type system enforces this; runtime guard is defensive against
    // a future widening of the scope union without an implementation.
    return { correct: 0, total: 0, percent: null };
  }
  return moduleAccuracy(ET_ATTEMPT_MODULE_IDS);
}

/**
 * Harmonic Fluency accuracy. Step 4 ships overall-only — see
 * `getEarTrainingAccuracy` for the deferral rationale.
 */
export async function getHarmonicFluencyAccuracy(
  scope: 'overall',
): Promise<AccuracyResult> {
  if (scope !== 'overall') {
    return { correct: 0, total: 0, percent: null };
  }
  return moduleAccuracy([HF_MODULE_REF]);
}

// =====================================================================
// Goal-aware top-level router
// =====================================================================

/**
 * Single entry point for goal rows. Inspects `goal.targetMetric` and
 * routes to the right helper.
 *
 * Returns `{ kind: 'unsupported' }` for metrics outside Step 4's
 * scope (consistency, song, S&P proficiency, production lesson-count,
 * accuracy_specific) so the UI can render a placeholder instead of
 * crashing. Step 4b / Step 5 / etc. fold those in as their helpers
 * land.
 *
 * Umbrella goals (`isUmbrella: true`) return `{ kind: 'unsupported' }`
 * — their progress is the rollup of children, computed by the goal
 * row component (Step 6). Not this helper's concern.
 */
export async function getGoalProgress(goal: Goal): Promise<GoalProgress> {
  const target = typeof goal.targetValue === 'number' ? goal.targetValue : 0;

  if (goal.isUmbrella) {
    return { kind: 'unsupported', current: null, target, source: 'umbrella' };
  }

  const metric = goal.targetMetric;
  if (!metric) {
    return { kind: 'unsupported', current: null, target, source: 'no-metric' };
  }

  // Coverage routing
  if (isCoverageMetric(metric)) {
    const subArea = isCoverageSpecificMetric(metric) ? goal.targetUnit : null;
    const count = await getCoverageCount(metric, subArea);
    return {
      kind: 'coverage',
      current: count,
      target,
      source: isCoverageOverallMetric(metric) ? 'coverage-overall' : 'coverage-specific',
    };
  }

  // Accuracy routing — Scope A: overall only
  if (metric === 'ear_training_accuracy_overall') {
    const r = await getEarTrainingAccuracy('overall');
    return { kind: 'accuracy', current: r.percent, target, source: 'et-accuracy-overall' };
  }
  if (metric === 'harmonic_fluency_accuracy_overall') {
    const r = await getHarmonicFluencyAccuracy('overall');
    return { kind: 'accuracy', current: r.percent, target, source: 'hf-accuracy-overall' };
  }

  // Specific accuracy + everything else not yet handled
  return { kind: 'unsupported', current: null, target, source: `unsupported:${metric}` };
}
