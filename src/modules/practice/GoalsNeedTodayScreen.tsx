import { useEffect, useState } from 'react';
import { moduleMetaById } from '../../lib/moduleMeta';
import { TIME_PRESETS_MIN } from './inputs';
import { loadDailyGoalNeed, type DailyNeed } from './dailyGoalNeed';

/**
 * "What your goals need today" screen — the new first surface in
 * the session-start flow. Replaces the questionnaire-as-first-screen
 * with a goal-aware introduction:
 *
 *   · Per-module daily need rows (Shapes 15 min, Repertoire 45 min,
 *     etc.) computed from the user's active monthly goals.
 *   · "Full session — X min" CTA equal to the sum across modules.
 *   · Standard preset slots (15 / 30 / 45 / 60 / Custom) below as
 *     alternatives — picking one proceeds to the questionnaire
 *     with that time pre-filled.
 *   · "Split across contexts" affordance when the user has already
 *     practiced today (signaled by hasEarlierSessionsToday).
 *
 * Behavior contracts:
 *   · `onPick(minutes)` fires once the user commits to a time. The
 *     parent threads this through to the existing questionnaire's
 *     `initialTimeMinutes` so the proposal screen sees the same
 *     value it would have received from the questionnaire's own
 *     time picker.
 *   · `onSkipToQuestionnaire()` fires when the user wants to skip
 *     past this screen (e.g. the "Split across contexts" path opens
 *     the questionnaire directly to handle the multi-session
 *     planning) OR when the loading takes too long (2s fallback).
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
  onPick: (minutes: number) => void;
  onClose: () => void;
}

const LOAD_TIMEOUT_MS = 2000;

export default function GoalsNeedTodayScreen({
  open,
  hasEarlierSessionsToday,
  onPick,
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
            onPick={onPick}
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
  onPick,
  onClose,
}: {
  need: DailyNeed;
  hasEarlierSessionsToday: boolean;
  onPick: (minutes: number) => void;
  onClose: () => void;
}) {
  const total = need.totalMinutes;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-4 py-3">
        <ul className="flex flex-col gap-1.5" data-testid="daily-need-rows">
          {need.entries.map(entry => {
            const meta = moduleMetaById(entry.moduleId);
            const accent = meta?.accentHex ?? '#4a9088';
            const label = meta?.label ?? entry.moduleId;
            return (
              <li
                key={entry.moduleId}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  {label}
                </span>
                <span className="font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200">
                  {entry.dailyMinutes} min
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
        onClick={() => onPick(total)}
        className="w-full px-4 py-3 rounded-md bg-fluent text-white text-base font-medium hover:opacity-90"
      >
        Full session — {total} min
      </button>

      <section className="flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          Or pick a different length
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TIME_PRESETS_MIN.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onPick(n)}
              className="px-3 py-1.5 rounded-md text-sm font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
            >
              {n} min
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
          >
            custom…
          </button>
        </div>
      </section>

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
