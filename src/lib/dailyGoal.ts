import type { AttemptRecord } from './db';

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
// consecutive days where total-attempt count met the goal. Wrong answers
// count toward the goal alongside correct ones — see DailyGoalBar.
export function computeDayStreak(attempts: AttemptRecord[], goal: number, today: string = localDayKey()): number {
  // A NON-POSITIVE GOAL IS CLEARED BY EVERY DAY THERE HAS EVER BEEN, so
  // the walk below never terminates. It hung a full test run once, from
  // a goal that arrived as an array and coerced to 0. Callers should
  // never pass one — "any practice" is its own unit, see
  // `ModuleDailyGoal` — and if one gets here anyway it stops here.
  if (!(goal > 0)) return 0;
  const attemptsByDay = new Map<string, number>();
  for (const a of attempts) {
    const key = localDayKey(new Date(a.timestamp));
    attemptsByDay.set(key, (attemptsByDay.get(key) ?? 0) + 1);
  }
  let cursor = today;
  if ((attemptsByDay.get(cursor) ?? 0) < goal) {
    // today not yet met — chain may still be alive from yesterday
    cursor = previousDayKey(cursor);
  }
  let streak = 0;
  while ((attemptsByDay.get(cursor) ?? 0) >= goal) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}


export function lastPracticedDaysAgo(attempts: AttemptRecord[], today: string = localDayKey()): number | null {
  if (attempts.length === 0) return null;
  let latest = -Infinity;
  for (const a of attempts) if (a.timestamp > latest) latest = a.timestamp;
  if (latest === -Infinity) return null;
  const latestKey = localDayKey(new Date(latest));
  return daysBetween(latestKey, today);
}
