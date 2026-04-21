import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import {
  PREF_SESSION_RESET,
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
  const [showSessionCounts, setShowSessionCounts] = useState(false);
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

  const todaysCounts = useLiveQuery(async () => {
    const start = startOfLocalDay();
    const rows = await db.attempts
      .where('timestamp').aboveOrEqual(start)
      .and(a => a.moduleId === moduleId)
      .toArray();
    return {
      correct: rows.filter(a => a.correct).length,
      total: rows.length,
    };
  }, [todayKey, moduleId]) ?? { correct: 0, total: 0 };
  const todaysCorrect = todaysCounts.correct;
  const todaysAttempted = todaysCounts.total;

  const sessionResetAt = useLiveQuery(
    async () => getPref<number>(PREF_SESSION_RESET, 0),
    [],
  ) ?? 0;

  const sessionStats = (() => {
    const cutoff = Math.max(startOfLocalDay(), sessionResetAt);
    const session = moduleAttempts.filter(a => a.timestamp >= cutoff);
    const correctN = session.filter(a => a.correct).length;
    const wrong = session.length - correctN;
    const accuracy = session.length === 0 ? 0 : Math.round((correctN / session.length) * 100);
    return { correct: correctN, wrong, accuracy, total: session.length };
  })();

  const onResetCounter = async () => {
    await setPref(PREF_SESSION_RESET, Date.now());
  };

  const dayStreak = computeDayStreak(moduleAttempts, goal, todayKey);
  const hot = computeHotStreak(moduleAttempts);

  // Progress is attempts-based across every module. Wrong answers are
  // genuine learning moments and count toward the daily engagement goal
  // alongside correct ones — see also computeDayStreak / classifyDay.
  const pct = goal === 0 ? 100 : (todaysAttempted / goal) * 100;
  const goalMet = todaysAttempted >= goal;
  const overshoot = Math.max(0, todaysAttempted - goal);

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
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <div className="text-sm flex items-center gap-1.5 flex-wrap">
          <span className="text-neutral-500">today: </span>
          <span className="font-medium font-mono">{todaysAttempted}</span>
          <span className="text-neutral-500">attempted /</span>
          <span className="font-mono">{todaysCorrect}</span>
          <span className="text-neutral-500">correct</span>
          <span className="text-neutral-500">(goal:</span>
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
            <>
              <span className="font-mono">{goal}</span>
              <button
                onClick={openEditor}
                aria-label="edit daily goal"
                className="text-neutral-400 hover:text-fluent ml-0.5"
                title="edit daily goal"
              >
                ✎
              </button>
            </>
          )}
          <span className="text-neutral-500">)</span>
          {goalMet && !editing && (
            <span className="inline-flex items-center gap-1 text-fluent" aria-label="goal met">
              <span aria-hidden>✓</span>
              {overshoot > 0 && (
                <span className="font-mono text-xs opacity-80">+{overshoot}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span><span className="text-neutral-500">day streak </span><span className="font-mono font-medium">{dayStreak}</span></span>
          <span><span className="text-neutral-500">hot streak </span><span className="font-mono font-medium">{hot.current}</span></span>
          <span><span className="text-neutral-500">best </span><span className="font-mono font-medium">{hot.best}</span></span>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${goalMet ? 'bg-fluent' : 'bg-fluent/70'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {invalid && (
        <p className="mt-2 text-xs text-needswork">
          daily goal must be an integer between {MIN_DAILY_GOAL} and {MAX_DAILY_GOAL}.
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-neutral-200/70 dark:border-neutral-800/70 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowSessionCounts(v => !v)}
            aria-expanded={showSessionCounts}
            className="text-neutral-500 hover:text-fluent"
          >
            {showSessionCounts ? '▴ hide session counts' : '▸ show session counts'}
          </button>
          {showSessionCounts && (
            <button
              onClick={onResetCounter}
              className="text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
              title="reset displayed session counts (does not affect streaks or stored data)"
            >
              ↻ reset counter
            </button>
          )}
        </div>
        {showSessionCounts && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 px-3 py-2">
              <div className="text-neutral-500">attempted</div>
              <div className="text-lg font-medium">{sessionStats.total}</div>
            </div>
            <div className="rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 px-3 py-2">
              <div className="text-neutral-500">correct</div>
              <div className="text-lg font-medium text-fluent">{sessionStats.correct}</div>
            </div>
            <div className="rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 px-3 py-2">
              <div className="text-neutral-500">wrong</div>
              <div className="text-lg font-medium text-needswork">{sessionStats.wrong}</div>
            </div>
            <div className="rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 px-3 py-2">
              <div className="text-neutral-500">accuracy</div>
              <div className="text-lg font-medium">
                {sessionStats.total === 0 ? '—' : `${sessionStats.accuracy}%`}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
