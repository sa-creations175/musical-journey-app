import { useMemo } from 'react';
import type { SongPracticeLog } from '../../lib/db';
import { localDayKey } from '../../lib/dailyGoal';

interface Props {
  logs: SongPracticeLog[];
  /** Days of history to render. Default 91 (~13 weeks). */
  days?: number;
}

/**
 * Compact per-song heatmap. 7-row × N-column grid where each cell is
 * one day; intensity scales with total practice minutes that day.
 *
 * Kept local to Repertoire rather than reusing PracticeCalendar because
 * PracticeCalendar reads from the `dailySummaries` table (module-level
 * attempts), whereas this reads directly from `songPracticeLog`
 * entries for a specific song.
 */
export default function SongHeatmap({ logs, days = 91 }: Props) {
  const { columns, total } = useMemo(() => {
    // Bucket logs by local day key.
    const minutesByDay = new Map<string, number>();
    for (const l of logs) {
      const d = localDayKey(new Date(l.timestamp));
      minutesByDay.set(d, (minutesByDay.get(d) ?? 0) + (l.durationMin || 0));
    }

    // Walk back `days` days from today, grouping into weeks (Sunday-
    // based columns to match most app conventions).
    const today = new Date();
    const cells: Array<{ key: string; minutes: number; date: Date }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = localDayKey(d);
      cells.push({ key, minutes: minutesByDay.get(key) ?? 0, date: d });
    }

    // Pad at the start so the first column begins on Sunday.
    const firstDow = cells[0].date.getDay(); // 0 = Sun
    const leading: Array<{ key: string; minutes: number; date: Date } | null> = [];
    for (let i = 0; i < firstDow; i++) leading.push(null);

    const all: Array<typeof cells[number] | null> = [...leading, ...cells];
    const columns: Array<Array<typeof cells[number] | null>> = [];
    for (let i = 0; i < all.length; i += 7) columns.push(all.slice(i, i + 7));

    const total = cells.reduce((s, c) => s + c.minutes, 0);
    return { columns, total };
  }, [logs, days]);

  // Intensity bins: 0, 1–14m, 15–29m, 30–59m, 60m+
  const intensityClass = (minutes: number): string => {
    if (minutes <= 0) return 'bg-neutral-100 dark:bg-neutral-800';
    if (minutes < 15) return 'bg-fluent/20';
    if (minutes < 30) return 'bg-fluent/40';
    if (minutes < 60) return 'bg-fluent/70';
    return 'bg-fluent';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          last {days} days
        </div>
        <div className="text-[11px] text-neutral-500">
          <span className="font-mono tabular-nums">{total}</span> total minutes
        </div>
      </div>
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell, ri) => (
              <div
                key={ri}
                className={`w-3 h-3 rounded-sm ${cell ? intensityClass(cell.minutes) : 'bg-transparent'}`}
                title={cell
                  ? `${cell.key} · ${cell.minutes} min${cell.minutes === 1 ? '' : 's'}`
                  : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
        <span>less</span>
        <span className="w-3 h-3 rounded-sm bg-neutral-100 dark:bg-neutral-800" aria-hidden />
        <span className="w-3 h-3 rounded-sm bg-fluent/20" aria-hidden />
        <span className="w-3 h-3 rounded-sm bg-fluent/40" aria-hidden />
        <span className="w-3 h-3 rounded-sm bg-fluent/70" aria-hidden />
        <span className="w-3 h-3 rounded-sm bg-fluent" aria-hidden />
        <span>more</span>
      </div>
    </div>
  );
}
