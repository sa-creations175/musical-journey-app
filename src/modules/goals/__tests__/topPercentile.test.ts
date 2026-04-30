/**
 * Phase 2 step 6b — pure helpers for activity chart rendering.
 *
 * Tests cover:
 *   - pickTopPercentileIndices: top-N selection, edge cases,
 *     sparse data, ties, all-zero, empty input
 *   - isFutureDay / isFutureMonth: calendar-day comparison ignores
 *     time-of-day; month math handles year boundaries
 */
import { describe, it, expect } from 'vitest';
import {
  pickTopPercentileIndices,
  isFutureDay,
  isFutureMonth,
} from '../activity/topPercentile';

describe('pickTopPercentileIndices', () => {
  it('returns empty set when all values are zero', () => {
    expect(pickTopPercentileIndices([0, 0, 0, 0, 0, 0, 0], 20)).toEqual(new Set());
  });

  it('returns empty set when input is empty', () => {
    expect(pickTopPercentileIndices([], 20)).toEqual(new Set());
  });

  it('picks the top-20% of non-zero values', () => {
    // 10 non-zero values, top 20% = 2 indices.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(pickTopPercentileIndices(values, 20)).toEqual(new Set([8, 9]));
  });

  it('picks at least one index when any non-zero value exists', () => {
    // 1 non-zero value, top 20% would round to 1 anyway.
    const values = [0, 0, 0, 5, 0, 0, 0];
    expect(pickTopPercentileIndices(values, 20)).toEqual(new Set([3]));
  });

  it('breaks ties by earlier index for deterministic output', () => {
    // Three identical top values; top-20% of 3 ceils to 1.
    // Earlier-index wins.
    const values = [10, 10, 10, 1, 1];
    expect(pickTopPercentileIndices(values, 20)).toEqual(new Set([0]));
  });

  it('rounds the slice up so a sparse top tier gets at least its share', () => {
    // 7 non-zero, 20% = 1.4 → ceil → 2.
    const values = [1, 2, 3, 4, 5, 6, 7];
    expect(pickTopPercentileIndices(values, 20)).toEqual(new Set([5, 6]));
  });

  it('skips zeros entirely when computing the threshold', () => {
    // Mix of zeros and one big day. Top 20% should still pick
    // only the non-zero day, not include any zero days.
    const values = [0, 0, 0, 0, 0, 0, 50];
    expect(pickTopPercentileIndices(values, 20)).toEqual(new Set([6]));
  });

  it('returns empty set when pct is 0', () => {
    expect(pickTopPercentileIndices([1, 2, 3], 0)).toEqual(new Set());
  });
});

describe('isFutureDay', () => {
  it('returns false for the same calendar day regardless of time', () => {
    const today = new Date('2026-04-29T08:00:00');
    const sameDayLater = new Date('2026-04-29T23:30:00');
    expect(isFutureDay(sameDayLater, today)).toBe(false);
  });

  it('returns true for tomorrow', () => {
    const today = new Date('2026-04-29T08:00:00');
    const tomorrow = new Date('2026-04-30T00:30:00');
    expect(isFutureDay(tomorrow, today)).toBe(true);
  });

  it('returns false for yesterday', () => {
    const today = new Date('2026-04-29T08:00:00');
    const yesterday = new Date('2026-04-28T23:30:00');
    expect(isFutureDay(yesterday, today)).toBe(false);
  });

  it('returns true even when only minutes into the next day', () => {
    // Guards against a timestamp comparison that would say
    // 23:59 yesterday < 00:01 today < 08:00 today (with today
    // at 08:00) → 00:01 today is "past." Calendar-day compare
    // says they're the same day.
    const today = new Date('2026-04-29T08:00:00');
    const earlyTomorrow = new Date('2026-04-30T00:01:00');
    expect(isFutureDay(earlyTomorrow, today)).toBe(true);
  });
});

describe('isFutureMonth', () => {
  it('returns false for the current month', () => {
    const today = new Date('2026-04-29T12:00:00');
    expect(isFutureMonth(2026, 3, today)).toBe(false); // April = 3
  });

  it('returns true for a later month in the same year', () => {
    const today = new Date('2026-04-29T12:00:00');
    expect(isFutureMonth(2026, 4, today)).toBe(true); // May
  });

  it('returns false for an earlier month in the same year', () => {
    const today = new Date('2026-04-29T12:00:00');
    expect(isFutureMonth(2026, 2, today)).toBe(false); // March
  });

  it('returns true for any month in a future year', () => {
    const today = new Date('2026-04-29T12:00:00');
    expect(isFutureMonth(2027, 0, today)).toBe(true);
  });

  it('returns false for any month in a past year', () => {
    const today = new Date('2026-04-29T12:00:00');
    expect(isFutureMonth(2025, 11, today)).toBe(false);
  });
});
