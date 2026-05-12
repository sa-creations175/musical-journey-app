/**
 * Phase 2 step 2a contract tests. Pins the wire format of the new
 * coverage metric ids so 2b–2e encoders/decoders + step 5/6 progress
 * calculation + Phase 5 auto-progress can't drift, and confirms the
 * existing `goalVocabulary.moduleForMetric` prefix matcher routes
 * each new id to the right flow module without any edit to that file.
 */
import { describe, it, expect } from 'vitest';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
  isCoverageMetric,
  isCoverageOverallMetric,
  isCoverageSpecificMetric,
} from '../coverageMetrics';
import { moduleForMetric, isNewVocabMetric } from '../goalVocabulary';

// -------------------------------------------------------------------
// Constant contract — exact wire-format strings
// -------------------------------------------------------------------

describe('COVERAGE_OVERALL_METRIC — exact ids', () => {
  it.each<[keyof typeof COVERAGE_OVERALL_METRIC, string]>([
    ['EAR_TRAINING',     'ear_training_coverage_at_acquired'],
    ['HARMONIC_FLUENCY', 'harmonic_fluency_coverage_at_acquired'],
    ['SHAPES',           'shapes_coverage_at_acquired'],
    ['PRODUCTION',       'production_coverage_at_acquired'],
  ])('%s = %s', (key, expected) => {
    expect(COVERAGE_OVERALL_METRIC[key]).toBe(expected);
  });

  it('has exactly 4 entries (one per coverage-eligible module)', () => {
    expect(Object.keys(COVERAGE_OVERALL_METRIC)).toHaveLength(4);
  });
});

describe('COVERAGE_SPECIFIC_METRIC — exact ids', () => {
  it.each<[keyof typeof COVERAGE_SPECIFIC_METRIC, string]>([
    ['EAR_TRAINING',     'ear_training_coverage_at_acquired_specific'],
    ['HARMONIC_FLUENCY', 'harmonic_fluency_coverage_at_acquired_specific'],
    ['SHAPES',           'shapes_coverage_at_acquired_specific'],
    ['PRODUCTION',       'production_coverage_at_acquired_specific'],
  ])('%s = %s', (key, expected) => {
    expect(COVERAGE_SPECIFIC_METRIC[key]).toBe(expected);
  });

  it('has exactly 4 entries (one per coverage-eligible module)', () => {
    expect(Object.keys(COVERAGE_SPECIFIC_METRIC)).toHaveLength(4);
  });
});

// -------------------------------------------------------------------
// Type-guard discrimination
// -------------------------------------------------------------------

describe('isCoverageOverallMetric', () => {
  it.each(Object.values(COVERAGE_OVERALL_METRIC))('accepts %s', m => {
    expect(isCoverageOverallMetric(m)).toBe(true);
  });

  it.each(Object.values(COVERAGE_SPECIFIC_METRIC))('rejects specific variant %s', m => {
    expect(isCoverageOverallMetric(m)).toBe(false);
  });

  it('rejects look-alike non-coverage metrics', () => {
    expect(isCoverageOverallMetric('ear_training_accuracy_overall')).toBe(false);
    expect(isCoverageOverallMetric('harmonic_fluency_accuracy_overall')).toBe(false);
    expect(isCoverageOverallMetric('items_at_level')).toBe(false);
  });

  it('handles null / undefined / empty string without throwing', () => {
    expect(isCoverageOverallMetric(null)).toBe(false);
    expect(isCoverageOverallMetric(undefined)).toBe(false);
    expect(isCoverageOverallMetric('')).toBe(false);
  });
});

describe('isCoverageSpecificMetric', () => {
  it.each(Object.values(COVERAGE_SPECIFIC_METRIC))('accepts %s', m => {
    expect(isCoverageSpecificMetric(m)).toBe(true);
  });

  it.each(Object.values(COVERAGE_OVERALL_METRIC))('rejects overall variant %s', m => {
    expect(isCoverageSpecificMetric(m)).toBe(false);
  });

  it('rejects look-alike non-coverage metrics', () => {
    expect(isCoverageSpecificMetric('ear_training_accuracy_specific')).toBe(false);
    expect(isCoverageSpecificMetric('shapes_proficiency_specific')).toBe(false);
  });

  it('handles null / undefined / empty string without throwing', () => {
    expect(isCoverageSpecificMetric(null)).toBe(false);
    expect(isCoverageSpecificMetric(undefined)).toBe(false);
    expect(isCoverageSpecificMetric('')).toBe(false);
  });
});

describe('isCoverageMetric — union of both', () => {
  it.each([
    ...Object.values(COVERAGE_OVERALL_METRIC),
    ...Object.values(COVERAGE_SPECIFIC_METRIC),
  ])('accepts %s', m => {
    expect(isCoverageMetric(m)).toBe(true);
  });

  it('rejects non-coverage metrics', () => {
    expect(isCoverageMetric('ear_training_accuracy_overall')).toBe(false);
    expect(isCoverageMetric('practice_days_per_cadence')).toBe(false);
    expect(isCoverageMetric('items_at_level')).toBe(false);
    expect(isCoverageMetric(null)).toBe(false);
    expect(isCoverageMetric(undefined)).toBe(false);
    expect(isCoverageMetric('')).toBe(false);
  });
});

// -------------------------------------------------------------------
// Integration with existing goalVocabulary routing
// -------------------------------------------------------------------

describe('coverage metrics route via existing goalVocabulary.moduleForMetric', () => {
  it.each<[string, ReturnType<typeof moduleForMetric>]>([
    [COVERAGE_OVERALL_METRIC.EAR_TRAINING,      'ear-training'],
    [COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,  'harmonic-fluency'],
    [COVERAGE_OVERALL_METRIC.SHAPES,            'shapes-and-patterns'],
    [COVERAGE_OVERALL_METRIC.PRODUCTION,        'production'],
    [COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,     'ear-training'],
    [COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY, 'harmonic-fluency'],
    [COVERAGE_SPECIFIC_METRIC.SHAPES,           'shapes-and-patterns'],
    [COVERAGE_SPECIFIC_METRIC.PRODUCTION,       'production'],
  ])('%s → %s', (metric, expectedFlowModule) => {
    expect(moduleForMetric(metric)).toBe(expectedFlowModule);
  });

  it('every coverage metric is recognized as new-vocab (so edit-mode opens GoalCreationFlow, not GoalFormModal)', () => {
    for (const m of Object.values(COVERAGE_OVERALL_METRIC)) {
      expect(isNewVocabMetric(m)).toBe(true);
    }
    for (const m of Object.values(COVERAGE_SPECIFIC_METRIC)) {
      expect(isNewVocabMetric(m)).toBe(true);
    }
  });

  it('song_of_month routes to repertoire so TBD-only umbrellas surface in by-module view', () => {
    // Without this routing, a Repertoire monthly umbrella whose only
    // children are TBD spotlight / queue slots (all song_of_month) is
    // invisible — every child's metric resolves to null and
    // umbrellaModuleId derives the umbrella's module from its children.
    expect(moduleForMetric('song_of_month')).toBe('repertoire');
    expect(isNewVocabMetric('song_of_month')).toBe(true);
  });
});
