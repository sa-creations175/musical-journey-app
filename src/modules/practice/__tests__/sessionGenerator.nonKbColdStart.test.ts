// @vitest-environment jsdom
/**
 * Tests for maybeInjectNonKeyboardColdStartBlocks — the full-session
 * cold-start cure for HF / ET / Production goals when no spacingState
 * rows exist yet for those modules.
 *
 * Scenarios:
 *   · context !== 'full' → no-op (keys / laptop / phone unaffected)
 *   · no relevant goal → no injection
 *   · HF goal + no HF block → HF cold-start injected
 *   · HF goal + HF block already present → no-op for HF
 *   · ET overall goal → injects all 4 ET sub-blocks
 *   · ET sub-area goal (specific) → injects only that submodule
 *   · Production goal → Production block injected
 *   · Multiple module injections in one call
 *   · Existing block in the pool prevents that module's cold-start
 *   · Song goal alone → no non-keyboard cold-start
 */
import { describe, expect, it } from 'vitest';
import { maybeInjectNonKeyboardColdStartBlocks } from '../sessionGenerator';
import type { AlgorithmBlock } from '../../../lib/sessionAlgorithm/timeAllocation';
import type { Goal, PracticeSessionContext } from '../../../lib/db';

const NOW = 1_700_000_000_000;

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: 'goal-1',
    scope: 'monthly',
    description: '',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: NOW,
    targetDate: NOW + 30 * 86_400_000,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

function blk(moduleRef: string, id = `block-${moduleRef}`): AlgorithmBlock {
  return {
    id,
    moduleRef,
    memoryType: 'declarative',
    itemRefs: ['item-1'],
    weight: 2,
    hasAcquiringItems: false,
    isKeyboardRequired: false,
  };
}

describe('maybeInjectNonKeyboardColdStartBlocks — context gating', () => {
  it('no-op on keys / laptop / phone — feature is full-session only', () => {
    const goals = [mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' })];
    for (const ctx of ['keys', 'laptop', 'phone'] as const) {
      const out = maybeInjectNonKeyboardColdStartBlocks([], goals, ctx as PracticeSessionContext);
      expect(out).toEqual([]);
    }
  });

  it('no-op on full when there are no goals', () => {
    const out = maybeInjectNonKeyboardColdStartBlocks([], [], 'full');
    expect(out).toEqual([]);
  });
});

describe('maybeInjectNonKeyboardColdStartBlocks — per-module injection', () => {
  it('HF coverage goal + no HF block → HF cold-start injected', () => {
    const goals = [mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' })];
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full');
    const hf = out.find(b => b.moduleRef === 'harmonic-fluency');
    expect(hf).toBeDefined();
    expect(hf!.id).toBe('block-harmonic-fluency-cold-start');
    expect(hf!.itemRefs).toEqual([]);
    expect(hf!.isKeyboardRequired).toBe(false);
    expect(hf!.weight).toBeGreaterThan(0);
  });

  it('HF goal + HF block already in the pool → HF cold-start skipped', () => {
    const goals = [mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' })];
    const existing = [blk('harmonic-fluency')];
    const out = maybeInjectNonKeyboardColdStartBlocks(existing, goals, 'full');
    expect(out.filter(b => b.moduleRef === 'harmonic-fluency')).toHaveLength(1);
    expect(out[0].id).toBe('block-harmonic-fluency'); // original, not cold-start
  });

  it('ET overall coverage goal → injects all 4 ET submodules', () => {
    const goals = [mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' })];
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full');
    const modules = new Set(out.map(b => b.moduleRef));
    expect(modules.has('intervals')).toBe(true);
    expect(modules.has('chord-recognition')).toBe(true);
    expect(modules.has('chord-progressions')).toBe(true);
    expect(modules.has('scales-modes')).toBe(true);
    // All 4 are cold-start synthetic blocks.
    expect(out.filter(b => b.id.endsWith('-cold-start'))).toHaveLength(4);
  });

  it('ET sub-area specific goal → injects only that submodule', () => {
    const goals = [mkGoal({
      targetMetric: 'ear_training_coverage_at_acquired_specific',
      targetUnit: 'intervals',
    })];
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full');
    expect(out.map(b => b.moduleRef)).toEqual(['intervals']);
  });

  it('Production goal → Production cold-start injected', () => {
    const goals = [mkGoal({ targetMetric: 'production_coverage_at_acquired' })];
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full');
    expect(out.map(b => b.moduleRef)).toEqual(['production']);
  });

  it('skips modules where a real block is already present, injects the others', () => {
    // User has HF goal + ET overall goal. HF already has spacing-state
    // rows (block in pool); ET subs do not. Expect HF skipped, all 4
    // ET subs injected.
    const goals = [
      mkGoal({ id: 'g-hf', targetMetric: 'harmonic_fluency_coverage_at_acquired' }),
      mkGoal({ id: 'g-et', targetMetric: 'ear_training_coverage_at_acquired' }),
    ];
    const existing = [blk('harmonic-fluency')];
    const out = maybeInjectNonKeyboardColdStartBlocks(existing, goals, 'full');
    expect(out.filter(b => b.id.endsWith('-cold-start')).map(b => b.moduleRef).sort())
      .toEqual(['chord-progressions', 'chord-recognition', 'intervals', 'scales-modes']);
    // HF preserved as the existing real block.
    expect(out.find(b => b.moduleRef === 'harmonic-fluency')!.id).toBe('block-harmonic-fluency');
  });

  it('song goal alone does not trigger non-keyboard cold-start', () => {
    // song_proficiency / song_whole_at_level / etc. are handled by
    // maybeInjectRepertoireColdStartBlock, not this helper. Their
    // specs don't carry moduleRefs at the candidate-spec layer.
    const goals = [mkGoal({
      targetMetric: 'song_whole_at_level',
      targetUnit: 'comfortable',
      relatedModules: ['repertoire'],
      relatedItems: ['song-A'],
    })];
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full');
    expect(out).toEqual([]);
  });

  it('ET tier gate: locked submodule (empty eligible set) skipped, unlocked submodule injected', () => {
    // ET overall goal would normally trigger all 4 ET sub cold-starts.
    // With the eligible map showing chord-progressions + scales-modes
    // locked (empty sets), only intervals + chord-recognition inject.
    const goals = [mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' })];
    const etEligibleByModule = new Map<string, ReadonlySet<string>>([
      ['intervals',           new Set(['m3:asc'])],
      ['chord-recognition',   new Set(['maj:0'])],
      ['chord-progressions',  new Set()], // locked
      ['scales-modes',        new Set()], // locked
    ]);
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full', etEligibleByModule);
    expect(out.map(b => b.moduleRef).sort()).toEqual(['chord-recognition', 'intervals']);
  });

  it('ET tier gate: omitting etEligibleByModule preserves the pre-gate behavior', () => {
    // Tests + legacy paths that don't supply the map get the original
    // "inject all touched modules" behavior. Safety net for future
    // callers that forget the arg.
    const goals = [mkGoal({ targetMetric: 'ear_training_coverage_at_acquired' })];
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full');
    expect(out.map(b => b.moduleRef).sort()).toEqual([
      'chord-progressions', 'chord-recognition', 'intervals', 'scales-modes',
    ]);
  });

  it('ET tier gate: HF and Production skip the gate (no tier system)', () => {
    // Even if the map has an empty set for HF or Production (impossible
    // in practice, but defensive), those modules still inject because
    // the gate only checks ET submodules.
    const goals = [
      mkGoal({ id: 'g-hf',   targetMetric: 'harmonic_fluency_coverage_at_acquired' }),
      mkGoal({ id: 'g-prod', targetMetric: 'production_coverage_at_acquired' }),
    ];
    const etEligibleByModule = new Map<string, ReadonlySet<string>>([
      ['intervals', new Set()], // locked, but no ET goal so irrelevant
    ]);
    const out = maybeInjectNonKeyboardColdStartBlocks([], goals, 'full', etEligibleByModule);
    expect(out.map(b => b.moduleRef).sort()).toEqual(['harmonic-fluency', 'production']);
  });

  it('preserves existing blocks and appends cold-start blocks at the end', () => {
    const goals = [mkGoal({ targetMetric: 'production_coverage_at_acquired' })];
    const existing = [blk('shapes-and-patterns', 'block-sp'), blk('repertoire', 'block-rep')];
    const out = maybeInjectNonKeyboardColdStartBlocks(existing, goals, 'full');
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe('block-sp');
    expect(out[1].id).toBe('block-rep');
    expect(out[2].id).toBe('block-production-cold-start');
  });
});
