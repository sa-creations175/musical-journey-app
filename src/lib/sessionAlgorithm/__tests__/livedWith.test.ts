/**
 * Phase 3 Step 2h — lived-with window helper tests.
 */
import { describe, expect, it } from 'vitest';
import {
  FADING_THRESHOLD_DAYS,
  LAPSED_THRESHOLD_DAYS,
  LIVED_WITH_WINDOW_DAYS,
  countEngagementsInWindow,
  daysSinceLastEngagement,
  isLivedWith,
  livedWithBand,
  mostRecentEngagement,
} from '../livedWith';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

describe('daysSinceLastEngagement', () => {
  it('null → null', () => {
    expect(daysSinceLastEngagement(null, T0)).toBeNull();
  });

  it('floors fractional days', () => {
    expect(daysSinceLastEngagement(T0 - DAY * 5 - DAY / 2, T0)).toBe(5);
  });

  it('clamps negative deltas to 0', () => {
    expect(daysSinceLastEngagement(T0 + DAY, T0)).toBe(0);
  });
});

describe('livedWithBand', () => {
  it('null timestamp → never', () => {
    expect(livedWithBand(null, T0)).toBe('never');
  });

  it('< 14 days → solid', () => {
    expect(livedWithBand(T0 - 0 * DAY, T0)).toBe('solid');
    expect(livedWithBand(T0 - 13 * DAY, T0)).toBe('solid');
  });

  it('14–29 days → fading', () => {
    expect(livedWithBand(T0 - 14 * DAY, T0)).toBe('fading');
    expect(livedWithBand(T0 - 29 * DAY, T0)).toBe('fading');
  });

  it('30+ days → lapsed', () => {
    expect(livedWithBand(T0 - 30 * DAY, T0)).toBe('lapsed');
    expect(livedWithBand(T0 - 365 * DAY, T0)).toBe('lapsed');
  });
});

describe('isLivedWith', () => {
  it('within default 14-day window → true', () => {
    expect(isLivedWith(T0 - 13 * DAY, T0)).toBe(true);
  });

  it('past window → false', () => {
    expect(isLivedWith(T0 - 14 * DAY, T0)).toBe(false);
  });

  it('null → false (never engaged)', () => {
    expect(isLivedWith(null, T0)).toBe(false);
  });

  it('respects an explicit window override', () => {
    expect(isLivedWith(T0 - 20 * DAY, T0, 30)).toBe(true);
    expect(isLivedWith(T0 - 30 * DAY, T0, 30)).toBe(false);
  });
});

describe('countEngagementsInWindow', () => {
  it('counts only timestamps within [now - window, now]', () => {
    const stamps = [
      T0 - 1 * DAY,
      T0 - 5 * DAY,
      T0 - 14 * DAY, // exactly at boundary, exclusive of window
      T0 - 30 * DAY,
      T0 + DAY,      // future
    ];
    expect(countEngagementsInWindow(stamps, T0)).toBe(2);
  });

  it('respects an explicit window', () => {
    const stamps = [T0 - 20 * DAY, T0 - 5 * DAY];
    expect(countEngagementsInWindow(stamps, T0, 30)).toBe(2);
  });

  it('empty list → 0', () => {
    expect(countEngagementsInWindow([], T0)).toBe(0);
  });
});

describe('mostRecentEngagement', () => {
  it('returns the max timestamp', () => {
    expect(mostRecentEngagement([100, 500, 200])).toBe(500);
  });

  it('null on empty list', () => {
    expect(mostRecentEngagement([])).toBeNull();
  });
});

describe('threshold constants', () => {
  it('match the design / schema', () => {
    expect(FADING_THRESHOLD_DAYS).toBe(14);
    expect(LAPSED_THRESHOLD_DAYS).toBe(30);
    expect(LIVED_WITH_WINDOW_DAYS).toBe(14);
  });
});
