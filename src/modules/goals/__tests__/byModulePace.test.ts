// @vitest-environment jsdom
/**
 * Unit tests for byModulePace.ts — the by-module view's pace
 * classifier. Pins:
 *   · which goal flavors render a colored pace pill (and which
 *     surface a muted "X of Y days" text instead);
 *   · the 5-band → 3-color mapping;
 *   · the classifier returns 'no-pill' when there's nothing
 *     honest to pace against.
 *
 * jsdom env required because Goal type imports transitively pull
 * db.ts (touches window).
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  classifyGoalPace,
  goalHasPacePill,
  isDaysConsistencyGoal,
  paceColorForBand,
} from '../byModulePace';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_START = 1_700_000_000_000;
const WEEK_END = WEEK_START + WEEK_MS;
const MID_WEEK = WEEK_START + (3 * 24 * 60 * 60 * 1000) + (12 * 60 * 60 * 1000); // ~3.5 days in

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: 't',
    scope: 'weekly',
    description: '',
    contextTag: 'mixed',
    relatedModules: [],
    startDate: WEEK_START,
    targetDate: WEEK_END,
    status: 'active',
    parentGoalId: null,
    isUmbrella: false,
    relatedItems: [],
    contributesNumericallyToParent: false,
    lastEngagedAt: null,
    currentValue: 0,
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    ...overrides,
  } as Goal;
}

describe('goalHasPacePill', () => {
  it('TRUE for coverage goals', () => {
    expect(goalHasPacePill(goal({ targetMetric: 'ear_training_coverage_at_acquired' }))).toBe(true);
  });
  it('TRUE for attempts/sessions-unit goals (no consistency suffix)', () => {
    expect(goalHasPacePill(goal({ targetMetric: 'ear_training_coverage_at_acquired' }))).toBe(true);
  });
  it('TRUE for production lessons goals', () => {
    expect(goalHasPacePill(goal({ targetMetric: 'production_lessons_per_cadence' }))).toBe(true);
    expect(goalHasPacePill(goal({ targetMetric: 'production_lessons_count' }))).toBe(true);
  });
  it('FALSE for *_days_per_cadence (consistency)', () => {
    expect(goalHasPacePill(goal({ targetMetric: 'harmonic_fluency_days_per_cadence' }))).toBe(false);
    expect(goalHasPacePill(goal({ targetMetric: 'repertoire_days_per_cadence' }))).toBe(false);
  });
  it('FALSE for practice-consistency umbrella metrics', () => {
    expect(goalHasPacePill(goal({ targetMetric: 'practice_days_per_cadence' }))).toBe(false);
    expect(goalHasPacePill(goal({ targetMetric: 'practice_weekly_floor_days' }))).toBe(false);
  });
  it('FALSE for legacy hours/minutes/sessions consistency metrics', () => {
    expect(goalHasPacePill(goal({ targetMetric: 'shapes_minutes_per_cadence' }))).toBe(false);
    expect(goalHasPacePill(goal({ targetMetric: 'production_hours_per_cadence' }))).toBe(false);
    expect(goalHasPacePill(goal({ targetMetric: 'repertoire_hours_per_cadence' }))).toBe(false);
    expect(goalHasPacePill(goal({ targetMetric: 'ear_training_sessions_per_cadence' }))).toBe(false);
  });
  it('FALSE for null metric', () => {
    expect(goalHasPacePill(goal({ targetMetric: null }))).toBe(false);
  });
});

describe('isDaysConsistencyGoal', () => {
  it('matches days metrics and practice_* umbrellas', () => {
    expect(isDaysConsistencyGoal(goal({ targetMetric: 'harmonic_fluency_days_per_cadence' }))).toBe(true);
    expect(isDaysConsistencyGoal(goal({ targetMetric: 'practice_days_per_cadence' }))).toBe(true);
    expect(isDaysConsistencyGoal(goal({ targetMetric: 'practice_weekly_floor_days' }))).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isDaysConsistencyGoal(goal({ targetMetric: 'shapes_minutes_per_cadence' }))).toBe(false);
    expect(isDaysConsistencyGoal(goal({ targetMetric: 'ear_training_coverage_at_acquired' }))).toBe(false);
    expect(isDaysConsistencyGoal(goal({ targetMetric: null }))).toBe(false);
  });
});

describe('paceColorForBand', () => {
  it('green for well-ahead and ahead', () => {
    expect(paceColorForBand('well-ahead')).toBe('green');
    expect(paceColorForBand('ahead')).toBe('green');
  });
  it('amber for at-risk', () => {
    expect(paceColorForBand('at-risk')).toBe('amber');
  });
  it('red for behind and significantly-behind', () => {
    expect(paceColorForBand('behind')).toBe('red');
    expect(paceColorForBand('significantly-behind')).toBe('red');
  });
});

describe('classifyGoalPace', () => {
  it('returns no-pill when goal has no targetValue', () => {
    const result = classifyGoalPace({
      goal: goal({ targetMetric: 'ear_training_coverage_at_acquired', targetValue: null }),
      actual: 10,
      now: MID_WEEK,
    });
    expect(result.kind).toBe('no-pill');
  });

  it('returns no-pill for days/consistency goals', () => {
    const result = classifyGoalPace({
      goal: goal({ targetMetric: 'harmonic_fluency_days_per_cadence', targetValue: 5 }),
      actual: 3,
      now: MID_WEEK,
    });
    expect(result.kind).toBe('no-pill');
  });

  it('classifies on-pace (green) when ratio >= 1.0', () => {
    // At ~3.5 days through the week, pro-rated target for 100 items = 50.
    // Actual = 60 → ratio 1.2 → "ahead" → green.
    const result = classifyGoalPace({
      goal: goal({
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 100,
      }),
      actual: 60,
      now: MID_WEEK,
    });
    if (result.kind !== 'pill') throw new Error('expected pill');
    expect(result.color).toBe('green');
  });

  it('classifies at-risk (amber) when 0.85 <= ratio < 1.0', () => {
    // Pro-rated target = 50; actual = 45 → ratio 0.9 → at-risk → amber.
    const result = classifyGoalPace({
      goal: goal({
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 100,
      }),
      actual: 45,
      now: MID_WEEK,
    });
    if (result.kind !== 'pill') throw new Error('expected pill');
    expect(result.color).toBe('amber');
  });

  it('classifies behind (red) when ratio < 0.85', () => {
    // Pro-rated target = 50; actual = 20 → ratio 0.4 → behind → red.
    const result = classifyGoalPace({
      goal: goal({
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 100,
      }),
      actual: 20,
      now: MID_WEEK,
    });
    if (result.kind !== 'pill') throw new Error('expected pill');
    expect(result.color).toBe('red');
  });

  it('treats start-of-week as green (no work expected yet)', () => {
    // `now` exactly at WEEK_START → 0 elapsed → ratio = +Infinity → well-ahead → green.
    const result = classifyGoalPace({
      goal: goal({
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 100,
      }),
      actual: 0,
      now: WEEK_START,
    });
    if (result.kind !== 'pill') throw new Error('expected pill');
    expect(result.color).toBe('green');
  });
});
