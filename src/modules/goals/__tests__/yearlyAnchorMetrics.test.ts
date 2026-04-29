/**
 * Phase 2 step 5a contract tests. Pins the wire format of the new
 * mastery metric ids so 5b–5e encoders/decoders + a future Step 4b
 * progress-reads extension can't drift, and confirms the existing
 * `goalVocabulary.moduleForMetric` prefix matcher routes each new id
 * to the right flow module without any edit to that file.
 */
import { describe, it, expect } from 'vitest';
import {
  MASTERY_OVERALL_METRIC,
  MASTERY_SPECIFIC_METRIC,
  isMasteryMetric,
  isMasteryOverallMetric,
  isMasterySpecificMetric,
} from '../yearlyAnchorMetrics';
import { moduleForMetric, isNewVocabMetric } from '../goalVocabulary';

// -------------------------------------------------------------------
// Constant contract — exact wire-format strings
// -------------------------------------------------------------------

describe('MASTERY_OVERALL_METRIC — exact ids', () => {
  it.each<[keyof typeof MASTERY_OVERALL_METRIC, string]>([
    ['EAR_TRAINING',     'ear_training_mastery_at_mastered'],
    ['HARMONIC_FLUENCY', 'harmonic_fluency_mastery_at_mastered'],
    ['SHAPES',           'shapes_mastery_at_mastered'],
  ])('%s = %s', (key, expected) => {
    expect(MASTERY_OVERALL_METRIC[key]).toBe(expected);
  });

  it('has exactly 3 entries (Production deliberately omitted)', () => {
    expect(Object.keys(MASTERY_OVERALL_METRIC)).toHaveLength(3);
  });

  it('does not include a Production mastery id (depth/mastery merged for Production)', () => {
    expect(Object.keys(MASTERY_OVERALL_METRIC)).not.toContain('PRODUCTION');
  });

  it('does not include a Song Repertoire mastery id (Songs reuse song_whole_at_level)', () => {
    expect(Object.keys(MASTERY_OVERALL_METRIC)).not.toContain('REPERTOIRE');
    expect(Object.keys(MASTERY_OVERALL_METRIC)).not.toContain('SONGS');
  });
});

describe('MASTERY_SPECIFIC_METRIC — exact ids', () => {
  it.each<[keyof typeof MASTERY_SPECIFIC_METRIC, string]>([
    ['EAR_TRAINING',     'ear_training_mastery_at_mastered_specific'],
    ['HARMONIC_FLUENCY', 'harmonic_fluency_mastery_at_mastered_specific'],
    ['SHAPES',           'shapes_mastery_at_mastered_specific'],
  ])('%s = %s', (key, expected) => {
    expect(MASTERY_SPECIFIC_METRIC[key]).toBe(expected);
  });

  it('has exactly 3 entries (mirrors overall)', () => {
    expect(Object.keys(MASTERY_SPECIFIC_METRIC)).toHaveLength(3);
  });
});

// -------------------------------------------------------------------
// Type guards — overall
// -------------------------------------------------------------------

describe('isMasteryOverallMetric', () => {
  it.each([
    'ear_training_mastery_at_mastered',
    'harmonic_fluency_mastery_at_mastered',
    'shapes_mastery_at_mastered',
  ])('returns true for %s', (m) => {
    expect(isMasteryOverallMetric(m)).toBe(true);
  });

  it.each([
    'ear_training_mastery_at_mastered_specific',
    'ear_training_coverage_at_acquired',          // coverage, not mastery
    'ear_training_accuracy_overall',
    'production_mastery_at_mastered',             // not a defined id
    'song_mastery_at_mastered',                   // not a defined id
    'items_at_level',                             // legacy generic
    null,
    undefined,
    '',
  ])('returns false for %s', (m) => {
    expect(isMasteryOverallMetric(m as string | null | undefined)).toBe(false);
  });
});

// -------------------------------------------------------------------
// Type guards — specific
// -------------------------------------------------------------------

describe('isMasterySpecificMetric', () => {
  it.each([
    'ear_training_mastery_at_mastered_specific',
    'harmonic_fluency_mastery_at_mastered_specific',
    'shapes_mastery_at_mastered_specific',
  ])('returns true for %s', (m) => {
    expect(isMasterySpecificMetric(m)).toBe(true);
  });

  it.each([
    'ear_training_mastery_at_mastered',           // overall, not specific
    'shapes_coverage_at_acquired_specific',       // coverage, not mastery
    null,
    undefined,
    '',
  ])('returns false for %s', (m) => {
    expect(isMasterySpecificMetric(m as string | null | undefined)).toBe(false);
  });
});

// -------------------------------------------------------------------
// Type guards — union
// -------------------------------------------------------------------

describe('isMasteryMetric', () => {
  it('returns true for any of the 6 mastery ids (3 overall + 3 specific)', () => {
    const all = [
      ...Object.values(MASTERY_OVERALL_METRIC),
      ...Object.values(MASTERY_SPECIFIC_METRIC),
    ];
    expect(all).toHaveLength(6);
    for (const m of all) {
      expect(isMasteryMetric(m)).toBe(true);
    }
  });

  it.each([
    'ear_training_coverage_at_acquired',
    'shapes_proficiency_overall',
    'song_whole_at_level',
    'practice_days_per_cadence',
    null,
  ])('returns false for non-mastery metric %s', (m) => {
    expect(isMasteryMetric(m as string | null | undefined)).toBe(false);
  });
});

// -------------------------------------------------------------------
// Routing through goalVocabulary — no edit to that file required
// -------------------------------------------------------------------

describe('goalVocabulary.moduleForMetric routes the new mastery ids', () => {
  it.each<[string, string]>([
    ['ear_training_mastery_at_mastered',                  'ear-training'],
    ['ear_training_mastery_at_mastered_specific',         'ear-training'],
    ['harmonic_fluency_mastery_at_mastered',              'harmonic-fluency'],
    ['harmonic_fluency_mastery_at_mastered_specific',     'harmonic-fluency'],
    ['shapes_mastery_at_mastered',                        'shapes-and-patterns'],
    ['shapes_mastery_at_mastered_specific',               'shapes-and-patterns'],
  ])('%s → %s', (metric, expected) => {
    expect(moduleForMetric(metric)).toBe(expected);
  });

  it('all 6 mastery ids are recognised as new-vocab metrics', () => {
    const all = [
      ...Object.values(MASTERY_OVERALL_METRIC),
      ...Object.values(MASTERY_SPECIFIC_METRIC),
    ];
    for (const m of all) {
      expect(isNewVocabMetric(m)).toBe(true);
    }
  });
});
