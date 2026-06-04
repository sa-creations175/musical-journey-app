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
import { SECTION_PALETTE } from './moduleSectionPalette';
import type { GoalFlowModuleId } from './goalVocabulary';
import { ORDERED_GOAL_MODULES } from './goalsByModule';
import { isCoverageMetric } from './coverageMetrics';
import {
  getShapesCoverageGroup,
  shapesAreaFromUnit,
} from './shapesCoverageGroups';
import {
  REPERTOIRE_MAINTENANCE_MINUTES,
  REPERTOIRE_SPOTLIGHT_MINUTES,
} from './repertoireBreakdown';
import {
  deriveWeeklyGoals,
  recomputeWeeklyTargetForMonthlyGoal,
  computeOverrideDivergence,
  type OverrideDivergence,
} from './weeklyDerivation';
import { getAttemptsInRange } from '../../lib/weeklyAttempts';
import { TIME_PER_ATTEMPT_SECONDS } from '../../lib/sessionAlgorithm/sessionNeed';
import {
  classifyPace,
  clearWeeklyAvailableDays,
  endOfWeekLocal,
  loadActiveMonthlyGoals,
  loadLastWeekReview,
  loadWeeklyAvailableDays,
  loadWeeklyGoalsForWeek,
  saveWeeklyAvailableDays,
  startOfWeekLocal,
  WEEKLY_AVAILABLE_DAYS_MAX,
  WEEKLY_AVAILABLE_DAYS_MIN,
  type LastWeekReview,
  type ModuleWeekStat,
  type PaceStatus,
} from './weeklyPlanData';

/**
 * Phase 4 Step 3 — WeeklyPlan modal.
 *
 * Two-part screen:
 *
 *   Part 1 — This week's plan:
 *     Derives weekly targets from the active monthly goals via
 *     deriveWeeklyGoals, lets the user adjust each target inline,
 *     shows the honest total time range, and surfaces the Phase 4
 *     daily pattern (Sun=Deep, Mon-Fri=Standard, Sat=Deep flex).
 *
 *   Part 2 — Last week review:
 *     For each module, show actual attempts + time vs the saved
 *     weekly target (if any) with an honest pace classification
 *     (ahead / on-track / behind / no-target). Empty state when
 *     the user has no weekly history yet.
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
  /** When true, render the body inline (no Modal wrapper, no
   *  Cancel/Close button — the host section owns containment).
   *  Used by Goals.tsx's by-timeframe "This week's challenge"
   *  subsection so the weekly plan content lives directly inside
   *  the This Week layer. `open` is ignored when inline is true —
   *  inline means "always rendered." */
  inline?: boolean;
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
  /** When set, this row is synthetic — not backed by a Goal record.
   *  Currently used for the Repertoire "Maintenance rotation" row
   *  that surfaces alongside Song of the Month when the user has
   *  ≥2 active songs. Synthetic rows render non-editable and are
   *  filtered out of the save loop. */
  kind?: 'synthetic-maintenance';
  /** Source monthly goal's `targetValue` for declarative-coverage
   *  rows — the item count behind the attempts target (e.g. 202
   *  cards). Drives the muted "{n} items · ~10 correct attempts each
   *  to reach acquired" explanation under the unit label. Null for
   *  every non-(declarative-coverage) row. */
  coverageItemCount: number | null;
}

/** Sentinel monthlyGoalId for the synthetic maintenance row — keeps
 *  setRowTarget / resetRowToSuggested from accidentally matching it
 *  (real rows always have a non-empty monthlyGoalId). */
const SYNTHETIC_MAINT_ID = '__synthetic-repertoire-maintenance__';

/** Per-row time display. `time` carries a TimeEstimate to render
 *  "~1h 50m" / "~30 min" the same as before. `per-session`
 *  carries a single per-session minutes value rendered as
 *  "~27m each" — used for standalone HF/ET consistency rows when
 *  there's no sibling coverage to merge into.
 *
 *  `consistencySuffix` carries the second-line breakdown:
 *      acrossText: "across 5 days"           — muted in render
 *      eachText:   "~27m each" / "~45m each" — emphasized
 *  Two structured pieces (not a single string) so PlanRowView can
 *  style the per-day/per-session figure distinctly from the cadence
 *  preamble. Resolved via daysPerWeekForModule, which walks every
 *  module's consistency row (not just umbrella siblings) so ET subs
 *  share the ET consistency cadence and Repertoire SotM/maintenance
 *  share repertoire_days_per_cadence. */
type RowTimeDisplay =
  | {
      kind: 'time';
      estimate: TimeEstimate;
      consistencySuffix?: { acrossText: string; eachText: string };
      /** Additional muted lines rendered below the consistency
       *  suffix. Used by Repertoire rows to surface the
       *  spotlight / maintenance per-session breakdown so the
       *  user reads the cadence shape, not just the bulk hours
       *  figure. Each entry renders on its own line. */
      extraLines?: readonly string[];
    }
  | { kind: 'per-session'; minutesPerSession: number };

/** Module → consistency-metric mapping the per-day breakdown reads
 *  from. ET subs all share the ET consistency target (one cadence
 *  goal covers all 4 subs); Repertoire SotM + synthetic maintenance
 *  share repertoire_days_per_cadence. Production uses lessons-per-
 *  week which already IS the cadence — no suffix; absent here. */
// `ear-training` is the rollup key actually used by PlanRow.moduleId
// for every ET sub coverage row (sub-area is encoded in parentUnit,
// not the moduleId). The 'intervals' / 'chord-recognition' / etc.
// entries are vestigial; leaving them defensive for future code that
// might key off a sub-area moduleId directly.
const DAYS_METRIC_BY_MODULE: ReadonlyMap<string, string> = new Map([
  ['harmonic-fluency',     'harmonic_fluency_days_per_cadence'],
  ['ear-training',         'ear_training_days_per_cadence'],
  ['intervals',            'ear_training_days_per_cadence'],
  ['chord-recognition',    'ear_training_days_per_cadence'],
  ['chord-progressions',   'ear_training_days_per_cadence'],
  ['scales-modes',         'ear_training_days_per_cadence'],
  ['shapes-and-patterns',  'shapes_days_per_cadence'],
  ['repertoire',           'repertoire_days_per_cadence'],
  ['practice-consistency', 'practice_days_per_cadence'],
]);

/** Module → moduleId of the consistency goal that drives its days
 *  cadence. Same as the row's own moduleId for HF / S&P / Repertoire,
 *  but 'ear-training' for every ET sub (one consistency target on
 *  the ET umbrella covers all four subs). Used to find the post-
 *  merge consistencyInfo when mergeCoverageAndConsistencyRows has
 *  dropped the standalone consistency row. */
const CONSISTENCY_CARRIER_MODULE: ReadonlyMap<string, string> = new Map([
  ['harmonic-fluency',     'harmonic-fluency'],
  ['ear-training',         'ear-training'],
  ['intervals',            'ear-training'],
  ['chord-recognition',    'ear-training'],
  ['chord-progressions',   'ear-training'],
  ['scales-modes',         'ear-training'],
  ['shapes-and-patterns',  'shapes-and-patterns'],
  ['repertoire',           'repertoire'],
  ['practice-consistency', 'practice-consistency'],
]);

/** Resolve the user's days/week consistency target for the given
 *  module by scanning planRows. Sources, in order:
 *
 *    0. Global Practice Consistency override for this week, if set.
 *       Wins over every per-module source — the override models
 *       "I can only practice N days this week," so every module's
 *       per-day breakdown should divide its weekly time by N.
 *
 *    1. Standalone consistency row with the matching parentMetric.
 *       This is the un-merged case — ET subs (Intervals, CR, etc.)
 *       hit this path because their coverage is in a different
 *       umbrella than the ET consistency goal, so the merge skips
 *       them and the consistency row stays in planRows.
 *
 *    2. Merged coverage row in the consistency-carrier module,
 *       carrying consistencyInfo. mergeCoverageAndConsistencyRows
 *       folds the consistency row into the coverage row's
 *       consistencyInfo field and drops the standalone row — so
 *       HF / ET-overall / S&P coverage all need this fallback to
 *       surface the days count.
 *
 *  Returns null when no consistency target exists for that module
 *  (caller skips the suffix). */
function daysPerWeekForModule(
  moduleId: string,
  rows: ReadonlyArray<PlanRow>,
  effectiveOverride?: number | null,
): number | null {
  if (effectiveOverride != null && effectiveOverride > 0) {
    return effectiveOverride;
  }
  const metric = DAYS_METRIC_BY_MODULE.get(moduleId);
  if (metric) {
    const row = rows.find(r => r.parentMetric === metric);
    if (row && row.target > 0) return row.target;
  }
  const carrier = CONSISTENCY_CARRIER_MODULE.get(moduleId);
  if (carrier) {
    const merged = rows.find(r =>
      r.moduleId === carrier
      && r.consistencyInfo !== null
      && r.consistencyInfo.unit === 'days'
      && r.consistencyInfo.count > 0,
    );
    if (merged && merged.consistencyInfo) return merged.consistencyInfo.count;
  }
  return null;
}

/** Pluralize "day" / "days" with the count baked in. */
function daysPhrase(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`;
}

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
/**
 * Item count behind a declarative-coverage row's attempts target, or
 * null. Declarative coverage (HF / ET) multiplies items × 10 to reach
 * the attempts figure; the muted explanation line surfaces that. Shapes
 * coverage is procedural (×3, not ×10) so it's excluded — the line's
 * "~10 correct attempts each" wording would be wrong for it. Consistency,
 * accuracy, song, etc. aren't coverage and never qualify.
 */
function declarativeCoverageItemCount(parent: Goal | undefined): number | null {
  if (!parent || !parent.targetMetric) return null;
  if (!isCoverageMetric(parent.targetMetric)) return null;
  if (parent.targetMetric.startsWith('shapes_')) return null;
  return parent.targetValue ?? null;
}

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

export default function WeeklyPlan({ open, onClose, weekStart: weekStartProp, inline = false }: Props) {
  const weekStart = useMemo(
    () => weekStartProp ?? startOfWeekLocal(Date.now()),
    [weekStartProp],
  );
  const weekEnd = useMemo(() => endOfWeekLocal(weekStart), [weekStart]);

  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<LastWeekReview | null>(null);
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [confirmedGoals, setConfirmedGoals] = useState<Goal[]>([]);
  /** Monthly goal snapshot, indexed by id for spotlight-song lookup
   *  in the guidance copy. Re-loaded on every modal open. */
  const [monthliesById, setMonthliesById] = useState<Map<string, Goal>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Song catalog snapshot for the Repertoire row plumbing:
   *    - songCount drives the synthetic maintenance row + guidance
   *      (≥2 means at least one song beyond the spotlight, i.e. a
   *      maintenance candidate exists).
   *    - songsById resolves SotM goal.relatedItems[0] → title for
   *      the guidance copy.
   *  Snapshot is fine — modal re-opens refresh state. */
  const [songsById, setSongsById] = useState<Map<string, { id: string; title: string }>>(
    () => new Map(),
  );
  const songCount = songsById.size;
  /** Phase B — override-divergence prompts, keyed by the confirmed
   *  weekly Goal record's id. Populated mid-week when the live
   *  recompute of a confirmed HF / ET coverage slice disagrees with
   *  what the user actually confirmed. Empty otherwise. */
  const [overridePrompts, setOverridePrompts] = useState<
    Map<string, OverrideDivergence>
  >(new Map());
  /** Active global practice-consistency goal's targetValue (days/week)
   *  — the default the available-days picker resets to. 0 when no
   *  consistency goal is configured (the picker still defaults to a
   *  sensible 1 in that case via the effective-days fallback). */
  const [consistencyTargetDays, setConsistencyTargetDays] = useState<number>(0);
  /** Per-week override of consistency days (1–7). Null when the user
   *  hasn't adjusted this week — pacing falls back to
   *  `consistencyTargetDays`. Edits persist immediately to
   *  weeklyOverrides; reverting to consistency clears the row. */
  const [availableDaysOverride, setAvailableDaysOverride] = useState<number | null>(null);
  const effectiveAvailableDays =
    availableDaysOverride ?? (consistencyTargetDays > 0 ? consistencyTargetDays : 0);
  /** Per-module collapse state. Empty set = everything expanded
   *  (the default — see spec: "expanded by default, collapse
   *  chevron on the right"). Only applies to multi-row module
   *  groups; single-row modules always render flat. */
  const [collapsedModules, setCollapsedModules] = useState<Set<GoalFlowModuleId>>(
    new Set(),
  );

  // Load everything on open / weekStart change. Inline mode is
  // "always open" — load whenever inline is true regardless of
  // the `open` flag.
  useEffect(() => {
    if (!open && !inline) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [reviewData, monthlies, alreadySaved, songs, override, allGoals] = await Promise.all([
          loadLastWeekReview(weekStart),
          loadActiveMonthlyGoals(weekStart),
          loadWeeklyGoalsForWeek(weekStart),
          db.songs.toArray(),
          loadWeeklyAvailableDays(weekStart),
          db.goals.where('status').equals('active').toArray(),
        ]);
        if (cancelled) return;
        setReview(reviewData);
        setConfirmedGoals(alreadySaved);
        setSongsById(new Map(songs.map(s => [s.id, { id: s.id, title: s.title }])));
        setMonthliesById(new Map(monthlies.map(m => [m.id, m])));
        const consistency = allGoals.find(
          g => g.targetMetric === 'practice_days_per_cadence',
        )?.targetValue ?? 0;
        setConsistencyTargetDays(consistency);
        setAvailableDaysOverride(override);

        // For the Practice Consistency row: the visible target is the
        // weekly override (if any) and the row's `suggested` resets to
        // the underlying consistency goal — so the existing PlanRowView
        // reset link reads "reset to N" with the goal default's N. Any
        // other row passes through unchanged.
        const effective = override ?? consistency;
        const applyConsistencyOverride = (r: PlanRow): PlanRow =>
          r.moduleId === 'practice-consistency' && consistency > 0
            ? { ...r, target: effective, suggested: consistency }
            : r;

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
              coverageItemCount: declarativeCoverageItemCount(parent),
            };
          }).map(applyConsistencyOverride);
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
              coverageItemCount: declarativeCoverageItemCount(parent),
            };
          }).map(applyConsistencyOverride);
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
  }, [open, weekStart, inline]);

  const isConfirmed = confirmedGoals.length > 0;

  // Phase B — override-divergence detection. Once the week's plan is
  // confirmed, re-run the live goal-pace recompute for each HF / ET
  // coverage slice and compare it to what the user actually
  // confirmed. A mismatch surfaces the "your monthly pace needs X,
  // you planned Z" prompt. Only runs on the *current* week — a
  // dev-pinned past/future weekStart has no live "now" to compare.
  useEffect(() => {
    if (!isConfirmed) {
      setOverridePrompts(new Map());
      return;
    }
    const now = Date.now();
    if (startOfWeekLocal(now) !== weekStart) {
      setOverridePrompts(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const prompts = new Map<string, OverrideDivergence>();
      // Effective per-day divisor for the time translation: a weekly
      // override (1–7) wins over the global consistency goal for this
      // week's "min/day" display, mirroring what Phase B will pace
      // against. Falls back to 0 → computeOverrideDivergence treats
      // that as "no cadence" and spreads across 7 days.
      const allActive = await db.goals
        .where('status').equals('active')
        .toArray();
      const consistencyForDivergence = effectiveAvailableDays;

      for (const weekly of confirmedGoals) {
        const moduleId = weekly.relatedModules[0];
        // Scope: HF / ET coverage slices — the modules Phase B plans
        // for, and the ones with a clean per-attempt time seed.
        if (moduleId !== 'harmonic-fluency' && moduleId !== 'ear-training') {
          continue;
        }
        if (weekly.targetUnit !== 'attempts') continue;
        if (!weekly.parentGoalId) continue;
        const monthly = allActive.find(g => g.id === weekly.parentGoalId)
          ?? await db.goals.get(weekly.parentGoalId);
        if (!monthly) continue;

        const recomputed = await recomputeWeeklyTargetForMonthlyGoal(monthly, now);
        if (!recomputed) continue;

        const coveredSoFar = await getAttemptsInRange(
          moduleId,
          monthly.startDate,
          now,
        );
        const weeksRemainingInMonth = Math.max(
          1,
          Math.ceil((monthly.targetDate - now) / (7 * 24 * 60 * 60 * 1000)),
        );

        const divergence = computeOverrideDivergence({
          dynamicTarget: recomputed.weeklyTarget,
          plannedTarget: weekly.targetValue ?? 0,
          timePerAttemptSeconds: TIME_PER_ATTEMPT_SECONDS[moduleId],
          consistencyTargetDays: consistencyForDivergence,
          monthlyTarget: recomputed.monthlyAttemptTarget,
          coveredSoFar,
          weeksRemainingInMonth,
        });
        if (divergence) prompts.set(weekly.id, divergence);
      }
      if (!cancelled) setOverridePrompts(prompts);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConfirmed, confirmedGoals, weekStart, effectiveAvailableDays]);

  /** Accept an override-divergence prompt — bump the confirmed
   *  weekly Goal record's target to the live-recomputed value so
   *  the user is back on monthly pace. */
  async function handleAcceptOverride(weeklyGoalId: string): Promise<void> {
    const divergence = overridePrompts.get(weeklyGoalId);
    if (!divergence) return;
    await db.goals.update(weeklyGoalId, {
      targetValue: divergence.dynamicTarget,
    });
    setConfirmedGoals(prev =>
      prev.map(g =>
        g.id === weeklyGoalId
          ? { ...g, targetValue: divergence.dynamicTarget }
          : g,
      ),
    );
    setOverridePrompts(prev => {
      const next = new Map(prev);
      next.delete(weeklyGoalId);
      return next;
    });
  }

  /** Mirror a new consistency-row value into planRows so the row
   *  re-renders and the time-math helpers (daysPerWeekForModule etc.)
   *  pick up the override without a reload. Targets every row whose
   *  module is Practice Consistency — there's only one in practice,
   *  but mapping defensively keeps the helper safe if the derivation
   *  ever returns more than one. */
  function setConsistencyRowTargetInPlan(value: number): void {
    setPlanRows(rows =>
      rows.map(r =>
        r.moduleId === 'practice-consistency' ? { ...r, target: value } : r,
      ),
    );
  }

  /** Edit handler for the Practice Consistency row's day count. The
   *  row IS the "available days this week" control — edits persist
   *  to weeklyOverrides immediately so the next session-start picks
   *  up the new value via loadGoalsNeedToday. Setting the value to
   *  match the consistency goal clears the override row entirely
   *  (keeps the table sparse: no row = "follow the goal"). */
  async function handleConsistencyRowEdit(next: number): Promise<void> {
    const clamped = Math.min(
      WEEKLY_AVAILABLE_DAYS_MAX,
      Math.max(WEEKLY_AVAILABLE_DAYS_MIN, Math.round(next)),
    );
    if (consistencyTargetDays > 0 && clamped === consistencyTargetDays) {
      setAvailableDaysOverride(null);
      await clearWeeklyAvailableDays(weekStart);
    } else {
      setAvailableDaysOverride(clamped);
      await saveWeeklyAvailableDays(weekStart, clamped);
    }
    setConsistencyRowTargetInPlan(clamped);
  }

  /** Reset handler — clears the override and reverts the row's
   *  displayed value to the consistency goal. The consistency goal
   *  itself is not touched; only the per-week override row goes
   *  away. */
  async function handleConsistencyRowReset(): Promise<void> {
    setAvailableDaysOverride(null);
    await clearWeeklyAvailableDays(weekStart);
    if (consistencyTargetDays > 0) {
      setConsistencyRowTargetInPlan(consistencyTargetDays);
    }
  }

  /** Per-row editability + edit/reset wiring.
   *
   *  The Practice Consistency row is special: it IS the available-days-
   *  this-week control, stays editable even after the weekly plan is
   *  confirmed, and renders as a native `<select>`. iOS Safari shows
   *  the wheel picker for selects — no keyboard, no caret, no zoom,
   *  none of the text-input bugs we hit on single-digit numeric fields.
   *  Other rows use the buffered text input. */
  function rowEditProps(row: PlanRow): {
    editable: boolean;
    onChangeTarget: (n: number) => void;
    onResetTarget: () => void;
    useSelect?: boolean;
    inputMin?: number;
    inputMax?: number;
  } {
    if (row.moduleId === 'practice-consistency') {
      return {
        editable: consistencyTargetDays > 0,
        onChangeTarget: n => { void handleConsistencyRowEdit(n); },
        onResetTarget: () => { void handleConsistencyRowReset(); },
        useSelect: true,
        inputMin: WEEKLY_AVAILABLE_DAYS_MIN,
        inputMax: WEEKLY_AVAILABLE_DAYS_MAX,
      };
    }
    return {
      editable: !isConfirmed && row.kind !== 'synthetic-maintenance',
      onChangeTarget: n => setRowTarget(row.monthlyGoalId, n),
      onResetTarget: () => resetRowToSuggested(row.monthlyGoalId),
    };
  }

  /** Dismiss an override-divergence prompt without changing the
   *  plan — the user is choosing to keep their override. */
  function handleDismissOverride(weeklyGoalId: string): void {
    setOverridePrompts(prev => {
      const next = new Map(prev);
      next.delete(weeklyGoalId);
      return next;
    });
  }

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

    // Synthetic maintenance row — no Goal record; time is the
    // per-session maintenance minutes × session count. Inserted by
    // augmentedPlanRows when songCount ≥ 2 and a SotM row exists.
    if (row.kind === 'synthetic-maintenance') {
      const days = daysPerWeekForModule('repertoire', planRows, availableDaysOverride);
      return {
        kind: 'time',
        estimate: { kind: 'point', minutes: row.target * REPERTOIRE_MAINTENANCE_MINUTES },
        consistencySuffix: days
          ? {
              acrossText: `across ${daysPhrase(days)}`,
              eachText: `~${REPERTOIRE_MAINTENANCE_MINUTES}m each`,
            }
          : undefined,
      };
    }

    // Song of the Month — the row IS the spotlight slice. Use the
    // per-session spotlight minutes from repertoireBreakdown, not
    // TIME_PER_ATTEMPT_MINUTES.repertoire (~17.5 min) which was the
    // pre-redesign per-cell-session estimate and produces wildly
    // under-stated totals for SotM sessions.
    if (row.parentMetric === 'song_whole_at_level') {
      const days = daysPerWeekForModule('repertoire', planRows, availableDaysOverride);
      return {
        kind: 'time',
        estimate: { kind: 'point', minutes: row.target * REPERTOIRE_SPOTLIGHT_MINUTES },
        consistencySuffix: days
          ? {
              acrossText: `across ${daysPhrase(days)}`,
              eachText: `~${REPERTOIRE_SPOTLIGHT_MINUTES}m each`,
            }
          : undefined,
      };
    }

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
    // target IS the weekly hour count. The Repertoire per-session
    // split (Song of the Month + Maintenance) now lives in dedicated
    // SotM + synthetic-maintenance rows, so this row just shows
    // the bulk cadence figure without the extraLines breakdown.
    if (row.unit === 'hours') {
      const estimate: TimeEstimate = { kind: 'point', minutes: row.target * 60 };
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
    //     REPERTOIRE_SESSION_DEFAULT_MINUTES (60 min/day —
    //     ~45 spotlight + ~15 maintenance).
    //   · HF/ET/Shapes _days_per_cadence standing alone — no
    //     coverage to derive minutes from, so just show the count.
    //   · practice_days_per_cadence — same: count-only, the
    //     practice-consistency umbrella covers any module.
    if (row.unit === 'days') {
      if (row.parentMetric === 'repertoire_days_per_cadence' && row.target > 0) {
        // When a SotM row is also present, the SotM + synthetic
        // maintenance rows already cover all Repertoire time —
        // returning a time here would double-count into totalTime.
        // The days row stays in the table (cadence is still
        // meaningful display copy) but contributes null time.
        const hasSotmRow = planRows.some(r => r.parentMetric === 'song_whole_at_level');
        if (hasSotmRow) return null;
        // No SotM → days row is the only Repertoire time signal.
        return {
          kind: 'time',
          estimate: { kind: 'point', minutes: row.target * REPERTOIRE_SESSION_DEFAULT_MINUTES },
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
      // Per-day breakdown: divide the row's total weekly minutes by
      // the user's days/week consistency target for that module.
      // Walks every planRow for the matching consistency metric
      // (DAYS_METRIC_BY_MODULE) — so ET-subs see ET consistency,
      // S&P sees S&P consistency, etc. Falls back to no suffix when
      // no consistency target exists. Estimate ranges (lessons-per-
      // week from getWeeklyTimeEstimate) collapse to midpoint here so
      // the per-day figure stays a single number.
      let consistencySuffix: { acrossText: string; eachText: string } | undefined;
      const days = daysPerWeekForModule(row.moduleId, planRows, availableDaysOverride);
      if (days) {
        const totalMinutes =
          estimate.kind === 'point'
            ? estimate.minutes
            : (estimate.minMinutes + estimate.maxMinutes) / 2;
        const minutesPerDay = totalMinutes / days;
        consistencySuffix = {
          acrossText: `across ${daysPhrase(days)}`,
          eachText: `~${formatMinutes(minutesPerDay)} each`,
        };
      }
      return { kind: 'time', estimate, consistencySuffix };
    }

    // Unhandled unit (defensive): no honest per-row time to surface.
    return null;
  }

  /**
   * planRows + a synthetic "Maintenance rotation" row injected when
   * the user has a Song of the Month target AND at least 2 active
   * songs (i.e. one song beyond the spotlight, so a maintenance
   * candidate exists). The synthetic row inherits the SotM's
   * session count so the user sees both spotlight + maintenance
   * minutes scaling together as they adjust SotM.
   *
   * Used for render-side paths (grouping, totalTime, table render).
   * The save loop keeps using `planRows` directly so synthetic rows
   * never round-trip to db.goals.
   */
  /**
   * Spotlight song title for the guidance copy — resolved from the
   * SotM monthly goal's relatedItems[0] via songsById. Null when no
   * SotM goal exists, or when the referenced song was deleted (the
   * goal row may still surface but the title gracefully drops out of
   * the guidance text).
   */
  const spotlightSongName = useMemo<string | null>(() => {
    const sotmRow = planRows.find(r => r.parentMetric === 'song_whole_at_level');
    if (!sotmRow) return null;
    // The SotM row carries the goal description (often "Get 'X' to
    // comfortable…") in parentDescription, but the songId lookup is
    // more reliable. Fall back to the description if no songId is
    // resolvable.
    const songId = monthliesById.get(sotmRow.monthlyGoalId)?.relatedItems[0];
    if (songId) {
      const song = songsById.get(songId);
      if (song) return song.title;
    }
    return null;
  }, [planRows, songsById]);

  const augmentedPlanRows = useMemo<PlanRow[]>(() => {
    if (songCount < 2) return planRows;
    const sotmIdx = planRows.findIndex(r => r.parentMetric === 'song_whole_at_level');
    if (sotmIdx < 0) return planRows;
    const sotm = planRows[sotmIdx];
    const maintenance: PlanRow = {
      moduleId: 'repertoire',
      monthlyGoalId: SYNTHETIC_MAINT_ID,
      suggested: sotm.target,
      target: sotm.target,
      unit: 'sessions',
      parentDescription: `Maintenance rotation — ${songCount - 1} song${songCount - 1 === 1 ? '' : 's'}`,
      parentMetric: null,
      parentUmbrellaId: null,
      parentUnit: null,
      consistencyInfo: null,
      coverageItemCount: null,
      kind: 'synthetic-maintenance',
    };
    return [
      ...planRows.slice(0, sotmIdx + 1),
      maintenance,
      ...planRows.slice(sotmIdx + 1),
    ];
  }, [planRows, songCount]);

  const totalTime = useMemo<TimeEstimate>(() => {
    const estimates: TimeEstimate[] = [];
    for (const row of augmentedPlanRows) {
      const t = rowTime(row);
      if (!t) continue;
      // Per-session rows reframe the same time as their sibling
      // coverage row. Counting both would double-up the total.
      if (t.kind !== 'time') continue;
      estimates.push(t.estimate);
    }
    if (estimates.length === 0) return { kind: 'point', minutes: 0 };
    return sumTimeEstimates(estimates);
    // rowTime reads from planRows / songCount via closure; the
    // augmentedPlanRows dep captures both indirectly.
    // availableDaysOverride is read explicitly so per-day breakdowns
    // update when the user adjusts the consistency days override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [augmentedPlanRows, availableDaysOverride]);

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
    for (const row of augmentedPlanRows) {
      const list = byModule.get(row.moduleId);
      if (list) list.push(row);
      else byModule.set(row.moduleId, [row]);
    }
    // Iterate ORDERED_GOAL_MODULES so the plan table renders the
    // canonical sequence regardless of which order the rows came
    // out of deriveWeeklyGoals (which mirrors the monthly-goals
    // walk from Dexie — not guaranteed to be canonical).
    const out: ModuleGroup[] = [];
    for (const moduleId of ORDERED_GOAL_MODULES) {
      const rows = byModule.get(moduleId);
      if (!rows || rows.length === 0) continue;
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
    // rowTime reads from planRows / songCount via closure — captured
    // indirectly by augmentedPlanRows. availableDaysOverride is read
    // explicitly so per-day breakdowns update when the user adjusts
    // the consistency days override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [augmentedPlanRows, availableDaysOverride]);

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
      setMonthliesById(new Map(monthlies.map(m => [m.id, m])));
      const derived = await deriveWeeklyGoals(monthlies, weekStart);
      // Re-plan keeps the existing weekly override (it's independent of
      // the confirmed plan); the consistency row in the freshly derived
      // set still surfaces it.
      const effective = availableDaysOverride ?? consistencyTargetDays;
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
          coverageItemCount: declarativeCoverageItemCount(parent),
        };
      }).map(r =>
        r.moduleId === 'practice-consistency' && consistencyTargetDays > 0
          ? { ...r, target: effective, suggested: consistencyTargetDays }
          : r,
      );
      setPlanRows(mergeCoverageAndConsistencyRows(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to re-plan');
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Render ----------------

  // Footer action row — Cancel/Close + Confirm or Re-plan. Inline
  // mode drops the Cancel/Close button (the host section owns
  // dismissal) but keeps Confirm/Re-plan inline below the body.
  const actionRow = (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-neutral-500">
        {error && <span className="text-rose-600 dark:text-rose-400">{error}</span>}
      </div>
      <div className="flex items-center gap-2">
        {!inline && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {isConfirmed ? 'Close' : 'Cancel'}
          </button>
        )}
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
  );

  const body = (
    <>
      {loading && (
        <div className="text-sm text-neutral-500 py-6 text-center">Loading…</div>
      )}

      {!loading && (
        <div className="space-y-8">
          {/* ============ Part 1 — This week's plan ============
              Actionable first, historical review second. The order
              flipped after the plan moved inline into the by-
              timeframe Weekly section — the user lands on the
              section to act, not to relive last week. */}
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
                {overridePrompts.size > 0 && (
                  <div className="space-y-2">
                    {confirmedGoals
                      .filter(g => overridePrompts.has(g.id))
                      .map(g => (
                        <OverrideDivergencePrompt
                          key={g.id}
                          moduleId={g.relatedModules[0] as GoalFlowModuleId}
                          divergence={overridePrompts.get(g.id)!}
                          onAccept={() => void handleAcceptOverride(g.id)}
                          onDismiss={() => handleDismissOverride(g.id)}
                        />
                      ))}
                  </div>
                )}
                <div className="overflow-hidden rounded-md border border-black/[0.07]">
                  <table className="w-full text-sm table-fixed">
                    {/* Explicit column widths — the inline mount
                        lives in a container narrower than the modal
                        body once Goals page chrome + LayerSection
                        padding eat into the page width. Without
                        fixed widths, table-auto can starve the Time
                        column because the Module cell's description
                        div asks for up to 20rem of content width. */}
                    <colgroup>
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '32%' }} />
                      <col style={{ width: '6%' }} />
                    </colgroup>
                    <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 text-left">Module</th>
                        <th className="px-3 py-2 text-left">Target</th>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left"></th>
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
                                {...rowEditProps(row)}
                              />
                              {isRepertoireRoutineRow(row.parentMetric) && (
                                <RepertoireGuidanceRow
                                  songCount={songCount}
                                  sessionsPerWeek={row.target}
                                  spotlightSongName={spotlightSongName}
                                />
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
                                  {...rowEditProps(row)}
                                  subLabel={subLabelForPlanRow(row) ?? row.parentDescription}
                                  hideModuleHeading
                                />
                                {isRepertoireRoutineRow(row.parentMetric) && (
                                  <RepertoireGuidanceRow
                                    songCount={songCount}
                                    sessionsPerWeek={row.target}
                                    spotlightSongName={spotlightSongName}
                                  />
                                )}
                              </Fragment>
                            ))}
                          </Fragment>
                        );
                      })}
                      <TotalRow
                        totalTime={totalTime}
                        availableDays={effectiveAvailableDays}
                      />
                    </tbody>
                  </table>
                </div>

                {totalTime.kind === 'range' && (
                  <div className="text-xs text-neutral-500 px-1">
                    Range reflects production lesson variability.
                  </div>
                )}
              </>
            )}
          </section>

          {/* ============ Part 2 — Last week review ============ */}
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
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="space-y-4">
        {body}
        {!loading && actionRow}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Weekly plan"
      description="Sun → Sat — review last week, plan this week"
      footer={actionRow}
    >
      {body}
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
      <div className="overflow-hidden rounded-md border border-black/[0.07]">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Module</th>
              {/* Time / Attempts / Target only fit at ≥sm (640px).
                  Below that, ReviewRowView folds them into a sub-line
                  under the module name so the row stays inside a
                  390px viewport without horizontal scroll. */}
              <th className="hidden sm:table-cell px-3 py-2 text-left">Time</th>
              <th className="hidden sm:table-cell px-3 py-2 text-left">Attempts</th>
              <th className="hidden sm:table-cell px-3 py-2 text-left">Target</th>
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
  // Mobile summary — Time / Attempts / Target folded into one muted
  // sub-line under the module name when those columns are hidden
  // (<sm). Format mirrors the desktop cells: time, attempts, then
  // "/ target unit" when a target was saved.
  const targetSuffix = stat.targetValue != null
    ? ` / ${stat.targetValue}${stat.targetUnit ? ` ${stat.targetUnit}` : ''}`
    : '';
  return (
    <tr>
      <td className="px-3 py-2 align-top">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: accentHex }}
          />
          <span className="font-medium">{MODULE_LABEL[stat.moduleId]}</span>
        </span>
        <div className="sm:hidden text-xs text-neutral-500 dark:text-neutral-400 tabular-nums mt-0.5">
          {formatTimeEstimate(stat.time)} · {stat.attempts}{targetSuffix}
        </div>
      </td>
      <td className="hidden sm:table-cell px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">
        {formatTimeEstimate(stat.time)}
      </td>
      <td className="hidden sm:table-cell px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">{stat.attempts}</td>
      <td className="hidden sm:table-cell px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">
        {stat.targetValue != null ? `${stat.targetValue} ${stat.targetUnit ?? ''}`.trim() : '—'}
      </td>
      <td className="px-3 py-2 align-top">
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
  /** When true, render a native `<select>` instead of the text input.
   *  Used by the Practice Consistency row: iOS Safari shows the OS
   *  wheel picker for selects (no keyboard, no caret, no zoom, none
   *  of the text-input bugs we'd been fighting). `inputMin` /
   *  `inputMax` produce the option list (inclusive, integer steps). */
  useSelect?: boolean;
  /** Lower bound for the select option list, inclusive. Defaults to 1. */
  inputMin?: number;
  /** Upper bound for the select option list, inclusive. Required when
   *  `useSelect` is on. */
  inputMax?: number;
}) {
  const {
    row, time, editable, onChangeTarget, onResetTarget, subLabel,
    hideModuleHeading, useSelect, inputMin, inputMax,
  } = props;
  const accentHex = MODULE_ACCENT_HEX[row.moduleId];
  const palette = SECTION_PALETTE[row.moduleId];
  const adjusted = row.target !== row.suggested;
  // Every row wears its module tint, including sub-rows under a
  // ModuleGroupHeader — so a grouped module (e.g. Repertoire's
  // SotM + maintenance rows) reads as one continuous tinted band,
  // matching the single-row modules (HF purple, ET green).
  const rowTint = palette.bg;

  // Local buffer decouples the input from the model during typing so
  // the user can clear + retype without intermediate clamping rewriting
  // the field mid-edit. Applied to every editable row — without it,
  // tapping a number field puts the cursor at the end and typed digits
  // append to the existing value (the "0 persisting" iOS bug). Synced
  // from row.target whenever it changes externally (reset link, override
  // round-trip, or a sibling row's edit that re-derives this row).
  const [bufferValue, setBufferValue] = useState<string>(String(row.target));
  useEffect(() => {
    setBufferValue(String(row.target));
  }, [row.target]);

  function commitBufferedValue(): void {
    const n = Number(bufferValue);
    if (Number.isFinite(n) && n >= 0) {
      onChangeTarget(n);
    } else {
      // Invalid → revert to current model value.
      setBufferValue(String(row.target));
    }
  }

  // Master-control rows (currently: Practice Consistency, identified
  // by useSelect) get a thicker, darker top border + a helper caption
  // below the select so the user reads this row as the upstream lever
  // that drives every other module's per-day breakdown rather than
  // just another module target. Border applied per-td because <tr>
  // borders are inconsistently honoured across browsers when the
  // tbody already has a `divide-y` cascade.
  const masterTdBorder = useSelect
    ? 'border-t-2 border-neutral-300 dark:border-neutral-700'
    : '';
  return (
    <tr style={rowTint ? { backgroundColor: rowTint } : undefined}>
      <td className={`px-3 py-2 align-top ${masterTdBorder} ${hideModuleHeading ? 'pl-9' : ''}`}>
        {hideModuleHeading ? (
          <div className="font-medium text-sm">{subLabel ?? row.parentDescription}</div>
        ) : (
          <>
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: accentHex }}
              />
              <span className="font-medium" style={{ color: palette.border }}>
                {MODULE_LABEL[row.moduleId]}
              </span>
            </span>
            <div className="text-xs text-neutral-500 mt-0.5 max-w-[20rem] truncate">
              {row.parentDescription}
            </div>
          </>
        )}
      </td>
      <td className={`px-3 py-2 align-top overflow-hidden ${masterTdBorder}`}>
        {/* Inner overflow-hidden div clips any unit-label spill so
            it can't visually leak into the adjacent Time column.
            flex-wrap lets the input drop above the unit on tight
            viewports instead of forcing the unit beyond the cell
            boundary. */}
        <div className="overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            {editable && useSelect ? (
              <select
                value={row.target}
                onChange={e => onChangeTarget(Number(e.target.value))}
                className="px-2 py-1 pr-7 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 tabular-nums"
                aria-label="available days this week"
              >
                {Array.from(
                  { length: (inputMax ?? 7) - (inputMin ?? 1) + 1 },
                  (_, i) => (inputMin ?? 1) + i,
                ).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : editable ? (
              <input
                // type="text" + inputMode="numeric" + pattern="[0-9]*"
                // — iOS Safari refuses to honour setSelectionRange on
                // type="number" inputs (selection API isn't supported
                // for them per HTML spec), and `e.target.select()`
                // silently no-ops on iOS once the keyboard is rising.
                // Switching to text + a numeric inputMode preserves the
                // numeric mobile keyboard while letting us programmatically
                // select the existing value on focus. The handler clamps
                // non-numeric input on commit.
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={bufferValue}
                onFocus={e => {
                  const target = e.currentTarget;
                  // Defer past iOS Safari's focus-handler — an immediate
                  // setSelectionRange runs before iOS has positioned its
                  // own caret and gets overwritten. setTimeout(_, 0) lets
                  // the browser settle, then the selection sticks and the
                  // user's first keystroke replaces the value cleanly.
                  setTimeout(() => {
                    try {
                      target.setSelectionRange(0, 9999);
                    } catch {
                      // Some browsers throw if the element is no longer
                      // in the DOM or is detached — harmless to swallow.
                    }
                  }, 0);
                }}
                onChange={e => setBufferValue(e.target.value)}
                onBlur={commitBufferedValue}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    commitBufferedValue();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-20 px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
            ) : (
              <span className="font-medium tabular-nums">{row.target}</span>
            )}
            <span className="text-xs text-neutral-500 whitespace-nowrap">{row.unit}</span>
          </div>
          {/* Declarative-coverage explanation: the attempts target is
              the item count × ~10 correct reps to reach acquired.
              Informational, muted — only for HF/ET coverage rows. */}
          {row.coverageItemCount != null && (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
              {row.coverageItemCount} items · ~10 correct attempts each to reach acquired
            </div>
          )}
          {useSelect && (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
              sets the daily pace for all modules
            </div>
          )}
          {adjusted && editable && (
            <button
              onClick={onResetTarget}
              className="text-xs text-neutral-500 underline hover:text-neutral-700 mt-1"
            >
              reset to {row.suggested}
            </button>
          )}
        </div>
      </td>
      <td className={`px-3 py-2 align-top text-neutral-600 dark:text-neutral-400 overflow-hidden ${masterTdBorder}`}>
        {/* Three-line layout, stacked block elements so no line
            visually overlaps another regardless of column width:
              1. primary time estimate (~Xm/week)
              2. muted count + unit footnote (context for the
                 estimate — same numbers as Target cell, but here
                 they document where the time came from)
              3. muted consistency suffix (~Ym each · N days/week) */}
        {time === null ? (
          <span className="tabular-nums">—</span>
        ) : time.kind === 'per-session' ? (
          <>
            <div className="tabular-nums whitespace-nowrap">
              ~{formatMinutes(time.minutesPerSession)} each
            </div>
            {row.target > 0 && row.unit && (
              <div className="tabular-nums text-xs text-neutral-500 mt-0.5 whitespace-nowrap">
                {row.target} {row.unit}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="tabular-nums whitespace-nowrap">
              ~{formatTimeEstimate(time.estimate)}/week
            </div>
            {row.target > 0 && row.unit && (
              <div className="tabular-nums text-xs text-neutral-500 mt-0.5 whitespace-nowrap">
                {row.target} {row.unit}
              </div>
            )}
            {time.consistencySuffix && (
              <div className="tabular-nums text-xs mt-0.5">
                <span className="text-neutral-500 dark:text-neutral-500">
                  {time.consistencySuffix.acrossText} ·{' '}
                </span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {time.consistencySuffix.eachText}
                </span>
              </div>
            )}
            {time.extraLines && time.extraLines.map((line, idx) => (
              <div
                key={idx}
                className="tabular-nums text-xs text-neutral-500 dark:text-neutral-500 mt-0.5"
              >
                {line}
              </div>
            ))}
          </>
        )}
      </td>
      <td className={`px-3 py-2 align-top ${masterTdBorder}`}></td>
    </tr>
  );
}

/**
 * Hint row rendered immediately under any repertoire-routine row
 * (the new `repertoire_days_per_cadence` and the legacy
 * `repertoire_hours_per_cadence`). Explains the recommended per-
 * session split and how the user's actual songCount + session cadence
 * map onto the coverage-this-week math.
 *
 * All numbers driven by props — spotlight + maintenance minutes from
 * the canonical constants, song count + sessions/week from the
 * caller's plan state. Spotlight song name surfaces when resolvable;
 * gracefully degraded when the SotM relatedItems[0] points at a
 * deleted song.
 */
function RepertoireGuidanceRow({
  songCount,
  sessionsPerWeek,
  spotlightSongName,
}: {
  songCount: number;
  sessionsPerWeek: number;
  spotlightSongName: string | null;
}) {
  const coverage = Math.min(songCount, sessionsPerWeek);
  const songsPhrase = `${songCount} active song${songCount === 1 ? '' : 's'}`;
  const sessionsPhrase = `${sessionsPerWeek} session${sessionsPerWeek === 1 ? '' : 's'}/week`;
  const sotmPhrase = spotlightSongName
    ? `Song of the Month (${spotlightSongName})`
    : 'Song of the Month';
  // Coverage clause: depends on songCount vs sessionsPerWeek.
  //   sessions ≥ songs → "covers all N"
  //   sessions <  songs → "covers M of N — the spacing system…"
  //   degenerate (0 songs / 0 sessions) → skip the math clause
  let coverageClause: string;
  if (songCount === 0 || sessionsPerWeek === 0) {
    coverageClause = '';
  } else if (sessionsPerWeek >= songCount) {
    coverageClause =
      ` With ${songsPhrase} and ${sessionsPhrase}, one song per session covers `
      + `all ${songCount}.`;
  } else {
    coverageClause =
      ` With ${songsPhrase} and ${sessionsPhrase}, one song per session covers `
      + `${coverage} of ${songCount} — the spacing system surfaces the most stale `
      + `song as the skip candidate.`;
  }
  return (
    <tr className="bg-neutral-50/40 dark:bg-neutral-800/20">
      <td
        colSpan={4}
        className="px-3 py-2 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400"
      >
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Suggested session split:
        </span>{' '}
        ~{REPERTOIRE_SPOTLIGHT_MINUTES} min on {sotmPhrase} +{' '}
        ~{REPERTOIRE_MAINTENANCE_MINUTES} min maintenance rotation.{coverageClause}
      </td>
    </tr>
  );
}

/**
 * Phase B — override-divergence prompt. Surfaces above the plan
 * table when a confirmed HF / ET weekly target no longer matches
 * what the live monthly-pace recompute needs. The user either
 * accepts the recomputed number (back on pace) or keeps their
 * override (the consequence line spells out the cost).
 */
function OverrideDivergencePrompt({
  moduleId,
  divergence,
  onAccept,
  onDismiss,
}: {
  moduleId: GoalFlowModuleId;
  divergence: OverrideDivergence;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const label = MODULE_LABEL[moduleId] ?? moduleId;
  const behind = divergence.direction === 'under-planned';
  return (
    <div
      className={`rounded-md border px-3 py-2.5 text-xs leading-relaxed ${
        behind
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20'
          : 'border-sky-300 bg-sky-50 dark:border-sky-700/60 dark:bg-sky-900/20'
      }`}
    >
      <div className="text-neutral-700 dark:text-neutral-200">
        <span className="font-semibold">{label}</span>
        {behind ? (
          <>
            {' '}— your monthly pace needs{' '}
            <span className="font-mono font-medium">
              {divergence.dynamicTarget} attempts
            </span>{' '}
            this week (~{divergence.dynamicMinPerDay} min/day). You planned{' '}
            <span className="font-mono font-medium">
              {divergence.plannedTarget} attempts
            </span>{' '}
            (~{divergence.plannedMinPerDay} min/day).
          </>
        ) : (
          <>
            {' '}— you planned{' '}
            <span className="font-mono font-medium">
              {divergence.plannedTarget} attempts
            </span>{' '}
            this week (~{divergence.plannedMinPerDay} min/day), more than
            your monthly pace needs:{' '}
            <span className="font-mono font-medium">
              {divergence.dynamicTarget} attempts
            </span>{' '}
            (~{divergence.dynamicMinPerDay} min/day).
          </>
        )}
      </div>
      <div className="mt-1 text-neutral-500">
        Keep your plan and you'll cover ~
        {divergence.monthlyCoveragePercentIfKept}% of your monthly goal.
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onAccept}
          className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700"
        >
          Update to {divergence.dynamicTarget}
        </button>
        <button
          onClick={onDismiss}
          className="px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Keep my plan
        </button>
      </div>
    </div>
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
  const palette = SECTION_PALETTE[moduleId];
  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer hover:brightness-95 dark:hover:brightness-110"
      style={{ backgroundColor: palette.bg }}
    >
      <td className="px-3 py-2 align-middle">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: accentHex }}
          />
          <span className="font-medium" style={{ color: palette.border }}>
            {MODULE_LABEL[moduleId]}
          </span>
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
function TotalRow({
  totalTime,
  availableDays,
}: {
  totalTime: TimeEstimate;
  /** Effective days-per-week — the Practice Consistency override
   *  when set, otherwise the consistency goal's default. 0 when no
   *  consistency goal exists; the per-day line is skipped in that
   *  case (no honest divisor available). */
  availableDays: number;
}) {
  // Per-day breakdown: divide the weekly total by the user's
  // available-days figure (Practice Consistency override or goal
  // default). Skipped when there's no consistency cadence to divide
  // against or when the weekly total is zero (nothing to budget).
  const perDayLabel = describePerDay(totalTime, availableDays);
  return (
    <tr className="bg-neutral-100/70 dark:bg-neutral-800/50">
      <td className="px-3 py-2.5 align-middle font-medium uppercase tracking-wide text-xs text-neutral-700 dark:text-neutral-300">
        Total this week
      </td>
      <td className="px-3 py-2.5 align-middle" />
      <td className="px-3 py-2.5 align-middle tabular-nums">
        <div className="font-semibold text-neutral-800 dark:text-neutral-100">
          ~{formatTimeEstimate(totalTime)}/week
        </div>
        {perDayLabel && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {perDayLabel}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 align-middle w-10" />
    </tr>
  );
}

/** Render the "~Xh Ym per day" line for the TOTAL row, derived from
 *  the weekly total ÷ effective days. Returns null when nothing
 *  useful can be shown — no available-days set, or the weekly total
 *  is already zero — so the caller can skip the line entirely. */
function describePerDay(t: TimeEstimate, days: number): string | null {
  if (days <= 0) return null;
  if (t.kind === 'point') {
    if (t.minutes <= 0) return null;
    return `~${formatMinutes(t.minutes / days)} per day`;
  }
  if (t.maxMinutes <= 0) return null;
  return `~${formatMinutes(t.minMinutes / days)}–${formatMinutes(t.maxMinutes / days)} per day`;
}
