import { useEffect, useState } from 'react';
import { moduleMetaById } from '../../lib/moduleMeta';
import { loadDailyGoalNeed, type DailyNeed } from './dailyGoalNeed';

/**
 * "What your goals need today" screen — the new first surface in
 * the session-start flow. Replaces the questionnaire-as-first-screen
 * with a goal-aware introduction:
 *
 *   · Per-module daily need rows (Shapes 15 min, Repertoire 45 min,
 *     etc.) computed from the user's active monthly goals.
 *   · "Full session — X min" CTA that bypasses the questionnaire
 *     entirely — proceeds straight to proposal generation with
 *     balanced intent + the full time. The user's saved context +
 *     day plan from prior sessions still apply.
 *   · "Customize" secondary action opens the questionnaire for
 *     users who want to override intent / context / day plan.
 *   · "Split across contexts" affordance when the user has already
 *     practiced today (signaled by hasEarlierSessionsToday).
 *
 * Behavior contracts:
 *   · `onFullSession(minutes)` fires when the user taps Full session.
 *     Parent skips the questionnaire and runs buildSessionPlan with
 *     the prefilled context/dayPlan + balanced intent.
 *   · `onCustomize(minutes)` opens the questionnaire pre-seeded
 *     with the full daily-need total. The user is explicitly asking
 *     for control over intent / context / day plan, but the
 *     goal-aware time figure is still the most useful default —
 *     surfaced as a named "Full session" pill in Q1.
 *   · `onClose()` fires on the header skip, on the timeout fallback,
 *     and on empty-goals — parent opens the questionnaire so the
 *     user is never trapped.
 *   · Caller is responsible for not opening this screen when the
 *     user has zero active goals — the wrapper falls back to the
 *     questionnaire directly. Loading null also falls through.
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
  const [need, setNeed] = useState<DailyNeed | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty' | 'timeout'>(
    'loading',
  );

  useEffect(() => {
    if (!open) return;
    setPhase('loading');
    setNeed(null);
    let cancelled = false;
    const timeoutHandle = window.setTimeout(() => {
      if (cancelled) return;
      setPhase(p => (p === 'loading' ? 'timeout' : p));
    }, LOAD_TIMEOUT_MS);

    void loadDailyGoalNeed().then(result => {
      if (cancelled) return;
      window.clearTimeout(timeoutHandle);
      if (!result) {
        setPhase('empty');
        return;
      }
      setNeed(result);
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

  // Fallback paths: empty (no active goals) or timeout collapse
  // back to the questionnaire so the user is never trapped on a
  // skeleton.
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
        {phase === 'ready' && need && (
          <ReadyContent
            need={need}
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
  need,
  hasEarlierSessionsToday,
  onFullSession,
  onCustomize,
  onClose,
}: {
  need: DailyNeed;
  hasEarlierSessionsToday: boolean;
  onFullSession: (minutes: number) => void;
  onCustomize: (minutes: number) => void;
  onClose: () => void;
}) {
  const total = need.totalMinutes;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-4 py-3">
        <ul className="flex flex-col gap-2" data-testid="daily-need-rows">
          {need.entries.map(entry => {
            const meta = moduleMetaById(entry.moduleId);
            const accent = meta?.accentHex ?? '#4a9088';
            const label = meta?.label ?? entry.moduleId;
            const overPractice = entry.phaseB?.isOverPractice ?? false;
            // Phase B entries (HF / ET) get a plain-English
            // breakdown: "65 attempts × 30s each". Legacy-estimated
            // modules show the minutes line alone.
            const breakdown = entry.phaseB && !overPractice
              ? `${entry.phaseB.attemptsToday} attempt${
                  entry.phaseB.attemptsToday === 1 ? '' : 's'
                } × ${Math.round(entry.phaseB.timePerAttemptSeconds)}s each`
              : null;
            return (
              <li
                key={entry.moduleId}
                className="flex items-start justify-between gap-3"
              >
                <span className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full mt-1.5"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="flex flex-col">
                    <span>{label}</span>
                    {breakdown && (
                      <span className="text-[11px] text-neutral-500 font-mono">
                        {breakdown}
                      </span>
                    )}
                    {overPractice && (
                      <span className="text-[11px] text-fluent">
                        weekly target met — over-practice
                      </span>
                    )}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200 shrink-0">
                  {overPractice ? '✓' : `~${entry.dailyMinutes} min`}
                </span>
              </li>
            );
          })}
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
