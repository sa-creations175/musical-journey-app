import { db } from './db';
import { ET_MODULE_REFS } from '../modules/goals/progress';
import type { GoalFlowModuleId } from '../modules/goals/goalVocabulary';

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
// Per-module time constants (first-pass; recalibrate after 3–4 weeks
// of real usage data per the Phase 4 design)
// ---------------------------------------------------------------------

/** Time per attempt in minutes for modules with a point estimate. */
export const TIME_PER_ATTEMPT_MINUTES: Record<
  Exclude<GoalFlowModuleId, 'production'>,
  number
> = {
  'harmonic-fluency':     20 / 60,  // 20 seconds per flashcard
  'ear-training':         20 / 60,  // 20 seconds per quiz question
  'shapes-and-patterns':  5,        // 5 minutes per drill rep
  'repertoire':           17.5,     // midpoint of 15–20 min per cell session
  'practice-consistency': 45,       // midpoint of 30–60 min per session
};

/** Production lesson time is highly variable — show as a range. */
export const PRODUCTION_TIME_RANGE_MINUTES = {
  minPerLesson: 30,
  maxPerLesson: 90,
} as const;

// ---------------------------------------------------------------------
// getWeeklyAttempts
// ---------------------------------------------------------------------

/**
 * Count attempts for a module within a week window. The "attempt"
 * unit and source table differ per module — this helper is the
 * single dispatch point so callers don't have to reason about
 * underlying schema:
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

// ---------------------------------------------------------------------
// getWeeklyTimeEstimate
// ---------------------------------------------------------------------

/**
 * Honest time estimate for an attempt count. Production returns a
 * range because lesson depth varies materially (a conceptual lesson
 * might take 15 min; a Logic-application lesson can hit 2+ hours).
 * Other modules return a point estimate from
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
): TimeEstimate {
  if (moduleId === 'production') {
    return {
      kind: 'range',
      minMinutes: attempts * PRODUCTION_TIME_RANGE_MINUTES.minPerLesson,
      maxMinutes: attempts * PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson,
    };
  }
  return {
    kind: 'point',
    minutes: attempts * TIME_PER_ATTEMPT_MINUTES[moduleId],
  };
}
