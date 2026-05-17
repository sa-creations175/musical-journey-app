// @vitest-environment jsdom
/**
 * Tests for the scopeMeta date helpers — week-boundary alignment
 * (Sun–Sat, delegated to weeklyPlanData) and the Fri/Sat next-week
 * planning hooks.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultStartDate,
  defaultTargetDate,
  isFriOrSatLocal,
  nextWeekEndLocal,
  nextWeekStartLocal,
} from '../scopeMeta';

// Local-time constructor — every test interprets dates in the runner's
// TZ, matching production behavior (all helpers use `new Date(...)` /
// `d.getDay()` which are local).
function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

describe('defaultStartDate', () => {
  it('weekly: returns most-recent Sunday 00:00 (start of current Sun–Sat week)', () => {
    // Wed May 13 2026 (12:00 local) → Sun May 10 2026 00:00.
    const wed = localDate(2026, 5, 13).getTime();
    const start = new Date(defaultStartDate('weekly', wed));
    expect(start.getDay()).toBe(0);            // Sunday
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(10);
    expect(start.getMonth()).toBe(4);          // May
    expect(start.getFullYear()).toBe(2026);
  });

  it('weekly: Sunday morning returns the same Sunday at 00:00', () => {
    const sun = localDate(2026, 5, 17, 9).getTime();
    const start = new Date(defaultStartDate('weekly', sun));
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(17);
    expect(start.getHours()).toBe(0);
  });

  it('weekly: Saturday returns the Sunday SIX days back (same week)', () => {
    const sat = localDate(2026, 5, 16, 21).getTime();
    const start = new Date(defaultStartDate('weekly', sat));
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(10);          // prev Sunday
  });

  it('monthly / quarterly / yearly: returns `now` unchanged', () => {
    const wed = localDate(2026, 5, 13).getTime();
    expect(defaultStartDate('monthly', wed)).toBe(wed);
    expect(defaultStartDate('quarterly', wed)).toBe(wed);
    expect(defaultStartDate('yearly', wed)).toBe(wed);
  });

  it('two_to_three_year / lifetime: returns `now` unchanged', () => {
    const wed = localDate(2026, 5, 13).getTime();
    expect(defaultStartDate('two_to_three_year', wed)).toBe(wed);
    expect(defaultStartDate('lifetime', wed)).toBe(wed);
  });
});

describe('defaultTargetDate — weekly Sun–Sat alignment', () => {
  it('weekly Wed: targets the upcoming Saturday at 23:59:59.999', () => {
    const wed = localDate(2026, 5, 13).getTime();
    const end = new Date(defaultTargetDate('weekly', wed));
    expect(end.getDay()).toBe(6);              // Saturday
    expect(end.getDate()).toBe(16);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('weekly Sunday morning: targets the Saturday SIX days later', () => {
    const sun = localDate(2026, 5, 17, 9).getTime();
    const end = new Date(defaultTargetDate('weekly', sun));
    expect(end.getDay()).toBe(6);
    expect(end.getDate()).toBe(23);
  });

  it('weekly Saturday: targets THAT Saturday at 23:59 (same-day end)', () => {
    const sat = localDate(2026, 5, 16, 9).getTime();
    const end = new Date(defaultTargetDate('weekly', sat));
    expect(end.getDay()).toBe(6);
    expect(end.getDate()).toBe(16);
  });
});

describe('isFriOrSatLocal', () => {
  it('true for Friday', () => {
    expect(isFriOrSatLocal(localDate(2026, 5, 15).getTime())).toBe(true); // Fri
  });
  it('true for Saturday', () => {
    expect(isFriOrSatLocal(localDate(2026, 5, 16).getTime())).toBe(true); // Sat
  });
  it('false for Sunday through Thursday', () => {
    expect(isFriOrSatLocal(localDate(2026, 5, 17).getTime())).toBe(false); // Sun
    expect(isFriOrSatLocal(localDate(2026, 5, 18).getTime())).toBe(false); // Mon
    expect(isFriOrSatLocal(localDate(2026, 5, 19).getTime())).toBe(false); // Tue
    expect(isFriOrSatLocal(localDate(2026, 5, 20).getTime())).toBe(false); // Wed
    expect(isFriOrSatLocal(localDate(2026, 5, 21).getTime())).toBe(false); // Thu
  });
});

describe('nextWeekStartLocal / nextWeekEndLocal', () => {
  it('Saturday: next week start is the next-day Sunday at 00:00', () => {
    const sat = localDate(2026, 5, 16, 21).getTime();
    const next = new Date(nextWeekStartLocal(sat));
    expect(next.getDay()).toBe(0);
    expect(next.getDate()).toBe(17);
    expect(next.getHours()).toBe(0);
  });

  it('Friday: next week start is Sunday two days later', () => {
    const fri = localDate(2026, 5, 15, 18).getTime();
    const next = new Date(nextWeekStartLocal(fri));
    expect(next.getDay()).toBe(0);
    expect(next.getDate()).toBe(17);
  });

  it('next week end is the Saturday after next week start', () => {
    const sat = localDate(2026, 5, 16).getTime();
    const end = new Date(nextWeekEndLocal(sat));
    expect(end.getDay()).toBe(6);
    expect(end.getDate()).toBe(23);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});
