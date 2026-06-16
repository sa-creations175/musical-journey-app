// @vitest-environment jsdom
/**
 * Phase 2 step 4 contract tests for `progress.ts`. Two layers:
 *
 *   1. Pure routing on top of seeded Dexie state (fake-indexeddb) —
 *      coverage primitives, accuracy primitives, by-metric routing.
 *   2. `getGoalProgress` smoke tests covering every supported and
 *      unsupported metric path so a goal-row consumer never crashes
 *      on a metric the helper hasn't yet implemented.
 *
 * jsdom env required because db.ts touches `window` at module load
 * under an `import.meta.env.DEV` guard. fake-indexeddb backs the
 * real db instance — no sync hooks are installed in tests
 * (installSyncHooks is opt-in), so writes don't touch a remote.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type AcquisitionStage, type AttemptRecord, type Goal, type SpacingState } from '../../../lib/db';
import { FLASHCARDS, type FlashcardCategory } from '../../harmonic-fluency/catalog';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
} from '../coverageMetrics';
import {
  ACCURACY_ROLLING_WINDOW,
  COVERED_STAGES,
  countCoveredSpacingRows,
  getCoverageCount,
  getEarTrainingAccuracy,
  getEffectiveCoverageCount,
  getGoalProgress,
  getHarmonicFluencyAccuracy,
  moduleAccuracy,
} from '../progress';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

let rowCounter = 0;
function makeSpacingRow(
  itemRef: string,
  moduleRef: string,
  stage: AcquisitionStage,
): SpacingState {
  rowCounter += 1;
  return {
    id: `test-row-${rowCounter}`,
    itemRef,
    moduleRef,
    memoryType: 'declarative',  // memoryType is not consulted by progress.ts
    hand: 'both',
    style: 'solid',
    acquisitionStage: stage,
    currentIntervalDays: 0,
    lastEngagedAt: 0,
    nextDueAt: null,
    performanceHistory: [],
  };
}

function makeAttempt(
  moduleId: string,
  itemId: string,
  correct: boolean,
  timestamp: number,
  opts: Partial<AttemptRecord> = {},
): AttemptRecord {
  return {
    moduleId,
    itemId,
    correct,
    timestamp,
    ...opts,
  };
}

beforeEach(async () => {
  await db.spacingState.clear();
  await db.attempts.clear();
});

// -------------------------------------------------------------------
// COVERED_STAGES constant
// -------------------------------------------------------------------

describe('COVERED_STAGES', () => {
  it('includes acquired, consolidated, mastered', () => {
    expect(COVERED_STAGES.has('acquired')).toBe(true);
    expect(COVERED_STAGES.has('consolidated')).toBe(true);
    expect(COVERED_STAGES.has('mastered')).toBe(true);
  });

  it('excludes new and acquiring', () => {
    expect(COVERED_STAGES.has('new')).toBe(false);
    expect(COVERED_STAGES.has('acquiring')).toBe(false);
  });
});

// -------------------------------------------------------------------
// countCoveredSpacingRows — primitive
// -------------------------------------------------------------------

describe('countCoveredSpacingRows', () => {
  it('returns 0 for empty moduleRefs', async () => {
    expect(await countCoveredSpacingRows([])).toBe(0);
  });

  it('counts only acquired+ rows in the moduleRef set', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('a', 'intervals', 'acquired'),
      makeSpacingRow('b', 'intervals', 'consolidated'),
      makeSpacingRow('c', 'intervals', 'mastered'),
      makeSpacingRow('d', 'intervals', 'acquiring'),  // not covered
      makeSpacingRow('e', 'intervals', 'new'),        // not covered
      makeSpacingRow('f', 'chord-recognition', 'acquired'),
      makeSpacingRow('g', 'harmonic-fluency', 'acquired'),  // not in filter
    ]);
    expect(await countCoveredSpacingRows(['intervals', 'chord-recognition']))
      .toBe(4);
  });

  it('applies itemRef predicate when provided', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C',  'shapes-and-patterns', 'acquired'),
      makeSpacingRow('scale:major:C',        'shapes-and-patterns', 'acquired'),
      makeSpacingRow('vl:aba-251:C',         'shapes-and-patterns', 'acquired'),
    ]);
    const onlyChordShapes = await countCoveredSpacingRows(
      ['shapes-and-patterns'],
      itemRef => itemRef.startsWith('chord-shape:'),
    );
    expect(onlyChordShapes).toBe(1);
  });
});

// -------------------------------------------------------------------
// getCoverageCount — overall variants
// -------------------------------------------------------------------

describe('getCoverageCount — overall', () => {
  it('Ear Training overall counts across all 4 ET submodules', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('a', 'intervals',          'acquired'),
      makeSpacingRow('b', 'chord-recognition',  'acquired'),
      makeSpacingRow('c', 'chord-progressions', 'mastered'),
      makeSpacingRow('d', 'scales-modes',       'consolidated'),
      makeSpacingRow('e', 'harmonic-fluency',   'acquired'),  // excluded
    ]);
    expect(await getCoverageCount(COVERAGE_OVERALL_METRIC.EAR_TRAINING))
      .toBe(4);
  });

  it('Harmonic Fluency overall counts only harmonic-fluency rows', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('mo-1', 'harmonic-fluency', 'acquired'),
      makeSpacingRow('iv-1', 'harmonic-fluency', 'acquired'),
      makeSpacingRow('a',    'intervals',        'acquired'),  // excluded
    ]);
    expect(await getCoverageCount(COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY))
      .toBe(2);
  });

  it('Shapes overall counts only shapes-and-patterns rows', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C', 'shapes-and-patterns', 'acquired'),
      makeSpacingRow('scale:major:C',       'shapes-and-patterns', 'mastered'),
      makeSpacingRow('mo-1',                'harmonic-fluency',    'acquired'),
    ]);
    expect(await getCoverageCount(COVERAGE_OVERALL_METRIC.SHAPES))
      .toBe(2);
  });

  it('Production overall counts only production rows', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('wf-01',   'production',     'acquired'),
      makeSpacingRow('lang-01', 'production',     'mastered'),
      makeSpacingRow('a',       'intervals',      'acquired'),
    ]);
    expect(await getCoverageCount(COVERAGE_OVERALL_METRIC.PRODUCTION))
      .toBe(2);
  });

  it('returns 0 when no rows exist', async () => {
    expect(await getCoverageCount(COVERAGE_OVERALL_METRIC.EAR_TRAINING))
      .toBe(0);
  });
});

// -------------------------------------------------------------------
// getCoverageCount — specific variants
// -------------------------------------------------------------------

describe('getCoverageCount — specific (ET)', () => {
  it('counts only the requested submodule', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('a', 'intervals',         'acquired'),
      makeSpacingRow('b', 'intervals',         'mastered'),
      makeSpacingRow('c', 'chord-recognition', 'acquired'),
    ]);
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.EAR_TRAINING, 'intervals'))
      .toBe(2);
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.EAR_TRAINING, 'chord-recognition'))
      .toBe(1);
  });

  it('returns 0 for unknown sub-area', async () => {
    await db.spacingState.add(makeSpacingRow('a', 'intervals', 'acquired'));
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.EAR_TRAINING, 'bogus-group'))
      .toBe(0);
  });

  it('returns 0 when sub-area is null/undefined', async () => {
    await db.spacingState.add(makeSpacingRow('a', 'intervals', 'acquired'));
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.EAR_TRAINING, null))
      .toBe(0);
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.EAR_TRAINING))
      .toBe(0);
  });
});

describe('getCoverageCount — specific (HF)', () => {
  // Pull a known card per category from the canonical FLASHCARDS list
  // so the test stays in sync with catalog reorganisation.
  const cardForCategory = (cat: FlashcardCategory) =>
    FLASHCARDS.find(c => c.category === cat)!.id;

  it('foundational group includes scale-degree-math + named-notes + key-signatures categories', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow(cardForCategory('scale-degree-math'), 'harmonic-fluency', 'acquired'),
      makeSpacingRow(cardForCategory('named-notes'),       'harmonic-fluency', 'acquired'),
      makeSpacingRow(cardForCategory('modes'),             'harmonic-fluency', 'acquired'),  // ear-recognition, excluded
    ]);
    expect(await getCoverageCount(
      COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      'foundational',
    )).toBe(2);
  });

  it('ear-recognition group includes modes + intervals + ear-theory categories', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow(cardForCategory('modes'),     'harmonic-fluency', 'acquired'),
      makeSpacingRow(cardForCategory('intervals'), 'harmonic-fluency', 'acquired'),
      makeSpacingRow(cardForCategory('ear-theory'),'harmonic-fluency', 'acquired'),
    ]);
    expect(await getCoverageCount(
      COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      'ear-recognition',
    )).toBe(3);
  });

  it('returns 0 for unknown HF group id', async () => {
    expect(await getCoverageCount(
      COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      'not-a-real-group',
    )).toBe(0);
  });

  it('skips itemRefs that do not resolve to a known card', async () => {
    await db.spacingState.add(
      makeSpacingRow('not-a-real-card-id', 'harmonic-fluency', 'acquired'),
    );
    expect(await getCoverageCount(
      COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      'foundational',
    )).toBe(0);
  });
});

describe('getCoverageCount — specific (S&P)', () => {
  beforeEach(async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C', 'shapes-and-patterns', 'acquired'),
      makeSpacingRow('chord-shape:min7:C', 'shapes-and-patterns', 'mastered'),
      makeSpacingRow('scale:major:C',       'shapes-and-patterns', 'acquired'),
      makeSpacingRow('vl:aba-251:C',        'shapes-and-patterns', 'consolidated'),
    ]);
  });

  it('chord_shape_drills filters by chord-shape: prefix', async () => {
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.SHAPES, 'chord_shape_drills'))
      .toBe(2);
  });

  it('scale_drills filters by scale: prefix', async () => {
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.SHAPES, 'scale_drills'))
      .toBe(1);
  });

  it('voice_leading filters by vl: prefix', async () => {
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.SHAPES, 'voice_leading'))
      .toBe(1);
  });

  it('returns 0 for unknown S&P sub-area', async () => {
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.SHAPES, 'mental_viz'))
      .toBe(0);
  });
});

describe('getCoverageCount — specific (Production)', () => {
  it('counts only lessons in the requested path', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('wf-01',   'production', 'acquired'),
      makeSpacingRow('wf-02',   'production', 'mastered'),
      makeSpacingRow('lang-01', 'production', 'acquired'),
    ]);
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.PRODUCTION, 'workflow-foundations'))
      .toBe(2);
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.PRODUCTION, 'language-of-production'))
      .toBe(1);
  });

  it('returns 0 for an unknown path id', async () => {
    expect(await getCoverageCount(COVERAGE_SPECIFIC_METRIC.PRODUCTION, 'not-a-path'))
      .toBe(0);
  });
});

// -------------------------------------------------------------------
// getEffectiveCoverageCount — Step 9b follow-up #2
//
// Adds two semantics on top of getCoverageCount:
//   (1) honors goal.relatedItems (Accept-extended carry-over scope —
//       items outside the metric predicate / outside the metric's
//       sub-area still count toward the numerator)
//   (2) dedupes — an item in both predicate AND relatedItems counts
//       once, not twice
//
// Tests below use real catalog itemRefs so they pass the
// effectiveScopeForGoal enumeration. Synthetic IDs wouldn't be in the
// catalog and would silently drop to zero.
// -------------------------------------------------------------------

describe('getEffectiveCoverageCount — relatedItems-aware coverage', () => {
  // Reuses the local `makeGoal` defined below (hoisted via function
  // declaration). Body referenced before declaration — fine for
  // function statements, not for `const = function`.
  function _mkGoal(partial: Partial<Goal>): Goal {
    return {
      id: partial.id ?? 'eff-cov-goal',
      scope: partial.scope ?? 'monthly',
      description: partial.description ?? '',
      targetMetric: partial.targetMetric ?? null,
      targetValue: partial.targetValue ?? 0,
      targetUnit: partial.targetUnit ?? null,
      currentValue: partial.currentValue ?? 0,
      contextTag: partial.contextTag ?? null,
      relatedModules: partial.relatedModules ?? [],
      relatedItems: partial.relatedItems ?? [],
      startDate: partial.startDate ?? 0,
      targetDate: partial.targetDate ?? 0,
      status: partial.status ?? 'active',
      parentGoalId: partial.parentGoalId ?? null,
      contributesNumericallyToParent: partial.contributesNumericallyToParent ?? false,
      isUmbrella: partial.isUmbrella ?? false,
      lastEngagedAt: partial.lastEngagedAt ?? null,
    };
  }

  it('counts items only in relatedItems when they reach COVERED_STAGES (Fix 1 primary)', async () => {
    // Monthly goal scoped to chord_shape_drills (matches every
    // `chord-shape:` ref). Carryover Accept extended scope with a
    // scale row (NOT matched by the chord-shape predicate). Both
    // covered → both should count.
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C:root', 'shapes-and-patterns', 'acquired'),
      makeSpacingRow('scale:major:C',           'shapes-and-patterns', 'acquired'),
    ]);
    const goal = _mkGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_drills',
      relatedItems: ['scale:major:C'],
    });
    expect(await getEffectiveCoverageCount(goal)).toBe(2);
  });

  it('counts predicate-matching items normally (regression guard)', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C:root', 'shapes-and-patterns', 'acquired'),
      makeSpacingRow('chord-shape:min7:C:root', 'shapes-and-patterns', 'mastered'),
    ]);
    const goal = _mkGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_drills',
      relatedItems: [], // no Accept-extension; behaves like getCoverageCount
    });
    expect(await getEffectiveCoverageCount(goal)).toBe(2);
  });

  it('dedupes — item in BOTH predicate match and relatedItems counts once', async () => {
    // chord-shape:maj7:C:root matches the chord_shape_drills predicate
    // AND is explicitly listed in relatedItems. Must not double-count.
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C:root', 'shapes-and-patterns', 'acquired'),
    ]);
    const goal = _mkGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_drills',
      relatedItems: ['chord-shape:maj7:C:root'],
    });
    expect(await getEffectiveCoverageCount(goal)).toBe(1);
  });

  it('cross-submodule ET — chord-recognition goal counting an intervals relatedItem', async () => {
    // The primary Accept use case per the user's reframing: leftover
    // items from a *different* sub-area than the active monthly goal.
    // ET specific goals scope to a single submodule by moduleRef;
    // relatedItems extension lets cross-submodule items count.
    await db.spacingState.bulkAdd([
      makeSpacingRow('maj',     'chord-recognition', 'acquired'),
      makeSpacingRow('M3:asc',  'intervals',         'acquired'),
    ]);
    const goal = _mkGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
      relatedItems: ['M3:asc'], // leftover from a prior intervals month
    });
    expect(await getEffectiveCoverageCount(goal)).toBe(2);
  });

  it('does not count items in non-COVERED stages', async () => {
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C:root', 'shapes-and-patterns', 'acquiring'),
      makeSpacingRow('scale:major:C',           'shapes-and-patterns', 'new'),
    ]);
    const goal = _mkGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_drills',
      relatedItems: ['scale:major:C'],
    });
    expect(await getEffectiveCoverageCount(goal)).toBe(0);
  });
});

// -------------------------------------------------------------------
// moduleAccuracy primitive
// -------------------------------------------------------------------

describe('moduleAccuracy', () => {
  it('returns null percent when total < MIN_ATTEMPTS_FOR_TIER (5)', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', true,  1),
      makeAttempt('intervals', 'M3', true,  2),
      makeAttempt('intervals', 'M3', false, 3),
    ]);
    const r = await moduleAccuracy(['intervals']);
    expect(r.total).toBe(3);
    expect(r.correct).toBe(2);
    expect(r.percent).toBeNull();
  });

  it('computes percent when total >= 5', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', true,  1),
      makeAttempt('intervals', 'M3', true,  2),
      makeAttempt('intervals', 'M3', true,  3),
      makeAttempt('intervals', 'M3', true,  4),
      makeAttempt('intervals', 'M3', false, 5),
    ]);
    const r = await moduleAccuracy(['intervals']);
    expect(r.percent).toBe(80);
  });

  it('excludes excludeFromFluency rows', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', true,  1),
      makeAttempt('intervals', 'M3', true,  2),
      makeAttempt('intervals', 'M3', true,  3),
      makeAttempt('intervals', 'M3', true,  4),
      makeAttempt('intervals', 'M3', true,  5),
      makeAttempt('intervals', 'M3', false, 6, { excludeFromFluency: true }),
      makeAttempt('intervals', 'M3', false, 7, { excludeFromFluency: true }),
    ]);
    const r = await moduleAccuracy(['intervals']);
    expect(r.total).toBe(5);
    expect(r.percent).toBe(100);
  });

  it('takes only the most recent `window` attempts', async () => {
    // 6 attempts: oldest 3 false, newest 3 true. Window of 3 → 100%.
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', false, 1),
      makeAttempt('intervals', 'M3', false, 2),
      makeAttempt('intervals', 'M3', false, 3),
      makeAttempt('intervals', 'M3', true,  4),
      makeAttempt('intervals', 'M3', true,  5),
      makeAttempt('intervals', 'M3', true,  6),
    ]);
    const r = await moduleAccuracy(['intervals'], { window: 3 });
    // Window of 3 brings total down to 3, which is < MIN_ATTEMPTS_FOR_TIER
    expect(r.total).toBe(3);
    expect(r.correct).toBe(3);
    expect(r.percent).toBeNull();
  });

  it('default window is ACCURACY_ROLLING_WINDOW (200) — caps large datasets', async () => {
    expect(ACCURACY_ROLLING_WINDOW).toBe(200);
    // Seed 250 attempts: oldest 50 false, newest 200 true. Default
    // window = 200 → all 200 newest, all correct.
    const seeds: AttemptRecord[] = [];
    for (let i = 0; i < 50; i++) seeds.push(makeAttempt('intervals', 'M3', false, i));
    for (let i = 50; i < 250; i++) seeds.push(makeAttempt('intervals', 'M3', true, i));
    await db.attempts.bulkAdd(seeds);
    const r = await moduleAccuracy(['intervals']);
    expect(r.total).toBe(200);
    expect(r.correct).toBe(200);
    expect(r.percent).toBe(100);
  });

  it('returns zeros for empty moduleIds', async () => {
    const r = await moduleAccuracy([]);
    expect(r).toEqual({ correct: 0, total: 0, percent: null });
  });

  it('aggregates across multiple moduleIds', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals',         'M3', true,  1),
      makeAttempt('intervals',         'M3', true,  2),
      makeAttempt('chord-recognition', 'maj7', true, 3),
      makeAttempt('chord-recognition', 'maj7', false, 4),
      makeAttempt('chord-recognition', 'maj7', true, 5),
    ]);
    const r = await moduleAccuracy(['intervals', 'chord-recognition']);
    expect(r.total).toBe(5);
    expect(r.correct).toBe(4);
    expect(r.percent).toBe(80);
  });

  it('respects attemptFilter', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', true,  1, { direction: 'asc'  }),
      makeAttempt('intervals', 'M3', false, 2, { direction: 'asc'  }),
      makeAttempt('intervals', 'M3', true,  3, { direction: 'asc'  }),
      makeAttempt('intervals', 'M3', true,  4, { direction: 'asc'  }),
      makeAttempt('intervals', 'M3', true,  5, { direction: 'asc'  }),
      makeAttempt('intervals', 'M3', false, 6, { direction: 'desc' }),
      makeAttempt('intervals', 'M3', false, 7, { direction: 'desc' }),
    ]);
    const r = await moduleAccuracy(['intervals'], {
      attemptFilter: a => a.direction === 'asc',
    });
    expect(r.total).toBe(5);
    expect(r.correct).toBe(4);
    expect(r.percent).toBe(80);
  });
});

// -------------------------------------------------------------------
// getEarTrainingAccuracy + getHarmonicFluencyAccuracy
// -------------------------------------------------------------------

describe('getEarTrainingAccuracy', () => {
  it('overall aggregates across all 4 ET submodules', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals',          'M3',     true,  1),
      makeAttempt('chord-recognition',  'maj7',   true,  2),
      makeAttempt('chord-progressions', 'cycle1', true,  3),
      makeAttempt('scales-modes',       'mo-1',   true,  4),
      makeAttempt('scales-modes',       'mo-1',   false, 5),
    ]);
    const r = await getEarTrainingAccuracy('overall');
    expect(r.total).toBe(5);
    expect(r.correct).toBe(4);
    expect(r.percent).toBe(80);
  });

  it('ignores HF attempts even though HF cards may share itemIds', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('harmonic-fluency', 'mo-1', true, 1),
      makeAttempt('harmonic-fluency', 'mo-1', true, 2),
      makeAttempt('harmonic-fluency', 'mo-1', true, 3),
      makeAttempt('harmonic-fluency', 'mo-1', true, 4),
      makeAttempt('harmonic-fluency', 'mo-1', true, 5),
    ]);
    const r = await getEarTrainingAccuracy('overall');
    expect(r.total).toBe(0);
    expect(r.percent).toBeNull();
  });
});

describe('getHarmonicFluencyAccuracy', () => {
  it('overall counts only harmonic-fluency attempts', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('harmonic-fluency', 'mo-1', true,  1),
      makeAttempt('harmonic-fluency', 'mo-1', true,  2),
      makeAttempt('harmonic-fluency', 'mo-1', false, 3),
      makeAttempt('harmonic-fluency', 'mo-1', true,  4),
      makeAttempt('harmonic-fluency', 'mo-1', true,  5),
      makeAttempt('intervals',         'M3',  false, 6),  // excluded
    ]);
    const r = await getHarmonicFluencyAccuracy('overall');
    expect(r.total).toBe(5);
    expect(r.correct).toBe(4);
    expect(r.percent).toBe(80);
  });
});

// -------------------------------------------------------------------
// getGoalProgress — top-level router smoke tests
// -------------------------------------------------------------------

function makeGoal(partial: Partial<Goal>): Goal {
  return {
    id: partial.id ?? 'test-goal',
    scope: partial.scope ?? 'monthly',
    description: partial.description ?? '',
    targetMetric: partial.targetMetric ?? null,
    targetValue: partial.targetValue ?? 0,
    targetUnit: partial.targetUnit ?? null,
    currentValue: partial.currentValue ?? 0,
    contextTag: partial.contextTag ?? null,
    relatedModules: partial.relatedModules ?? [],
    relatedItems: partial.relatedItems ?? [],
    startDate: partial.startDate ?? 0,
    targetDate: partial.targetDate ?? 0,
    status: partial.status ?? 'active',
    parentGoalId: partial.parentGoalId ?? null,
    contributesNumericallyToParent: partial.contributesNumericallyToParent ?? false,
    isUmbrella: partial.isUmbrella ?? false,
    lastEngagedAt: partial.lastEngagedAt ?? null,
  };
}

describe('getGoalProgress — coverage routing', () => {
  it('routes ear_training_coverage_at_acquired to ET overall coverage', async () => {
    // Real catalog itemRefs — getEffectiveCoverageCount (Step 9b
    // follow-up #2) walks effectiveScopeForGoal, which enumerates
    // from source catalogs. Synthetic IDs that don't match the
    // catalog wouldn't count post-fix.
    await db.spacingState.bulkAdd([
      makeSpacingRow('M3:asc', 'intervals',         'acquired'),
      makeSpacingRow('maj',    'chord-recognition', 'mastered'),
    ]);
    const goal = makeGoal({
      targetMetric: 'ear_training_coverage_at_acquired',
      targetValue: 143,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('coverage');
    expect(r.current).toBe(2);
    expect(r.target).toBe(143);
    expect(r.source).toBe('coverage-overall');
  });

  it('routes shapes_coverage_at_acquired_specific with targetUnit sub-area', async () => {
    // chord_shape_drills sub-area matches every chord-shape: itemRef.
    // Real catalog IDs: sevenths use the 4-part `:state` form;
    // scales use the SCALE_CELLS catalog refs.
    await db.spacingState.bulkAdd([
      makeSpacingRow('chord-shape:maj7:C:root', 'shapes-and-patterns', 'acquired'),
      makeSpacingRow('scale:major:C',           'shapes-and-patterns', 'acquired'),
    ]);
    const goal = makeGoal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_drills',
      targetValue: 348,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('coverage');
    expect(r.current).toBe(1);
    expect(r.source).toBe('coverage-specific');
  });
});

describe('getGoalProgress — accuracy routing', () => {
  it('routes ear_training_accuracy_overall to ET accuracy', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', true,  1),
      makeAttempt('intervals', 'M3', true,  2),
      makeAttempt('intervals', 'M3', true,  3),
      makeAttempt('intervals', 'M3', true,  4),
      makeAttempt('intervals', 'M3', false, 5),
    ]);
    const goal = makeGoal({
      targetMetric: 'ear_training_accuracy_overall',
      targetValue: 85,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('accuracy');
    expect(r.current).toBe(80);
    expect(r.target).toBe(85);
    expect(r.source).toBe('et-accuracy-overall');
  });

  it('routes harmonic_fluency_accuracy_overall to HF accuracy', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('harmonic-fluency', 'mo-1', true,  1),
      makeAttempt('harmonic-fluency', 'mo-1', true,  2),
      makeAttempt('harmonic-fluency', 'mo-1', true,  3),
      makeAttempt('harmonic-fluency', 'mo-1', true,  4),
      makeAttempt('harmonic-fluency', 'mo-1', true,  5),
    ]);
    const goal = makeGoal({
      targetMetric: 'harmonic_fluency_accuracy_overall',
      targetValue: 80,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('accuracy');
    expect(r.current).toBe(100);
    expect(r.source).toBe('hf-accuracy-overall');
  });

  it('returns null current when accuracy has insufficient signal', async () => {
    await db.attempts.bulkAdd([
      makeAttempt('intervals', 'M3', true, 1),
      makeAttempt('intervals', 'M3', true, 2),
    ]);
    const goal = makeGoal({
      targetMetric: 'ear_training_accuracy_overall',
      targetValue: 85,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('accuracy');
    expect(r.current).toBeNull();
  });
});

describe('getGoalProgress — unsupported routing', () => {
  it('returns unsupported for accuracy_specific (Step 4b territory)', async () => {
    const goal = makeGoal({
      targetMetric: 'ear_training_accuracy_specific',
      targetUnit: 'intervals:ascending',
      targetValue: 85,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('unsupported');
    expect(r.current).toBeNull();
    expect(r.source).toBe('unsupported:ear_training_accuracy_specific');
  });

  it('returns unsupported for consistency metrics', async () => {
    const goal = makeGoal({
      targetMetric: 'ear_training_sessions_per_cadence',
      targetValue: 4,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('unsupported');
  });

  it('returns unsupported for song metrics', async () => {
    const goal = makeGoal({
      targetMetric: 'song_whole_at_level',
      targetValue: 25,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('unsupported');
  });

  it('returns unsupported for umbrella goals', async () => {
    const goal = makeGoal({
      targetMetric: 'ear_training_coverage_at_acquired',
      targetValue: 143,
      isUmbrella: true,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('unsupported');
    expect(r.source).toBe('umbrella');
  });

  it('returns unsupported for goals with no metric', async () => {
    const goal = makeGoal({ targetMetric: null });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('unsupported');
    expect(r.source).toBe('no-metric');
  });

  it('returns unsupported for legacy generic metrics', async () => {
    const goal = makeGoal({
      targetMetric: 'items_at_level',
      targetUnit: 'rooted',
      targetValue: 10,
    });
    const r = await getGoalProgress(goal);
    expect(r.kind).toBe('unsupported');
  });
});
