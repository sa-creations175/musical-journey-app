import { db } from '../../../lib/db';
import { localDayKey } from '../../../lib/dailyGoal';
import type { GoalFlowModuleId } from '../goalVocabulary';

/**
 * Phase 2 step 6c — live daily-activity helper for the goal-row
 * activity chart.
 *
 * Returns a per-day count for the goal's module within the given
 * range. Card modules (Ear Training, Harmonic Fluency) count
 * cards reviewed; time modules (Shapes, Songs, Production) sum
 * minutes practised. The caller bins this daily series into the
 * chart shape that matches the goal's scope:
 *
 *   weekly  → 7 daily values (Mon–Sun)
 *   monthly → one value per day in the month
 *   yearly  → 12 monthly totals
 *
 * Per-module data sources:
 *
 *   ear-training         dailySummaries filtered to ET sub-quizzes
 *                        (intervals, chord-recognition,
 *                        chord-progressions, scales-modes)
 *   harmonic-fluency     dailySummaries filtered to harmonic-fluency
 *   shapes-and-patterns  drillSessions, sum durationSeconds → min
 *   repertoire           songPracticeLog, sum durationMin
 *   production           productionLessonSessions, sum durationSeconds → min
 *   practice-consistency no chart yet — returns []
 *
 * Production sessions have an OPTIONAL durationSeconds field
 * ("UI tracks when user closes lesson"). Sessions without it
 * contribute zero — defensive nullable handling.
 */

export interface DailyActivityPoint {
  /** YYYY-MM-DD in the user's local timezone. */
  date: string;
  /** Cards reviewed (card modules) or minutes practised (time
   *  modules). Always rounded to an integer. */
  count: number;
}

export interface DateRangeMs {
  /** Start of range, inclusive (epoch ms). */
  startMs: number;
  /** End of range, exclusive (epoch ms) — typically the next-day
   *  boundary so `endMs - startMs` covers a whole window. */
  endMs: number;
}

const ET_SUB_MODULE_IDS = [
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
] as const;

/**
 * Returns the canonical activity unit for a goal module, used
 * by the chart label / aria text. Card modules report "cards",
 * time modules report "minutes".
 */
export function activityUnitForModule(
  moduleId: GoalFlowModuleId,
): 'cards' | 'minutes' {
  if (moduleId === 'ear-training' || moduleId === 'harmonic-fluency') {
    return 'cards';
  }
  return 'minutes';
}

/**
 * Daily activity series for a goal's module across the given
 * range. Returns an empty array for `practice-consistency`
 * (cross-module meta-habit, no single source).
 */
export async function getDailyActivity(
  moduleId: GoalFlowModuleId,
  range: DateRangeMs,
): Promise<DailyActivityPoint[]> {
  switch (moduleId) {
    case 'ear-training':
      return await fromDailySummaries([...ET_SUB_MODULE_IDS], range);
    case 'harmonic-fluency':
      return await fromDailySummaries(['harmonic-fluency'], range);
    case 'shapes-and-patterns':
      return await fromTimestampedRows(
        () => db.drillSessions.toArray(),
        r => r.timestamp,
        r => r.durationSeconds / 60,
        range,
      );
    case 'repertoire':
      return await fromTimestampedRows(
        () => db.songPracticeLog.toArray(),
        r => r.timestamp,
        r => r.durationMin,
        range,
      );
    case 'production':
      return await fromTimestampedRows(
        () => db.productionLessonSessions.toArray(),
        r => r.timestamp,
        r => (r.durationSeconds ?? 0) / 60,
        range,
      );
    case 'practice-consistency':
      return [];
  }
}

// ───── per-module fetch helpers ────────────────────────────────

/**
 * Aggregate dailySummaries rows for the given moduleIds across
 * the range. The table already pre-aggregates `correctCount +
 * wrongCount` per (date, moduleId) so the helper just sums
 * across moduleIds for each calendar day.
 */
async function fromDailySummaries(
  moduleIds: string[],
  range: DateRangeMs,
): Promise<DailyActivityPoint[]> {
  const rows = await db.dailySummaries
    .where('moduleId')
    .anyOf(moduleIds)
    .toArray();

  const startKey = localDayKey(new Date(range.startMs));
  const endKey = localDayKey(new Date(range.endMs - 1));

  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r.date < startKey || r.date > endKey) continue;
    const total = r.correctCount + r.wrongCount;
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + total);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, count]) => ({ date, count }));
}

/**
 * Generic timestamp-and-duration aggregator for time modules.
 * Filters rows to the range, bins by local-day key, sums the
 * extracted duration, then rounds to an integer for clean
 * display. The full-table fetch is fine at the data scales we
 * deal with; if a module's history grows large later, swap to a
 * Dexie indexed-range query.
 */
async function fromTimestampedRows<T>(
  fetch: () => Promise<T[]>,
  getTs: (row: T) => number,
  getDurationMin: (row: T) => number,
  range: DateRangeMs,
): Promise<DailyActivityPoint[]> {
  const rows = await fetch();
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const ts = getTs(r);
    if (ts < range.startMs || ts >= range.endMs) continue;
    const key = localDayKey(new Date(ts));
    const min = getDurationMin(r);
    if (min <= 0 || !Number.isFinite(min)) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + min);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, mins]) => ({ date, count: Math.round(mins) }));
}

// ───── binning helpers (chart-shape adapters) ──────────────────

/**
 * Bin a daily series into a 7-element values array indexed Mon
 * (0) → Sun (6). Days outside the week return 0.
 */
export function binToWeek(
  daily: DailyActivityPoint[],
  weekStart: Date,
): number[] {
  const out = new Array(7).fill(0) as number[];
  const map = new Map(daily.map(p => [p.date, p.count]));
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    out[i] = map.get(localDayKey(d)) ?? 0;
  }
  return out;
}

/**
 * Bin a daily series into one entry per day in the displayed
 * month, in calendar order (day 1 → end of month). Each entry
 * carries its Date so the dot grid can compute future-fade.
 */
export function binToMonth(
  daily: DailyActivityPoint[],
  year: number,
  month: number,
): { date: Date; count: number }[] {
  const map = new Map(daily.map(p => [p.date, p.count]));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: { date: Date; count: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    out.push({ date: d, count: map.get(localDayKey(d)) ?? 0 });
  }
  return out;
}

/**
 * Bin a daily series into 12 monthly totals indexed Jan (0) →
 * Dec (11). Months outside the year contribute nothing.
 */
export function binToYear(
  daily: DailyActivityPoint[],
  year: number,
): number[] {
  const out = new Array(12).fill(0) as number[];
  for (const p of daily) {
    const [y, m] = p.date.split('-').map(Number);
    if (y !== year) continue;
    if (m < 1 || m > 12) continue;
    out[m - 1] += p.count;
  }
  return out;
}

// ───── range builders ──────────────────────────────────────────

/** Monday of the week containing `today` at 00:00 local. */
export function mondayOf(today: Date): Date {
  const out = new Date(today);
  out.setHours(0, 0, 0, 0);
  const offset = (out.getDay() + 6) % 7; // 0 = Sun in JS
  out.setDate(out.getDate() - offset);
  return out;
}

/** Range covering the 7 days starting at the Monday of `today`. */
export function weeklyRange(today: Date): DateRangeMs {
  const start = mondayOf(today);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function monthlyRange(today: Date): DateRangeMs {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function yearlyRange(today: Date): DateRangeMs {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear() + 1, 0, 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}
