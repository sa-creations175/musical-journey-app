/**
 * Tests for dimensionSortOrder — the by-module monthly section uses
 * this as a sort key so dimension children render Coverage →
 * Consistency → Accuracy/Proficiency → Mastery → other.
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import { dimensionSortOrder } from '../umbrellaSummary';

function mkGoal(metric: string, unit?: string): Goal {
  return {
    id: 'g',
    scope: 'monthly',
    description: '',
    targetMetric: metric,
    targetValue: null,
    targetUnit: unit ?? null,
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
  };
}

describe('dimensionSortOrder', () => {
  it('orders Coverage(0) < Consistency(1) < Accuracy(2) < Mastery(3)', () => {
    const coverage = mkGoal('harmonic_fluency_coverage_at_acquired');
    const consistency = mkGoal('harmonic_fluency_days_per_cadence');
    const accuracy = mkGoal('harmonic_fluency_accuracy_overall');
    const mastery = mkGoal('harmonic_fluency_mastery_at_mastered');
    expect(dimensionSortOrder(coverage)).toBe(0);
    expect(dimensionSortOrder(consistency)).toBe(1);
    expect(dimensionSortOrder(accuracy)).toBe(2);
    expect(dimensionSortOrder(mastery)).toBe(3);
  });

  it('Shapes proficiency sorts with Accuracy (Depth dimension)', () => {
    expect(dimensionSortOrder(mkGoal('shapes_proficiency_overall')))
      .toBe(2);
  });

  it('Unknown / unclassified goals sort last', () => {
    expect(dimensionSortOrder(mkGoal('items_at_level'))).toBe(4);
  });

  it('produces a Coverage→Consistency→Accuracy ordering when used as a comparator', () => {
    const goals = [
      mkGoal('harmonic_fluency_accuracy_overall'),
      mkGoal('harmonic_fluency_days_per_cadence'),
      mkGoal('harmonic_fluency_coverage_at_acquired'),
    ];
    const sorted = [...goals].sort(
      (a, b) => dimensionSortOrder(a) - dimensionSortOrder(b),
    );
    expect(sorted.map(g => g.targetMetric)).toEqual([
      'harmonic_fluency_coverage_at_acquired',
      'harmonic_fluency_days_per_cadence',
      'harmonic_fluency_accuracy_overall',
    ]);
  });
});
