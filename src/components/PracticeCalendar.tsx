import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DailySummary } from '../lib/db';
import { localDayKey } from '../lib/dailyGoal';
import {
  DAY_CLASS_LABEL,
  DAY_CLASS_ORDER,
  DAY_CLASS_STYLE,
  PRACTICE_DAY_MIN_ATTEMPTS,
  classifyDay,
  type DayClass,
} from '../lib/dayClassification';

interface Props {
  moduleId: string;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function dayKey(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatLongDate(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Reusable monthly practice calendar. Reads the moduleId's dailySummaries
// via useLiveQuery, classifies each day, and renders a navigable grid.
// Identical markup + behavior for any future module.
export default function PracticeCalendar({ moduleId }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState<number>(() => now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => now.getMonth());
  const todayKey = localDayKey();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  const summaries = useLiveQuery(
    () => db.dailySummaries.where('moduleId').equals(moduleId).toArray(),
    [moduleId],
  ) ?? [];

  const summariesByDate = useMemo(() => {
    const m = new Map<string, DailySummary>();
    for (const s of summaries) m.set(s.date, s);
    return m;
  }, [summaries]);

  const earliest = useMemo(() => {
    if (summaries.length === 0) return null;
    let min = summaries[0].date;
    for (const s of summaries) if (s.date < min) min = s.date;
    return min;
  }, [summaries]);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;

  const earliestMonthNumber = useMemo(() => {
    if (!earliest) return currentYear * 12 + currentMonth;
    const [y, m] = earliest.split('-').map(Number);
    return y * 12 + (m - 1);
  }, [earliest, currentYear, currentMonth]);

  const viewMonthNumber = viewYear * 12 + viewMonth;
  const isEarliestMonth = viewMonthNumber <= earliestMonthNumber;

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const firstWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: dayKey(viewYear, viewMonth, d) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstOfMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const goPrev = () => {
    if (isEarliestMonth) return;
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    setViewYear(currentYear);
    setViewMonth(currentMonth);
    setSelectedDate(todayKey);
  };

  const selectedSummary = summariesByDate.get(selectedDate);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            disabled={isEarliestMonth}
            aria-label="previous month"
            title={isEarliestMonth ? 'earliest data shown' : 'previous month'}
            className="w-8 h-8 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-40 disabled:hover:border-neutral-200 dark:disabled:hover:border-neutral-700 disabled:hover:text-inherit disabled:cursor-not-allowed"
          >
            ←
          </button>
          <div className="px-3 text-sm font-medium tabular-nums min-w-[140px] text-center">
            {monthLabel}
          </div>
          <button
            onClick={goNext}
            disabled={isCurrentMonth}
            aria-label="next month"
            title={isCurrentMonth ? 'no future data to display' : 'next month'}
            className="w-8 h-8 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-40 disabled:hover:border-neutral-200 dark:disabled:hover:border-neutral-700 disabled:hover:text-inherit disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            onClick={goToday}
            className="text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
          >
            today
          </button>
        )}
      </header>

      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-neutral-400 text-center">
        {WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} aria-hidden className="aspect-square" />;
          const summary = summariesByDate.get(cell.date);
          const isFuture = cell.date > todayKey;
          const classification: DayClass = isFuture ? 'empty' : classifyDay(summary);
          const isToday = cell.date === todayKey;
          const isSelected = cell.date === selectedDate;
          const disabled = isFuture;
          const cellClasses = [
            'relative aspect-square rounded-md flex items-start justify-start px-1.5 py-1 text-xs transition appearance-none border-0',
            disabled ? 'opacity-40 cursor-default' : 'hover:brightness-110 cursor-pointer',
            isToday ? 'ring-2 ring-info' : '',
            isSelected && !isToday ? 'ring-2 ring-neutral-400 dark:ring-neutral-500' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={cell.date}
              onClick={disabled ? undefined : () => setSelectedDate(cell.date)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${formatLongDate(cell.date)} — ${DAY_CLASS_LABEL[classification]}`}
              title={formatLongDate(cell.date)}
              className={cellClasses}
              style={DAY_CLASS_STYLE[classification]}
            >
              <span className="font-mono tabular-nums">{cell.day}</span>
              {classification === 'belowThreshold' && (
                <span aria-hidden className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-neutral-400" />
              )}
              {classification === 'goalCrushed' && (
                <span aria-hidden className="absolute bottom-0.5 right-1 text-[10px] leading-none">★</span>
              )}
            </button>
          );
        })}
      </div>

      <DayDetail dateKey={selectedDate} todayKey={todayKey} summary={selectedSummary} />

      <Legend />
    </div>
  );
}

interface DayDetailProps {
  dateKey: string;
  todayKey: string;
  summary: DailySummary | undefined;
}

function DayDetail({ dateKey, todayKey, summary }: DayDetailProps) {
  const attempts = summary ? summary.correctCount + summary.wrongCount : 0;
  const isFuture = dateKey > todayKey;
  const classification = classifyDay(summary);
  const dateLabel = formatLongDate(dateKey);
  const accuracy = summary && attempts > 0
    ? Math.round((summary.correctCount / attempts) * 100)
    : 0;

  let body: React.ReactNode;
  if (isFuture) {
    body = <p className="text-neutral-500">future date — nothing to show yet.</p>;
  } else if (classification === 'empty') {
    body = <p className="text-neutral-500">no practice this day.</p>;
  } else if (classification === 'belowThreshold') {
    body = (
      <p className="text-neutral-500">
        {attempts} attempts — didn't reach the {PRACTICE_DAY_MIN_ATTEMPTS}-attempt minimum for a practice day.
      </p>
    );
  } else if (summary) {
    // Goal is attempts-based — wrong answers count toward it just like
    // correct ones (see DailyGoalBar / classifyDay).
    const goalReached = attempts >= summary.dailyGoal;
    body = (
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-mono">{attempts}</span>
          <span className="text-neutral-500"> attempts</span>
        </div>
        <div>
          <span className="font-mono">{summary.correctCount}</span>
          <span className="text-neutral-500"> correct · </span>
          <span className="font-mono">{accuracy}%</span>
          <span className="text-neutral-500"> accuracy</span>
        </div>
        <div>
          <span className={goalReached ? 'text-fluent font-medium' : 'text-neutral-500'}>
            {goalReached ? 'goal met' : 'below goal'}:
          </span>
          <span className="ml-1 font-mono">{attempts}/{summary.dailyGoal}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/[0.07] p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">{dateLabel}</div>
      {body}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-neutral-500 pt-1">
      {DAY_CLASS_ORDER.map(cls => (
        <div key={cls} className="inline-flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded border border-black/10 dark:border-white/10"
            style={{ backgroundColor: DAY_CLASS_STYLE[cls].backgroundColor }}
            aria-hidden
          />
          <span>{DAY_CLASS_LABEL[cls]}</span>
        </div>
      ))}
    </div>
  );
}
