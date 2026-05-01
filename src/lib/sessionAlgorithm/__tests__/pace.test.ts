/**
 * Phase 3 Step 2c — pace-based urgency contract tests.
 */
import { describe, expect, it } from 'vitest';
import {
  PACE_AT_RISK_THRESHOLD,
  PACE_FACTOR_AHEAD,
  PACE_FACTOR_AT_RISK,
  PACE_FACTOR_BEHIND,
  PACE_FACTOR_SIGNIFICANTLY_BEHIND,
  PACE_FACTOR_WELL_AHEAD,
  bandForRatio,
  daysElapsed,
  daysRemaining,
  factorForRatio,
  paceForCoverageGoal,
} from '../pace';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

describe('paceForCoverageGoal — straight-line math', () => {
  it('halfway through period with half the items covered → on-pace ratio 1', () => {
    const r = paceForCoverageGoal({
      startDate: T0,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 50,
      now: T0 + 50 * DAY,
    });
    expect(r.expected).toBe(50);
    expect(r.actual).toBe(50);
    expect(r.deficit).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.band).toBe('ahead');
    expect(r.factor).toBe(PACE_FACTOR_AHEAD);
    expect(r.periodElapsedFraction).toBeCloseTo(0.5);
  });

  it('halfway through with 25 covered → ratio 0.5, behind band', () => {
    const r = paceForCoverageGoal({
      startDate: T0,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 25,
      now: T0 + 50 * DAY,
    });
    expect(r.expected).toBe(50);
    expect(r.deficit).toBe(25);
    expect(r.ratio).toBe(0.5);
    expect(r.band).toBe('behind');
    expect(r.factor).toBe(PACE_FACTOR_BEHIND);
  });

  it('quarter through with 5 covered → significantly behind', () => {
    const r = paceForCoverageGoal({
      startDate: T0,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 5,
      now: T0 + 25 * DAY,
    });
    expect(r.ratio).toBe(0.2);
    expect(r.band).toBe('significantly-behind');
    expect(r.factor).toBe(PACE_FACTOR_SIGNIFICANTLY_BEHIND);
  });

  it('halfway with 75 covered → well ahead', () => {
    const r = paceForCoverageGoal({
      startDate: T0,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 75,
      now: T0 + 50 * DAY,
    });
    expect(r.ratio).toBe(1.5);
    expect(r.band).toBe('well-ahead');
    expect(r.factor).toBe(PACE_FACTOR_WELL_AHEAD);
  });
});

describe('bandForRatio — boundaries', () => {
  it('exactly at thresholds picks the higher band', () => {
    expect(bandForRatio(1.5)).toBe('well-ahead');
    expect(bandForRatio(1.0)).toBe('ahead');
    expect(bandForRatio(PACE_AT_RISK_THRESHOLD)).toBe('at-risk');
    expect(bandForRatio(0.5)).toBe('behind');
  });

  it('just below thresholds drops a band', () => {
    expect(bandForRatio(1.499999)).toBe('ahead');
    expect(bandForRatio(0.999999)).toBe('at-risk');
    expect(bandForRatio(0.849999)).toBe('behind');
    expect(bandForRatio(0.499999)).toBe('significantly-behind');
  });

  it('Infinity → well-ahead', () => {
    expect(bandForRatio(Number.POSITIVE_INFINITY)).toBe('well-ahead');
  });
});

describe('factorForRatio — calibration constants line up', () => {
  it('at-risk ratio gets at-risk factor', () => {
    expect(factorForRatio(0.9)).toBe(PACE_FACTOR_AT_RISK);
  });

  it('on-pace ratio gets the ahead factor', () => {
    expect(factorForRatio(1.0)).toBe(PACE_FACTOR_AHEAD);
  });
});

describe('paceForCoverageGoal — edge cases', () => {
  it('period not yet started: actual > 0 → +Infinity ratio, well-ahead', () => {
    const r = paceForCoverageGoal({
      startDate: T0 + 10 * DAY,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 5,
      now: T0,
    });
    expect(r.expected).toBe(0);
    expect(r.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(r.band).toBe('well-ahead');
    expect(r.factor).toBe(PACE_FACTOR_WELL_AHEAD);
  });

  it('period not yet started, no progress yet: ratio 1, ahead', () => {
    const r = paceForCoverageGoal({
      startDate: T0 + 10 * DAY,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 0,
      now: T0,
    });
    expect(r.ratio).toBe(1);
    expect(r.band).toBe('ahead');
  });

  it('past the target date: expected = totalItems', () => {
    const r = paceForCoverageGoal({
      startDate: T0,
      targetDate: T0 + 100 * DAY,
      totalItems: 100,
      actualCoverage: 60,
      now: T0 + 200 * DAY,
    });
    expect(r.expected).toBe(100);
    expect(r.ratio).toBe(0.6);
    expect(r.band).toBe('behind');
  });

  it('zero-item target: vacuously on pace', () => {
    const r = paceForCoverageGoal({
      startDate: T0,
      targetDate: T0 + 100 * DAY,
      totalItems: 0,
      actualCoverage: 0,
      now: T0 + 50 * DAY,
    });
    expect(r.ratio).toBe(1);
    expect(r.band).toBe('ahead');
  });
});

describe('daysElapsed / daysRemaining', () => {
  it('floors elapsed days', () => {
    expect(daysElapsed(T0, T0 + 5 * DAY)).toBe(5);
    expect(daysElapsed(T0, T0 + 5 * DAY + 12 * 60 * 60 * 1000)).toBe(5);
  });

  it('clamps elapsed at 0 when now is before start', () => {
    expect(daysElapsed(T0 + 10 * DAY, T0)).toBe(0);
  });

  it('counts today as a remaining day (ceil)', () => {
    expect(daysRemaining(T0 + 7 * DAY, T0)).toBe(7);
    expect(daysRemaining(T0 + 7 * DAY + 1, T0)).toBe(8);
  });

  it('returns 0 once past target', () => {
    expect(daysRemaining(T0, T0 + 5 * DAY)).toBe(0);
  });
});
