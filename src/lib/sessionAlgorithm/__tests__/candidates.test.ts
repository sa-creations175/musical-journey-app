// @vitest-environment jsdom
/**
 * Phase 3 Step 2a — candidate spec generator + resolver contract tests.
 *
 * jsdom environment is required because progress.ts (transitively
 * imported through the constants we re-use) touches `window` at
 * module load behind an `import.meta.env.DEV` guard. The tests
 * themselves are pure — no DB access — but loading the module graph
 * needs a window.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../db';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
} from '../../../modules/goals/coverageMetrics';
import { SONG_METRIC } from '../../../modules/goals/songTarget';
import { candidateSpecForGoal, resolveCandidates } from '../candidates';
import type { SpacingRow } from '../types';

function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: partial.id ?? 'g-1',
    scope: partial.scope ?? 'monthly',
    description: partial.description ?? '',
    targetMetric: partial.targetMetric ?? null,
    targetValue: partial.targetValue ?? null,
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

function row(partial: Partial<SpacingRow> & Pick<SpacingRow, 'itemRef' | 'moduleRef'>): SpacingRow {
  return {
    acquisitionStage: partial.acquisitionStage ?? 'new',
    memoryType: partial.memoryType,
    lastEngagedAt: partial.lastEngagedAt ?? null,
    nextDueAt: partial.nextDueAt ?? null,
    itemRef: partial.itemRef,
    moduleRef: partial.moduleRef,
  };
}

describe('candidateSpecForGoal — coverage overall', () => {
  it('Ear Training overall returns all four ET moduleRefs with COVERED_STAGES excluded', () => {
    const spec = candidateSpecForGoal(
      makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING }),
    );
    expect(spec.kind).toBe('coverage');
    if (spec.kind !== 'coverage') return;
    expect([...spec.moduleRefs].sort()).toEqual([
      'chord-progressions',
      'chord-recognition',
      'intervals',
      'scales-modes',
    ]);
    expect(spec.excludeStages.has('acquired')).toBe(true);
    expect(spec.excludeStages.has('consolidated')).toBe(true);
    expect(spec.excludeStages.has('mastered')).toBe(true);
    expect(spec.excludeStages.has('new')).toBe(false);
    expect(spec.excludeStages.has('acquiring')).toBe(false);
  });

  it('Harmonic Fluency / Shapes / Production each scope to one moduleRef', () => {
    expect(
      candidateSpecForGoal(
        makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY }),
      ),
    ).toMatchObject({ kind: 'coverage', moduleRefs: ['harmonic-fluency'] });
    expect(
      candidateSpecForGoal(makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.SHAPES })),
    ).toMatchObject({ kind: 'coverage', moduleRefs: ['shapes-and-patterns'] });
    expect(
      candidateSpecForGoal(makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.PRODUCTION })),
    ).toMatchObject({ kind: 'coverage', moduleRefs: ['production'] });
  });
});

describe('candidateSpecForGoal — coverage specific', () => {
  it('ET specific routes to the chosen sub-module only', () => {
    const spec = candidateSpecForGoal(
      makeGoal({
        targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
        targetUnit: 'intervals',
      }),
    );
    expect(spec).toMatchObject({ kind: 'coverage', moduleRefs: ['intervals'] });
  });

  it('ET specific with unknown sub-area yields unsupported', () => {
    expect(
      candidateSpecForGoal(
        makeGoal({
          targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
          targetUnit: 'not-a-real-thing',
        }),
      ),
    ).toEqual({ kind: 'unsupported' });
  });

  it('Shapes specific applies the right itemRef prefix filter', () => {
    const spec = candidateSpecForGoal(
      makeGoal({
        targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
        targetUnit: 'scale_drills',
      }),
    );
    expect(spec.kind).toBe('coverage');
    if (spec.kind !== 'coverage') return;
    expect(spec.itemRefFilter?.('scale:major:C')).toBe(true);
    expect(spec.itemRefFilter?.('chord-shape:maj:C')).toBe(false);
    expect(spec.itemRefFilter?.('vl:aba-251:C')).toBe(false);
  });

  it('HF specific filters by category set', () => {
    const spec = candidateSpecForGoal(
      makeGoal({
        targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
        targetUnit: 'foundational',
      }),
    );
    expect(spec.kind).toBe('coverage');
    // The filter relies on cardById; we only assert it's a function.
    if (spec.kind !== 'coverage') return;
    expect(typeof spec.itemRefFilter).toBe('function');
  });

  it('Production specific without a matching path → unsupported', () => {
    expect(
      candidateSpecForGoal(
        makeGoal({
          targetMetric: COVERAGE_SPECIFIC_METRIC.PRODUCTION,
          targetUnit: 'not-a-real-path',
        }),
      ),
    ).toEqual({ kind: 'unsupported' });
  });
});

describe('candidateSpecForGoal — accuracy / consistency / songs / umbrella', () => {
  it('accuracy_overall maps to the module accuracy spec', () => {
    expect(
      candidateSpecForGoal(makeGoal({ targetMetric: 'ear_training_accuracy_overall' })),
    ).toMatchObject({
      kind: 'accuracy',
      moduleRefs: ['intervals', 'chord-recognition', 'chord-progressions', 'scales-modes'],
    });
    expect(
      candidateSpecForGoal(makeGoal({ targetMetric: 'harmonic_fluency_accuracy_overall' })),
    ).toMatchObject({ kind: 'accuracy', moduleRefs: ['harmonic-fluency'] });
  });

  it('consistency metrics route to their module', () => {
    expect(
      candidateSpecForGoal(makeGoal({ targetMetric: 'shapes_days_per_cadence' })),
    ).toMatchObject({ kind: 'consistency', moduleRefs: ['shapes-and-patterns'] });
  });

  it('practice_* consistency umbrella spans every module', () => {
    const spec = candidateSpecForGoal(
      makeGoal({ targetMetric: 'practice_weekly_floor_days' }),
    );
    expect(spec.kind).toBe('consistency');
    if (spec.kind !== 'consistency') return;
    expect(spec.moduleRefs).toContain('intervals');
    expect(spec.moduleRefs).toContain('harmonic-fluency');
    expect(spec.moduleRefs).toContain('shapes-and-patterns');
    expect(spec.moduleRefs).toContain('production');
    expect(spec.moduleRefs).toContain('repertoire');
  });

  it('song_of_month metric (queue metadata) classifies as unsupported', () => {
    // Slot-1 TBD + slot 2/3 entries — pure queue metadata, must not
    // drive the algorithm. Only slot-1 specific reaches the
    // algorithm via song_whole_at_level (covered below).
    expect(
      candidateSpecForGoal(makeGoal({ targetMetric: 'song_of_month' })),
    ).toEqual({ kind: 'unsupported' });
  });

  it('song proficiency metrics surface the related song ids', () => {
    const spec = candidateSpecForGoal(
      makeGoal({
        targetMetric: SONG_METRIC.WHOLE,
        relatedItems: ['song-mirror', 'song-ribbon'],
      }),
    );
    expect(spec).toEqual({
      kind: 'song_proficiency',
      relatedItems: ['song-mirror', 'song-ribbon'],
    });
  });

  it('umbrella goals short-circuit to umbrella regardless of metric', () => {
    expect(
      candidateSpecForGoal(makeGoal({ isUmbrella: true, targetMetric: null })),
    ).toEqual({ kind: 'umbrella' });
  });

  it('null metric → unsupported', () => {
    expect(candidateSpecForGoal(makeGoal({ targetMetric: null }))).toEqual({
      kind: 'unsupported',
    });
  });

  it('legacy items_at_level / hours_on_modules → unsupported', () => {
    expect(candidateSpecForGoal(makeGoal({ targetMetric: 'items_at_level' }))).toEqual({
      kind: 'unsupported',
    });
    expect(candidateSpecForGoal(makeGoal({ targetMetric: 'hours_on_modules' }))).toEqual({
      kind: 'unsupported',
    });
  });
});

describe('resolveCandidates — coverage', () => {
  it('keeps only rows in the module set with stages outside excludeStages', () => {
    const rows: SpacingRow[] = [
      row({ itemRef: 'a', moduleRef: 'intervals', acquisitionStage: 'new' }),
      row({ itemRef: 'b', moduleRef: 'intervals', acquisitionStage: 'acquiring' }),
      row({ itemRef: 'c', moduleRef: 'intervals', acquisitionStage: 'acquired' }),
      row({ itemRef: 'd', moduleRef: 'intervals', acquisitionStage: 'consolidated' }),
      row({ itemRef: 'e', moduleRef: 'harmonic-fluency', acquisitionStage: 'new' }),
    ];
    const spec = candidateSpecForGoal(
      makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING }),
    );
    expect(resolveCandidates(spec, rows)).toEqual(['a', 'b']);
  });

  it('applies the optional itemRefFilter', () => {
    const rows: SpacingRow[] = [
      row({ itemRef: 'scale:major:C', moduleRef: 'shapes-and-patterns', acquisitionStage: 'new' }),
      row({ itemRef: 'chord-shape:maj:C', moduleRef: 'shapes-and-patterns', acquisitionStage: 'new' }),
    ];
    const spec = candidateSpecForGoal(
      makeGoal({
        targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
        targetUnit: 'scale_drills',
      }),
    );
    expect(resolveCandidates(spec, rows)).toEqual(['scale:major:C']);
  });
});

describe('resolveCandidates — accuracy / consistency / passthrough', () => {
  const rows: SpacingRow[] = [
    row({ itemRef: 'a', moduleRef: 'intervals', acquisitionStage: 'acquired' }),
    row({ itemRef: 'b', moduleRef: 'intervals', acquisitionStage: 'new' }),
  ];

  it('accuracy includes acquired rows (any stage)', () => {
    const spec = candidateSpecForGoal(
      makeGoal({ targetMetric: 'ear_training_accuracy_overall' }),
    );
    expect(resolveCandidates(spec, rows)).toEqual(['a', 'b']);
  });

  it('consistency includes any stage in the module', () => {
    const spec = candidateSpecForGoal(
      makeGoal({ targetMetric: 'ear_training_days_per_cadence' }),
    );
    expect(resolveCandidates(spec, rows)).toEqual(['a', 'b']);
  });

  it('umbrella / unsupported / song / production_count return []', () => {
    expect(resolveCandidates({ kind: 'umbrella' }, rows)).toEqual([]);
    expect(resolveCandidates({ kind: 'unsupported' }, rows)).toEqual([]);
    expect(
      resolveCandidates({ kind: 'song_proficiency', relatedItems: ['x'] }, rows),
    ).toEqual([]);
    expect(
      resolveCandidates({ kind: 'production_count', moduleRefs: ['production'] }, rows),
    ).toEqual([]);
  });
});

// =====================================================================
// Phase B Step 9b follow-up — relatedItems extend coverage-specific scope
// =====================================================================

describe('candidateSpecForGoal — relatedItems extends coverage-specific scope', () => {
  it('Shapes-specific: items added to relatedItems pass the filter even when the metric matcher would drop them', () => {
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_triads_aug',
      // An item from a DIFFERENT quality (m7) carries over via
      // Accept's relatedItems extension. The base matcher (aug only)
      // would drop it; the wired filter should accept it.
      relatedItems: ['chord-shape:min7:G:root'],
    });
    const spec = candidateSpecForGoal(goal);
    expect(spec.kind).toBe('coverage');
    if (spec.kind !== 'coverage') return;
    expect(spec.itemRefFilter).toBeDefined();
    // Base scope: an augmented-triad item still matches.
    expect(spec.itemRefFilter!('chord-shape:aug:C:root')).toBe(true);
    // relatedItems extension: a min7 item that wouldn't normally pass
    // the matcher does pass now.
    expect(spec.itemRefFilter!('chord-shape:min7:G:root')).toBe(true);
    // Unrelated items: still dropped.
    expect(spec.itemRefFilter!('chord-shape:dim:C:root')).toBe(false);
  });

  it('empty relatedItems is a no-op — base matcher unchanged', () => {
    const withItems = candidateSpecForGoal(makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_triads_aug',
      relatedItems: [],
    }));
    if (withItems.kind !== 'coverage') throw new Error('expected coverage spec');
    expect(withItems.itemRefFilter!('chord-shape:aug:C:root')).toBe(true);
    expect(withItems.itemRefFilter!('chord-shape:min:C:root')).toBe(false);
  });

  it('resolveCandidates surfaces a relatedItems-extension row through the candidate pool', () => {
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'chord_shape_triads_aug',
      relatedItems: ['chord-shape:min7:G:root'],
    });
    const spec = candidateSpecForGoal(goal);
    const rows: SpacingRow[] = [
      row({ itemRef: 'chord-shape:aug:C:root', moduleRef: 'shapes-and-patterns' }),
      row({ itemRef: 'chord-shape:min7:G:root', moduleRef: 'shapes-and-patterns' }),
      row({ itemRef: 'chord-shape:dim:C:root', moduleRef: 'shapes-and-patterns' }),
    ];
    const out = [...resolveCandidates(spec, rows)].sort();
    expect(out).toEqual([
      'chord-shape:aug:C:root',
      'chord-shape:min7:G:root',
    ]);
  });
});

// =====================================================================
// Step 9b follow-up #2 — Fix 2: ET-specific cross-submodule relatedItems
//
// ET specific goals scope by moduleRef (no itemRefFilter), so the
// extendWithRelatedItems trick used by HF/Shapes/Production can't
// surface cross-submodule items. The spec's new `relatedItems`
// field tells resolveCandidates to bypass the moduleRefs gate for
// listed itemRefs. This is the PRIMARY Accept use case per the
// user's reframing: leftover items from a *different* sub-area
// than the active monthly goal.
// =====================================================================

describe('candidateSpecForGoal — ET-specific cross-submodule relatedItems (Fix 2)', () => {
  it('spec carries relatedItems on ET-specific coverage', () => {
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
      relatedItems: ['M3:asc', 'P5:asc'], // leftover from intervals
    });
    const spec = candidateSpecForGoal(goal);
    expect(spec.kind).toBe('coverage');
    if (spec.kind !== 'coverage') return;
    expect(spec.moduleRefs).toEqual(['chord-recognition']);
    expect(spec.relatedItems).toBeDefined();
    expect(spec.relatedItems!.has('M3:asc')).toBe(true);
    expect(spec.relatedItems!.has('P5:asc')).toBe(true);
    // ET-specific intentionally has NO itemRefFilter — the bypass
    // happens in resolveCandidates via the moduleSet check.
    expect(spec.itemRefFilter).toBeUndefined();
  });

  it('empty relatedItems → relatedItems omitted on the spec (no override)', () => {
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
      relatedItems: [],
    });
    const spec = candidateSpecForGoal(goal);
    if (spec.kind !== 'coverage') throw new Error('expected coverage spec');
    expect(spec.relatedItems).toBeUndefined();
  });

  it('resolveCandidates: intervals item added to a chord-recognition goal surfaces in the pool', () => {
    // The "primary use case" test per the spec: a chord-recognition
    // monthly goal with an intervals item in relatedItems. The
    // intervals row's moduleRef is OUTSIDE the goal's moduleRefs
    // ([chord-recognition]) — only the relatedItems bypass can
    // surface it.
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
      relatedItems: ['M3:asc'],
    });
    const spec = candidateSpecForGoal(goal);
    const rows: SpacingRow[] = [
      row({ itemRef: 'maj',     moduleRef: 'chord-recognition', acquisitionStage: 'new' }),
      row({ itemRef: 'M3:asc',  moduleRef: 'intervals',         acquisitionStage: 'new' }),
      row({ itemRef: 'mixo',    moduleRef: 'scales-modes',      acquisitionStage: 'new' }),
    ];
    const out = [...resolveCandidates(spec, rows)].sort();
    // 'maj' surfaces via moduleSet (it's in chord-recognition).
    // 'M3:asc' surfaces via relatedItems bypass (intervals would
    // be dropped by moduleSet).
    // 'mixo' is dropped — neither in moduleSet nor in relatedItems.
    expect(out).toEqual(['M3:asc', 'maj']);
  });

  it('resolveCandidates: same-sub-module candidates still work (regression)', () => {
    // Without any relatedItems, ET-specific behaves exactly as
    // before — only chord-recognition rows in non-COVERED stages
    // come through.
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
      relatedItems: [],
    });
    const spec = candidateSpecForGoal(goal);
    const rows: SpacingRow[] = [
      row({ itemRef: 'maj', moduleRef: 'chord-recognition', acquisitionStage: 'new' }),
      row({ itemRef: 'min', moduleRef: 'chord-recognition', acquisitionStage: 'acquiring' }),
      row({ itemRef: 'dim', moduleRef: 'chord-recognition', acquisitionStage: 'acquired' }), // excluded
      row({ itemRef: 'M3:asc', moduleRef: 'intervals', acquisitionStage: 'new' }), // wrong module
    ];
    const out = [...resolveCandidates(spec, rows)].sort();
    expect(out).toEqual(['maj', 'min']);
  });

  it('relatedItems bypass still honors excludeStages', () => {
    // An accepted carryover item that has already reached acquired
    // is no longer a candidate — the COVERED_STAGES filter applies
    // to all rows uniformly, both in-module and bypass.
    const goal = makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
      relatedItems: ['M3:asc', 'P5:asc'],
    });
    const spec = candidateSpecForGoal(goal);
    const rows: SpacingRow[] = [
      row({ itemRef: 'M3:asc', moduleRef: 'intervals', acquisitionStage: 'new' }),
      row({ itemRef: 'P5:asc', moduleRef: 'intervals', acquisitionStage: 'acquired' }), // excluded
    ];
    const out = resolveCandidates(spec, rows);
    expect(out).toEqual(['M3:asc']);
  });
});
