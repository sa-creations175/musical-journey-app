import { Fragment, useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { db, type Goal } from '../../lib/db';
import {
  getWeeklyTimeEstimate,
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  TIME_PER_ATTEMPT_MINUTES,
  type TimeEstimate,
} from '../../lib/weeklyAttempts';
import { MODULE_ORDER, PRACTICE_SESSIONS_META } from '../../lib/moduleMeta';
import type { GoalFlowModuleId } from './goalVocabulary';
import { isCoverageMetric } from './coverageMetrics';
import {
  getShapesCoverageGroup,
  shapesAreaFromUnit,
} from './shapesCoverageGroups';
import { deriveWeeklyGoals } from './weeklyDerivation';
import {
  classifyPace,
  endOfWeekLocal,
  loadActiveMonthlyGoals,
  loadLastWeekReview,
  loadWeeklyGoalsForWeek,
  startOfWeekLocal,
  type LastWeekReview,
  type ModuleWeekStat,
  type PaceStatus,
} from './weeklyPlanData';

/**
 * Phase 4 Step 3 — WeeklyPlan modal.
 *
 * Two-part screen:
 *
 *   Part 1 — Last week review:
 *     For each module, show actual attempts + time vs the saved
 *     weekly target (if any) with an honest pace classification
 *     (ahead / on-track / behind / no-target). Empty state when
 *     the user has no weekly history yet.
 *
 *   Part 2 — This week's plan:
 *     Derives weekly targets from the active monthly goals via
 *     deriveWeeklyGoals, lets the user adjust each target inline,
 *     shows the honest total time range, and surfaces the Phase 4
 *     daily pattern (Sun=Deep, Mon-Fri=Standard, Sat=Deep flex).
 *
 * On confirm: weekly Goal records persist to db.goals. Sync hooks
 * push to Supabase automatically. Re-opening shows a "confirmed"
 * state with a Re-plan affordance that clears + lets the user
 * derive again.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Defaults to startOfWeekLocal(Date.now()). Tests / dev tools
   *  can pin this to a specific Sunday. */
  weekStart?: number;
}

interface PlanRow {
  /** Module the parent monthly goal targets — drives time math. */
  moduleId: GoalFlowModuleId;
  /** Parent monthly goal id, mirrored to parentGoalId on save. */
  monthlyGoalId: string;
  /** Auto-derived suggestion (read-only, for "reset to suggested"). */
  suggested: number;
  /** Current value — starts at suggested, user can adjust. */
  target: number;
  /** Display unit (attempts / sessions / hours / days / lessons). */
  unit: string;
  /** Description for the row label — pulled from the parent. */
  parentDescription: string;
  /** Source monthly goal's targetMetric — drives per-row time
   *  classification (HF/ET consistency vs coverage vs other).
   *  Null when the source can't be resolved. */
  parentMetric: string | null;
  /** Source monthly goal's parentGoalId — the umbrella id (or
   *  yearly anchor id when there's no umbrella). Used to find
   *  sibling rows for the per-session time breakdown. */
  parentUmbrellaId: string | null;
  /** Source monthly goal's targetUnit. Carries the Shapes activity
   *  area for the *_specific coverage / proficiency metrics
   *  ('chord_shape_drills' | 'scale_drills' | 'voice_leading' or
   *  a colon-prefixed variant for proficiency). Drives per-area
   *  time-per-rep selection in rowTime. */
  parentUnit: string | null;
  /** Phase 4 polish — when a sibling consistency row exists in the
   *  same module (e.g. an HF umbrella with both a coverage child and
   *  a consistency child), this field folds the consistency count
   *  into the coverage row's display: "across N days · ~Y min each"
   *  (or "across N sessions · …" for legacy sessions-per-cadence
   *  goals). The standalone consistency row is dropped from the plan
   *  grid after the merge. Set only on coverage rows; null otherwise. */
  consistencyInfo: {
    count: number;
    cadence: 'week' | 'month';
    /** 'days' for new *_days_per_cadence metrics; 'sessions' for
     *  legacy *_sessions_per_cadence metrics. Drives the suffix
     *  noun ("days" vs "sessions"). */
    unit: 'days' | 'sessions';
  } | null;
}

/** Per-row time display. `time` carries a TimeEstimate to render
 *  "~1h 50m" / "~30 min" the same as before. `per-session`
 *  carries a single per-session minutes value rendered as
 *  "~27m each" — used for standalone HF/ET consistency rows when
 *  there's no sibling coverage to merge into.
 *
 *  When a coverage row has a sibling consistency target (merged via
 *  consistencyInfo on the PlanRow), the time display additionally
 *  carries a `consistencySuffix` string — appended inline to make
 *  the user's full week read as a single line:
 *      "~1h 48m/week · across 4 sessions · ~27 min each"
 *  The standalone consistency row is dropped from the grid after
 *  the merge so the user doesn't see duplicated time estimates. */
type RowTimeDisplay =
  | {
      kind: 'time';
      estimate: TimeEstimate;
      consistencySuffix?: string;
    }
  | { kind: 'per-session'; minutesPerSession: number };

/** Per-module consistency metrics that should fold into a sibling
 *  coverage row when both exist. Includes the new days-based metrics
 *  (HF / ET / Shapes — May 2026 redesign) plus the legacy sessions-
 *  and minutes-based names so existing goals still merge correctly.
 *  Repertoire's _days_per_cadence intentionally stays out — it's a
 *  standalone row with its own per-day display path. */
const MERGEABLE_CONSISTENCY_METRICS: ReadonlySet<string> = new Set([
  // New (days-based).
  'harmonic_fluency_days_per_cadence',
  'ear_training_days_per_cadence',
  'shapes_days_per_cadence',
  // Legacy.
  'harmonic_fluency_sessions_per_cadence',
  'ear_training_sessions_per_cadence',
  'shapes_minutes_per_cadence',
]);

/** Whether the metric carries days-per-week semantics (vs the legacy
 *  sessions/minutes shape). Drives the consistencyInfo.unit
 *  discriminator and downstream display copy. */
function isDaysMetric(metric: string | null | undefined): boolean {
  return !!metric && metric.includes('_days_per_');
}

/** Repertoire's two consistency metric flavors — the new days-based
 *  shape (May 2026 redesign) and the legacy hours-based one. Both
 *  trigger the RepertoireGuidanceRow under the row. */
function isRepertoireRoutineRow(metric: string | null | undefined): boolean {
  return (
    metric === 'repertoire_days_per_cadence'
    || metric === 'repertoire_hours_per_cadence'
  );
}

/**
 * Phase 4 polish — merge coverage + consistency rows for the same
 * (parentUmbrellaId, moduleId). The coverage row keeps the primary
 * target + time; the consistency row's session count + cadence
 * attaches to the coverage row's `consistencyInfo` and the
 * standalone consistency row is dropped from the grid.
 *
 * Rationale: coverage and consistency for the same module describe
 * the same weekly time — coverage measures attempts, consistency
 * frames those attempts as sessions. Showing both as separate rows
 * implies separate time commitments. Merging keeps the UI honest:
 * one time figure, with the consistency cadence as a sub-note.
 *
 * Edge cases preserved:
 *   · Consistency-only modules (no sibling coverage) stay as
 *     standalone rows; rowTime returns null or per-session
 *     depending on whether HF/ET sibling-coverage logic finds
 *     anything (it won't, since we already filtered to this module).
 *   · Coverage-only modules stay as standalone rows with
 *     consistencyInfo = null.
 *   · Multiple umbrellas for the same module (rare) stay separate
 *     since the group key includes parentUmbrellaId.
 */
function mergeCoverageAndConsistencyRows(rows: PlanRow[]): PlanRow[] {
  // Group rows by (parentUmbrellaId, moduleId). Falls back to
  // monthlyGoalId for rows without an umbrella so unrelated
  // standalone goals never accidentally merge.
  const groupKey = (r: PlanRow) =>
    `${r.parentUmbrellaId ?? r.monthlyGoalId}\x00${r.moduleId}`;
  const groups = new Map<string, PlanRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }

  const out: PlanRow[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const coverage = group.find(r => r.parentMetric != null && isCoverageMetric(r.parentMetric));
    const consistency = group.find(
      r => r.parentMetric != null && MERGEABLE_CONSISTENCY_METRICS.has(r.parentMetric),
    );
    if (coverage && consistency) {
      // Fold consistency into coverage. Cadence comes from the
      // consistency goal's targetUnit; defaults to 'week' when the
      // saved value is anything else. The unit discriminator drives
      // the display suffix ("across N days" vs "across N sessions").
      const cadence: 'week' | 'month' =
        consistency.parentUnit === 'month' ? 'month' : 'week';
      const unit: 'days' | 'sessions' = isDaysMetric(consistency.parentMetric)
        ? 'days'
        : 'sessions';
      out.push({
        ...coverage,
        consistencyInfo: { count: consistency.target, cadence, unit },
      });
      // Push any other rows in the group (e.g. accuracy children)
      // unchanged so they keep their own display.
      for (const r of group) {
        if (r === coverage || r === consistency) continue;
        out.push(r);
      }
    } else {
      // No clean coverage+consistency pair — emit as-is.
      for (const r of group) out.push(r);
    }
  }
  return out;
}

const MODULE_LABEL: Record<GoalFlowModuleId, string> = {
  'harmonic-fluency':     'Harmonic Fluency',
  'ear-training':         'Ear Training',
  'shapes-and-patterns':  'Shapes & Patterns',
  'repertoire':           'Repertoire',
  'production':           'Production',
  'practice-consistency': 'Practice Consistency',
};

const MODULE_ACCENT_HEX: Record<GoalFlowModuleId, string> = {
  'harmonic-fluency':     MODULE_ORDER.find(m => m.id === 'harmonic-fluency')?.accentHex     ?? '#7a5aa8',
  'ear-training':         MODULE_ORDER.find(m => m.id === 'ear-training')?.accentHex         ?? '#5a8752',
  'shapes-and-patterns':  MODULE_ORDER.find(m => m.id === 'shapes-and-patterns')?.accentHex  ?? '#d4885a',
  'repertoire':           MODULE_ORDER.find(m => m.id === 'repertoire')?.accentHex           ?? '#a8556b',
  'production':           MODULE_ORDER.find(m => m.id === 'production')?.accentHex           ?? '#3a4875',
  'practice-consistency': PRACTICE_SESSIONS_META.accentHex,
};

/**
 * Display labels for the four ET sub-modules (used as sub-row
 * labels when an ET monthly goal has split coverage across multiple
 * sub-areas — e.g. intervals + chord-progressions both selected on
 * the picker). Keys match `parentUnit` for ear_training_*_specific
 * coverage records.
 */
const ET_SUBAREA_LABEL: Readonly<Record<string, string>> = {
  'intervals':          'Intervals',
  'chord-recognition':  'Chord recognition',
  'chord-progressions': 'Chord progressions',
  'scales-modes':       'Scales & modes',
};

/**
 * Short display label for a sub-row inside a multi-row module
 * group. Distinguishes siblings ("Major triads" / "Minor triads" /
 * "Intervals" / "Chord progressions") without repeating the module
 * label that already shows in the group header.
 *
 * Resolution order:
 *   · Shapes coverage_specific  → SHAPES_COVERAGE_GROUP_DEFS label
 *     by parentUnit (covers the Layer 2 triad-quality ids + the
 *     Layer 1 group ids like 'scale_drills').
 *   · ET coverage_specific      → ET_SUBAREA_LABEL by parentUnit
 *     (intervals / chord-recognition / chord-progressions /
 *     scales-modes).
 *   · Fallback                  → parentDescription (verbose but
 *     never empty).
 *
 * Returns null when there's nothing useful — the caller can fall
 * back to the parent description in that case.
 */
function subLabelForPlanRow(row: PlanRow): string | null {
  const metric = row.parentMetric;
  const unit = row.parentUnit;
  if (!unit) return null;
  if (metric && metric.startsWith('shapes_coverage_at_acquired')) {
    const def = getShapesCoverageGroup(unit);
    if (def) {
      // Capitalize the first letter so it reads as a label, not the
      // raw lowercase picker copy.
      return def.label.charAt(0).toUpperCase() + def.label.slice(1);
    }
  }
  if (metric && metric.startsWith('ear_training_coverage_at_acquired')) {
    return ET_SUBAREA_LABEL[unit] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------

function formatDateRange(start: number, end: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${new Date(start).toLocaleDateString(undefined, opts)} → ${new Date(end).toLocaleDateString(undefined, opts)}`;
}

/** Render minutes as "1h 23m" / "23m" / "<1m". */
function formatMinutes(min: number): string {
  if (min <= 0) return '0';
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTimeEstimate(t: TimeEstimate): string {
  if (t.kind === 'point') return formatMinutes(t.minutes);
  return `${formatMinutes(t.minMinutes)}–${formatMinutes(t.maxMinutes)}`;
}

/** Sum a list of TimeEstimates into one combined point/range. */
function sumTimeEstimates(estimates: TimeEstimate[]): TimeEstimate {
  let totalPoint = 0;
  let totalMin = 0;
  let totalMax = 0;
  let hasRange = false;
  for (const t of estimates) {
    if (t.kind === 'point') {
      totalPoint += t.minutes;
      totalMin += t.minutes;
      totalMax += t.minutes;
    } else {
      hasRange = true;
      totalMin += t.minMinutes;
      totalMax += t.maxMinutes;
    }
  }
  if (hasRange) return { kind: 'range', minMinutes: totalMin, maxMinutes: totalMax };
  return { kind: 'point', minutes: totalPoint };
}

/** Pace pill colors mirror the goals module's status palette —
 *  green for on-track / ahead, amber for behind, neutral for no
 *  target. Honest signal, no inflation. */
function paceBadge(p: PaceStatus): { label: string; bg: string; fg: string } {
  switch (p) {
    case 'ahead':     return { label: 'ahead',     bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-800 dark:text-emerald-300' };
    case 'on-track':  return { label: 'on track',  bg: 'bg-emerald-50 dark:bg-emerald-900/20',  fg: 'text-emerald-700 dark:text-emerald-300' };
    case 'behind':    return { label: 'behind',    bg: 'bg-amber-100 dark:bg-amber-900/30',    fg: 'text-amber-800 dark:text-amber-300' };
    case 'no-target': return { label: 'no target', bg: 'bg-neutral-100 dark:bg-neutral-800',   fg: 'text-neutral-600 dark:text-neutral-400' };
  }
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function WeeklyPlan({ open, onClose, weekStart: weekStartProp }: Props) {
  const weekStart = useMemo(
    () => weekStartProp ?? startOfWeekLocal(Date.now()),
    [weekStartProp],
  );
  const weekEnd = useMemo(() => endOfWeekLocal(weekStart), [weekStart]);

  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<LastWeekReview | null>(null);
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [confirmedGoals, setConfirmedGoals] = useState<Goal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Per-module collapse state. Empty set = everything expanded
   *  (the default — see spec: "expanded by default, collapse
   *  chevron on the right"). Only applies to multi-row module
   *  groups; single-row modules always render flat. */
  const [collapsedModules, setCollapsedModules] = useState<Set<GoalFlowModuleId>>(
    new Set(),
  );

  // Load everything on open / weekStart change.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [reviewData, monthlies, alreadySaved] = await Promise.all([
          loadLastWeekReview(weekStart),
          loadActiveMonthlyGoals(weekStart),
          loadWeeklyGoalsForWeek(weekStart),
        ]);
        if (cancelled) return;
        setReview(reviewData);
        setConfirmedGoals(alreadySaved);

        // Derive suggestions from monthly goals. If already confirmed,
        // we mirror the saved targets into editable rows instead so
        // the user can see what they've already committed to.
        if (alreadySaved.length > 0) {
          const rows: PlanRow[] = alreadySaved.map(g => {
            const mod = (g.relatedModules[0] as GoalFlowModuleId) ?? 'practice-consistency';
            const parent = monthlies.find(m => m.id === g.parentGoalId);
            return {
              moduleId: mod,
              monthlyGoalId: g.parentGoalId ?? '',
              suggested: g.targetValue ?? 0,
              target: g.targetValue ?? 0,
              unit: g.targetUnit ?? 'attempts',
              parentDescription: g.description,
              parentMetric: parent?.targetMetric ?? null,
              parentUmbrellaId: parent?.parentGoalId ?? null,
              parentUnit: parent?.targetUnit ?? null,
              consistencyInfo: null,
            };
          });
          setPlanRows(mergeCoverageAndConsistencyRows(rows));
        } else {
          const derived = await deriveWeeklyGoals(monthlies, weekStart);
          const rows: PlanRow[] = derived.map(g => {
            const mod = (g.relatedModules[0] as GoalFlowModuleId) ?? 'practice-consistency';
            const parent = monthlies.find(m => m.id === g.parentGoalId);
            return {
              moduleId: mod,
              monthlyGoalId: g.parentGoalId ?? '',
              suggested: g.targetValue ?? 0,
              target: g.targetValue ?? 0,
              unit: g.targetUnit ?? 'attempts',
              parentDescription: parent?.description ?? g.description,
              parentMetric: parent?.targetMetric ?? null,
              parentUmbrellaId: parent?.parentGoalId ?? null,
              parentUnit: parent?.targetUnit ?? null,
              consistencyInfo: null,
            };
          });
          setPlanRows(mergeCoverageAndConsistencyRows(rows));
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load weekly plan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, weekStart]);

  const isConfirmed = confirmedGoals.length > 0;

  // Per-row time display. Two shapes:
  //
  //   `time` — TimeEstimate from getWeeklyTimeEstimate (or hours
  //   passthrough). The standard "~1h 50m" / "~30 min" copy.
  //
  //   `per-session` — minutes per session, for HF/ET consistency
  //   rows that have a sibling coverage row to honestly divide.
  //   The display shows "~27m each" so the user reads the row +
  //   adjacent target column as "4 sessions · ~27m each".
  //
  // Returns null when no honest time math is available (e.g.
  // consistency without a sibling, days/lessons without a per-day
  // constant).
  function rowTime(row: PlanRow): RowTimeDisplay | null {
    if (row.target <= 0) return null;

    // HF / ET consistency — divide sibling coverage attempts by
    // sessions to get attempts-per-session × per-attempt minutes.
    if (row.parentMetric != null && MERGEABLE_CONSISTENCY_METRICS.has(row.parentMetric)) {
      if (!row.parentUmbrellaId) return null;
      const sibling = planRows.find(
        r =>
          r.parentUmbrellaId === row.parentUmbrellaId &&
          r.moduleId === row.moduleId &&
          r.parentMetric != null &&
          isCoverageMetric(r.parentMetric),
      );
      if (!sibling || sibling.target <= 0) return null;
      if (row.moduleId !== 'harmonic-fluency' && row.moduleId !== 'ear-training') {
        return null;
      }
      const minutesPerAttempt = TIME_PER_ATTEMPT_MINUTES[row.moduleId];
      const attemptsPerSession = sibling.target / row.target;
      return {
        kind: 'per-session',
        minutesPerSession: attemptsPerSession * minutesPerAttempt,
      };
    }

    // Hours-per-cadence consistency rows (legacy
    // production_hours_per_cadence / repertoire_hours_per_cadence):
    // target IS the weekly hour count. Repertoire additionally
    // derives a session breakdown so the user sees the cadence
    // shape, not just the bulk hours figure.
    if (row.unit === 'hours') {
      const estimate: TimeEstimate = { kind: 'point', minutes: row.target * 60 };
      if (row.parentMetric === 'repertoire_hours_per_cadence' && row.target > 0) {
        const sessions = Math.max(
          1,
          Math.round((row.target * 60) / REPERTOIRE_SESSION_DEFAULT_MINUTES),
        );
        const sessionNoun = sessions === 1 ? 'session' : 'sessions';
        return {
          kind: 'time',
          estimate,
          consistencySuffix:
            `~${REPERTOIRE_SESSION_DEFAULT_MINUTES} min · ${sessions} ${sessionNoun}/week`,
        };
      }
      return { kind: 'time', estimate };
    }

    // Shapes minutes_per_cadence (legacy consistency): target IS the
    // weekly minute count. Bypass the per-rep math entirely.
    if (row.unit === 'minutes') {
      return {
        kind: 'time',
        estimate: { kind: 'point', minutes: row.target },
      };
    }

    // Lessons-per-week (Production new consistency, or
    // production_path_completion / _lessons_count): getWeeklyTimeEstimate
    // returns a range (30–90 min/lesson). New
    // production_lessons_per_cadence routes through the same range
    // mapping — depth is variable, so we honestly show a range.
    if (row.unit === 'lessons') {
      return { kind: 'time', estimate: getWeeklyTimeEstimate(row.moduleId, row.target) };
    }

    // Days-per-week (the new consistency idiom). Standalone rows
    // (i.e. no sibling coverage to merge with) get a per-day
    // breakdown based on the module:
    //   · repertoire_days_per_cadence — multiplies by
    //     REPERTOIRE_SESSION_DEFAULT_MINUTES (45 min/day).
    //   · HF/ET/Shapes _days_per_cadence standing alone — no
    //     coverage to derive minutes from, so just show the count.
    //   · practice_days_per_cadence — same: count-only, the
    //     practice-consistency umbrella covers any module.
    if (row.unit === 'days') {
      if (row.parentMetric === 'repertoire_days_per_cadence' && row.target > 0) {
        const totalMinutes = row.target * REPERTOIRE_SESSION_DEFAULT_MINUTES;
        const dayNoun = row.target === 1 ? 'day' : 'days';
        return {
          kind: 'time',
          estimate: { kind: 'point', minutes: totalMinutes },
          consistencySuffix:
            `~${REPERTOIRE_SESSION_DEFAULT_MINUTES} min · ${row.target} ${dayNoun}/week`,
        };
      }
      return null;
    }

    // Standard attempt / session counts: HF/ET coverage, Shapes
    // drills, Repertoire song-sessions. Shapes routes through the
    // area-aware getWeeklyTimeEstimate overload — for *_specific
    // metrics the parent's targetUnit carries the activity area
    // (or 'area:level' for proficiency); the *_overall metric has
    // no area, so the function falls back to the catalog-weighted
    // average per-rep.
    //
    // consistencySuffix: when this row has a merged sibling
    // consistency target (HF/ET only), append "across N sessions ·
    // ~Y min each" to the time display so the user sees one honest
    // line per module. Per-session minutes = (this row's attempts) /
    // (sibling's session count) × per-attempt-minutes; uses the
    // declarative HF/ET constants since the per-session breakdown
    // is currently scoped to those modules (matches the suggestion
    // flow's weeklyTimeEstimate.ts logic).
    if (row.unit === 'attempts' || row.unit === 'sessions') {
      let estimate: TimeEstimate;
      if (row.moduleId === 'shapes-and-patterns') {
        const area = shapesAreaFromUnit(row.parentUnit);
        estimate = getWeeklyTimeEstimate('shapes-and-patterns', row.target, area ?? undefined);
      } else {
        estimate = getWeeklyTimeEstimate(row.moduleId, row.target);
      }
      let consistencySuffix: string | undefined;
      if (
        row.consistencyInfo
        && (row.moduleId === 'harmonic-fluency' || row.moduleId === 'ear-training')
        && row.consistencyInfo.count > 0
      ) {
        const minutesPerAttempt = TIME_PER_ATTEMPT_MINUTES[row.moduleId];
        const attemptsPerUnit = row.target / row.consistencyInfo.count;
        const minutesPerUnit = attemptsPerUnit * minutesPerAttempt;
        const unitNoun =
          row.consistencyInfo.unit === 'days'
            ? row.consistencyInfo.count === 1 ? 'day' : 'days'
            : row.consistencyInfo.count === 1 ? 'session' : 'sessions';
        const cadenceNoun = row.consistencyInfo.cadence === 'month' ? '/month' : '';
        consistencySuffix =
          `across ${row.consistencyInfo.count} ${unitNoun}${cadenceNoun} · `
          + `~${formatMinutes(minutesPerUnit)} each`;
      }
      return { kind: 'time', estimate, consistencySuffix };
    }

    // Unhandled unit (defensive): no honest per-row time to surface.
    return null;
  }

  const totalTime = useMemo<TimeEstimate>(() => {
    const estimates: TimeEstimate[] = [];
    for (const row of planRows) {
      const t = rowTime(row);
      if (!t) continue;
      // Per-session rows reframe the same time as their sibling
      // coverage row. Counting both would double-up the total.
      if (t.kind !== 'time') continue;
      estimates.push(t.estimate);
    }
    if (estimates.length === 0) return { kind: 'point', minutes: 0 };
    return sumTimeEstimates(estimates);
  }, [planRows]);

  /**
   * Group rows by module so the grid can render a per-module header
   * with combined time for multi-row groups (e.g. Shapes with maj +
   * min + dim triad sub-goals → one "Shapes & Patterns" header
   * grouping 3 sub-rows). Each group carries its own combined time
   * estimate; single-row groups still flow through the existing
   * flat-row render path.
   */
  interface ModuleGroup {
    moduleId: GoalFlowModuleId;
    rows: PlanRow[];
    combinedTime: TimeEstimate;
  }
  const moduleGroups = useMemo<ModuleGroup[]>(() => {
    const byModule = new Map<GoalFlowModuleId, PlanRow[]>();
    // Preserve insertion order — first row's module wins the slot,
    // siblings append to the existing array. Keeps a deterministic
    // visual order tied to deriveWeeklyGoals' walk through the
    // monthly-goals list.
    for (const row of planRows) {
      const list = byModule.get(row.moduleId);
      if (list) list.push(row);
      else byModule.set(row.moduleId, [row]);
    }
    const out: ModuleGroup[] = [];
    for (const [moduleId, rows] of byModule) {
      const estimates: TimeEstimate[] = [];
      for (const r of rows) {
        const t = rowTime(r);
        if (!t || t.kind !== 'time') continue;
        estimates.push(t.estimate);
      }
      const combinedTime: TimeEstimate =
        estimates.length === 0
          ? { kind: 'point', minutes: 0 }
          : sumTimeEstimates(estimates);
      out.push({ moduleId, rows, combinedTime });
    }
    return out;
  }, [planRows]);

  const toggleModuleCollapsed = (moduleId: GoalFlowModuleId) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  function setRowTarget(monthlyGoalId: string, next: number) {
    setPlanRows(rows =>
      rows.map(r =>
        r.monthlyGoalId === monthlyGoalId ? { ...r, target: next } : r,
      ),
    );
  }

  function resetRowToSuggested(monthlyGoalId: string) {
    setPlanRows(rows =>
      rows.map(r =>
        r.monthlyGoalId === monthlyGoalId ? { ...r, target: r.suggested } : r,
      ),
    );
  }

  async function handleConfirm() {
    if (saving) return;
    if (planRows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();
      const records: Goal[] = planRows.map(r => ({
        id: crypto.randomUUID(),
        scope: 'weekly',
        description: `${MODULE_LABEL[r.moduleId]} — ${r.target} ${r.unit} this week`,
        targetMetric: null, // user-confirmed weekly slice; mirrors what
                            // deriveWeeklyGoals returns when caller can't
                            // re-pull the parent metric. Keep null so the
                            // existing classifiers don't double-count
                            // these as breadth/etc. goals.
        targetValue: r.target,
        targetUnit: r.unit,
        currentValue: 0,
        contextTag: null,
        relatedModules: [r.moduleId],
        relatedItems: [],
        startDate: weekStart,
        targetDate: weekEnd,
        status: 'active',
        parentGoalId: r.monthlyGoalId || null,
        contributesNumericallyToParent: true,
        isUmbrella: false,
        lastEngagedAt: now,
      }));
      await db.goals.bulkAdd(records);
      setConfirmedGoals(records);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save weekly plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleReplan() {
    if (saving) return;
    if (!isConfirmed) return;
    if (!confirm('Clear this week\'s saved plan and re-derive from your monthly goals?')) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ids = confirmedGoals.map(g => g.id);
      await db.goals.bulkDelete(ids);
      setConfirmedGoals([]);
      // Re-derive from active monthlies.
      const monthlies = await loadActiveMonthlyGoals(weekStart);
      const derived = await deriveWeeklyGoals(monthlies, weekStart);
      const rows: PlanRow[] = derived.map(g => {
        const mod = (g.relatedModules[0] as GoalFlowModuleId) ?? 'practice-consistency';
        const parent = monthlies.find(m => m.id === g.parentGoalId);
        return {
          moduleId: mod,
          monthlyGoalId: g.parentGoalId ?? '',
          suggested: g.targetValue ?? 0,
          target: g.targetValue ?? 0,
          unit: g.targetUnit ?? 'attempts',
          parentDescription: parent?.description ?? g.description,
          parentMetric: parent?.targetMetric ?? null,
          parentUmbrellaId: parent?.parentGoalId ?? null,
          parentUnit: parent?.targetUnit ?? null,
          consistencyInfo: null,
        };
      });
      setPlanRows(mergeCoverageAndConsistencyRows(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to re-plan');
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Render ----------------

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Weekly plan"
      description="Sun → Sat — review last week, plan this week"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            {error && <span className="text-rose-600 dark:text-rose-400">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {isConfirmed ? 'Close' : 'Cancel'}
            </button>
            {isConfirmed ? (
              <button
                onClick={handleReplan}
                disabled={saving}
                className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                Re-plan
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={saving || planRows.length === 0}
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm plan'}
              </button>
            )}
          </div>
        </div>
      }
    >
      {loading && (
        <div className="text-sm text-neutral-500 py-6 text-center">Loading…</div>
      )}

      {!loading && (
        <div className="space-y-8">
          {/* ============ Part 1 — Last week review ============ */}
          <section className="space-y-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">Last week</h4>
              {review && (
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {formatDateRange(review.weekStart, review.weekEnd)}
                </span>
              )}
              <span className="text-xs text-neutral-500">how did the past week go?</span>
            </div>

            {review?.isEmpty ? (
              <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-5 text-sm text-neutral-500">
                No data yet. Last week is a fresh slate — start logging attempts
                this week and you'll see your pace next Sunday.
              </div>
            ) : (
              <ReviewTable review={review!} />
            )}
          </section>

          {/* ============ Part 2 — This week's plan ============ */}
          <section className="space-y-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">This week</h4>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {formatDateRange(weekStart, weekEnd)}
              </span>
              <span className="text-xs text-neutral-500">what's the plan?</span>
              {isConfirmed && (
                <span className="ml-auto text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Confirmed ✓
                </span>
              )}
            </div>

            {planRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-5 text-sm text-neutral-500">
                No active monthly goals to derive a weekly plan from. Set up a
                yearly anchor + monthly goal in Goals first; come back here on
                Sunday and you'll see a target for each module.
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 text-left">Module</th>
                        <th className="px-3 py-2 text-left">Target</th>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {moduleGroups.map(group => {
                        // Single-row module → flat row (no group header,
                        // no chevron). HF's coverage+consistency merge
                        // commonly lands here.
                        if (group.rows.length === 1) {
                          const row = group.rows[0];
                          return (
                            <Fragment key={row.monthlyGoalId || `${row.moduleId}-${row.suggested}`}>
                              <PlanRowView
                                row={row}
                                time={rowTime(row)}
                                editable={!isConfirmed}
                                onChangeTarget={n => setRowTarget(row.monthlyGoalId, n)}
                                onResetTarget={() => resetRowToSuggested(row.monthlyGoalId)}
                              />
                              {isRepertoireRoutineRow(row.parentMetric) && (
                                <RepertoireGuidanceRow />
                              )}
                            </Fragment>
                          );
                        }
                        // Multi-row module → collapsible group header
                        // + sub-rows (rendered when expanded).
                        const isCollapsed = collapsedModules.has(group.moduleId);
                        return (
                          <Fragment key={group.moduleId}>
                            <ModuleGroupHeader
                              moduleId={group.moduleId}
                              combinedTime={group.combinedTime}
                              collapsed={isCollapsed}
                              onToggle={() => toggleModuleCollapsed(group.moduleId)}
                            />
                            {!isCollapsed && group.rows.map(row => (
                              <Fragment key={row.monthlyGoalId || `${row.moduleId}-${row.suggested}`}>
                                <PlanRowView
                                  row={row}
                                  time={rowTime(row)}
                                  editable={!isConfirmed}
                                  onChangeTarget={n => setRowTarget(row.monthlyGoalId, n)}
                                  onResetTarget={() => resetRowToSuggested(row.monthlyGoalId)}
                                  subLabel={subLabelForPlanRow(row) ?? row.parentDescription}
                                  hideModuleHeading
                                />
                                {isRepertoireRoutineRow(row.parentMetric) && (
                                  <RepertoireGuidanceRow />
                                )}
                              </Fragment>
                            ))}
                          </Fragment>
                        );
                      })}
                      <TotalRow totalTime={totalTime} />
                    </tbody>
                  </table>
                </div>

                {totalTime.kind === 'range' && (
                  <div className="text-xs text-neutral-500 px-1">
                    Range reflects production lesson variability.
                  </div>
                )}

                <DailyPattern />
              </>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------

function ReviewTable({ review }: { review: LastWeekReview }) {
  const totalMinutes = review.byModule.reduce((sum, m) => {
    if (m.time.kind === 'point') return sum + m.time.minutes;
    return sum + (m.time.minMinutes + m.time.maxMinutes) / 2;
  }, 0);
  const onTrackCount = review.byModule.filter(m => {
    const p = classifyPace(m);
    return p === 'on-track' || p === 'ahead';
  }).length;
  const withTargetCount = review.byModule.filter(m => m.targetValue != null).length;

  return (
    <>
      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Module</th>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">Attempts</th>
              <th className="px-3 py-2 text-left">Target</th>
              <th className="px-3 py-2 text-left">Pace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {review.byModule.map(stat => (
              <ReviewRowView key={stat.moduleId} stat={stat} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-neutral-500 px-1">
        Total practice last week: <span className="font-medium text-neutral-700 dark:text-neutral-300">{formatMinutes(totalMinutes)}</span>
        {withTargetCount > 0 && (
          <>
            {' · '}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{onTrackCount}/{withTargetCount}</span>
            {' '}modules with targets were on track or ahead
          </>
        )}
      </div>
    </>
  );
}

function ReviewRowView({ stat }: { stat: ModuleWeekStat }) {
  const pace = classifyPace(stat);
  const badge = paceBadge(pace);
  const accentHex = MODULE_ACCENT_HEX[stat.moduleId];
  return (
    <tr>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: accentHex }}
          />
          <span className="font-medium">{MODULE_LABEL[stat.moduleId]}</span>
        </span>
      </td>
      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">
        {formatTimeEstimate(stat.time)}
      </td>
      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">{stat.attempts}</td>
      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">
        {stat.targetValue != null ? `${stat.targetValue} ${stat.targetUnit ?? ''}`.trim() : '—'}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${badge.bg} ${badge.fg}`}>
          {badge.label}
        </span>
      </td>
    </tr>
  );
}

function PlanRowView(props: {
  row: PlanRow;
  time: RowTimeDisplay | null;
  editable: boolean;
  onChangeTarget: (n: number) => void;
  onResetTarget: () => void;
  /** When set, the module name is suppressed in the row's Module
   *  cell and `subLabel` replaces it. Used for sub-rows of a
   *  multi-row module group (the group's header already shows
   *  the module name + accent dot). */
  subLabel?: string;
  /** Hide the module name and accent dot; sub-row mode. */
  hideModuleHeading?: boolean;
}) {
  const { row, time, editable, onChangeTarget, onResetTarget, subLabel, hideModuleHeading } = props;
  const accentHex = MODULE_ACCENT_HEX[row.moduleId];
  const adjusted = row.target !== row.suggested;
  return (
    <tr>
      <td className={`px-3 py-2 align-top ${hideModuleHeading ? 'pl-9' : ''}`}>
        {hideModuleHeading ? (
          <div className="font-medium text-sm">{subLabel ?? row.parentDescription}</div>
        ) : (
          <>
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: accentHex }}
              />
              <span className="font-medium">{MODULE_LABEL[row.moduleId]}</span>
            </span>
            <div className="text-xs text-neutral-500 mt-0.5 max-w-[20rem] truncate">
              {row.parentDescription}
            </div>
          </>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          {editable ? (
            <input
              type="number"
              min={0}
              value={row.target}
              onChange={e => {
                const n = Number(e.target.value);
                onChangeTarget(Number.isFinite(n) && n >= 0 ? n : 0);
              }}
              className="w-20 px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          ) : (
            <span className="font-medium tabular-nums">{row.target}</span>
          )}
          <span className="text-xs text-neutral-500">{row.unit}</span>
        </div>
        {adjusted && editable && (
          <button
            onClick={onResetTarget}
            className="text-xs text-neutral-500 underline hover:text-neutral-700 mt-1"
          >
            reset to {row.suggested}
          </button>
        )}
      </td>
      <td className="px-3 py-2 align-top text-neutral-600 dark:text-neutral-400">
        {time === null ? (
          <span className="tabular-nums">—</span>
        ) : time.kind === 'per-session' ? (
          <span className="tabular-nums">~{formatMinutes(time.minutesPerSession)} each</span>
        ) : (
          <span>
            <span className="tabular-nums">~{formatTimeEstimate(time.estimate)}/week</span>
            {time.consistencySuffix && (
              <span className="tabular-nums text-neutral-500 dark:text-neutral-500">
                {' · '}{time.consistencySuffix}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2 align-top"></td>
    </tr>
  );
}

/**
 * Hint row rendered immediately under any repertoire-routine row
 * (the new `repertoire_days_per_cadence` and the legacy
 * `repertoire_hours_per_cadence`). Explains the recommended split
 * of a ~45 min repertoire session
 * — new-song learning vs. maintenance rotation — and how 6 sessions a
 * week cover 6 of 7 active songs with the spacing system surfacing
 * the most stale as the skip candidate.
 *
 * Static guidance: doesn't read from the row's target (the math
 * holds at 4.5 h/week — recalibrate if the default ever moves and
 * the inline numbers stop matching the session cadence).
 */
function RepertoireGuidanceRow() {
  return (
    <tr className="bg-neutral-50/40 dark:bg-neutral-800/20">
      <td
        colSpan={4}
        className="px-3 py-2 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400"
      >
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Suggested session split:
        </span>{' '}
        ~30 min new-song learning + ~15 min maintenance rotation. With
        7 active songs and 6 sessions/week, one song per session covers
        6 of 7 — the spacing system surfaces the most stale song as the
        skip candidate.
      </td>
    </tr>
  );
}

/**
 * Group-header row for a module that has multiple sub-goals
 * (e.g. Shapes with maj/min/dim triad coverage selections, or
 * ET with intervals + chord-progressions coverage). Renders the
 * module name + accent dot, an empty Target column (sub-rows carry
 * the individual targets), the combined weekly time across the
 * group, and a chevron toggle in the right gutter.
 *
 * Clicking anywhere on the row toggles collapse — the chevron is
 * the visual cue, the whole row is the affordance.
 */
function ModuleGroupHeader(props: {
  moduleId: GoalFlowModuleId;
  combinedTime: TimeEstimate;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { moduleId, combinedTime, collapsed, onToggle } = props;
  const accentHex = MODULE_ACCENT_HEX[moduleId];
  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 bg-neutral-50/50 dark:bg-neutral-800/30"
    >
      <td className="px-3 py-2 align-middle">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: accentHex }}
          />
          <span className="font-medium">{MODULE_LABEL[moduleId]}</span>
        </span>
      </td>
      <td className="px-3 py-2 align-middle text-xs text-neutral-500">{/* sub-rows carry targets */}</td>
      <td className="px-3 py-2 align-middle text-neutral-700 dark:text-neutral-300 tabular-nums font-medium">
        ~{formatTimeEstimate(combinedTime)}/week
      </td>
      <td className="px-3 py-2 align-middle text-right w-10 text-neutral-500">
        <button
          type="button"
          aria-label={collapsed ? 'expand' : 'collapse'}
          className="inline-block align-middle"
          onClick={e => {
            // The whole row already handles the click; this button
            // is here for accessibility / keyboard focus. Stop the
            // event so it doesn't fire twice (parent + child).
            e.stopPropagation();
            onToggle();
          }}
        >
          <span
            className={`inline-block transition-transform duration-150 ${
              collapsed ? '-rotate-90' : 'rotate-0'
            }`}
            aria-hidden
          >
            ▾
          </span>
        </button>
      </td>
    </tr>
  );
}

/**
 * Bottom-of-table total row aggregating weekly time across all
 * modules. Per-session-only goals (HF/ET consistency surfaced as
 * "~27 min each") are intentionally excluded — totalTime is
 * computed from the same `kind: 'time'` estimates we sum into
 * group totals, so the math composes cleanly.
 */
function TotalRow({ totalTime }: { totalTime: TimeEstimate }) {
  return (
    <tr className="bg-neutral-100/70 dark:bg-neutral-800/50">
      <td className="px-3 py-2.5 align-middle font-medium uppercase tracking-wide text-xs text-neutral-700 dark:text-neutral-300">
        Total this week
      </td>
      <td className="px-3 py-2.5 align-middle" />
      <td className="px-3 py-2.5 align-middle font-semibold text-neutral-800 dark:text-neutral-100 tabular-nums">
        ~{formatTimeEstimate(totalTime)}/week
      </td>
      <td className="px-3 py-2.5 align-middle w-10" />
    </tr>
  );
}

function DailyPattern() {
  const days: ReadonlyArray<{ day: string; slot: string; note: string }> = [
    { day: 'Sun',     slot: 'Deep',         note: 'longest block of the week — set the tone' },
    { day: 'Mon-Fri', slot: 'Standard',     note: 'shorter focused sessions — protect consistency' },
    { day: 'Sat',     slot: 'Deep flex',    note: 'flex day — go long if energy is there' },
  ];
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
        Daily pattern
      </div>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {days.map(d => (
          <li key={d.day} className="px-3 py-2 flex items-baseline gap-3 text-sm">
            <span className="w-20 font-medium tabular-nums">{d.day}</span>
            <span className="text-neutral-700 dark:text-neutral-300">{d.slot}</span>
            <span className="text-xs text-neutral-500">— {d.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
