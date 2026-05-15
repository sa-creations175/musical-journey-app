import { useEffect, useState } from 'react';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  loadGoalsNeedToday,
  type GoalsNeedTodayEntry,
  type GoalsNeedTodaySummary,
} from './goalsNeedToday';
import type { WeeklyPace } from '../../lib/sessionAlgorithm/moduleWeeklyNeed';

/**
 * "What your goals need today" screen — the first surface in the
 * session-start flow. Phase B Step 7 routes this through the keystone
 * (loadModuleWeeklyNeeds → summarizeGoalsNeedToday), retiring the
 * pre-Phase-B dailyGoalNeed.ts.
 *
 *   · Per-module rows: minutes (Phase B `estimatedMinutesNeeded`,
 *     rounded) plus a pace pill (ahead / on-pace / behind). Modules
 *     whose weekly target is already met render a "target met"
 *     pill instead of a minutes line.
 *   · Practice Consistency nudge: shown when the user hasn't logged
 *     a practice session today (per design-doc §"Practice
 *     Consistency — Special Case" — it's the global cadence
 *     denominator, not a coverage module, so it never carries a
 *     time slice; the nudge IS its surface).
 *   · "Full session — X min" CTA bypasses the questionnaire and
 *     proceeds straight to proposal generation; "Customize" opens
 *     the questionnaire pre-seeded with the total. The user's saved
 *     context + day plan still apply.
 *   · "Split across contexts" affordance when the user has already
 *     practiced today (hasEarlierSessionsToday).
 *
 * Behavior contracts:
 *   · `onFullSession(minutes)` fires when the user taps Full
 *     session. Parent skips the questionnaire and runs
 *     buildSessionPlan with the prefilled context/dayPlan +
 *     balanced intent.
 *   · `onCustomize(minutes)` opens the questionnaire pre-seeded
 *     with the full total. The user is asking for control over
 *     intent / context / day plan, but the goal-aware figure is
 *     still the most useful default.
 *   · `onClose()` fires on the header skip, on the timeout fallback,
 *     and on empty-needs — parent opens the questionnaire so the
 *     user is never trapped.
 *   · Caller is responsible for not opening this screen when the
 *     user has zero active goals — the wrapper falls back to the
 *     questionnaire directly. Loading null / empty also falls through.
 */
interface Props {
  open: boolean;
  /** When true, the user has already practiced today (or has a
   *  multi-session day planned). Surfaces the "Split across
   *  contexts" affordance. */
  hasEarlierSessionsToday: boolean;
  onFullSession: (minutes: number) => void;
  onCustomize: (minutes: number) => void;
  onClose: () => void;
}

const LOAD_TIMEOUT_MS = 2000;

export default function GoalsNeedTodayScreen({
  open,
  hasEarlierSessionsToday,
  onFullSession,
  onCustomize,
  onClose,
}: Props) {
  const [summary, setSummary] = useState<GoalsNeedTodaySummary | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty' | 'timeout'>(
    'loading',
  );

  useEffect(() => {
    if (!open) return;
    setPhase('loading');
    setSummary(null);
    let cancelled = false;
    const timeoutHandle = window.setTimeout(() => {
      if (cancelled) return;
      setPhase(p => (p === 'loading' ? 'timeout' : p));
    }, LOAD_TIMEOUT_MS);

    void loadGoalsNeedToday().then(result => {
      if (cancelled) return;
      window.clearTimeout(timeoutHandle);
      if (result.entries.length === 0) {
        setPhase('empty');
        return;
      }
      setSummary(result);
      setPhase('ready');
    }).catch(() => {
      if (cancelled) return;
      window.clearTimeout(timeoutHandle);
      setPhase('timeout');
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutHandle);
    };
  }, [open]);

  // Fallback paths: empty (no active weekly coverage goals) or
  // timeout collapse back to the questionnaire so the user is never
  // trapped on a skeleton.
  useEffect(() => {
    if (!open) return;
    if (phase === 'empty' || phase === 'timeout') onClose();
  }, [open, phase, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="What your goals need today"
      className="fixed inset-0 z-[140] flex flex-col bg-white dark:bg-neutral-950"
    >
      <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          What your goals need today
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-fluent"
          aria-label="Skip and pick a time"
        >
          skip
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-xl mx-auto w-full">
        {phase === 'loading' && <SkeletonRows />}
        {phase === 'ready' && summary && (
          <ReadyContent
            summary={summary}
            hasEarlierSessionsToday={hasEarlierSessionsToday}
            onFullSession={onFullSession}
            onCustomize={onCustomize}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function ReadyContent({
  summary,
  hasEarlierSessionsToday,
  onFullSession,
  onCustomize,
  onClose,
}: {
  summary: GoalsNeedTodaySummary;
  hasEarlierSessionsToday: boolean;
  onFullSession: (minutes: number) => void;
  onCustomize: (minutes: number) => void;
  onClose: () => void;
}) {
  const total = summary.totalMinutes;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-4 py-3">
        <ul className="flex flex-col gap-2" data-testid="daily-need-rows">
          {summary.entries.map(entry => (
            <EntryRow key={entry.moduleId} entry={entry} />
          ))}
        </ul>
        <hr className="my-2 border-neutral-200 dark:border-neutral-800" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Your goals need
          </span>
          <span className="font-mono tabular-nums text-sm font-medium text-neutral-800 dark:text-neutral-100">
            ~{total} min today
          </span>
        </div>
      </section>

      {summary.showConsistencyNudge && (
        <ConsistencyNudge />
      )}

      <button
        type="button"
        onClick={() => onFullSession(total)}
        className="w-full px-4 py-3 rounded-md bg-fluent text-white text-base font-medium hover:opacity-90"
      >
        Full session — {total} min
      </button>

      <button
        type="button"
        onClick={() => onCustomize(total)}
        className="w-full px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
      >
        Customize…
      </button>

      {hasEarlierSessionsToday && (
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
            Multi-session day
          </div>
          <p className="text-sm text-neutral-700 dark:text-neutral-200 mb-2">
            Split across contexts so you don't have to fit everything into one block.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-fluent hover:underline"
          >
            Keyboard now → Phone midday → Keyboard later
          </button>
          <p className="text-[11px] text-neutral-500 mt-1">
            Picks up the day planner in the questionnaire — open it to set
            this session's role.
          </p>
        </section>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Per-row + pace pill
// -------------------------------------------------------------------

function EntryRow({ entry }: { entry: GoalsNeedTodayEntry }) {
  const meta = moduleMetaById(entry.moduleId);
  const accent = meta?.accentHex ?? '#4a9088';
  const label = meta?.label ?? entry.moduleId;
  // Plain-English breakdown for active rows — today's-slice attempts
  // and the per-attempt seed. "20 attempts × 30s each" reads as the
  // session's recommended HF reps at the current seed.
  const breakdown = !entry.isTargetMet && entry.attemptsToday > 0
    ? `${entry.attemptsToday} attempt${
        entry.attemptsToday === 1 ? '' : 's'
      } × ${Math.round(entry.perAttemptSeconds)}s each`
    : null;
  return (
    <li
      data-testid={`row-${entry.moduleId}`}
      className="flex items-start justify-between gap-3"
    >
      <span className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full mt-1.5"
          style={{ backgroundColor: accent }}
        />
        <span className="flex flex-col">
          <span className="flex items-center gap-2 flex-wrap">
            <span>{label}</span>
            {!entry.isTargetMet && <PacePill pace={entry.pace} />}
          </span>
          {breakdown && (
            <span className="text-[11px] text-neutral-500 font-mono">
              {breakdown}
            </span>
          )}
          {entry.isTargetMet && (
            <span className="text-[11px] text-fluent">
              weekly target met — over-practice
            </span>
          )}
        </span>
      </span>
      <span className="font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200 shrink-0">
        {entry.isTargetMet ? '✓' : `~${entry.minutes} min`}
      </span>
    </li>
  );
}

/** Color convention mirrors BehindPaceBanner (amber for behind) and
 *  the rest of the app's "fluent = positive / good" cue. */
const PACE_PILL_CLASS: Record<WeeklyPace, string> = {
  'ahead':
    'bg-fluent/15 text-fluent border-fluent/30',
  'on-pace':
    'bg-neutral-100 text-neutral-600 border-neutral-200 '
    + 'dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
  'behind':
    'bg-amber-100 text-amber-800 border-amber-300 '
    + 'dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
};

const PACE_LABEL: Record<WeeklyPace, string> = {
  'ahead':   'ahead',
  'on-pace': 'on pace',
  'behind':  'behind',
};

function PacePill({ pace }: { pace: WeeklyPace }) {
  return (
    <span
      data-testid={`pace-${pace}`}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium border ${PACE_PILL_CLASS[pace]}`}
    >
      {PACE_LABEL[pace]}
    </span>
  );
}

// -------------------------------------------------------------------
// Practice Consistency nudge (design-doc §"Practice Consistency —
// Special Case"). Distinct from per-module rows: PC never gets a time
// slice, it's the cadence framework that holds the other modules
// together. Surface as a one-line reminder when the user hasn't
// practiced today.
// -------------------------------------------------------------------

function ConsistencyNudge() {
  return (
    <section
      data-testid="consistency-nudge"
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-4 py-2 flex items-baseline gap-2"
    >
      <span className="text-xs uppercase tracking-wide text-neutral-500 shrink-0">
        Practice consistency
      </span>
      <span className="text-sm text-neutral-700 dark:text-neutral-200">
        Today's session hasn't started yet — keeping the streak alive.
      </span>
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3 space-y-2">
        <div className="h-3 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
        <div className="h-3 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded" />
        <div className="h-3 w-3/4 bg-neutral-200 dark:bg-neutral-800 rounded" />
      </div>
      <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded" />
    </div>
  );
}
