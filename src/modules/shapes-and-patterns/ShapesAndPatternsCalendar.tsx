import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSession } from '../../lib/db';
import { localDayKey } from '../../lib/dailyGoal';
import { formatDuration } from './drillModel';

const WEEKS = 26; // Roughly 6 months of history at the default zoom.

/**
 * Standalone calendar view for the Shapes & Patterns module. Shows a
 * heatmap of drill-minutes per day across recent weeks. Cells that
 * aren't in the visible window are drawn as empty placeholders so
 * columns stay Sunday-aligned.
 */
export default function ShapesAndPatternsCalendar() {
  const sessions = useLiveQuery<DrillSession[]>(
    () => db.drillSessions.toArray(),
    [],
  ) ?? [];

  const { columns, total, activeDays } = useMemo(() => {
    const minutesByDay = new Map<string, number>();
    for (const s of sessions) {
      const key = localDayKey(new Date(s.timestamp));
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + Math.round(s.durationSeconds / 60));
    }
    const today = new Date();
    const days = WEEKS * 7;
    const cells: Array<{ key: string; minutes: number; date: Date }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDayKey(d);
      cells.push({ key, minutes: minutesByDay.get(key) ?? 0, date: d });
    }
    const firstDow = cells[0].date.getDay();
    const leading: Array<(typeof cells)[number] | null> = [];
    for (let i = 0; i < firstDow; i++) leading.push(null);
    const all: Array<(typeof cells)[number] | null> = [...leading, ...cells];
    const columns: Array<Array<(typeof cells)[number] | null>> = [];
    for (let i = 0; i < all.length; i += 7) columns.push(all.slice(i, i + 7));
    const total = cells.reduce((s, c) => s + c.minutes, 0);
    const activeDays = cells.filter(c => c.minutes > 0).length;
    return { columns, total, activeDays };
  }, [sessions]);

  const intensity = (minutes: number): string => {
    if (minutes <= 0) return 'bg-neutral-100 dark:bg-neutral-800';
    if (minutes < 10) return 'bg-fluent/20';
    if (minutes < 25) return 'bg-fluent/40';
    if (minutes < 45) return 'bg-fluent/70';
    return 'bg-fluent';
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/shapes-and-patterns" className="text-xs text-neutral-500 hover:text-fluent">
          ← back to shapes &amp; patterns
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">shapes &amp; patterns · calendar</h1>
        <p className="text-neutral-500 text-sm">
          every day you ran at least one drill session lights up; darker cells = more minutes practised.
        </p>
      </div>

      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2 text-sm">
          <span className="text-neutral-500">last {WEEKS} weeks</span>
          <span>
            <span className="font-mono tabular-nums font-medium">{total}</span> total minutes
            <span className="text-neutral-400 mx-1.5">·</span>
            <span className="font-mono tabular-nums font-medium">{activeDays}</span> active day{activeDays === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px] min-w-max">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((cell, ri) => (
                  <div
                    key={ri}
                    className={`w-3.5 h-3.5 rounded-sm ${cell ? intensity(cell.minutes) : 'bg-transparent'}`}
                    title={cell
                      ? `${cell.key} · ${cell.minutes} min${cell.minutes === 1 ? '' : 's'}${cell.minutes === 0 ? ' (no drills)' : ''}`
                      : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span>less</span>
          <span className="w-3.5 h-3.5 rounded-sm bg-neutral-100 dark:bg-neutral-800" aria-hidden />
          <span className="w-3.5 h-3.5 rounded-sm bg-fluent/20" aria-hidden />
          <span className="w-3.5 h-3.5 rounded-sm bg-fluent/40" aria-hidden />
          <span className="w-3.5 h-3.5 rounded-sm bg-fluent/70" aria-hidden />
          <span className="w-3.5 h-3.5 rounded-sm bg-fluent" aria-hidden />
          <span>more</span>
        </div>
      </section>

      {sessions.length > 0 && (
        <RecentSessionsList sessions={sessions} />
      )}
    </div>
  );
}

function RecentSessionsList({ sessions }: { sessions: DrillSession[] }) {
  const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        most recent sessions
      </h2>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
        {sorted.map(s => (
          <div key={s.id} className="py-2 flex items-center gap-2 flex-wrap">
            <span className="text-neutral-500 tabular-nums">
              {new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-neutral-400">·</span>
            <span className="font-mono tabular-nums">{formatDuration(s.durationSeconds)}</span>
            {s.notes && (
              <>
                <span className="text-neutral-400">·</span>
                <span className="italic text-neutral-500 truncate">{s.notes}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
