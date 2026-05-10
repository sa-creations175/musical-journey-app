import { isCoverageMetric } from './coverageMetrics';
import {
  getWeeklyTimeEstimate,
  TIME_PER_ATTEMPT_MINUTES,
  type TimeEstimate,
} from '../../lib/weeklyAttempts';
import type { GoalFlowModuleId } from './goalVocabulary';
import type { EncodedRecord } from './GoalCreationFlow';
import { coverageGroupIdToActivityArea } from './shapesCoverageGroups';

/**
 * Live weekly time estimate for the GoalSuggestionFlow body.
 *
 * Translates the records the user is currently building into the
 * weekly time commitment they imply, so they see "~X hrs/week"
 * update as they toggle focus groups, accuracy add-ons, etc.
 *
 * Two display shapes:
 *
 *   · `total` — single weekly time figure. Used when only coverage
 *     is enabled (no sibling consistency record to give a
 *     per-session breakdown). Format: `~1.8 hrs/week`.
 *
 *   · `per-session` — `X sessions/week · ~Y min each`. Triggered
 *     when both coverage AND consistency records exist on the
 *     same goal: the consistency record's session count divides
 *     the coverage record's weekly attempt budget, producing an
 *     honest per-session time. A consistency-only goal (no
 *     sibling coverage) returns null — there's no attempt budget
 *     to divide, so any time-per-session number would be
 *     fabricated.
 *
 * v1 module support: HF only. Other modules return null so the
 * row hides — extend per-module as the math is specified.
 *
 * Accuracy records: skipped from the estimate (accuracy is a
 * quality target, not extra reps).
 */

/** Display shape returned by `weeklyTimeForRecords`. */
export type WeeklyTimeDisplay =
  | { kind: 'total'; estimate: TimeEstimate }
  | {
      kind: 'per-session';
      sessions: number;
      cadence: 'week' | 'month';
      minutesPerSession: number;
    };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Weeks remaining from `now` to `targetDate`, rounded UP, min 1.
 *  Mirrors the weeks-remaining math in weeklyDerivation.ts so the
 *  preview here matches the actual derivation post-save. */
function weeksInPeriod(now: number, targetDate: number): number {
  if (targetDate <= now) return 1;
  return Math.max(1, Math.ceil((targetDate - now) / (7 * ONE_DAY_MS)));
}

/**
 * Compute the weekly time commitment for a list of records under
 * a given module / target date. Returns null when the module
 * hasn't been wired up yet, OR when no records contribute (e.g.,
 * a consistency-only HF goal with no sibling coverage to divide).
 */
export function weeklyTimeForRecords(args: {
  records: ReadonlyArray<EncodedRecord>;
  moduleId: GoalFlowModuleId;
  targetDate: number;
  now?: number;
}): WeeklyTimeDisplay | null {
  const { records, moduleId, targetDate, now = Date.now() } = args;

  if (moduleId === 'harmonic-fluency') {
    return weeklyTimeForHfRecords(records, targetDate, now);
  }
  if (moduleId === 'shapes-and-patterns') {
    return weeklyTimeForShapesRecords(records, targetDate, now);
  }
  // Other modules deferred until each one's attempt → time
  // mapping is spec'd. Return null hides the estimate row.
  return null;
}

/**
 * Shapes per-rep cost varies by activity area (chord_shape /
 * scale = 2 min/rep; voice_leading = 3 min/rep). The picker's six
 * coverage-group ids (4 chord-shape sub-groups + scale_drills +
 * voice_leading) all roll up to one of those three activity areas
 * via `coverageGroupIdToActivityArea` — so the four chord-shape
 * sub-groups share the chord_shape_drills 2 min/rep constant.
 *
 * Walks each coverage record, multiplies items × 3 reps-to-acquired
 * (procedural threshold) by the area's per-rep minutes, and sums
 * into the period total. The overall coverage metric (targetUnit=
 * 'items', no group id) falls back to the catalog-weighted-average
 * baked into getWeeklyTimeEstimate.
 */
function weeklyTimeForShapesRecords(
  records: ReadonlyArray<EncodedRecord>,
  targetDate: number,
  now: number,
): WeeklyTimeDisplay | null {
  const weeks = weeksInPeriod(now, targetDate);
  let totalWeeklyMinutes = 0;
  let contributed = false;

  for (const r of records) {
    if (!isCoverageMetric(r.targetMetric)) continue;
    if (r.targetValue == null || r.targetValue <= 0) continue;
    const weeklyAttempts = (r.targetValue * 3) / weeks; // procedural threshold
    // Overall coverage record (targetUnit='items') has no specific
    // area — getWeeklyTimeEstimate's no-area branch applies the
    // catalog-weighted-average per-rep. The function always returns
    // a point estimate for shapes.
    const area = r.targetUnit ? coverageGroupIdToActivityArea(r.targetUnit) : null;
    const est = getWeeklyTimeEstimate(
      'shapes-and-patterns',
      weeklyAttempts,
      area ?? undefined,
    );
    if (est.kind === 'point') totalWeeklyMinutes += est.minutes;
    contributed = true;
  }

  if (!contributed) return null;
  return { kind: 'total', estimate: { kind: 'point', minutes: totalWeeklyMinutes } };
}

interface HfConsistency {
  sessions: number;
  cadence: 'week' | 'month';
}

function weeklyTimeForHfRecords(
  records: ReadonlyArray<EncodedRecord>,
  targetDate: number,
  now: number,
): WeeklyTimeDisplay | null {
  // Sum coverage items across every coverage record (overall +
  // any specific group sub-records) so multi-pick selections roll
  // up into one estimate.
  let coverageItems = 0;
  for (const r of records) {
    if (!isCoverageMetric(r.targetMetric)) continue;
    if (r.targetValue == null || r.targetValue <= 0) continue;
    coverageItems += r.targetValue;
  }

  // Find the consistency record (encoder emits at most one per HF
  // goal). targetUnit carries the cadence — 'week' | 'month'.
  let consistency: HfConsistency | null = null;
  for (const r of records) {
    if (r.targetMetric !== 'harmonic_fluency_sessions_per_cadence') continue;
    if (r.targetValue == null || r.targetValue <= 0) continue;
    const cadence = r.targetUnit === 'month' ? 'month' : 'week';
    consistency = { sessions: r.targetValue, cadence };
    break;
  }

  // No coverage → no honest attempt budget to translate. Hide the
  // estimate entirely (also covers consistency-only goals per the
  // spec — those would otherwise show a fabricated per-session
  // time).
  if (coverageItems <= 0) return null;

  const monthlyAttempts = coverageItems * 10; // declarative threshold
  const weeks = weeksInPeriod(now, targetDate);
  const minutesPerAttempt = TIME_PER_ATTEMPT_MINUTES['harmonic-fluency'];

  if (consistency) {
    // Sessions across the goal's full period:
    //   weekly cadence  → sessions × weeks-in-period
    //   monthly cadence → sessions (one cadence per period)
    const sessionsInPeriod =
      consistency.cadence === 'week'
        ? consistency.sessions * weeks
        : consistency.sessions;
    if (sessionsInPeriod <= 0) {
      return {
        kind: 'total',
        estimate: getWeeklyTimeEstimate(
          'harmonic-fluency',
          monthlyAttempts / weeks,
        ),
      };
    }
    const attemptsPerSession = monthlyAttempts / sessionsInPeriod;
    return {
      kind: 'per-session',
      sessions: consistency.sessions,
      cadence: consistency.cadence,
      minutesPerSession: attemptsPerSession * minutesPerAttempt,
    };
  }

  const weeklyAttempts = monthlyAttempts / weeks;
  return {
    kind: 'total',
    estimate: getWeeklyTimeEstimate('harmonic-fluency', weeklyAttempts),
  };
}

// ---------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------

/** Format a WeeklyTimeDisplay as user-facing copy.
 *
 * `total`:
 *   point estimate      → "~1.8 hrs/week" or "~30 min/week"
 *   range estimate      → "~1–3 hrs/week" or "~20–45 min/week"
 *   (range picks hours when either endpoint ≥ 60min)
 *
 * `per-session`:
 *   "{N} sessions/{cadence} · ~{min} min each"
 *   or                     "~{X} hrs each" when minutes ≥ 60
 */
export function formatWeeklyTimeEstimate(d: WeeklyTimeDisplay): string {
  if (d.kind === 'per-session') {
    const noun = d.sessions === 1 ? 'session' : 'sessions';
    const cadence = d.cadence === 'month' ? '/month' : '/week';
    return `${d.sessions} ${noun}${cadence} · ~${formatMinutesAsUnit(d.minutesPerSession)} each`;
  }
  const t = d.estimate;
  if (t.kind === 'point') {
    return `~${formatMinutesAsUnit(t.minutes)}/week`;
  }
  // Range — pick hours if EITHER endpoint is ≥ 60min so the unit
  // stays consistent across the range.
  const useHours = t.maxMinutes >= 60 || t.minMinutes >= 60;
  if (useHours) {
    return `~${roundHrs(t.minMinutes)}–${roundHrs(t.maxMinutes)} hrs/week`;
  }
  return `~${Math.round(t.minMinutes)}–${Math.round(t.maxMinutes)} min/week`;
}

function formatMinutesAsUnit(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${roundHrs(minutes)} hrs`;
}

function roundHrs(minutes: number): string {
  const hrs = minutes / 60;
  // Whole-hour values render without a decimal; otherwise show one
  // decimal so "1.8 hrs" doesn't get truncated to "2 hrs".
  if (Math.abs(hrs - Math.round(hrs)) < 0.05) return `${Math.round(hrs)}`;
  return hrs.toFixed(1);
}
