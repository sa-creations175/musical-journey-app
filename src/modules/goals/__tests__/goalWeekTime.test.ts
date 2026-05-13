// @vitest-environment jsdom
/**
 * Unit tests for goalWeekTime — pins that the per-goal weekly
 * time estimate matches WeeklyPlan's rowTime() across every
 * metric flavor. The exact numbers depend on the constants in
 * lib/weeklyAttempts.ts (TIME_PER_ATTEMPT_MINUTES,
 * SHAPES_TIME_PER_REP_MINUTES, REPERTOIRE_SESSION_DEFAULT_MINUTES,
 * PRODUCTION_TIME_RANGE_MINUTES); the tests assert relationships
 * not magic numbers where possible.
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import { goalWeekTime } from '../goalWeekTime';
import {
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  PRODUCTION_TIME_RANGE_MINUTES,
  TIME_PER_ATTEMPT_MINUTES,
} from '../../../lib/weeklyAttempts';

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: 't',
    scope: 'weekly',
    description: '',
    contextTag: 'mixed',
    relatedModules: [],
    startDate: 0,
    targetDate: 0,
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

describe('goalWeekTime — null cases', () => {
  it('null targetMetric → null', () => {
    expect(goalWeekTime(goal({ targetMetric: null, targetValue: 5 }))).toBeNull();
  });
  it('null targetValue → null', () => {
    expect(goalWeekTime(goal({
      targetMetric: 'ear_training_coverage_at_acquired',
      targetValue: null,
    }))).toBeNull();
  });
  it('zero targetValue → null', () => {
    expect(goalWeekTime(goal({
      targetMetric: 'ear_training_coverage_at_acquired',
      targetValue: 0,
    }))).toBeNull();
  });
  it('standalone HF days metric → null (no per-day time constant)', () => {
    expect(goalWeekTime(goal({
      targetMetric: 'harmonic_fluency_days_per_cadence',
      targetValue: 5,
    }))).toBeNull();
  });
  it('practice_* metrics → null', () => {
    expect(goalWeekTime(goal({
      targetMetric: 'practice_days_per_cadence',
      targetValue: 6,
    }))).toBeNull();
  });
});

describe('goalWeekTime — legacy hours/minutes', () => {
  it('production_hours_per_cadence = target hours × 60', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'production_hours_per_cadence',
      targetValue: 2,
    }));
    expect(r).not.toBeNull();
    expect(r!.estimate).toEqual({ kind: 'point', minutes: 120 });
  });

  it('repertoire_hours_per_cadence carries a session breakdown', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'repertoire_hours_per_cadence',
      targetValue: 4.5,
    }));
    expect(r).not.toBeNull();
    expect(r!.estimate).toEqual({ kind: 'point', minutes: 270 });
    // Session breakdown uses REPERTOIRE_SESSION_DEFAULT_MINUTES
    // (60 min/session as of the May 2026 rebalance — was 45).
    expect(r!.breakdown).toContain('60 min');
    expect(r!.breakdown).toContain('week');
  });

  it('shapes_minutes_per_cadence = target verbatim', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'shapes_minutes_per_cadence',
      targetValue: 30,
    }));
    expect(r!.estimate).toEqual({ kind: 'point', minutes: 30 });
  });
});

describe('goalWeekTime — new days/lessons', () => {
  it('repertoire_days_per_cadence = days × default session minutes, with breakdown', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'repertoire_days_per_cadence',
      targetValue: 6,
    }));
    expect(r).not.toBeNull();
    expect(r!.estimate).toEqual({
      kind: 'point',
      minutes: 6 * REPERTOIRE_SESSION_DEFAULT_MINUTES,
    });
    // 60 min/session as of the May 2026 rebalance.
    expect(r!.breakdown).toContain('60 min');
    expect(r!.breakdown).toContain('6 days');
  });

  it('production_lessons_per_cadence = lessons × 30-90 min range', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'production_lessons_per_cadence',
      targetValue: 3,
    }));
    expect(r).not.toBeNull();
    expect(r!.estimate).toEqual({
      kind: 'range',
      minMinutes: 3 * PRODUCTION_TIME_RANGE_MINUTES.minPerLesson,
      maxMinutes: 3 * PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson,
    });
  });

  it('production_lessons_count = lessons × 30-90 min range', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'production_lessons_count',
      targetValue: 4,
    }));
    expect(r!.estimate).toEqual({
      kind: 'range',
      minMinutes: 4 * PRODUCTION_TIME_RANGE_MINUTES.minPerLesson,
      maxMinutes: 4 * PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson,
    });
  });
});

describe('goalWeekTime — attempts / sessions', () => {
  it('HF coverage at acquired = attempts × HF per-attempt minutes', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'ear_training_coverage_at_acquired',
      targetValue: 60,
    }));
    expect(r!.estimate).toEqual({
      kind: 'point',
      minutes: 60 * TIME_PER_ATTEMPT_MINUTES['ear-training'],
    });
  });

  it('Shapes coverage with chord_shape_triads_maj uses chord_shape rate', () => {
    const r = goalWeekTime(goal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetValue: 96,
      targetUnit: 'chord_shape_triads_maj',
    }));
    expect(r).not.toBeNull();
    // The exact constant is SHAPES_TIME_PER_REP_MINUTES.chord_shape_drills (1.6).
    // Assert >0 and a sensible upper bound rather than the magic number.
    expect(r!.estimate.kind).toBe('point');
    if (r!.estimate.kind !== 'point') return;
    expect(r!.estimate.minutes).toBeGreaterThan(0);
    expect(r!.estimate.minutes).toBeLessThan(96 * 5);
  });

  it('Shapes coverage with voice_leading uses voice-leading rate', () => {
    const rChord = goalWeekTime(goal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetValue: 50,
      targetUnit: 'chord_shape_triads_maj',
    }));
    const rVL = goalWeekTime(goal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetValue: 50,
      targetUnit: 'voice_leading',
    }));
    // Voice-leading is more expensive per rep than chord shapes.
    if (rChord!.estimate.kind !== 'point' || rVL!.estimate.kind !== 'point') {
      throw new Error('expected points');
    }
    expect(rVL!.estimate.minutes).toBeGreaterThan(rChord!.estimate.minutes);
  });
});
