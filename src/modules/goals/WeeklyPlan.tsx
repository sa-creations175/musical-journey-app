import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { db, type Goal } from '../../lib/db';
import {
  getWeeklyTimeEstimate,
  TIME_PER_ATTEMPT_MINUTES,
  type ShapesActivityArea,
  type TimeEstimate,
} from '../../lib/weeklyAttempts';
import { MODULE_ORDER, PRACTICE_SESSIONS_META } from '../../lib/moduleMeta';
import type { GoalFlowModuleId } from './goalVocabulary';
import { isCoverageMetric } from './coverageMetrics';
import { coverageGroupIdToActivityArea } from './shapesCoverageGroups';
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
}

/** Per-row time display. `time` carries a TimeEstimate to render
 *  "~1h 50m" / "~30 min" the same as before. `per-session`
 *  carries a single per-session minutes value rendered as
 *  "~27m each" — used for HF/ET consistency rows so the user
 *  sees the honest "this many sessions × this much time per
 *  session" breakdown derived from the sibling coverage row. */
type RowTimeDisplay =
  | { kind: 'time'; estimate: TimeEstimate }
  | { kind: 'per-session'; minutesPerSession: number };

/** HF/ET cadence-style metrics whose row should render as
 *  per-session when a sibling coverage row exists. */
const SESSIONS_PER_CADENCE_METRICS: ReadonlySet<string> = new Set([
  'harmonic_fluency_sessions_per_cadence',
  'ear_training_sessions_per_cadence',
]);

/** Pull the activity-area discriminator out of a Shapes parent
 *  goal's targetUnit when present:
 *    coverage_specific:    one of the six ShapesCoverageGroupId
 *                          values (chord_shape_triads /
 *                          chord_shape_sevenths /
 *                          chord_shape_extensions /
 *                          chord_shape_special / scale_drills /
 *                          voice_leading) — the four chord-shape
 *                          sub-groups all roll up to the
 *                          chord_shape_drills activity area for
 *                          time-per-rep dispatch.
 *    proficiency_overall:  '${activityArea}:${level}'              → split before ':'
 *    proficiency_specific: '${activityArea}:${shapeId}:${key}:${level}' → split before ':'
 *  Returns null for overall-coverage rows ('items') and for any
 *  unit string that doesn't resolve — caller falls back to the
 *  catalog-weighted-average constant. */
function shapesAreaFromUnit(unit: string | null): ShapesActivityArea | null {
  if (!unit) return null;
  const head = unit.includes(':') ? unit.slice(0, unit.indexOf(':')) : unit;
  // Try the coverage-group-id space first (covers the 4 chord-shape
  // sub-groups + scale_drills + voice_leading + legacy
  // chord_shape_drills). Falls through to the proficiency picker's
  // raw activity-area space (scale_drills / chord_shape_drills /
  // voice_leading) for proficiency unit prefixes — the helper
  // recognizes the legacy chord_shape_drills id directly.
  return coverageGroupIdToActivityArea(head);
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
            };
          });
          setPlanRows(rows);
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
            };
          });
          setPlanRows(rows);
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
    if (row.parentMetric != null && SESSIONS_PER_CADENCE_METRICS.has(row.parentMetric)) {
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

    // Production hours/cadence: target IS the weekly hour count.
    if (row.unit === 'hours') {
      return {
        kind: 'time',
        estimate: { kind: 'point', minutes: row.target * 60 },
      };
    }

    // Shapes minutes_per_cadence (consistency): target IS the
    // weekly minute count. Bypass the per-rep math entirely.
    if (row.unit === 'minutes') {
      return {
        kind: 'time',
        estimate: { kind: 'point', minutes: row.target },
      };
    }

    // Production lesson count: getWeeklyTimeEstimate returns a range
    // (30–90 min/lesson). Other modules with unit='lessons' would
    // route here too, but the function is module-aware via the
    // moduleId switch.
    if (row.unit === 'lessons') {
      return { kind: 'time', estimate: getWeeklyTimeEstimate(row.moduleId, row.target) };
    }

    // Standard attempt / session counts: HF/ET coverage, Shapes
    // drills, Repertoire song-sessions. Shapes routes through the
    // area-aware getWeeklyTimeEstimate overload — for *_specific
    // metrics the parent's targetUnit carries the activity area
    // (or 'area:level' for proficiency); the *_overall metric has
    // no area, so the function falls back to the catalog-weighted
    // average per-rep.
    if (row.unit === 'attempts' || row.unit === 'sessions') {
      if (row.moduleId === 'shapes-and-patterns') {
        const area = shapesAreaFromUnit(row.parentUnit);
        return {
          kind: 'time',
          estimate: getWeeklyTimeEstimate('shapes-and-patterns', row.target, area ?? undefined),
        };
      }
      return { kind: 'time', estimate: getWeeklyTimeEstimate(row.moduleId, row.target) };
    }

    // 'days' (practice consistency) — no honest per-day constant
    // to multiply by; show the count verbatim, no time estimate.
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
        };
      });
      setPlanRows(rows);
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
                        <th className="px-3 py-2 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {planRows.map(row => (
                        <PlanRowView
                          key={row.monthlyGoalId || `${row.moduleId}-${row.suggested}`}
                          row={row}
                          time={rowTime(row)}
                          editable={!isConfirmed}
                          onChangeTarget={n => setRowTarget(row.monthlyGoalId, n)}
                          onResetTarget={() => resetRowToSuggested(row.monthlyGoalId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-neutral-500 px-1">
                  Total time this week: <span className="font-medium text-neutral-700 dark:text-neutral-300">{formatTimeEstimate(totalTime)}</span>
                  {totalTime.kind === 'range' && ' (range reflects production lesson variability)'}
                </div>

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
}) {
  const { row, time, editable, onChangeTarget, onResetTarget } = props;
  const accentHex = MODULE_ACCENT_HEX[row.moduleId];
  const adjusted = row.target !== row.suggested;
  return (
    <tr>
      <td className="px-3 py-2 align-top">
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
      <td className="px-3 py-2 align-top text-neutral-600 dark:text-neutral-400 tabular-nums">
        {time === null
          ? '—'
          : time.kind === 'per-session'
            ? `~${formatMinutes(time.minutesPerSession)} each`
            : `~${formatTimeEstimate(time.estimate)}`}
      </td>
      <td className="px-3 py-2 align-top"></td>
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
