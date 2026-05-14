import type { Goal } from '../../lib/db';
import { isCoverageMetric } from './coverageMetrics';
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';
import { getAttemptsInRange } from '../../lib/weeklyAttempts';
import { startOfWeekLocal } from './weeklyPlanData';

/**
 * Phase 4 Step 2 — derive weekly goals from active monthly goals.
 *
 * The Sunday weekly-plan flow takes the user's currently-active
 * monthly goals and computes a per-monthly-goal weekly target so
 * the upcoming week has concrete numbers to chase. This file owns
 * the math and the goal-record construction; the UI in Step 3
 * just calls `deriveWeeklyGoals` and persists the returned records.
 *
 * Formula routing (per-metric, not per-module — coverage and
 * consistency goals from the same module compute differently):
 *
 *   Coverage (*_coverage_at_acquired[_specific]) →
 *       monthly attempts ≈ items × per-memory-type multiplier
 *           HF / ET (declarative)  → 10 attempts/item
 *           Shapes  (procedural)   → 3  attempts/item
 *       weekly target = (monthly_target − attempts_so_far) / weeks_remaining
 *
 *   Production completion (path_completion, lessons_count) →
 *       monthly target = lesson count
 *       weekly target  = remaining lessons / weeks_remaining
 *
 *   Consistency (*_per_cadence | practice_*) →
 *       weekly target = monthly cadence value (direct passthrough)
 *       No formula — the cadence IS already weekly.
 *
 *   Song repertoire (song_whole_at_level) →
 *       weekly target = 1 session/week per song goal.
 *       Each song goal is its own record (umbrella + per-song
 *       children) so this maps to one weekly per song.
 *
 *   Accuracy / Mastery / Proficiency / Bench-time threshold →
 *       skipped — these don't translate to weekly attempt volume.
 *       The monthly goal still tracks its own progress; the user
 *       just won't get a weekly slice for it.
 *
 * Mid-week creation: when the monthly goal's startDate falls inside
 * this week, the first weekly slice is prorated:
 *   weekly_target = monthly_target × (days_remaining_this_week / days_remaining_this_month)
 * This stops a Thursday-created monthly goal from generating a
 * full-week target the user can't actually hit.
 *
 * No schema changes — every weekly goal record reuses the existing
 * Goal interface. parentGoalId points at the monthly goal,
 * startDate=weekStart, targetDate=weekEnd, scope='weekly'.
 */

/** One day in milliseconds. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Multiplier from items to attempts for declarative-memory modules.
 *  Mirrors the DECLARATIVE_ACQUIRED_WINDOW threshold of 10 successful
 *  recalls before a card is considered acquired. */
const DECLARATIVE_ATTEMPTS_PER_ITEM = 10;

/** Multiplier from items to attempts for procedural-memory modules
 *  (Shapes). Mirrors RATING_ACQUIRED_MIN_RATINGS — 3 satisfactory
 *  ratings before a drill is considered acquired. */
const PROCEDURAL_ATTEMPTS_PER_ITEM = 3;

/** Days remaining between two timestamps, rounded UP so a partial
 *  day still counts. Returns 0 (not negative) if `to` is before
 *  `from` — caller handles "already past" by skipping. */
function daysBetween(from: number, to: number): number {
  if (to <= from) return 0;
  return Math.ceil((to - from) / ONE_DAY_MS);
}

/** Saturday 23:59:59.999 local for the Sunday week-start passed in.
 *  Week shape per Phase 4 design: Sun=day0 → Sat=day6. */
function endOfWeekFromStart(weekStart: number): number {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** True when the metric is one of the cadence-style or
 *  practice-consistency metrics whose weekly target is the
 *  monthly cadence value verbatim. Mirrors the predicate in
 *  umbrellaSummary.ts:isConsistencyMetricLocal — keep in lockstep. */
function isConsistencyMetric(metric: string): boolean {
  return (
    metric.includes('_sessions_per_') ||
    metric.includes('_minutes_per_') ||
    metric.includes('_hours_per_') ||
    metric.includes('_days_per_') ||
    metric.includes('_lessons_per_') ||
    metric.startsWith('practice_')
  );
}

/** Module-display label for the auto-generated weekly description.
 *  Matches the cards in GoalSuggestionFlow so a weekly goal reads
 *  the same as its monthly parent's headline. */
const MODULE_DISPLAY_LABEL: Record<GoalFlowModuleId, string> = {
  'harmonic-fluency':     'Harmonic Fluency',
  'ear-training':         'Ear Training',
  'shapes-and-patterns':  'Shapes & Patterns',
  'repertoire':           'Repertoire',
  'production':           'Production',
  'practice-consistency': 'Practice Consistency',
};

/** Categorize a goal's metric into the derivation strategy that
 *  applies. Centralizes the per-metric routing so the formula logic
 *  and the unit logic agree on what kind of weekly each goal
 *  produces. Returns null for metrics that don't translate to a
 *  weekly attempt slice. */
type DerivationKind =
  | { kind: 'coverage'; multiplier: number }
  | { kind: 'completion' }       // production lessons / path completion
  | { kind: 'consistency' }      // direct passthrough of cadence value
  | { kind: 'song' }             // one session/week per song goal
  | null;

function classifyMetric(metric: string): DerivationKind {
  if (isCoverageMetric(metric)) {
    return {
      kind: 'coverage',
      multiplier: metric.startsWith('shapes_')
        ? PROCEDURAL_ATTEMPTS_PER_ITEM
        : DECLARATIVE_ATTEMPTS_PER_ITEM,
    };
  }
  if (
    metric === 'production_path_completion' ||
    metric === 'production_lessons_count'
  ) {
    return { kind: 'completion' };
  }
  if (metric === 'song_whole_at_level') {
    return { kind: 'song' };
  }
  if (isConsistencyMetric(metric)) {
    return { kind: 'consistency' };
  }
  return null;
}

/** Pick the targetUnit string for the weekly record based on the
 *  parent's metric. Drives display ("325 attempts" vs "9 sessions"
 *  vs "1 hour"). Production hours-per-cadence uses 'hours'; lesson
 *  metrics use 'lessons'; song goals use 'sessions'; everything
 *  else defaults to 'attempts'. */
function weeklyUnitForMetric(metric: string): string {
  if (metric === 'production_hours_per_cadence') return 'hours';
  if (
    metric === 'production_path_completion' ||
    metric === 'production_lessons_count'
  ) {
    return 'lessons';
  }
  if (metric === 'song_whole_at_level') return 'sessions';
  if (metric === 'repertoire_sessions_per_cadence') return 'sessions';
  if (isConsistencyMetric(metric)) {
    if (metric.includes('_minutes_per_')) return 'minutes';
    if (metric.includes('_hours_per_')) return 'hours';
    if (metric.includes('_lessons_per_')) return 'lessons';
    if (metric.includes('_days_per_') || metric.startsWith('practice_')) {
      return 'days';
    }
    return 'sessions';
  }
  return 'attempts';
}

// ---------------------------------------------------------------------
// computeWeeklyTarget — pure formula
// ---------------------------------------------------------------------

/**
 * Pure math separated from the async orchestrator so the formula
 * can be tested without spinning up Dexie. All the time-window
 * decisions (mid-week branch, weeks-remaining, proration) live
 * here; the orchestrator just feeds it inputs.
 *
 * Returns the rounded-up weekly attempt target, or 0 if the
 * monthly window has already ended (caller should skip).
 */
export interface ComputeWeeklyTargetArgs {
  /** Total attempts/lessons/items the monthly goal aims at. */
  monthlyTarget: number;
  /** Attempts already logged against the monthly goal up to (but
   *  not including) the start of this week. Ignored on the
   *  mid-week-creation branch — proration is from total, not
   *  remaining, since no significant attempts have been logged
   *  yet for a freshly-created goal. */
  attemptsSoFar: number;
  monthlyStartDate: number;
  monthlyTargetDate: number;
  weekStart: number;
  weekEnd: number;
  /** "Now" used to anchor mid-week proration. Defaults to weekStart
   *  for the regular Sunday-of-week call; tests can pin it for
   *  deterministic mid-week scenarios. */
  now: number;
}

export function computeWeeklyTarget(args: ComputeWeeklyTargetArgs): number {
  const {
    monthlyTarget,
    attemptsSoFar,
    monthlyStartDate,
    monthlyTargetDate,
    weekStart,
    weekEnd,
    now,
  } = args;

  if (monthlyTarget <= 0) return 0;
  if (monthlyTargetDate <= weekStart) return 0; // monthly already over

  const goalStartedThisWeek =
    monthlyStartDate > weekStart && monthlyStartDate <= weekEnd;

  if (goalStartedThisWeek) {
    // Mid-week creation: prorate. Anchor on the later of `now` and
    // the goal's startDate so a goal that says "starts Thursday"
    // gets at most Thurs–Sat regardless of when this function runs.
    const fromTime = Math.max(now, monthlyStartDate);
    const daysWeek = daysBetween(fromTime, weekEnd);
    const daysMonth = daysBetween(fromTime, monthlyTargetDate);
    if (daysWeek <= 0 || daysMonth <= 0) return 0;
    return Math.max(0, Math.ceil(monthlyTarget * (daysWeek / daysMonth)));
  }

  // Reset-clean: spread remaining attempts across remaining weeks.
  const remaining = Math.max(0, monthlyTarget - attemptsSoFar);
  if (remaining === 0) return 0;
  const daysToEnd = daysBetween(weekStart, monthlyTargetDate);
  const weeksRemaining = Math.max(1, Math.ceil(daysToEnd / 7));
  return Math.ceil(remaining / weeksRemaining);
}

// ---------------------------------------------------------------------
// deriveWeeklyGoals — async orchestrator
// ---------------------------------------------------------------------

/**
 * Build weekly Goal records for the upcoming week from a list of
 * active monthly goals. Caller is responsible for:
 *   · selecting which monthly goals to derive (typically: every
 *     monthly with status='active' whose window covers `weekStart`)
 *   · persisting the returned records via db.goals.bulkAdd (if any)
 *
 * Skips:
 *   · umbrella monthly goals (caller passes children directly)
 *   · goals whose metric doesn't translate to weekly attempts
 *     (accuracy / mastery / proficiency / unrecognized)
 *   · goals whose computed weekly target rounds to ≤ 0
 *   · monthly goals already past their targetDate by `weekStart`
 */
export async function deriveWeeklyGoals(
  monthlyGoals: ReadonlyArray<Goal>,
  weekStart: number,
  now: number = Date.now(),
): Promise<Goal[]> {
  const weekEnd = endOfWeekFromStart(weekStart);
  const out: Goal[] = [];

  for (const monthly of monthlyGoals) {
    if (monthly.scope !== 'monthly') continue;
    if (monthly.isUmbrella) continue;
    if (!monthly.targetMetric) continue;
    if (monthly.targetDate <= weekStart) continue;

    const moduleId = moduleForMetric(monthly.targetMetric);
    if (!moduleId) continue;

    const kind = classifyMetric(monthly.targetMetric);
    if (!kind) continue;

    const weeklyTarget = await computeWeeklyTargetForGoal(
      monthly,
      moduleId,
      kind,
      weekStart,
      weekEnd,
      now,
    );
    if (weeklyTarget <= 0) continue;

    const unit = weeklyUnitForMetric(monthly.targetMetric);
    out.push({
      id: crypto.randomUUID(),
      scope: 'weekly',
      description: `${MODULE_DISPLAY_LABEL[moduleId]} — ${weeklyTarget} ${unit} this week`,
      targetMetric: monthly.targetMetric,
      targetValue: weeklyTarget,
      targetUnit: unit,
      currentValue: 0,
      contextTag: monthly.contextTag,
      relatedModules: [...monthly.relatedModules],
      relatedItems: [...monthly.relatedItems],
      startDate: weekStart,
      targetDate: weekEnd,
      status: 'active',
      parentGoalId: monthly.id,
      contributesNumericallyToParent: true,
      isUmbrella: false,
      lastEngagedAt: null,
    });
  }

  return out;
}

/**
 * Per-goal weekly target computation. Routes by derivation kind:
 * consistency and song goals don't need attempt aggregation;
 * coverage and completion goals query attempts already logged
 * against the monthly window so the reset-clean formula sees real
 * remaining work.
 */
async function computeWeeklyTargetForGoal(
  monthly: Goal,
  moduleId: GoalFlowModuleId,
  kind: NonNullable<DerivationKind>,
  weekStart: number,
  weekEnd: number,
  now: number,
): Promise<number> {
  switch (kind.kind) {
    case 'consistency': {
      // Cadence value passes through unchanged. A "1 hour/week"
      // monthly stays "1 hour" weekly regardless of where in the
      // month we are.
      return Math.max(0, Math.ceil(monthly.targetValue ?? 0));
    }

    case 'song': {
      // One session/week per song goal. Caller should pass each
      // song's individual goal record (not the umbrella).
      return 1;
    }

    case 'coverage': {
      const items = monthly.targetValue ?? 0;
      const monthlyTarget = items * kind.multiplier;
      const goalStartedThisWeek =
        monthly.startDate > weekStart && monthly.startDate <= weekEnd;
      // Skip the Dexie read on the mid-week branch — proration uses
      // the gross monthly target, not remaining-after-progress.
      const attemptsSoFar = goalStartedThisWeek
        ? 0
        : await getAttemptsInRange(
            moduleId,
            monthly.startDate,
            weekStart - 1,
          );
      return computeWeeklyTarget({
        monthlyTarget,
        attemptsSoFar,
        monthlyStartDate: monthly.startDate,
        monthlyTargetDate: monthly.targetDate,
        weekStart,
        weekEnd,
        now,
      });
    }

    case 'completion': {
      const monthlyTarget = monthly.targetValue ?? 0;
      const goalStartedThisWeek =
        monthly.startDate > weekStart && monthly.startDate <= weekEnd;
      const attemptsSoFar = goalStartedThisWeek
        ? 0
        : await getAttemptsInRange(
            moduleId,
            monthly.startDate,
            weekStart - 1,
          );
      return computeWeeklyTarget({
        monthlyTarget,
        attemptsSoFar,
        monthlyStartDate: monthly.startDate,
        monthlyTargetDate: monthly.targetDate,
        weekStart,
        weekEnd,
        now,
      });
    }
  }
}

// ---------------------------------------------------------------------
// Phase B — live mid-week recompute + override divergence
// ---------------------------------------------------------------------

export interface RecomputedWeeklyTarget {
  /** Live-recomputed weekly attempt target for the week containing
   *  `now` — what the monthly pace actually needs this week. */
  weeklyTarget: number;
  /** The monthly goal expressed in ATTEMPTS — items × per-item
   *  multiplier for coverage goals, the raw target for completion.
   *  Same unit as `weeklyTarget`; feeds the divergence consequence
   *  projection. */
  monthlyAttemptTarget: number;
}

/**
 * Recompute a monthly goal's weekly target for the week containing
 * `now`, live. `deriveWeeklyGoals` runs once on Sunday and persists
 * a frozen weekly Goal record; this helper re-runs the same
 * `computeWeeklyTarget` formula against the CURRENT week + the
 * user's progress so far — so a mid-week consumer can compare the
 * frozen confirmed target against where the monthly pace actually
 * stands now.
 *
 * Returns null when the goal doesn't translate to a weekly attempt
 * slice (umbrella, accuracy / mastery metric, past its window).
 */
export async function recomputeWeeklyTargetForMonthlyGoal(
  monthly: Goal,
  now: number = Date.now(),
): Promise<RecomputedWeeklyTarget | null> {
  if (monthly.scope !== 'monthly') return null;
  if (monthly.isUmbrella) return null;
  if (!monthly.targetMetric) return null;
  if (monthly.targetDate <= now) return null;

  const moduleId = moduleForMetric(monthly.targetMetric);
  if (!moduleId) return null;
  const kind = classifyMetric(monthly.targetMetric);
  if (!kind) return null;

  const weekStart = startOfWeekLocal(now);
  const weekEnd = endOfWeekFromStart(weekStart);
  const weeklyTarget = await computeWeeklyTargetForGoal(
    monthly,
    moduleId,
    kind,
    weekStart,
    weekEnd,
    now,
  );

  // Monthly target in the same attempt unit as weeklyTarget — only
  // coverage + completion translate cleanly. consistency / song
  // goals carry no monthly attempt total, so the divergence prompt
  // (which guards monthlyTarget ≤ 0) simply won't fire for them.
  let monthlyAttemptTarget = 0;
  if (kind.kind === 'coverage') {
    monthlyAttemptTarget = (monthly.targetValue ?? 0) * kind.multiplier;
  } else if (kind.kind === 'completion') {
    monthlyAttemptTarget = monthly.targetValue ?? 0;
  }

  return { weeklyTarget, monthlyAttemptTarget };
}

export interface ComputeOverrideDivergenceArgs {
  /** The freshly-recomputed weekly target — what the monthly pace
   *  actually needs this week, recalculated live. */
  dynamicTarget: number;
  /** What the user actually confirmed for this week — their manual
   *  override, or the suggested value if they didn't change it. */
  plannedTarget: number;
  /** Seconds per attempt for the module — drives the "~Y min/day"
   *  time translation. */
  timePerAttemptSeconds: number;
  /** Days/week the user practises (global practice-consistency
   *  goal). 0 → the per-day display spreads across the 7-day
   *  calendar week instead. */
  consistencyTargetDays: number;
  /** Total attempts the monthly goal aims at. */
  monthlyTarget: number;
  /** Attempts already logged against the monthly goal so far. */
  coveredSoFar: number;
  /** Whole weeks left in the monthly goal's window — drives the
   *  "you'll cover ~X%" consequence projection. */
  weeksRemainingInMonth: number;
}

export interface OverrideDivergence {
  dynamicTarget: number;
  plannedTarget: number;
  /** Whole minutes/day the dynamic target implies. */
  dynamicMinPerDay: number;
  /** Whole minutes/day the user's planned (override) target implies. */
  plannedMinPerDay: number;
  /** 'under-planned' — the user planned FEWER attempts than the
   *    monthly pace needs (the "update to stay on track" case).
   *  'over-planned' — they planned more than the pace needs. */
  direction: 'under-planned' | 'over-planned';
  /** % of the monthly goal the user covers if they keep the planned
   *  (override) target for every remaining week. Clamped 0–100. */
  monthlyCoveragePercentIfKept: number;
}

/**
 * Pure — compare a live-recomputed weekly target against what the
 * user confirmed, and package the prompt's display numbers.
 * Returns null when there's nothing to surface: the targets match,
 * or the monthly target is degenerate.
 *
 * The consequence projection ("you'll cover ~X%") assumes the user
 * holds the planned target for every remaining week — a straight-
 * line extrapolation of their override, which is the honest "if you
 * keep doing this" framing the design asks for.
 */
export function computeOverrideDivergence(
  args: ComputeOverrideDivergenceArgs,
): OverrideDivergence | null {
  const {
    dynamicTarget,
    plannedTarget,
    timePerAttemptSeconds,
    consistencyTargetDays,
    monthlyTarget,
    coveredSoFar,
    weeksRemainingInMonth,
  } = args;

  if (monthlyTarget <= 0) return null;
  if (dynamicTarget === plannedTarget) return null;

  // Per-day divisor: the user's cadence when they have one, else a
  // flat 7-day spread so the "min/day" line is still meaningful.
  const perDayDivisor = consistencyTargetDays > 0 ? consistencyTargetDays : 7;
  const minPerDay = (target: number): number =>
    Math.round((target * timePerAttemptSeconds) / 60 / perDayDivisor);

  const weeksLeft = Math.max(1, weeksRemainingInMonth);
  const projected = coveredSoFar + plannedTarget * weeksLeft;
  const monthlyCoveragePercentIfKept = Math.round(
    Math.max(0, Math.min(100, (projected / monthlyTarget) * 100)),
  );

  return {
    dynamicTarget,
    plannedTarget,
    dynamicMinPerDay: minPerDay(dynamicTarget),
    plannedMinPerDay: minPerDay(plannedTarget),
    direction: plannedTarget < dynamicTarget ? 'under-planned' : 'over-planned',
    monthlyCoveragePercentIfKept,
  };
}
