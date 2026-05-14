import { db, type Goal } from '../../lib/db';
import {
  moduleForMetric,
  type GoalFlowModuleId,
} from '../goals/goalVocabulary';
import { isCoverageMetric } from '../goals/coverageMetrics';
import { isConsistencyMetric } from '../goals/progress';
import {
  TIME_PER_ATTEMPT_MINUTES,
  SHAPES_TIME_PER_REP_MINUTES,
  SHAPES_DEFAULT_TIME_PER_REP_MINUTES,
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  PRODUCTION_TIME_RANGE_MINUTES,
  type ShapesActivityArea,
} from '../../lib/sessionAlgorithm/timePerAttempt';
import {
  computeSessionNeedByModule,
  type ModuleSessionNeed,
} from '../../lib/sessionAlgorithm/sessionNeed';

/**
 * Per-module per-day need estimate for the "What your goals need
 * today" screen. Each entry is one module's typical per-session
 * minute commitment derived from its active monthly goals.
 *
 * The day-of-week question ("does Shapes need practice today?") is
 * intentionally ignored: a consistency target of e.g. 5 days/week is
 * surfaced as if the module needs practice every day, since the user
 * can't know in advance which days they'll skip. The total is a
 * "honest practice day" estimate, not a contractual obligation.
 */
/** Phase B breakdown attached to entries computed by the goal-pace
 *  formula (computeSessionNeedByModule). Present only for the
 *  modules Phase B currently plans for — Harmonic Fluency + Ear
 *  Training. Drives the plain-English detail line on
 *  GoalsNeedTodayScreen ("65 attempts × 30s each"). Absent on
 *  legacy-estimated entries (S&P / Repertoire / Production), which
 *  keep the pre-Phase-B per-day estimate. */
export interface DailyNeedPhaseB {
  /** Attempts today's session targets for this module. 0 in
   *  over-practice mode. */
  attemptsToday: number;
  /** Seconds per attempt — the seed (or, later, rolling average)
   *  used in the breakdown. */
  timePerAttemptSeconds: number;
  /** True when the weekly target is already met — the screen
   *  renders this as a "target met" state, not a time ask. */
  isOverPractice: boolean;
}

export interface DailyNeedEntry {
  moduleId: GoalFlowModuleId;
  /** User-facing label — pulled from moduleMeta in the renderer. The
   *  helper stores only the canonical id. */
  dailyMinutes: number;
  /** Phase B goal-pace breakdown. Undefined for legacy-estimated
   *  modules — see DailyNeedPhaseB. */
  phaseB?: DailyNeedPhaseB;
}

export interface DailyNeed {
  entries: DailyNeedEntry[];
  totalMinutes: number;
}

/**
 * Async entry for "What your goals need today". Hybrid by design:
 *
 *   · Harmonic Fluency + Ear Training go through the Phase B
 *     goal-pace formula (computeSessionNeedByModule) — the same
 *     source of truth the session planner uses, so the pre-session
 *     screen and the proposal agree.
 *   · Every other module keeps the legacy per-day estimate
 *     (computeDailyGoalNeed) until Phase B's attempt-counting gaps
 *     for S&P / Repertoire / Production close — dropping them from
 *     the screen would be a visible regression, so they stay on
 *     the cruder estimate for now.
 *
 * `mergeDailyNeed` does the pure merge; this wrapper just does the
 * two Dexie reads. Returns null when neither source produces an
 * entry — caller skips the screen and goes straight to the
 * questionnaire's time picker.
 */
export async function loadDailyGoalNeed(
  now: number = Date.now(),
): Promise<DailyNeed | null> {
  const goals = await db.goals
    .where('status').equals('active')
    .toArray();
  const legacy = computeDailyGoalNeed(goals);
  const phaseB = await computeSessionNeedByModule(now);
  return mergeDailyNeed(legacy, phaseB);
}

/**
 * Pure merge — Phase B entries OVERRIDE the legacy estimate for the
 * modules they cover, legacy entries fill in the rest. Re-orders by
 * MODULE_ORDER so the screen sequencing stays stable regardless of
 * which source produced each row.
 *
 * Over-practice modules (weekly target met) are kept in the list
 * with dailyMinutes 0 and the isOverPractice flag — the screen
 * renders them as a "target met" win rather than hiding the
 * positive signal. They contribute 0 to the total naturally.
 *
 * Returns null when the merged set is empty.
 */
export function mergeDailyNeed(
  legacy: DailyNeed | null,
  phaseBByModule: ReadonlyMap<GoalFlowModuleId, ModuleSessionNeed>,
): DailyNeed | null {
  const byModule = new Map<GoalFlowModuleId, DailyNeedEntry>();

  if (legacy) {
    for (const e of legacy.entries) byModule.set(e.moduleId, e);
  }

  for (const [moduleId, need] of phaseBByModule) {
    // timeNeeded = attemptsToday × timePerAttempt by construction,
    // so the division recovers the per-attempt seed exactly.
    const timePerAttemptSeconds = need.attemptsToday > 0
      ? need.timeNeededSeconds / need.attemptsToday
      : 0;
    byModule.set(moduleId, {
      moduleId,
      dailyMinutes: Math.round(need.timeNeededSeconds / 60),
      phaseB: {
        attemptsToday: need.attemptsToday,
        timePerAttemptSeconds,
        isOverPractice: need.isOverPractice,
      },
    });
  }

  if (byModule.size === 0) return null;

  const entries: DailyNeedEntry[] = [];
  for (const moduleId of MODULE_ORDER) {
    const entry = byModule.get(moduleId);
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return null;

  const totalMinutes = entries.reduce((s, e) => s + e.dailyMinutes, 0);
  return { entries, totalMinutes };
}

/**
 * Pure transform — given the list of active goals, compute per-
 * module daily-minute estimates and a total. Exported for tests.
 *
 * Coverage estimates use weekly attempt counts × time-per-attempt
 * (divided by 7 → daily). Consistency estimates use the per-session
 * minute constant directly (each practice day on the cadence). For
 * modules with both, we take the larger of the two — they should
 * roughly agree, but a coverage-heavy week may push past the
 * consistency floor; we honor whichever signals more time.
 *
 * Repertoire's days-per-cadence anchor is the dominant signal there
 * (45 min/practice-day), so we read it directly when present.
 *
 * Module ordering follows MODULE_ORDER below — matches the rest of
 * the app's by-module sorting (Shapes before Repertoire, etc.).
 */
export function computeDailyGoalNeed(
  goals: ReadonlyArray<Goal>,
): DailyNeed | null {
  const active = goals.filter(g => g.status === 'active' && !g.isUmbrella);
  if (active.length === 0) return null;

  const minutesByModule = new Map<GoalFlowModuleId, number>();

  for (const goal of active) {
    if (goal.scope !== 'monthly') continue;
    const moduleId = moduleForMetric(goal.targetMetric);
    if (!moduleId) continue;
    const dailyMinutes = perDayMinutesForGoal(goal, moduleId);
    if (dailyMinutes <= 0) continue;
    const prev = minutesByModule.get(moduleId) ?? 0;
    // Take the larger of multiple goals' contributions for the same
    // module rather than summing — a coverage goal and a consistency
    // goal in the same module describe the same practice time, just
    // from different angles.
    minutesByModule.set(moduleId, Math.max(prev, dailyMinutes));
  }

  if (minutesByModule.size === 0) return null;

  const entries: DailyNeedEntry[] = [];
  for (const moduleId of MODULE_ORDER) {
    const minutes = minutesByModule.get(moduleId);
    if (minutes === undefined) continue;
    entries.push({ moduleId, dailyMinutes: Math.round(minutes) });
  }
  if (entries.length === 0) return null;

  const totalMinutes = entries.reduce((s, e) => s + e.dailyMinutes, 0);
  return { entries, totalMinutes };
}

/**
 * Per-module daily-minute display order — Shapes/Repertoire on top
 * because those carry the highest per-session minute floor on a
 * typical Keys session, the cognitive modules (HF/ET) lower because
 * they're shorter and can be slotted into off-keyboard time.
 * Production sits between the two ranges.
 */
const MODULE_ORDER: ReadonlyArray<GoalFlowModuleId> = [
  'shapes-and-patterns',
  'repertoire',
  'production',
  'harmonic-fluency',
  'ear-training',
  'practice-consistency',
];

/** Per-goal contribution to daily minutes. Dispatches on metric kind +
 *  module. Returns 0 for goals that don't translate to a usable time
 *  signal (e.g. pure mastery goals — those overlap with coverage
 *  anyway). */
function perDayMinutesForGoal(
  goal: Goal,
  moduleId: GoalFlowModuleId,
): number {
  const metric = goal.targetMetric ?? '';
  const value = goal.targetValue;

  if (metric === 'song_whole_at_level' || metric === 'song_of_month') {
    // Spotlight / queue child contributes one Repertoire practice
    // session worth of time on a typical day.
    return REPERTOIRE_SESSION_DEFAULT_MINUTES;
  }

  if (isConsistencyMetric(metric)) {
    return perDayFromConsistency(metric, value, moduleId);
  }

  if (isCoverageMetric(metric)) {
    return perDayFromCoverage(metric, value, moduleId, goal);
  }

  return 0;
}

/**
 * Consistency-target translation. Days/lessons/sessions per cadence
 * → per-day minutes on a practice day. The user's commitment is
 * "this many sessions/days a week"; on the days they DO practice
 * they need one session worth of time.
 */
function perDayFromConsistency(
  metric: string,
  _value: number | null,
  moduleId: GoalFlowModuleId,
): number {
  if (metric.endsWith('_days_per_cadence')) {
    // One practice-day worth of module time. Each module's session
    // length is its own constant — HF/ET sessions are short (15-ish
    // minutes), Shapes are 20-ish, Repertoire is 45.
    return defaultSessionMinutesForModule(moduleId);
  }
  if (metric.endsWith('_lessons_per_cadence')) {
    // Production: one lesson midpoint.
    return (
      PRODUCTION_TIME_RANGE_MINUTES.minPerLesson
      + PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson
    ) / 2;
  }
  if (metric.endsWith('_sessions_per_cadence')) {
    // Legacy sessions-per-cadence — same as a typical session.
    return defaultSessionMinutesForModule(moduleId);
  }
  if (metric === 'practice_days_per_cadence') {
    // Whole-app practice-consistency goal — neutral 30 min default.
    return 30;
  }
  return 0;
}

/**
 * Coverage-target translation. Weekly attempt count × per-attempt
 * time gives the weekly minute budget for hitting the target by
 * the deadline; divided by 7 to get a daily smear. Coverage doesn't
 * imply daily practice (some modules cluster on 5 days/week), but
 * this approximation lets the user see weight from coverage goals
 * even when there's no companion consistency target.
 */
function perDayFromCoverage(
  _metric: string,
  value: number | null,
  moduleId: GoalFlowModuleId,
  goal: Goal,
): number {
  if (value == null || value <= 0) return 0;

  // Rough weeks-until-target. If the deadline is past, treat it as 1
  // week so we still produce a finite minute estimate.
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const remainingMs = Math.max(goal.targetDate - goal.startDate, ONE_WEEK_MS);
  const weeks = Math.max(1, Math.ceil(remainingMs / ONE_WEEK_MS));
  const weeklyAttempts = value / weeks;

  if (moduleId === 'harmonic-fluency' || moduleId === 'ear-training') {
    return (weeklyAttempts * TIME_PER_ATTEMPT_MINUTES[moduleId]) / 7;
  }
  if (moduleId === 'shapes-and-patterns') {
    const perRep = shapesPerRepMinutes(goal.targetUnit);
    return (weeklyAttempts * perRep) / 7;
  }
  if (moduleId === 'production') {
    return (weeklyAttempts
      * (PRODUCTION_TIME_RANGE_MINUTES.minPerLesson
        + PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson) / 2) / 7;
  }
  if (moduleId === 'repertoire') {
    // Coverage on Repertoire is rare (legacy songs_*); fall back to
    // one default session per day.
    return REPERTOIRE_SESSION_DEFAULT_MINUTES;
  }
  return 0;
}

function shapesPerRepMinutes(targetUnit: string | null): number {
  if (!targetUnit) return SHAPES_DEFAULT_TIME_PER_REP_MINUTES;
  const area: ShapesActivityArea | null =
    targetUnit.startsWith('chord_shape') ? 'chord_shape_drills'
    : targetUnit === 'scale_drills' ? 'scale_drills'
    : targetUnit === 'voice_leading' ? 'voice_leading'
    : null;
  return area ? SHAPES_TIME_PER_REP_MINUTES[area] : SHAPES_DEFAULT_TIME_PER_REP_MINUTES;
}

/**
 * Default per-practice-day minute estimate per module. Used by
 * consistency translations that don't carry an inline duration.
 * Tuned to the post-redesign UX defaults: HF/ET are short cognitive
 * sessions, Shapes ~20 min (a typical 12-rep block), Repertoire 45
 * (the session-default constant), Production a lesson midpoint.
 */
function defaultSessionMinutesForModule(moduleId: GoalFlowModuleId): number {
  switch (moduleId) {
    case 'harmonic-fluency':     return 15;
    case 'ear-training':         return 15;
    case 'shapes-and-patterns':  return 20;
    case 'repertoire':           return REPERTOIRE_SESSION_DEFAULT_MINUTES;
    case 'production':
      return (
        PRODUCTION_TIME_RANGE_MINUTES.minPerLesson
        + PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson
      ) / 2;
    case 'practice-consistency': return 30;
  }
}
