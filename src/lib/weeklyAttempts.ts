import { db } from './db';
import { ET_MODULE_REFS } from '../modules/goals/progress';
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
 *   production           → db.spacingState.performanceHistory entries
 *                          on production rows (excluding 'recency'
 *                          marks — those represent passive surfacing,
 *                          not user-initiated state changes)
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

    case 'production': {
      // Walk performanceHistory on every production row. Each entry
      // (other than passive 'recency' marks) represents a user state
      // change — the "any state change except not_yet" semantics from
      // the Phase 4 spec. 'not_yet' selections don't write to
      // performanceHistory at all (they're the implicit default
      // state, no engagement event), so no explicit filter needed.
      const rows = await db.spacingState
        .where('moduleRef').equals('production')
        .toArray();
      let count = 0;
      for (const row of rows) {
        for (const entry of row.performanceHistory) {
          const t = (entry as { t?: unknown }).t;
          const kind = (entry as { kind?: unknown }).kind;
          if (typeof t !== 'number') continue;
          if (t < weekStart || t > weekEnd) continue;
          if (kind === 'recency') continue;
          count++;
        }
      }
      return count;
    }

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
 * Production attempts for the window — Phase B definition: rated
 * ProductionLessonSession rows (Step 3 — a Production attempt counts
 * when the user submits a Flying / Cruising / Crawling rating on the
 * lesson session).
 *
 * Deliberately NOT the same as getWeeklyAttempts('production', …):
 * that walks db.spacingState.performanceHistory (mastery-state
 * changes), the pre-Step-3 notion of a Production "attempt", and the
 * call-sites that consume it (existing weekly-plan UI, the
 * Phase B-prototype loader in sessionNeed.ts) still want that shape.
 * Phase B's keystone wants the rated-session count, so it gets its
 * own helper rather than overloading getWeeklyAttempts's per-module
 * contract.
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
      const rows = await db.spacingState
        .where('moduleRef').equals('production')
        .toArray();
      for (const row of rows) {
        for (const entry of row.performanceHistory) {
          const t = (entry as { t?: unknown }).t;
          const kind = (entry as { kind?: unknown }).kind;
          if (typeof t !== 'number') continue;
          if (t < weekStart || t > weekEnd) continue;
          if (kind === 'recency') continue;
          days.add(localDayKey(t));
        }
      }
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
  return {
    kind: 'point',
    minutes: attempts * TIME_PER_ATTEMPT_MINUTES[moduleId],
  };
}
