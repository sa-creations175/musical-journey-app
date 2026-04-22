import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import {
  computeDayStreak,
  computeHotStreak,
  localDayKey,
  nextLocalMidnight,
  startOfLocalDay,
} from '../lib/dailyGoal';
import {
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  dailyGoalKey,
  defaultDailyGoal,
  isValidGoal,
} from '../lib/goalConfig';
import { getPref, setPref } from '../lib/userPrefs';
import { updateDailySummary } from '../lib/dailySummaries';

interface Props {
  moduleId: string;
}

export default function DailyGoalBar({ moduleId }: Props) {
  const [todayKey, setTodayKey] = useState(localDayKey());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [justHit, setJustHit] = useState(false);
  const wasMetRef = useRef<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-tick at the next local midnight so daily counts roll cleanly.
  useEffect(() => {
    const ms = nextLocalMidnight() - Date.now() + 250;
    const id = window.setTimeout(() => setTodayKey(localDayKey()), Math.max(1000, ms));
    return () => window.clearTimeout(id);
  }, [todayKey]);

  const goal = useLiveQuery(
    async () => getPref<number>(dailyGoalKey(moduleId), defaultDailyGoal(moduleId)),
    [moduleId],
  ) ?? defaultDailyGoal(moduleId);

  const moduleAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(moduleId).toArray(),
    [moduleId],
  ) ?? [];

  // Today's attempts bound the displayed header + progress bar. Counts
  // roll automatically at local midnight via the todayKey re-tick above;
  // no manual reset is offered.
  const cutoff = startOfLocalDay();
  const session = moduleAttempts.filter(a => a.timestamp >= cutoff);
  const attempted = session.length;
  const correct = session.filter(a => a.correct).length;
  const wrong = attempted - correct;
  const accuracy = attempted === 0 ? 0 : Math.round((correct / attempted) * 100);

  const dayStreak = computeDayStreak(moduleAttempts, goal, todayKey);
  const hot = computeHotStreak(moduleAttempts);

  const goalMet = attempted >= goal;
  const overshoot = Math.max(0, attempted - goal);

  // Fire a one-shot glow animation the moment the user crosses the goal.
  // wasMetRef starts null so the initial render doesn't celebrate a
  // previously-met goal on page load.
  useEffect(() => {
    if (wasMetRef.current === null) {
      wasMetRef.current = goalMet;
      return;
    }
    if (!wasMetRef.current && goalMet) {
      setJustHit(true);
      const t = window.setTimeout(() => setJustHit(false), 1200);
      wasMetRef.current = goalMet;
      return () => window.clearTimeout(t);
    }
    wasMetRef.current = goalMet;
  }, [goalMet]);

  // Fill ratio of the whole bar (capped at 100%); within that, split
  // correct vs wrong by their share of attempted. Simplifies to
  // correct/goal and wrong/goal before the goal is hit, then recalculates
  // against total attempts after — so overshoot makes the green grow and
  // the amber shrink as the user answers more correctly. This accuracy
  // recalculation is the motivational core of the bar.
  const filledPct = goal === 0 ? 100 : Math.min(100, (attempted / goal) * 100);
  const correctPct = attempted === 0 ? 0 : filledPct * (correct / attempted);
  const wrongPct = attempted === 0 ? 0 : filledPct * (wrong / attempted);

  const openEditor = () => {
    setDraft(String(goal));
    setInvalid(false);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setInvalid(false);
  };

  const saveEdit = async () => {
    const n = Number(draft.trim());
    if (!isValidGoal(n)) {
      setInvalid(true);
      return;
    }
    await setPref(dailyGoalKey(moduleId), n);
    await updateDailySummary(moduleId);
    setEditing(false);
    setInvalid(false);
  };

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur p-4">
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 mb-2.5 text-sm">
        {/* Left cluster: today / correct / wrong / accuracy */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-neutral-500">Today:</span>
            <span className="font-medium font-mono tabular-nums">{attempted}</span>
            <span className="text-neutral-400">/</span>
            {editing ? (
              <form
                onSubmit={e => { e.preventDefault(); saveEdit(); }}
                className="inline-flex items-center gap-1"
              >
                <input
                  ref={inputRef}
                  type="number"
                  min={MIN_DAILY_GOAL}
                  max={MAX_DAILY_GOAL}
                  step={1}
                  value={draft}
                  onChange={e => { setDraft(e.target.value); setInvalid(false); }}
                  onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } }}
                  aria-invalid={invalid}
                  className={`w-16 px-1.5 py-0.5 rounded border font-mono text-sm bg-white dark:bg-neutral-900 focus:outline-none ${
                    invalid
                      ? 'border-needswork text-needswork'
                      : 'border-neutral-300 dark:border-neutral-700 focus:border-fluent'
                  }`}
                />
                <button type="submit" aria-label="save goal" className="text-fluent hover:opacity-80">✓</button>
                <button type="button" onClick={cancelEdit} aria-label="cancel" className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">×</button>
              </form>
            ) : (
              <button
                type="button"
                onClick={openEditor}
                className="font-mono tabular-nums hover:text-fluent transition-colors"
                title="click to edit daily goal"
              >
                {goal}
              </button>
            )}
          </span>

          <span
            className="inline-flex items-center gap-1 text-fluent"
            title="correct today"
          >
            <span aria-hidden>✓</span>
            <span className="font-mono tabular-nums">{correct}</span>
          </span>

          <span
            className="inline-flex items-center gap-1 text-developing"
            title="wrong today"
          >
            <span aria-hidden>✗</span>
            <span className="font-mono tabular-nums">{wrong}</span>
          </span>

          <span
            className="text-neutral-500 font-mono tabular-nums"
            title="accuracy today"
          >
            {attempted === 0 ? '—' : `${accuracy}%`}
          </span>

          {goalMet && !editing && (
            <span
              className="inline-flex items-center gap-1 text-fluent"
              aria-label={`goal met${overshoot > 0 ? ` with +${overshoot} extra` : ''}`}
            >
              <span aria-hidden>✓</span>
              {overshoot > 0 && (
                <span className="font-mono text-xs opacity-80">+{overshoot}</span>
              )}
            </span>
          )}
        </div>

        {/* Right cluster: streaks */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
          <span
            className="inline-flex items-center gap-1"
            title={`hot streak (longest: ${hot.best})`}
          >
            <span aria-hidden>🔥</span>
            <span className="font-mono tabular-nums font-medium">{hot.current}</span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="day streak — consecutive days the goal was met"
          >
            <span aria-hidden>📅</span>
            <span className="font-mono tabular-nums font-medium">{dayStreak}</span>
          </span>
        </div>
      </div>

      {/* Mixed-color progress bar — green (correct) + amber (wrong).
          Widths animate smoothly; a persistent subtle ring marks the
          goal-met state, and a brief shadow pulse fires the moment it's
          first crossed. */}
      <div
        className={`relative h-2.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex transition-shadow duration-500 ${
          goalMet ? 'ring-1 ring-fluent/40' : ''
        } ${justHit ? 'shadow-[0_0_0_3px_rgba(29,158,117,0.25)]' : ''}`}
      >
        <div
          className="h-full bg-fluent transition-[width] duration-300 ease-out"
          style={{ width: `${correctPct}%` }}
        />
        <div
          className="h-full bg-developing transition-[width] duration-300 ease-out"
          style={{ width: `${wrongPct}%` }}
        />
      </div>

      {invalid && (
        <p className="mt-2 text-xs text-needswork">
          daily goal must be an integer between {MIN_DAILY_GOAL} and {MAX_DAILY_GOAL}.
        </p>
      )}
    </section>
  );
}
