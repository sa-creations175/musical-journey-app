// @vitest-environment jsdom
/**
 * Unit tests for goalTypeLabel — the by-module view's row-badge
 * label. Pins the Breadth → "Coverage" rename and the existing
 * module-aware Depth → Accuracy/Proficiency mapping.
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import { goalTypeLabel } from '../umbrellaSummary';

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

describe('goalTypeLabel', () => {
  it('Breadth → "Coverage"', () => {
    expect(goalTypeLabel(
      goal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      'ear-training',
    )).toBe('Coverage');
    expect(goalTypeLabel(
      goal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' }),
      'harmonic-fluency',
    )).toBe('Coverage');
    expect(goalTypeLabel(
      goal({ targetMetric: 'shapes_coverage_at_acquired' }),
      'shapes-and-patterns',
    )).toBe('Coverage');
  });

  it('Consistency → "Consistency"', () => {
    expect(goalTypeLabel(
      goal({ targetMetric: 'harmonic_fluency_days_per_cadence' }),
      'harmonic-fluency',
    )).toBe('Consistency');
    expect(goalTypeLabel(
      goal({ targetMetric: 'repertoire_days_per_cadence' }),
      'repertoire',
    )).toBe('Consistency');
  });

  it('Depth → "Accuracy" for ET/HF', () => {
    expect(goalTypeLabel(
      goal({ targetMetric: 'ear_training_accuracy_overall' }),
      'ear-training',
    )).toBe('Accuracy');
    expect(goalTypeLabel(
      goal({ targetMetric: 'harmonic_fluency_accuracy_overall' }),
      'harmonic-fluency',
    )).toBe('Accuracy');
  });

  it('Depth → "Proficiency" for Shapes/Production', () => {
    expect(goalTypeLabel(
      goal({ targetMetric: 'shapes_proficiency_overall' }),
      'shapes-and-patterns',
    )).toBe('Proficiency');
    expect(goalTypeLabel(
      goal({ targetMetric: 'production_path_completion' }),
      'production',
    )).toBe('Proficiency');
  });

  it('returns null for unclassifiable metrics', () => {
    expect(goalTypeLabel(goal({ targetMetric: null }), 'ear-training')).toBeNull();
    expect(goalTypeLabel(goal({ targetMetric: 'totally_made_up_metric' }), 'ear-training')).toBeNull();
  });
});
