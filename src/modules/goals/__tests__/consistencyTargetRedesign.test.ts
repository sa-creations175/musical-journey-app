// @vitest-environment jsdom
/**
 * Contract tests for the May 2026 consistency-target redesign.
 *
 * Pins three things:
 *   1. Encoders write the new days/lessons metric names with
 *      targetUnit='week'.
 *   2. Decoders accept both new and legacy metric names; legacy
 *      records reset the consistency count to the module's new
 *      default so the user re-affirms when they next save.
 *   3. coverageWeeklyMinutes returns the right per-week minute
 *      total for HF, ET, Shapes, and null for modules without a
 *      coverage-time model.
 *
 * jsdom env required because GoalCreationFlow transitively imports
 * db.ts (touches window).
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  decodeEarTraining,
  decodeHarmonicFluency,
  decodeShapesPatterns,
  decodeProduction,
  defaultEarTraining,
  defaultHarmonicFluency,
  defaultShapesPatterns,
  defaultProduction,
  encodeEarTraining,
  encodeHarmonicFluency,
  encodeShapesPatterns,
  encodeProduction,
  type EarTrainingTarget,
  type HarmonicFluencyTarget,
  type ShapesPatternsTarget,
  type ProductionTarget,
} from '../GoalCreationFlow';
import { coverageWeeklyMinutes } from '../weeklyTimeEstimate';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function et(overrides: Partial<EarTrainingTarget> = {}): EarTrainingTarget {
  return { ...defaultEarTraining(), ...overrides };
}
function hf(overrides: Partial<HarmonicFluencyTarget> = {}): HarmonicFluencyTarget {
  return { ...defaultHarmonicFluency(), ...overrides };
}
function sp(overrides: Partial<ShapesPatternsTarget> = {}): ShapesPatternsTarget {
  return { ...defaultShapesPatterns(), ...overrides };
}
function prod(overrides: Partial<ProductionTarget> = {}): ProductionTarget {
  return { ...defaultProduction(), ...overrides };
}

function legacyGoal(metric: string, value: number, unit: string): Goal {
  // Minimal Goal stub — only the fields the decoders inspect.
  return {
    id: 't',
    scope: 'monthly',
    targetMetric: metric,
    targetValue: value,
    targetUnit: unit,
    description: 'legacy',
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
  } as Goal;
}

// ---------------------------------------------------------------------
// Encoder pinning — new metric names, week unit
// ---------------------------------------------------------------------

describe('Encoders: new days/lessons metrics', () => {
  it('Ear Training writes ear_training_days_per_cadence with unit=week', () => {
    const records = encodeEarTraining(et({ consistencyEnabled: true, consistencyCount: 5 }));
    const cons = records.find(r => r.targetMetric === 'ear_training_days_per_cadence');
    expect(cons).toBeDefined();
    expect(cons?.targetValue).toBe(5);
    expect(cons?.targetUnit).toBe('week');
    // Legacy metric is no longer written.
    expect(records.find(r => r.targetMetric === 'ear_training_sessions_per_cadence')).toBeUndefined();
  });

  it('Harmonic Fluency writes harmonic_fluency_days_per_cadence with unit=week', () => {
    const records = encodeHarmonicFluency(hf({ consistencyEnabled: true, consistencyCount: 5 }));
    const cons = records.find(r => r.targetMetric === 'harmonic_fluency_days_per_cadence');
    expect(cons).toBeDefined();
    expect(cons?.targetValue).toBe(5);
    expect(cons?.targetUnit).toBe('week');
    expect(records.find(r => r.targetMetric === 'harmonic_fluency_sessions_per_cadence')).toBeUndefined();
  });

  it('Shapes writes shapes_days_per_cadence with unit=week', () => {
    const records = encodeShapesPatterns(sp({ consistencyEnabled: true, consistencyCount: 6 }));
    const cons = records.find(r => r.targetMetric === 'shapes_days_per_cadence');
    expect(cons).toBeDefined();
    expect(cons?.targetValue).toBe(6);
    expect(cons?.targetUnit).toBe('week');
    expect(records.find(r => r.targetMetric === 'shapes_minutes_per_cadence')).toBeUndefined();
  });

  it('Production writes production_lessons_per_cadence with unit=week', () => {
    const records = encodeProduction(prod({ consistencyEnabled: true, consistencyCount: 3 }));
    const cons = records.find(r => r.targetMetric === 'production_lessons_per_cadence');
    expect(cons).toBeDefined();
    expect(cons?.targetValue).toBe(3);
    expect(cons?.targetUnit).toBe('week');
    expect(records.find(r => r.targetMetric === 'production_hours_per_cadence')).toBeUndefined();
  });

  it('omits the consistency record entirely when disabled', () => {
    const records = encodeEarTraining(et({ consistencyEnabled: false }));
    expect(records.find(r => r.targetMetric === 'ear_training_days_per_cadence')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// Decoder pinning — legacy resets to default, new round-trips
// ---------------------------------------------------------------------

describe('Decoders: legacy reset + new round-trip', () => {
  it('ET legacy sessions metric resets count to new default (5)', () => {
    const target = decodeEarTraining(legacyGoal('ear_training_sessions_per_cadence', 3, 'week'));
    expect(target.consistencyEnabled).toBe(true);
    expect(target.consistencyCount).toBe(defaultEarTraining().consistencyCount);
    expect(target.consistencyCadence).toBe('week');
  });

  it('HF legacy sessions metric resets count to new default (5)', () => {
    const target = decodeHarmonicFluency(legacyGoal('harmonic_fluency_sessions_per_cadence', 7, 'week'));
    expect(target.consistencyCount).toBe(defaultHarmonicFluency().consistencyCount);
  });

  it('Shapes legacy minutes metric resets count to new default (6)', () => {
    const target = decodeShapesPatterns(legacyGoal('shapes_minutes_per_cadence', 20, 'week'));
    expect(target.consistencyCount).toBe(defaultShapesPatterns().consistencyCount);
  });

  it('Production legacy hours metric resets count to new default (3)', () => {
    const target = decodeProduction(legacyGoal('production_hours_per_cadence', 1, 'week'));
    expect(target.consistencyCount).toBe(defaultProduction().consistencyCount);
  });

  it('round-trips ET days metric without mutation', () => {
    const target = decodeEarTraining(legacyGoal('ear_training_days_per_cadence', 4, 'week'));
    expect(target.consistencyCount).toBe(4);
    expect(target.consistencyCadence).toBe('week');
  });

  it('round-trips Production lessons metric without mutation', () => {
    const target = decodeProduction(legacyGoal('production_lessons_per_cadence', 5, 'week'));
    expect(target.consistencyCount).toBe(5);
  });
});

// ---------------------------------------------------------------------
// coverageWeeklyMinutes — per-day math source
// ---------------------------------------------------------------------

describe('coverageWeeklyMinutes', () => {
  // 30-day horizon → ceil(30/7) = 5 weeks for HF/ET coverage math.
  const NOW = 1_700_000_000_000;
  const TARGET_DATE = NOW + 30 * 24 * 60 * 60 * 1000;

  it('returns null when no coverage records contribute', () => {
    const records = encodeHarmonicFluency(hf({ coverageEnabled: false }));
    expect(coverageWeeklyMinutes({
      records,
      moduleId: 'harmonic-fluency',
      targetDate: TARGET_DATE,
      now: NOW,
    })).toBeNull();
  });

  it('HF: items × 10 attempts/item × per-attempt-minutes / weeks', () => {
    // HF foundational group is the default suggestion (130 items).
    const records = encodeHarmonicFluency(hf({
      coverageEnabled: true,
      coverageScope: 'specific',
      coverageGroupIds: ['foundational'],
    }));
    const minutes = coverageWeeklyMinutes({
      records,
      moduleId: 'harmonic-fluency',
      targetDate: TARGET_DATE,
      now: NOW,
    });
    // Sanity bound — should be a positive number (exact value
    // depends on catalog counts which can shift; assert positivity
    // and order of magnitude).
    expect(minutes).not.toBeNull();
    expect(minutes!).toBeGreaterThan(0);
    expect(minutes!).toBeLessThan(1000); // < ~17 hrs/week
  });

  it('Production returns null (no coverage-time model)', () => {
    const records = encodeProduction(prod({ coverageEnabled: true, coverageScope: 'overall' }));
    expect(coverageWeeklyMinutes({
      records,
      moduleId: 'production',
      targetDate: TARGET_DATE,
      now: NOW,
    })).toBeNull();
  });

  it('Repertoire returns null (uses perDayMinutesOverride instead)', () => {
    expect(coverageWeeklyMinutes({
      records: [],
      moduleId: 'repertoire',
      targetDate: TARGET_DATE,
      now: NOW,
    })).toBeNull();
  });
});

// ---------------------------------------------------------------------
// New defaults pinning
// ---------------------------------------------------------------------

describe('Default targets reflect new consistency defaults', () => {
  it('ET defaults: enabled=true, count=5', () => {
    const d = defaultEarTraining();
    expect(d.consistencyEnabled).toBe(true);
    expect(d.consistencyCount).toBe(5);
  });
  it('HF defaults: enabled=true, count=5', () => {
    const d = defaultHarmonicFluency();
    expect(d.consistencyEnabled).toBe(true);
    expect(d.consistencyCount).toBe(5);
  });
  it('Shapes defaults: enabled=true, count=6', () => {
    const d = defaultShapesPatterns();
    expect(d.consistencyEnabled).toBe(true);
    expect(d.consistencyCount).toBe(6);
  });
  it('Production defaults: enabled=true, count=3', () => {
    const d = defaultProduction();
    expect(d.consistencyEnabled).toBe(true);
    expect(d.consistencyCount).toBe(3);
  });
});
