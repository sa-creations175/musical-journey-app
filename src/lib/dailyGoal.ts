import type { AttemptRecord } from './db';

export const PREF_SESSION_RESET = 'session.resetTimestamp';

export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d: Date = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

export function nextLocalMidnight(d: Date = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d - 1));
}

export function daysBetween(olderKey: string, newerKey: string): number {
  const [y1, m1, d1] = olderKey.split('-').map(Number);
  const [y2, m2, d2] = newerKey.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Day streak — derived purely from attempt history.
// Walks back from today (or yesterday if today's goal not yet met) counting
// consecutive days where correct-count met the goal.
export function computeDayStreak(attempts: AttemptRecord[], goal: number, today: string = localDayKey()): number {
  const correctByDay = new Map<string, number>();
  for (const a of attempts) {
    if (!a.correct) continue;
    const key = localDayKey(new Date(a.timestamp));
    correctByDay.set(key, (correctByDay.get(key) ?? 0) + 1);
  }
  let cursor = today;
  if ((correctByDay.get(cursor) ?? 0) < goal) {
    // today not yet met — chain may still be alive from yesterday
    cursor = previousDayKey(cursor);
  }
  let streak = 0;
  while ((correctByDay.get(cursor) ?? 0) >= goal) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

// Hot streak — current = consecutive corrects ending at most-recent attempt;
// best = longest run ever observed across all attempts.
export interface HotStreakStats { current: number; best: number; }

export function computeHotStreak(attempts: AttemptRecord[]): HotStreakStats {
  const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp);
  let current = 0;
  let best = 0;
  for (const a of sorted) {
    if (a.correct) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return { current, best };
}

export function lastPracticedDaysAgo(attempts: AttemptRecord[], today: string = localDayKey()): number | null {
  if (attempts.length === 0) return null;
  let latest = -Infinity;
  for (const a of attempts) if (a.timestamp > latest) latest = a.timestamp;
  if (latest === -Infinity) return null;
  const latestKey = localDayKey(new Date(latest));
  return daysBetween(latestKey, today);
}
