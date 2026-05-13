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

/** Time per attempt in minutes for modules with a single point
 *  estimate. Shapes lives in its own per-activity-area table (see
 *  SHAPES_TIME_PER_REP_MINUTES below) because its three activity
 *  areas have materially different per-rep costs; Production is in
 *  PRODUCTION_TIME_RANGE_MINUTES because lesson length varies enough
 *  to warrant a range. */
export const TIME_PER_ATTEMPT_MINUTES: Record<
  Exclude<GoalFlowModuleId, 'production' | 'shapes-and-patterns'>,
  number
> = {
  'harmonic-fluency':     20 / 60,  // 20 seconds per flashcard
  'ear-training':         20 / 60,  // 20 seconds per quiz question
  'repertoire':           17.5,     // midpoint of 15–20 min per cell session
  'practice-consistency': 45,       // midpoint of 30–60 min per session
};

/** Shapes & Patterns activity-area discriminator. Mirrors the
 *  ShapesActivityArea union in GoalCreationFlow.tsx but redeclared
 *  here so this lib stays UI-independent. */
export type ShapesActivityArea =
  | 'chord_shape_drills'
  | 'scale_drills'
  | 'voice_leading';

/** Per-activity-area Shapes time-per-rep. The chord_shape_drills
 *  value is a weighted average across the post-inversion-redesign
 *  drill mix (90 s/rep for individual inversions, 120 s/rep for
 *  fluid + extensions/special voicings) — see Phase 4 inversion
 *  spec. Voice-leading reps are longer because the pattern itself
 *  is longer (a full ii–V–I cycle). Recalibrate alongside
 *  TIME_PER_ATTEMPT_MINUTES once there's enough real session data. */
export const SHAPES_TIME_PER_REP_MINUTES: Record<ShapesActivityArea, number> = {
  chord_shape_drills: 1.6,  // weighted avg: triads ~1.625, sevenths ~1.6
  scale_drills:       2,
  voice_leading:      3,
};

/** Weighted-average fallback used when a Shapes time estimate is
 *  requested without a specific activity area (e.g., the WeeklyPlan
 *  last-week review, which counts drill sessions across all three
 *  areas without joining through db.drillSkills). Weights come from
 *  catalog cardinality at time of writing (Phase 4 inversion model):
 *    chord_shape_drills = 852 acquisition-path items
 *      (triads 6×12×4=288, sevenths 6×12×5=360, extensions 14×12=168, special 3×12=36)
 *    scale_drills       = 4 scales × 12 keys = 48
 *    voice_leading      = 3 patterns × 12 keys = 36
 *  → (852×1.6 + 48×2 + 36×3) / 936 ≈ 1.67 min/rep.
 *  Hardcoded (rather than computed from moduleItemCounts) so this
 *  file stays dependency-free. Re-derive if the catalog shifts. */
export const SHAPES_DEFAULT_TIME_PER_REP_MINUTES = 1.67;

/** Default assumed length of a full Repertoire practice session
 *  (spotlight + maintenance combined), used by the WeeklyPlan when
 *  an hours- or days-based repertoire consistency goal needs a
 *  "~60 min · N sessions/week" cadence breakdown. The session
 *  breaks down as ~45 min Song of the Month + ~15 min maintenance
 *  in the session allocator; the WeeklyPlan surfaces both lines.
 *  Was 45 prior to the May 2026 rebalance — that value treated the
 *  full session as just the spotlight portion. Recalibrate after a
 *  few weeks of real song-cell run-through data inform what a
 *  typical repertoire session actually runs. */
export const REPERTOIRE_SESSION_DEFAULT_MINUTES = 60;

/** Production lesson time is highly variable — show as a range. */
export const PRODUCTION_TIME_RANGE_MINUTES = {
  minPerLesson: 30,
  maxPerLesson: 90,
} as const;

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
