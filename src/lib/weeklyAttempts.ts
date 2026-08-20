import { db } from './db';
import { ET_MODULE_REFS, READING_MODULE_REF } from '../modules/goals/progress';
import type { GoalFlowModuleId } from '../modules/goals/goalVocabulary';
import {
  TIME_PER_ATTEMPT_MINUTES,
  SHAPES_TIME_PER_REP_MINUTES,
  SHAPES_DEFAULT_TIME_PER_REP_MINUTES,
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  PRODUCTION_TIME_RANGE_MINUTES,
  type ShapesActivityArea,
} from './sessionAlgorithm/timePerAttempt';

/**
 * Phase 4 Step 1 — weekly attempt aggregation + time estimation.
 *
 * Two pure helpers that translate the underlying per-module attempt
 * sources into the language the weekly plan UI consumes. Same
 * `(moduleId, weekStart, weekEnd)` window across all six modules;
 * each module routes to its native source table.
 *
 * No schema changes — reads from existing tables only. No UI.
 */

// ---------------------------------------------------------------------
// Per-module time constants
// ---------------------------------------------------------------------
//
// The time-per-attempt seeds moved to the canonical
// sessionAlgorithm/timePerAttempt.ts in Phase B Step 1. They're
// imported above (getWeeklyTimeEstimate below still consumes them
// directly) and re-exported here unchanged so existing importers of
// '../weeklyAttempts' keep working without a path change.

export {
  TIME_PER_ATTEMPT_MINUTES,
  SHAPES_TIME_PER_REP_MINUTES,
  SHAPES_DEFAULT_TIME_PER_REP_MINUTES,
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  PRODUCTION_TIME_RANGE_MINUTES,
};
export type { ShapesActivityArea };

// ---------------------------------------------------------------------
// getWeeklyAttempts
// ---------------------------------------------------------------------

/**
 * Count attempts for a module within an arbitrary date range. The
 * `getWeeklyAttempts` and `getAttemptsInRange` exports are the same
 * function — the weekly name preserves the Phase 4 Step 1 contract,
 * the range name is for callers (Step 2's monthly aggregation,
 * future trend queries) that operate on non-weekly windows.
 *
 * The "attempt" unit and source table differ per module — this
 * helper is the single dispatch point so callers don't have to
 * reason about underlying schema:
 *
 *   harmonic-fluency     → db.attempts (moduleId='harmonic-fluency')
 *   ear-training         → db.attempts (moduleId in ET_MODULE_REFS)
 *   shapes-and-patterns  → db.drillSessions
 *   repertoire           → db.songCellRunThroughs
 *   production           → db.productionLessonSessions rows carrying
 *                          a rating (passive open events don't count)
 *   practice-consistency → db.practiceSessions (any module counts)
 *
 * `weekStart` and `weekEnd` are epoch ms, both inclusive. Caller
 * builds them via dateHelpers.startOfWeekISODate (Sunday 00:00 local)
 * and the matching Saturday 23:59 local end.
 */
export async function getWeeklyAttempts(
  moduleId: GoalFlowModuleId,
  weekStart: number,
  weekEnd: number,
): Promise<number> {
  switch (moduleId) {
    case 'harmonic-fluency':
      return db.attempts
        .where('moduleId').equals('harmonic-fluency')
        .filter(a => a.timestamp >= weekStart && a.timestamp <= weekEnd)
        .count();

    case 'ear-training':
      return db.attempts
        .where('moduleId').anyOf(ET_MODULE_REFS as readonly string[] as string[])
        .filter(a => a.timestamp >= weekStart && a.timestamp <= weekEnd)
        .count();

    case 'shapes-and-patterns':
      return db.drillSessions
        .where('timestamp').between(weekStart, weekEnd, true, true)
        .count();

    case 'repertoire':
      return db.songCellRunThroughs
        .where('createdAt').between(weekStart, weekEnd, true, true)
        .count();

    case 'production':
      // Rated lesson sessions — the same source
      // getWeeklyRatedProductionAttempts reads. See the note on that
      // function for why this branch no longer walks spacingState.
      return getWeeklyRatedProductionAttempts(weekStart, weekEnd);

    case 'reading':
      // Same shape as HF: one attempts row per answered card, under a
      // single moduleId. Counts correctly from the moment the step-4
      // attempt writer exists, and returns 0 before then — no
      // placeholder needed because the query is already right.
      return db.attempts
        .where('moduleId').equals(READING_MODULE_REF)
        .filter(a => a.timestamp >= weekStart && a.timestamp <= weekEnd)
        .count();

    case 'practice-consistency':
      return db.practiceSessions
        .where('startedAt').between(weekStart, weekEnd, true, true)
        .count();
  }
}

/**
 * Alias of getWeeklyAttempts. Exists so callers operating on
 * non-weekly date ranges (Step 2's monthly aggregation, future
 * trend queries) can read intent at the call site without
 * pretending the window is a single week. Identical implementation.
 */
export const getAttemptsInRange = getWeeklyAttempts;

// ---------------------------------------------------------------------
// getEarTrainingAttemptsBySubActivity
// ---------------------------------------------------------------------

/** ET sub-activity moduleIds Phase B budgets time for independently.
 *  Each ET quiz already writes db.attempts rows under its own
 *  MODULE_ID ('intervals', 'chord-recognition', …) — the sub-activity
 *  is encoded in the existing schema, so there's no new field. */
const ET_INTERVALS_MODULE_ID = 'intervals';
const ET_CHORD_RECOGNITION_MODULE_ID = 'chord-recognition';

export interface EarTrainingAttemptsBySubActivity {
  /** Attempts logged in the intervals quiz this window. */
  intervals: number;
  /** Attempts logged in the chord-recognition quiz this window. */
  chordRecognition: number;
  /** Every ET attempt in the window, across all ET sub-modules —
   *  equal by construction to getWeeklyAttempts('ear-training', …)
   *  (same query, same filter). Always ≥ intervals + chordRecognition;
   *  the remainder is the "other" ET sub-activities
   *  (chord-progressions, scales-modes), which count toward the total
   *  but don't yet get their own Phase B time slice. */
  total: number;
}

/**
 * ET attempt counts for the window, broken out by the sub-activities
 * Phase B plans time for independently (intervals, chord
 * recognition). Parallel to — not a replacement for —
 * getWeeklyAttempts('ear-training', …): that stays the single uniform
 * per-module count; this slices the same rows so
 * computeSessionNeedByModule can budget each sub-activity.
 *
 * No schema change needed — the sub-activity is already the
 * AttemptRecord's `moduleId` (each ET quiz writes its own MODULE_ID).
 * Rows whose moduleId is an ET sub-module other than intervals /
 * chord-recognition fold into `total` only, never into the two named
 * buckets — the "handled gracefully" path for anything that isn't one
 * of the two Phase-B-planned sub-activities.
 */
export async function getEarTrainingAttemptsBySubActivity(
  weekStart: number,
  weekEnd: number,
): Promise<EarTrainingAttemptsBySubActivity> {
  const rows = await db.attempts
    .where('moduleId').anyOf(ET_MODULE_REFS as readonly string[] as string[])
    .filter(a => a.timestamp >= weekStart && a.timestamp <= weekEnd)
    .toArray();

  let intervals = 0;
  let chordRecognition = 0;
  for (const a of rows) {
    if (a.moduleId === ET_INTERVALS_MODULE_ID) intervals += 1;
    else if (a.moduleId === ET_CHORD_RECOGNITION_MODULE_ID) chordRecognition += 1;
  }

  return { intervals, chordRecognition, total: rows.length };
}

// ---------------------------------------------------------------------
// getWeeklyRatedProductionAttempts
// ---------------------------------------------------------------------

/**
 * Production attempts for the window: ProductionLessonSession rows
 * carrying a rating. Passive open events (recordLessonOpen) have no
 * rating and don't count — opening a lesson is not an attempt at it.
 *
 * This is now the SAME thing getWeeklyAttempts('production', …)
 * returns; the two agree by construction and the helper survives
 * because callers name it directly.
 *
 * It used not to. getWeeklyAttempts walked
 * db.spacingState.performanceHistory on production rows, which is a
 * count that could only ever be zero: the only writer of production
 * spacing rows is assertSpacingStage, and that deliberately does NOT
 * append to performanceHistory (see spacingState.ts) — it creates
 * rows with an empty history. recordEngagement, the only function
 * that appends, is never called with moduleRef 'production'. So the
 * weekly-plan UI and the session generator read 0 Production
 * attempts forever, no matter how much Production work was done.
 *
 * Counting the module's own source table is also what every other
 * module already does — attempts, drillSessions, songCellRunThroughs.
 * Production walking spacingState was the odd one out, not the
 * consistent case.
 */
export async function getWeeklyRatedProductionAttempts(
  weekStart: number,
  weekEnd: number,
): Promise<number> {
  return db.productionLessonSessions
    .where('timestamp').between(weekStart, weekEnd, true, true)
    .filter(s => s.rating !== undefined)
    .count();
}

// ---------------------------------------------------------------------
// getDaysWithActivity
// ---------------------------------------------------------------------

/** Convert an epoch ms to a local YYYY-MM-DD string. Used as the
 *  distinct-day key for `getDaysWithActivity` — two timestamps on
 *  the same local calendar day collapse to one entry. */
function localDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Distinct days within the window that had at least one attempt
 * for `moduleId`. Returns 0-7 for a one-week window. Drives the
 * by-module view's "X of Y days" muted text for consistency goals.
 *
 * Mirrors `getWeeklyAttempts` per-module dispatch: each module
 * pulls timestamps from its native source table. Practice-
 * consistency is the module-agnostic "any practice session"
 * count — every other module narrows to its own source.
 */
export async function getDaysWithActivity(
  moduleId: GoalFlowModuleId,
  weekStart: number,
  weekEnd: number,
): Promise<number> {
  const days = new Set<string>();

  switch (moduleId) {
    case 'harmonic-fluency': {
      const rows = await db.attempts
        .where('moduleId').equals('harmonic-fluency')
        .filter(a => a.timestamp >= weekStart && a.timestamp <= weekEnd)
        .toArray();
      for (const r of rows) days.add(localDayKey(r.timestamp));
      break;
    }
    case 'ear-training': {
      const rows = await db.attempts
        .where('moduleId').anyOf(ET_MODULE_REFS as readonly string[] as string[])
        .filter(a => a.timestamp >= weekStart && a.timestamp <= weekEnd)
        .toArray();
      for (const r of rows) days.add(localDayKey(r.timestamp));
      break;
    }
    case 'shapes-and-patterns': {
      const rows = await db.drillSessions
        .where('timestamp').between(weekStart, weekEnd, true, true)
        .toArray();
      for (const r of rows) days.add(localDayKey(r.timestamp));
      break;
    }
    case 'repertoire': {
      const rows = await db.songCellRunThroughs
        .where('createdAt').between(weekStart, weekEnd, true, true)
        .toArray();
      for (const r of rows) days.add(localDayKey(r.createdAt));
      break;
    }
    case 'production': {
      const rows = await db.productionLessonSessions
        .where('timestamp').between(weekStart, weekEnd, true, true)
        .filter(s => s.rating !== undefined)
        .toArray();
      for (const r of rows) days.add(localDayKey(r.timestamp));
      break;
    }
    case 'practice-consistency': {
      const rows = await db.practiceSessions
        .where('startedAt').between(weekStart, weekEnd, true, true)
        .toArray();
      for (const r of rows) days.add(localDayKey(r.startedAt));
      break;
    }
  }

  return days.size;
}

// ---------------------------------------------------------------------
// getWeeklyTimeEstimate
// ---------------------------------------------------------------------

/**
 * Honest time estimate for an attempt count. Production returns a
 * range because lesson depth varies materially (a conceptual lesson
 * might take 15 min; a Logic-application lesson can hit 2+ hours).
 * Shapes accepts an optional `shapesActivityArea` so callers that
 * know which activity drove the attempts (chord shape vs scale vs
 * voice-leading) get the area-specific minutes; without it, falls
 * back to SHAPES_DEFAULT_TIME_PER_REP_MINUTES (catalog-weighted
 * average). Other modules return a point estimate from
 * TIME_PER_ATTEMPT_MINUTES.
 *
 * Returns minutes (caller formats hours/minutes for display).
 */
export type TimeEstimate =
  | { kind: 'point'; minutes: number }
  | { kind: 'range'; minMinutes: number; maxMinutes: number };

export function getWeeklyTimeEstimate(
  moduleId: GoalFlowModuleId,
  attempts: number,
  shapesActivityArea?: ShapesActivityArea,
): TimeEstimate {
  if (moduleId === 'production') {
    return {
      kind: 'range',
      minMinutes: attempts * PRODUCTION_TIME_RANGE_MINUTES.minPerLesson,
      maxMinutes: attempts * PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson,
    };
  }
  if (moduleId === 'shapes-and-patterns') {
    const perRep = shapesActivityArea
      ? SHAPES_TIME_PER_REP_MINUTES[shapesActivityArea]
      : SHAPES_DEFAULT_TIME_PER_REP_MINUTES;
    return { kind: 'point', minutes: attempts * perRep };
  }
  if (moduleId === 'reading') {
    // Reading is deliberately absent from TIME_PER_ATTEMPT_MINUTES —
    // its seeds are PER-SKILL and live in TIME_PER_ATTEMPT_SECONDS
    // (step 5), because a key-signature card and a chord-under-a-
    // signature card are very different costs. This branch becomes
    // `attempts * SECONDS['reading'] / 60` there. Zero until then;
    // unreachable, since Reading has no goals to estimate yet.
    return { kind: 'point', minutes: 0 };
  }
  return {
    kind: 'point',
    minutes: attempts * TIME_PER_ATTEMPT_MINUTES[moduleId],
  };
}
