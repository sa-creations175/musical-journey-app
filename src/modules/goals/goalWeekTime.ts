/**
 * Per-goal weekly time estimate for the by-module view.
 *
 * Mirrors `WeeklyPlan.tsx:rowTime()`'s per-row math, minus the
 * sibling-merge fold — each goal in the by-module view stands on
 * its own. The exact same per-attempt / per-rep / per-day / per-
 * lesson constants flow through `getWeeklyTimeEstimate` so two
 * views never disagree on what a goal "costs" per week.
 *
 * Returns null when no honest time estimate is available (e.g.
 * standalone HF/ET/Shapes days-per-cadence goals — no coverage
 * sibling to derive minutes from, and days-alone don't determine
 * total time).
 */
import {
  getWeeklyTimeEstimate,
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  type TimeEstimate,
} from '../../lib/weeklyAttempts';
import type { Goal } from '../../lib/db';
import { moduleForMetric } from './goalVocabulary';
import { shapesAreaFromUnit } from './shapesCoverageGroups';

export interface GoalWeekTime {
  estimate: TimeEstimate;
  /** Optional human-readable breakdown ("~45 min · 6 days/week").
   *  Renders inline next to the headline estimate. Repertoire's
   *  days metric is the primary user today; others may grow into
   *  this. */
  breakdown?: string;
}

/**
 * Per-goal weekly time, branching on `targetMetric` and `targetUnit`
 * exactly the way `WeeklyPlan.tsx:rowTime()` does — minus the
 * coverage+consistency sibling-merge logic that's specific to the
 * plan grid.
 *
 * The argument is the saved Goal record. For weekly goals this is
 * the derived weekly row; for monthly goals it's the saved monthly
 * record. Either way the function uses the goal's targetMetric,
 * targetValue, and targetUnit to land in the right branch.
 */
export function goalWeekTime(goal: Goal): GoalWeekTime | null {
  const metric = goal.targetMetric;
  const value = goal.targetValue;
  if (metric == null || value == null || value <= 0) return null;

  const moduleId = moduleForMetric(metric);
  if (!moduleId) return null;

  // -- Legacy hours-per-cadence (production / repertoire) ----------
  // Pre-redesign metrics where the saved value IS the weekly hour
  // count. Repertoire additionally surfaces a session breakdown so
  // the user sees the cadence shape.
  if (metric === 'repertoire_hours_per_cadence') {
    const minutes = value * 60;
    const sessions = Math.max(
      1,
      Math.round(minutes / REPERTOIRE_SESSION_DEFAULT_MINUTES),
    );
    const noun = sessions === 1 ? 'session' : 'sessions';
    return {
      estimate: { kind: 'point', minutes },
      breakdown:
        `~${REPERTOIRE_SESSION_DEFAULT_MINUTES} min · ${sessions} ${noun}/week`,
    };
  }
  if (metric === 'production_hours_per_cadence') {
    return { estimate: { kind: 'point', minutes: value * 60 } };
  }

  // -- Legacy minutes-per-cadence (shapes) -------------------------
  if (metric === 'shapes_minutes_per_cadence') {
    return { estimate: { kind: 'point', minutes: value } };
  }

  // -- New days-per-cadence ----------------------------------------
  // Repertoire derives total weekly time from days × ~45 min/day.
  // HF/ET/Shapes days standing alone have no per-day constant —
  // the per-day estimate is computed by the coverage card; the
  // by-module view simply omits a time estimate for these rows.
  if (metric === 'repertoire_days_per_cadence') {
    const minutes = value * REPERTOIRE_SESSION_DEFAULT_MINUTES;
    const dayNoun = value === 1 ? 'day' : 'days';
    return {
      estimate: { kind: 'point', minutes },
      breakdown:
        `~${REPERTOIRE_SESSION_DEFAULT_MINUTES} min · ${value} ${dayNoun}/week`,
    };
  }
  if (metric.includes('_days_per_')) return null;
  // practice-consistency umbrella metrics (practice_*) — module-
  // agnostic count of days, no per-day time constant either.
  if (metric.startsWith('practice_')) return null;

  // -- Lessons-per-cadence (production new) + lessons_count --------
  // Both route through getWeeklyTimeEstimate's production branch,
  // which returns a range (30–90 min/lesson) reflecting variable
  // depth. production_path_completion has no value to multiply
  // against and is excluded above (value === null for path goals).
  if (
    metric === 'production_lessons_per_cadence'
    || metric === 'production_lessons_count'
  ) {
    return { estimate: getWeeklyTimeEstimate('production', value) };
  }

  // -- Attempts / sessions (coverage + standard) -------------------
  // Shapes routes through the area-aware overload, picking the
  // activity area out of targetUnit. Other modules use the
  // module-level per-attempt constant.
  if (moduleId === 'shapes-and-patterns') {
    const area = shapesAreaFromUnit(goal.targetUnit);
    return {
      estimate: getWeeklyTimeEstimate(
        'shapes-and-patterns',
        value,
        area ?? undefined,
      ),
    };
  }

  return { estimate: getWeeklyTimeEstimate(moduleId, value) };
}
