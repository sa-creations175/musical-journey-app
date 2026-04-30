import type { Goal, GoalScope } from '../../../lib/db';

/**
 * Phase 2 step 6b — deterministic mock activity data, seeded by
 * goal id, used to populate ActivityChart while step 6c is still
 * pending. Once 6c lands and the live `getDailyActivity` helper
 * exists, this generator stays around (DEV-only) so we can
 * preview chart shapes without needing real practice history.
 *
 * Determinism: hash(goal.id) seeds a small mulberry32 RNG so the
 * same goal renders the same chart across reloads — no flicker
 * between "today's mock" and "yesterday's mock."
 */

export interface MockWeeklyData {
  values: number[]; // length 7, Mon-Sun
  weekStart: Date;  // Monday
  averageCount: number;
}

export interface MockMonthlyData {
  values: { date: Date; count: number }[];
  averageCount: number;
}

export interface MockYearlyData {
  values: number[]; // length 12, Jan-Dec
  year: number;
  averageCount: number;
}

export function mockWeeklyForGoal(goal: Goal, today: Date): MockWeeklyData {
  const rng = makeRng(goal.id);
  const weekStart = mondayOf(today);
  const values: number[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    if (date > today) {
      values.push(0);
    } else {
      // Most days have moderate activity; ~25% are zero, ~10% are
      // standout high-intensity days.
      const r = rng();
      if (r < 0.25) values.push(0);
      else if (r < 0.85) values.push(Math.round(8 + rng() * 30));
      else values.push(Math.round(40 + rng() * 35));
    }
  }
  return {
    values,
    weekStart,
    averageCount: avgNonZero(values, 18),
  };
}

export function mockMonthlyForGoal(goal: Goal, today: Date): MockMonthlyData {
  const rng = makeRng(goal.id);
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const values: { date: Date; count: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (date > today) {
      values.push({ date, count: 0 });
    } else {
      const r = rng();
      if (r < 0.3) values.push({ date, count: 0 });
      else if (r < 0.85) values.push({ date, count: Math.round(8 + rng() * 30) });
      else values.push({ date, count: Math.round(40 + rng() * 35) });
    }
  }
  return {
    values,
    averageCount: avgNonZero(values.map(v => v.count), 18),
  };
}

export function mockYearlyForGoal(goal: Goal, today: Date): MockYearlyData {
  const rng = makeRng(goal.id);
  const year = today.getFullYear();
  const currentMonth = today.getMonth();
  const values: number[] = [];
  for (let m = 0; m < 12; m++) {
    if (m > currentMonth) {
      values.push(0);
    } else {
      // Larger numbers on the yearly view — these represent
      // monthly totals, not daily counts.
      values.push(Math.round(80 + rng() * 320));
    }
  }
  return {
    values,
    year,
    averageCount: avgNonZero(values, 220),
  };
}

/** Pick the right mock generator for the goal's scope. */
export function mockForGoal(goal: Goal, today: Date) {
  const scope: GoalScope = goal.scope;
  if (scope === 'weekly') return { kind: 'weekly' as const, ...mockWeeklyForGoal(goal, today) };
  if (scope === 'monthly') return { kind: 'monthly' as const, ...mockMonthlyForGoal(goal, today) };
  if (scope === 'yearly') return { kind: 'yearly' as const, ...mockYearlyForGoal(goal, today) };
  return { kind: 'none' as const };
}

// ───── helpers ──────────────────────────────────────────────────

function avgNonZero(values: number[], fallback: number): number {
  const nz = values.filter(v => v > 0);
  if (nz.length === 0) return fallback;
  return Math.round(nz.reduce((a, b) => a + b, 0) / nz.length);
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // JS getDay: 0 = Sun, 1 = Mon, …, 6 = Sat. Roll back to Monday.
  const offset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - offset);
  return out;
}

function makeRng(seedString: string): () => number {
  let h = 1779033703 ^ seedString.length;
  for (let i = 0; i < seedString.length; i++) {
    h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  // mulberry32 — small, deterministic, good enough for mock viz
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
