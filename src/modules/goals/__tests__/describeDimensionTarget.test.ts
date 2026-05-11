// @vitest-environment jsdom
/**
 * Tests for describeDimensionTarget — the Goals-home target string
 * formatter for monthly dimension children (coverage / accuracy /
 * consistency rows under a monthly umbrella).
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import { describeDimensionTarget } from '../describeGoal';

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: 'g',
    scope: 'monthly',
    description: '',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: 0,
    targetDate: 0,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

describe('describeDimensionTarget — coverage', () => {
  it('formats HF coverage-specific with group label', () => {
    const out = describeDimensionTarget(
      mkGoal({
        targetMetric: 'harmonic_fluency_coverage_at_acquired_specific',
        targetValue: 130,
        targetUnit: 'foundational',
      }),
      'harmonic-fluency',
    );
    expect(out).toBe('130 foundational cards covered this month');
  });

  it('formats HF coverage-overall without a group label', () => {
    const out = describeDimensionTarget(
      mkGoal({
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        targetValue: 302,
      }),
      'harmonic-fluency',
    );
    expect(out).toBe('302 cards covered this month');
  });

  it('uses "items" noun for ET and Shapes', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 50,
      }),
      'ear-training',
    )).toBe('50 items covered this month');
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'shapes_coverage_at_acquired_specific',
        targetValue: 24,
        targetUnit: 'chord_shape_triads_maj',
      }),
      'shapes-and-patterns',
    )).toBe('24 chord shape triads maj items covered this month');
  });

  it('uses "lessons" noun for Production', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'production_coverage_at_acquired',
        targetValue: 8,
      }),
      'production',
    )).toBe('8 lessons covered this month');
  });

  it('normalizes kebab-case group ids', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'harmonic_fluency_coverage_at_acquired_specific',
        targetValue: 47,
        targetUnit: 'chord-knowledge',
      }),
      'harmonic-fluency',
    )).toBe('47 chord knowledge cards covered this month');
  });
});

describe('describeDimensionTarget — accuracy', () => {
  it('formats overall accuracy with % suffix + module noun', () => {
    const out = describeDimensionTarget(
      mkGoal({
        targetMetric: 'harmonic_fluency_accuracy_overall',
        targetValue: 85,
      }),
      'harmonic-fluency',
    );
    expect(out).toBe('85% accuracy across cards covered this month');
  });

  it('uses the same template for specific accuracy', () => {
    const out = describeDimensionTarget(
      mkGoal({
        targetMetric: 'ear_training_accuracy_specific',
        targetValue: 80,
        targetUnit: 'intervals:ascending',
      }),
      'ear-training',
    );
    expect(out).toBe('80% accuracy across items covered this month');
  });
});

describe('describeDimensionTarget — consistency', () => {
  it('formats days-per-cadence with lowercase module label', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'harmonic_fluency_days_per_cadence',
        targetValue: 5,
        targetUnit: 'week',
      }),
      'harmonic-fluency',
    )).toBe('5 days a week practicing harmonic fluency this month');
  });

  it('elides the module label for practice-consistency', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'practice_days_per_cadence',
        targetValue: 6,
        targetUnit: 'week',
      }),
      'practice-consistency',
    )).toBe('6 days a week practicing this month');
  });

  it('uses Production-specific lessons-per-cadence template', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'production_lessons_per_cadence',
        targetValue: 3,
        targetUnit: 'week',
      }),
      'production',
    )).toBe('3 lessons a week on production this month');
  });

  it('uses Song Repertoire label for repertoire_days_per_cadence', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'repertoire_days_per_cadence',
        targetValue: 6,
        targetUnit: 'week',
      }),
      'repertoire',
    )).toBe('6 days a week practicing song repertoire this month');
  });
});

describe('describeDimensionTarget — fall-through', () => {
  it('returns null for goals outside the three dimensions', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'shapes_proficiency_overall',
        targetValue: 4,
        targetUnit: 'chord_shape_drills:comfortable',
      }),
      'shapes-and-patterns',
    )).toBeNull();
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'items_at_level',
        targetValue: 3,
      }),
      'harmonic-fluency',
    )).toBeNull();
  });

  it('returns null when targetValue is missing', () => {
    expect(describeDimensionTarget(
      mkGoal({
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        targetValue: null,
      }),
      'harmonic-fluency',
    )).toBeNull();
  });
});
