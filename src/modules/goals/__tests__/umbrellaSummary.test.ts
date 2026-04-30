/**
 * Phase 2 step 6c.1 — tests for the umbrella row helpers.
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  dimensionForGoal,
  dimensionDisplayLabel,
  umbrellaSubtitle,
  findChildren,
  umbrellaModuleId,
  isCrossModuleUmbrella,
  isConcatenatedChildSummary,
} from '../umbrellaSummary';

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'yearly',
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
    ...overrides,
  };
}

describe('dimensionForGoal', () => {
  it('classifies coverage metrics as Breadth', () => {
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      ),
    ).toBe('Breadth');
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'shapes_coverage_at_acquired_specific' }),
      ),
    ).toBe('Breadth');
  });

  it('classifies mastery metrics as Mastery', () => {
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'ear_training_mastery_at_mastered' }),
      ),
    ).toBe('Mastery');
  });

  it('classifies *_accuracy_* metrics as Depth', () => {
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'ear_training_accuracy_overall' }),
      ),
    ).toBe('Depth');
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'harmonic_fluency_accuracy_specific' }),
      ),
    ).toBe('Depth');
  });

  it('classifies *_sessions_per_* metrics as Consistency', () => {
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'ear_training_sessions_per_week' }),
      ),
    ).toBe('Consistency');
  });

  it('classifies practice_* meta-habit metrics as Consistency', () => {
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'practice_weekly_floor_days' }),
      ),
    ).toBe('Consistency');
  });

  it('uses song targetUnit to pick the dimension', () => {
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'song_whole_at_level', targetUnit: 'comfortable' }),
      ),
    ).toBe('Breadth');
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'song_whole_at_level', targetUnit: 'solid' }),
      ),
    ).toBe('Depth');
    expect(
      dimensionForGoal(
        mkGoal({ targetMetric: 'song_whole_at_level', targetUnit: 'internalized' }),
      ),
    ).toBe('Mastery');
  });

  it('returns null for goals that do not fit the framework', () => {
    expect(dimensionForGoal(mkGoal({ targetMetric: null }))).toBeNull();
    expect(dimensionForGoal(mkGoal({ targetMetric: 'count_completed' }))).toBeNull();
  });
});

describe('umbrellaSubtitle', () => {
  it('joins distinct dimensions in the order children are passed (with display-label mapping)', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }), // Breadth
      mkGoal({ targetMetric: 'ear_training_mastery_at_mastered' }),  // Mastery
      mkGoal({ targetMetric: 'ear_training_accuracy_overall' }),     // Depth → Accuracy (ET)
      mkGoal({ targetMetric: 'ear_training_sessions_per_week' }),    // Consistency
    ];
    expect(umbrellaSubtitle(children)).toBe(
      'Breadth · Mastery · Accuracy · Consistency',
    );
  });

  it('renders Depth as Proficiency for time-module children', () => {
    const children = [
      mkGoal({ targetMetric: 'shapes_coverage_at_acquired' }),       // Breadth
      mkGoal({ targetMetric: 'shapes_accuracy_overall' }),           // Depth → Proficiency
    ];
    expect(umbrellaSubtitle(children)).toBe('Breadth · Proficiency');
  });

  it('dedupes when multiple children share a dimension', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ targetMetric: 'shapes_coverage_at_acquired' }),
      mkGoal({ targetMetric: 'production_coverage_at_acquired' }),
    ];
    expect(umbrellaSubtitle(children)).toBe('Breadth');
  });

  it('preserves the order children appear in the list', () => {
    // Subtitle ordering follows children's rendered order so the
    // overview matches what the user sees below the umbrella.
    const consistencyFirst = [
      mkGoal({ targetMetric: 'ear_training_sessions_per_week' }),    // Consistency
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }), // Breadth
    ];
    expect(umbrellaSubtitle(consistencyFirst)).toBe('Consistency · Breadth');

    const breadthFirst = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }), // Breadth
      mkGoal({ targetMetric: 'ear_training_sessions_per_week' }),    // Consistency
    ];
    expect(umbrellaSubtitle(breadthFirst)).toBe('Breadth · Consistency');
  });

  it('skips Depth from the subtitle when no child carries that dimension', () => {
    // Active dimensions only: a Mastery + Consistency umbrella
    // does not surface a phantom "Depth" slot.
    const children = [
      mkGoal({ targetMetric: 'ear_training_mastery_at_mastered' }),  // Mastery
      mkGoal({ targetMetric: 'ear_training_sessions_per_week' }),    // Consistency
    ];
    expect(umbrellaSubtitle(children)).toBe('Mastery · Consistency');
  });

  it('returns null when no child has a classifiable dimension', () => {
    const children = [mkGoal({ targetMetric: null })];
    expect(umbrellaSubtitle(children)).toBeNull();
  });

  it('returns null when called with no children', () => {
    expect(umbrellaSubtitle([])).toBeNull();
  });
});

describe('findChildren', () => {
  it('returns children with parentGoalId pointing at the umbrella + same scope', () => {
    const umbrella = mkGoal({ id: 'u1', scope: 'yearly', isUmbrella: true });
    const all = [
      umbrella,
      mkGoal({ id: 'c1', scope: 'yearly', parentGoalId: 'u1', targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ id: 'c2', scope: 'yearly', parentGoalId: 'u1', targetMetric: 'ear_training_mastery_at_mastered' }),
      mkGoal({ id: 'c3', scope: 'monthly', parentGoalId: 'u1' }), // wrong scope
      mkGoal({ id: 'c4', scope: 'yearly', parentGoalId: 'other' }), // wrong parent
    ];
    const out = findChildren(umbrella, all);
    expect(out.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('does not include the umbrella in its own children list', () => {
    const umbrella = mkGoal({ id: 'u1', scope: 'yearly', isUmbrella: true });
    const out = findChildren(umbrella, [umbrella]);
    expect(out).toEqual([]);
  });
});

describe('umbrellaModuleId', () => {
  it('returns the shared module when every child agrees', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ targetMetric: 'ear_training_mastery_at_mastered' }),
      mkGoal({ targetMetric: 'ear_training_accuracy_overall' }),
    ];
    expect(umbrellaModuleId(children)).toBe('ear-training');
  });

  it('returns null when children span multiple modules', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ targetMetric: 'shapes_coverage_at_acquired' }),
    ];
    expect(umbrellaModuleId(children)).toBeNull();
  });

  it('skips children with non-derivable modules but still returns the rest', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ targetMetric: null }), // no module
    ];
    expect(umbrellaModuleId(children)).toBe('ear-training');
  });

  it('returns null when no child has a derivable module', () => {
    const children = [mkGoal({ targetMetric: null })];
    expect(umbrellaModuleId(children)).toBeNull();
  });
});

describe('dimensionDisplayLabel', () => {
  it('renames Depth → Accuracy for card modules', () => {
    expect(dimensionDisplayLabel('Depth', 'ear-training')).toBe('Accuracy');
    expect(dimensionDisplayLabel('Depth', 'harmonic-fluency')).toBe('Accuracy');
  });

  it('renames Depth → Proficiency for time/proficiency modules', () => {
    expect(dimensionDisplayLabel('Depth', 'repertoire')).toBe('Proficiency');
    expect(dimensionDisplayLabel('Depth', 'shapes-and-patterns')).toBe('Proficiency');
    expect(dimensionDisplayLabel('Depth', 'production')).toBe('Proficiency');
  });

  it('defaults Depth → Proficiency when moduleId is null or practice-consistency', () => {
    expect(dimensionDisplayLabel('Depth', null)).toBe('Proficiency');
    expect(dimensionDisplayLabel('Depth', 'practice-consistency')).toBe('Proficiency');
  });

  it('passes Breadth, Mastery, and Consistency through unchanged', () => {
    expect(dimensionDisplayLabel('Breadth', 'ear-training')).toBe('Breadth');
    expect(dimensionDisplayLabel('Mastery', 'shapes-and-patterns')).toBe('Mastery');
    expect(dimensionDisplayLabel('Consistency', null)).toBe('Consistency');
  });
});

describe('isConcatenatedChildSummary', () => {
  it('catches the legacy run-on concatenation on umbrella records', () => {
    const goal = mkGoal({
      isUmbrella: true,
      description:
        'Cover all 143 ear training items (acquired) and Improve my overall ear training accuracy to 80% and practice at least 3 times a week',
    });
    expect(isConcatenatedChildSummary(goal)).toBe(true);
  });

  it('returns false for non-umbrella goals even if their description contains " and "', () => {
    const goal = mkGoal({
      isUmbrella: false,
      description: 'Practice scales and arpeggios this week',
    });
    expect(isConcatenatedChildSummary(goal)).toBe(false);
  });

  it('returns false for umbrella records without " and " in their description', () => {
    expect(
      isConcatenatedChildSummary(
        mkGoal({ isUmbrella: true, description: 'Build comprehensive Ear Training mastery in 2026' }),
      ),
    ).toBe(false);
    expect(
      isConcatenatedChildSummary(mkGoal({ isUmbrella: true, description: '' })),
    ).toBe(false);
  });

  it('treats a user-customized title containing " and " as legacy too (accepted false positive)', () => {
    // Documented trade-off: if a real user types " and " into
    // their umbrella name, it gets substituted with the new
    // auto-default. They can re-edit. The legacy-concat case is
    // common enough to warrant the broad heuristic.
    expect(
      isConcatenatedChildSummary(
        mkGoal({ isUmbrella: true, description: 'Master ET basics and dive deeper' }),
      ),
    ).toBe(true);
  });
});

describe('isCrossModuleUmbrella', () => {
  it('is true when children span 2+ modules', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ targetMetric: 'shapes_coverage_at_acquired' }),
    ];
    expect(isCrossModuleUmbrella(children)).toBe(true);
  });

  it('is false when all children share one module', () => {
    const children = [
      mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' }),
      mkGoal({ targetMetric: 'ear_training_mastery_at_mastered' }),
    ];
    expect(isCrossModuleUmbrella(children)).toBe(false);
  });

  it('is false when no child has a derivable module', () => {
    expect(isCrossModuleUmbrella([mkGoal({ targetMetric: null })])).toBe(false);
  });
});
