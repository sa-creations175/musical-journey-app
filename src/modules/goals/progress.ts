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
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';

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

// =====================================================================
// Goal feasibility — projection-based status (Phase 2 step 7)
// =====================================================================

/**
 * "Will I make it" status tiers. Distinct from raw progress
 * (which answers "where am I"). Coverage goals project from
 * current value + remaining weeks × weekly-pace; status falls
 * out of how that projection compares to target.
 *
 *   - 'on_track'      — projected ≥ target at current pace
 *   - 'at_risk'       — projected ≥ 85% of target, < target
 *                       (gentle nudge; trivial bump recovers)
 *   - 'critical'      — projected < 85% of target, but
 *                       doubling pace would still reach target
 *   - 'unrecoverable' — even doubling won't reach target by
 *                       deadline, OR deadline already passed.
 *                       Excluded from worst-case rollup; UI
 *                       shows a motivational placeholder
 *                       instead of a status pill.
 */
export type GoalFeasibilityStatus =
  | 'on_track'
  | 'at_risk'
  | 'critical'
  | 'unrecoverable';

/**
 * Output of `getGoalFeasibility`. Discriminated by `kind`:
 *   - 'measurable'    — concrete projection vs target with status
 *                       and a calculated, numbers-driven
 *                       recommendation string
 *   - 'aspirational'  — open-text reflections (2-3 year, lifetime
 *                       scopes); a randomly-selected motivational
 *                       placeholder phrase from
 *                       ASPIRATIONAL_PLACEHOLDERS
 *   - 'unknown'       — goal type not yet handled by the
 *                       projection math (accuracy / consistency /
 *                       item-count metrics — wired in step 7b)
 */
export type GoalFeasibility =
  | {
      kind: 'measurable';
      status: GoalFeasibilityStatus;
      projected: number;
      target: number;
      currentValue: number;
      daysRemaining: number;
      recommendation: string;
    }
  | { kind: 'aspirational'; message: string }
  | { kind: 'unknown' };

/** Per-week count of each day-profile type. Defaults to
 *  DEFAULT_DAY_PROFILE_MIX when omitted. */
export type DayProfileMix = Partial<
  Record<'standard' | 'deep' | 'light' | 'custom', number>
>;

/**
 * Coverage-unit noun per module — the thing being counted
 * toward a coverage goal's target. **Distinct from
 * `activityUnitForModule`** (cards / minutes), which describes
 * the per-session activity unit on the activity chart.
 *
 *   activity unit       coverage unit
 *   -----------------   -----------------
 *   ET, HF: cards       cards
 *   Shapes: minutes     shapes
 *   Songs:  minutes     songs
 *   Production: minutes lessons
 *
 * For card modules the two units happen to coincide (you
 * review cards and you cover cards). For time modules they
 * diverge: you practice minutes but you cover shapes / songs /
 * lessons toward the target.
 *
 * Practice consistency goals don't actually use coverage math —
 * the value is a defensive default for any caller that asks.
 */
export function coverageUnitForModule(moduleId: GoalFlowModuleId): string {
  switch (moduleId) {
    case 'ear-training':
    case 'harmonic-fluency':
      return 'cards';
    case 'shapes-and-patterns':
      return 'shapes';
    case 'repertoire':
      return 'songs';
    case 'production':
      return 'lessons';
    case 'practice-consistency':
      return 'sessions';
  }
}

/** Phase 2 default mix per the 6h.2 sign-off (3 Standard + 1
 *  Deep + 1 Light per week). Phase 7 makes this user-editable. */
export const DEFAULT_DAY_PROFILE_MIX: DayProfileMix = {
  standard: 3,
  deep: 1,
  light: 1,
};

/**
 * Stable accessor for the user's weekly day-profile mix. Phase 2
 * returns the hardcoded default; Phase 7 swaps the body to read
 * from a user-editable store (likely localStorage to sidestep
 * the userPrefs sync race that bit 6g/6h). Callers that want
 * feasibility against the user's current mix should go through
 * here so the Phase 7 swap happens in one place.
 */
export function loadDayProfileMix(): DayProfileMix {
  return DEFAULT_DAY_PROFILE_MIX;
}

/** Items-per-session estimates per (module × profile). Starting
 *  points from the 6h.2 design call; calibrated from real use
 *  in Phase 7. Card modules count cards reviewed; time modules
 *  count minutes practised. */
const ITEMS_PER_SESSION: Record<
  | 'ear-training'
  | 'harmonic-fluency'
  | 'shapes-and-patterns'
  | 'repertoire'
  | 'production',
  Record<'standard' | 'deep' | 'light' | 'custom', number>
> = {
  'ear-training':        { standard: 30, deep: 50, light: 10, custom: 30 },
  'harmonic-fluency':    { standard: 25, deep: 45, light:  8, custom: 25 },
  'shapes-and-patterns': { standard: 20, deep: 35, light:  8, custom: 20 },
  'repertoire':          { standard: 25, deep: 45, light: 10, custom: 25 },
  'production':          { standard: 30, deep: 60, light: 15, custom: 30 },
};

type FeasibilityModule = keyof typeof ITEMS_PER_SESSION;

/** Boundary between at_risk and critical, applied as a target
 *  ratio. A goal with projected ≥ AT_RISK_RATIO × target sits in
 *  at_risk; below that, the doubling check picks critical vs
 *  unrecoverable. */
export const AT_RISK_RATIO = 0.85;

/** Pool of motivational placeholders shown in place of a status
 *  pill on aspirational scopes (2–3 year, lifetime). Randomly
 *  selected per call. */
export const ASPIRATIONAL_PLACEHOLDERS: ReadonlyArray<string> = [
  'Your daily wins compound into the greatness outlined here.',
  'Every session moves you closer to this vision.',
  "This is where you're headed. Show up and trust the process.",
  'The trajectory starts today. Keep going.',
  'Your daily wins compound and set the trajectory for this vision.',
];

/**
 * Rolled-up feasibility for an umbrella goal. `status` is the
 * worst-case across the umbrella's actionable children (i.e.,
 * everything except unrecoverable — unrecoverable children are
 * no longer in play, so they don't pull the umbrella's status
 * down with them). `breakdown` counts each status across all
 * measurable children for the UI's "X on track · Y at risk · Z
 * unrecoverable" display.
 *
 * Aspirational and 'unknown' children are not measurable and
 * contribute neither to the worst-case nor to the breakdown.
 */
export interface FeasibilityRollup {
  /** Worst-case status across actionable children, or null when
   *  no children are actionable (every measurable child is
   *  unrecoverable, or the umbrella has no measurable children). */
  status: GoalFeasibilityStatus | null;
  /** Per-status counts across measurable children. Includes the
   *  unrecoverable count so the UI can surface "1 unrecoverable"
   *  separately from the worst-case pill. */
  breakdown: Record<GoalFeasibilityStatus, number>;
}

/** Inputs the caller supplies to `getGoalFeasibility`. */
export interface GoalFeasibilityContext {
  /** Live numerator — typically `getCoverageCount` for coverage
   *  goals, `goal.currentValue` otherwise. Pure-function input
   *  so the helper stays testable without Dexie. */
  currentValue: number;
  /** Reference "today" — caller-supplied so tests can pin. */
  today: Date;
  /** Weekly day-profile mix. Defaults to DEFAULT_DAY_PROFILE_MIX
   *  when omitted. */
  mix?: DayProfileMix;
}

const DAY_MS = 86_400_000;

/**
 * Project a goal's likely outcome by deadline and assign a
 * status tier. Step 7a covers coverage goals + the
 * aspirational-placeholder branch. Other goal types (accuracy,
 * consistency, item-count) return `{ kind: 'unknown' }` —
 * wired in step 7b.
 */
export function getGoalFeasibility(
  goal: Goal,
  ctx: GoalFeasibilityContext,
): GoalFeasibility {
  // Aspirational scopes — open-text reflections, no measurable
  // target. Always render a motivational placeholder instead of
  // computing a status. Phrase is seeded by goal.id so the same
  // goal always shows the same phrase across renders.
  if (goal.scope === 'two_to_three_year' || goal.scope === 'lifetime') {
    return {
      kind: 'aspirational',
      message: pickAspirationalPlaceholder(goal.id),
    };
  }

  const metric = goal.targetMetric;
  if (!metric) return { kind: 'unknown' };

  if (isCoverageMetric(metric)) {
    return coverageFeasibility(goal, ctx, metric);
  }

  if (metric === 'song_whole_at_level') {
    return songWholeFeasibility(goal, ctx);
  }

  if (isAccuracyMetric(metric)) {
    return accuracyFeasibility(goal, ctx);
  }

  if (isConsistencyMetric(metric)) {
    return consistencyFeasibility(goal, ctx);
  }

  // count_completed and other free-form item-count metrics need
  // per-goal rate data we don't track yet — they stay 'unknown'
  // until that data lands. song_whole_at_level is wired above
  // with a default 1-song/month rate (Phase 7 calibration).
  return { kind: 'unknown' };
}

/**
 * Roll up an umbrella's children into a single feasibility
 * status + breakdown. Worst-case across actionable children;
 * unrecoverable children are excluded from the worst-case
 * (they're no longer actionable per the 6h.2 sign-off) but
 * still surface in the breakdown so the UI can show a
 * motivational placeholder per unrecoverable child.
 *
 * Pure function — caller computes each child's feasibility,
 * passes the array in, and renders the result.
 */
export function rollupChildFeasibilities(
  children: ReadonlyArray<GoalFeasibility>,
): FeasibilityRollup {
  const breakdown: Record<GoalFeasibilityStatus, number> = {
    on_track: 0,
    at_risk: 0,
    critical: 0,
    unrecoverable: 0,
  };
  for (const c of children) {
    if (c.kind !== 'measurable') continue;
    breakdown[c.status]++;
  }
  // Worst-case across actionable (non-unrecoverable) children.
  // Order matters: critical is worse than at_risk, which is worse
  // than on_track. Unrecoverable doesn't enter the comparison.
  let status: GoalFeasibilityStatus | null = null;
  if (breakdown.critical > 0) status = 'critical';
  else if (breakdown.at_risk > 0) status = 'at_risk';
  else if (breakdown.on_track > 0) status = 'on_track';
  return { status, breakdown };
}

/** Accuracy metrics — `*_accuracy_overall` and `*_accuracy_specific`. */
function isAccuracyMetric(metric: string): boolean {
  return metric.includes('_accuracy_');
}

/** Consistency metrics — `*_sessions_per_week`, `*_sessions_per_month`,
 *  and the practice-consistency umbrella's `practice_*` flavors. */
function isConsistencyMetric(metric: string): boolean {
  return metric.includes('_sessions_per_') || metric.startsWith('practice_');
}

function coverageFeasibility(
  goal: Goal,
  ctx: GoalFeasibilityContext,
  metric: CoverageMetric,
): GoalFeasibility {
  const target = goal.targetValue;
  if (target === null || target === undefined) {
    return { kind: 'unknown' };
  }

  const moduleId = moduleForMetric(metric);
  if (!moduleId || !(moduleId in ITEMS_PER_SESSION)) {
    return { kind: 'unknown' };
  }
  const feasibilityModule = moduleId as FeasibilityModule;

  const daysRemaining = Math.max(
    0,
    Math.ceil((goal.targetDate - ctx.today.getTime()) / DAY_MS),
  );
  const weeksRemaining = daysRemaining / 7;

  const itemsPerWeek = weeklyPace(
    feasibilityModule,
    ctx.mix ?? DEFAULT_DAY_PROFILE_MIX,
  );
  const projected = Math.round(ctx.currentValue + weeksRemaining * itemsPerWeek);
  const doubledProjected = Math.round(
    ctx.currentValue + weeksRemaining * itemsPerWeek * 2,
  );

  const status = classifyCoverageStatus(
    projected,
    doubledProjected,
    target,
    daysRemaining,
  );

  const recommendation = recommendCoverage({
    status,
    projected,
    doubledProjected,
    target,
    currentValue: ctx.currentValue,
    daysRemaining,
    targetDate: new Date(goal.targetDate),
    unit: coverageUnitForModule(moduleId as GoalFlowModuleId),
  });

  return {
    kind: 'measurable',
    status,
    projected,
    target,
    currentValue: ctx.currentValue,
    daysRemaining,
    recommendation,
  };
}

function classifyCoverageStatus(
  projected: number,
  doubledProjected: number,
  target: number,
  daysRemaining: number,
): GoalFeasibilityStatus {
  // Target already met (or projected to meet) wins regardless
  // of remaining time — guards against deadlines-today goals
  // tripping into unrecoverable when the user has actually
  // hit the count.
  if (projected >= target) return 'on_track';
  if (daysRemaining <= 0) return 'unrecoverable';
  if (projected >= AT_RISK_RATIO * target) return 'at_risk';
  if (doubledProjected >= target) return 'critical';
  return 'unrecoverable';
}

function weeklyPace(
  moduleId: FeasibilityModule,
  mix: DayProfileMix,
): number {
  const items = ITEMS_PER_SESSION[moduleId];
  return (
    (mix.standard ?? 0) * items.standard +
    (mix.deep ?? 0) * items.deep +
    (mix.light ?? 0) * items.light +
    (mix.custom ?? 0) * items.custom
  );
}

/**
 * Compose a numbers-driven recommendation string per status.
 * Always includes real values (target, projected, date, items
 * needed per week) — no templated phrases divorced from the
 * actual goal state. Unit derived from `activityUnitForModule`
 * so card modules read "cards" and time modules read "minutes".
 */
function recommendCoverage(args: {
  status: GoalFeasibilityStatus;
  projected: number;
  doubledProjected: number;
  target: number;
  currentValue: number;
  daysRemaining: number;
  targetDate: Date;
  /** Coverage-unit noun for the module — "cards" / "shapes" /
   *  "songs" / "lessons". See `coverageUnitForModule`. */
  unit: string;
}): string {
  const dateStr = args.targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const remainingItems = Math.max(0, args.target - args.currentValue);
  const u = args.unit;

  if (args.status === 'on_track') {
    // Projected ≥ target — "X/Y" with X > Y reads inverted, so
    // drop the projected number entirely and frame around the
    // target itself.
    return `On pace — projected to cover all ${args.target} ${u} by ${dateStr}.`;
  }
  if (args.status === 'at_risk') {
    return `At current pace, projected to cover ${args.projected} of ${args.target} ${u} by ${dateStr}.`;
  }
  if (args.status === 'critical') {
    const weeksLeft = Math.max(1, Math.ceil(args.daysRemaining / 7));
    const itemsPerWeekNeeded = Math.ceil(remainingItems / weeksLeft);
    return `Need about ${itemsPerWeekNeeded} ${u} per week to hit ${args.target} by ${dateStr}.`;
  }
  // unrecoverable
  if (args.daysRemaining <= 0) {
    return `Deadline passed — reached ${args.currentValue} of ${args.target} ${u}.`;
  }
  return `Even at full pace, projected to cover ${args.doubledProjected} of ${args.target} ${u} by ${dateStr}.`;
}

// ── Song coverage branch (song_whole_at_level) ───────────────

/** Default rate of songs reaching a given level per week.
 *  Tunable starting point — 1 song/month per the Phase 7
 *  placeholder rule logged in BUILD_SEQUENCER_2.md. Calibrated
 *  from real use once songPracticeLog history accumulates. */
export const SONG_DEFAULT_RATE_PER_WEEK = 0.25;

/**
 * Format a song goal's targetUnit as a display label injected
 * into recommendation strings ("Comfortable", "Solid",
 * "Internalized"). Returns null for `cross_key` (uses % math,
 * deferred) or any unknown unit so the caller can fall back to
 * `{ kind: 'unknown' }`.
 */
function formatSongStageLabel(unit: string | null): string | null {
  if (!unit) return null;
  if (unit === 'comfortable') return 'Comfortable';
  if (unit === 'solid') return 'Solid';
  if (unit === 'internalized') return 'Internalized';
  // cross_key + anything unrecognized → no label, no projection.
  return null;
}

function songWholeFeasibility(
  goal: Goal,
  ctx: GoalFeasibilityContext,
): GoalFeasibility {
  const target = goal.targetValue;
  if (target === null || target === undefined) {
    return { kind: 'unknown' };
  }
  const stage = formatSongStageLabel(goal.targetUnit);
  if (!stage) return { kind: 'unknown' };

  const daysRemaining = Math.max(
    0,
    Math.ceil((goal.targetDate - ctx.today.getTime()) / DAY_MS),
  );
  const weeksRemaining = daysRemaining / 7;

  const projected = Math.round(
    ctx.currentValue + weeksRemaining * SONG_DEFAULT_RATE_PER_WEEK,
  );
  const doubledProjected = Math.round(
    ctx.currentValue + weeksRemaining * SONG_DEFAULT_RATE_PER_WEEK * 2,
  );

  const status = classifyCoverageStatus(
    projected,
    doubledProjected,
    target,
    daysRemaining,
  );

  const recommendation = recommendSongWhole({
    status,
    projected,
    doubledProjected,
    target,
    currentValue: ctx.currentValue,
    daysRemaining,
    targetDate: new Date(goal.targetDate),
    stage,
  });

  return {
    kind: 'measurable',
    status,
    projected,
    target,
    currentValue: ctx.currentValue,
    daysRemaining,
    recommendation,
  };
}

function recommendSongWhole(args: {
  status: GoalFeasibilityStatus;
  projected: number;
  doubledProjected: number;
  target: number;
  currentValue: number;
  daysRemaining: number;
  targetDate: Date;
  stage: string;
}): string {
  const dateStr = args.targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const remaining = Math.max(0, args.target - args.currentValue);
  const stage = args.stage;

  if (args.status === 'on_track') {
    return `On pace — projected to cover all ${args.target} songs at ${stage} by ${dateStr}.`;
  }
  if (args.status === 'at_risk') {
    return `At current pace, projected to cover ${args.projected} of ${args.target} songs at ${stage} by ${dateStr}.`;
  }
  if (args.status === 'critical') {
    const weeksLeft = Math.max(1, Math.ceil(args.daysRemaining / 7));
    const songsPerWeek = Math.ceil(remaining / weeksLeft);
    const songsWord = songsPerWeek === 1 ? 'song' : 'songs';
    return `Need about ${songsPerWeek} ${songsWord} to reach ${stage} per week to hit ${args.target} by ${dateStr}.`;
  }
  // unrecoverable
  if (args.daysRemaining <= 0) {
    return `Deadline passed — reached ${args.currentValue} of ${args.target} songs at ${stage}.`;
  }
  return `Even at full pace, projected to cover ${args.doubledProjected} of ${args.target} songs at ${stage} by ${dateStr}.`;
}

// ── Accuracy branch ──────────────────────────────────────────

/** Percentage-point gap below target that triggers `at_risk`.
 *  Accuracy improvement rates are too noisy at goal horizons,
 *  so the math is gap-based rather than rate-based. Tunable. */
export const ACCURACY_GAP_AT_RISK = 5;

/** Fraction of a goal's period that constitutes the "critical
 *  window" — the late-stage time pressure that bumps a stubborn
 *  gap from `at_risk` to `critical`. 0.20 = last 20% of the
 *  period (last ~73 days of a yearly, last ~6 of a monthly,
 *  last ~1.4 of a weekly). Tunable. */
export const ACCURACY_CRITICAL_WINDOW_PCT = 0.20;

function accuracyFeasibility(
  goal: Goal,
  ctx: GoalFeasibilityContext,
): GoalFeasibility {
  const target = goal.targetValue;
  if (target === null || target === undefined) {
    return { kind: 'unknown' };
  }
  const current = ctx.currentValue;
  const todayMs = ctx.today.getTime();
  const daysRemaining = Math.max(
    0,
    Math.ceil((goal.targetDate - todayMs) / DAY_MS),
  );
  const totalDays = Math.max(
    1,
    Math.ceil((goal.targetDate - goal.startDate) / DAY_MS),
  );

  const status = classifyAccuracyStatus(
    current,
    target,
    daysRemaining,
    totalDays,
  );
  const recommendation = recommendAccuracy({
    status,
    current,
    target,
    daysRemaining,
    targetDate: new Date(goal.targetDate),
  });

  return {
    kind: 'measurable',
    status,
    projected: current, // accuracy: projection = current state
    target,
    currentValue: current,
    daysRemaining,
    recommendation,
  };
}

function classifyAccuracyStatus(
  current: number,
  target: number,
  daysRemaining: number,
  totalDays: number,
): GoalFeasibilityStatus {
  if (current >= target) return 'on_track';
  if (daysRemaining <= 0) return 'unrecoverable';
  const gap = target - current;
  const inCriticalWindow =
    daysRemaining <= Math.max(1, Math.ceil(totalDays * ACCURACY_CRITICAL_WINDOW_PCT));
  if (gap > ACCURACY_GAP_AT_RISK && inCriticalWindow) return 'critical';
  return 'at_risk';
}

function recommendAccuracy(args: {
  status: GoalFeasibilityStatus;
  current: number;
  target: number;
  daysRemaining: number;
  targetDate: Date;
}): string {
  const dateStr = args.targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const gap = Math.max(0, args.target - args.current);

  if (args.status === 'on_track') {
    return `On pace — accuracy is ${roundPercent(args.current)}%, target ${roundPercent(args.target)}%.`;
  }
  if (args.status === 'at_risk') {
    return `Accuracy is ${roundPercent(args.current)}% — ${roundPercent(gap)} points below the ${roundPercent(args.target)}% target.`;
  }
  if (args.status === 'critical') {
    // Time-pressure framing — days remaining + gap up front, then
    // an action phrase. Replaces the prior "Push consistency"
    // wording so the user reads the urgency, not just a status.
    const daysWord = args.daysRemaining === 1 ? 'day' : 'days';
    return `${args.daysRemaining} ${daysWord} left to close a ${roundPercent(gap)}-point gap. Keep practicing to close the gap before ${dateStr}.`;
  }
  // unrecoverable — only fires when the deadline has passed (the
  // pre-deadline gap-only branch is gone now that critical
  // requires the late-stage window).
  return `Deadline passed — accuracy reached ${roundPercent(args.current)}%, target was ${roundPercent(args.target)}%.`;
}

function roundPercent(n: number): number {
  // Accept values in either 0-1 or 0-100 scale: caller normalizes.
  // Round to whole percent for clean display.
  return Math.round(n);
}

// ── Consistency branch ───────────────────────────────────────

/** Pace-ratio threshold for consistency at_risk (matches
 *  AT_RISK_RATIO so the at_risk band is defined identically
 *  across goal types). */
export const CONSISTENCY_AT_RISK_RATIO = AT_RISK_RATIO;

function consistencyFeasibility(
  goal: Goal,
  ctx: GoalFeasibilityContext,
): GoalFeasibility {
  const target = goal.targetValue;
  if (target === null || target === undefined) {
    return { kind: 'unknown' };
  }

  const todayMs = ctx.today.getTime();
  const periodStart = goal.startDate;
  const periodEnd = goal.targetDate;
  const daysTotal = Math.max(1, Math.ceil((periodEnd - periodStart) / DAY_MS));
  const daysPassed = Math.max(
    0,
    Math.min(daysTotal, Math.ceil((todayMs - periodStart) / DAY_MS)),
  );
  const daysRemaining = Math.max(0, daysTotal - daysPassed);

  const expectedSoFar = target * (daysPassed / daysTotal);
  const sessionsRemaining = Math.max(0, target - ctx.currentValue);

  const status = classifyConsistencyStatus({
    current: ctx.currentValue,
    target,
    expectedSoFar,
    sessionsRemaining,
    daysRemaining,
  });

  const recommendation = recommendConsistency({
    status,
    current: ctx.currentValue,
    target,
    sessionsRemaining,
    daysRemaining,
    targetDate: new Date(goal.targetDate),
  });

  return {
    kind: 'measurable',
    status,
    projected: Math.round(ctx.currentValue),
    target,
    currentValue: ctx.currentValue,
    daysRemaining,
    recommendation,
  };
}

function classifyConsistencyStatus(args: {
  current: number;
  target: number;
  expectedSoFar: number;
  sessionsRemaining: number;
  daysRemaining: number;
}): GoalFeasibilityStatus {
  if (args.current >= args.target) return 'on_track';

  // Pace ratio: have we logged what we'd expect by now?
  // Guards divide-by-zero at the start of the period (when
  // expectedSoFar == 0) by treating a zero-expected window as
  // on_track until the first day passes.
  const ratio =
    args.expectedSoFar > 0
      ? args.current / args.expectedSoFar
      : 1;

  if (ratio >= 1) return 'on_track';
  if (args.daysRemaining <= 0) return 'unrecoverable';
  if (ratio >= CONSISTENCY_AT_RISK_RATIO) return 'at_risk';

  // Below at_risk: can the remaining sessions still fit the
  // remaining days? At most 1 session/day is realistic for
  // consistency goals — a session is by definition a discrete
  // practice period.
  if (args.sessionsRemaining <= args.daysRemaining) return 'critical';
  return 'unrecoverable';
}

function recommendConsistency(args: {
  status: GoalFeasibilityStatus;
  current: number;
  target: number;
  sessionsRemaining: number;
  daysRemaining: number;
  targetDate: Date;
}): string {
  if (args.status === 'on_track') {
    return `On pace — ${args.current} of ${args.target} sessions logged.`;
  }
  if (args.status === 'at_risk') {
    return `${args.current} of ${args.target} sessions so far — slightly behind pace.`;
  }
  if (args.status === 'critical') {
    // Singular case (1 session, 1 day) reads more naturally as
    // "today" than "in the next 1 day".
    if (args.sessionsRemaining === 1 && args.daysRemaining === 1) {
      return `Need 1 more session today to stay on track.`;
    }
    return `Need ${args.sessionsRemaining} more session${args.sessionsRemaining === 1 ? '' : 's'} in the next ${args.daysRemaining} day${args.daysRemaining === 1 ? '' : 's'}.`;
  }
  // unrecoverable
  if (args.daysRemaining <= 0) {
    return `Deadline passed — reached ${args.current} of ${args.target} sessions.`;
  }
  // Future deadline but sessions can't fit — show what it would
  // take rather than declaring impossibility, so the user sees
  // a real number to react to.
  const sessionsPerDay = Math.ceil(args.sessionsRemaining / args.daysRemaining);
  const sessionsWord = sessionsPerDay === 1 ? 'session' : 'sessions';
  const daysWord = args.daysRemaining === 1 ? 'day' : 'days';
  return `${args.current} of ${args.target} sessions with ${args.daysRemaining} ${daysWord} left — you'd need ${sessionsPerDay} ${sessionsWord} per day to reach your target.`;
}

/**
 * Deterministic pick from the placeholder pool keyed on goal.id.
 * The same goal always gets the same phrase across renders, but
 * different goals distribute across the pool. Simple djb2-style
 * hash — speed and distribution good enough for a 5-element pool.
 */
function pickAspirationalPlaceholder(goalId: string): string {
  let hash = 5381;
  for (let i = 0; i < goalId.length; i++) {
    hash = ((hash << 5) + hash + goalId.charCodeAt(i)) | 0;
  }
  const idx =
    Math.abs(hash) % ASPIRATIONAL_PLACEHOLDERS.length;
  return ASPIRATIONAL_PLACEHOLDERS[idx];
}
