// @vitest-environment jsdom
/**
 * Tests for maybeInjectShapesColdStartBlock — the keyboard-module
 * cold-start cure for S&P chord-shape coverage goals when no
 * spacingState rows exist yet (first-time-in-module).
 *
 * The aggregator only builds an S&P block from existing spacing rows,
 * so a fresh "cover all N" goal produced a weekly need but no session
 * block. This injector enumerates the goal's target chord-shape
 * itemRefs from the catalog and seeds a SHAPES block so the
 * chord-shape walk (and the scales warm-up riding the same block)
 * surface on the proposal.
 *
 * Scenarios:
 *   · context gating — S&P allowed on keys / full, excluded laptop / phone
 *   · no S&P goal → no-op
 *   · S&P specific coverage goal + no rows → block injected, refs scoped
 *   · S&P block already present → no-op
 *   · items with an existing spacing row are excluded (un-started only)
 *   · unlocked-tier gate drops above-tier qualities
 *   · existing blocks preserved, cold-start appended at the end
 */
import { describe, expect, it } from 'vitest';
import { maybeInjectShapesColdStartBlock } from '../sessionGenerator';
import { itemRefMatcherForCoverageGroup } from '../../goals/shapesCoverageGroups';
import { getTierForShape } from '../../shapes-and-patterns/spTiers';
import type { AlgorithmBlock } from '../../../lib/sessionAlgorithm/timeAllocation';
import type { Goal, PracticeSessionContext, SpacingState } from '../../../lib/db';

const NOW = 1_700_000_000_000;
const SHAPES = 'shapes-and-patterns';

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: 'goal-1',
    scope: 'monthly',
    description: '',
    targetMetric: 'shapes_coverage_at_acquired',
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

function mkRow(itemRef: string): SpacingState {
  return { id: `row-${itemRef}`, itemRef, moduleRef: SHAPES } as SpacingState;
}

// Major-triad specific goal — the symptom case ("cover all major triad
// inversions"). Tier 4 unlocks every quality so the tier gate is a
// no-op for the scope tests.
const MAJ_TRIAD_GOAL = mkGoal({
  targetMetric: 'shapes_coverage_at_acquired_specific',
  targetUnit: 'chord_shape_triads_maj',
});

describe('maybeInjectShapesColdStartBlock — context gating', () => {
  it('no-op on laptop / phone (S&P excluded by the context filter)', async () => {
    for (const ctx of ['laptop', 'phone'] as const) {
      const out = await maybeInjectShapesColdStartBlock(
        [], [MAJ_TRIAD_GOAL], [], ctx as PracticeSessionContext, 4,
      );
      expect(out).toEqual([]);
    }
  });

  it('injects on keys and full (S&P is allowed there)', async () => {
    for (const ctx of ['keys', 'full'] as const) {
      const out = await maybeInjectShapesColdStartBlock(
        [], [MAJ_TRIAD_GOAL], [], ctx as PracticeSessionContext, 4,
      );
      expect(out.some(b => b.id === 'block-shapes-cold-start')).toBe(true);
    }
  });

  it('no-op when there is no S&P coverage goal', async () => {
    const goals = [mkGoal({ targetMetric: 'harmonic_fluency_coverage_at_acquired' })];
    const out = await maybeInjectShapesColdStartBlock([], goals, [], 'full', 4);
    expect(out).toEqual([]);
  });
});

describe('maybeInjectShapesColdStartBlock — injection', () => {
  it('S&P coverage goal + no rows → keyboard block with scoped catalog refs', async () => {
    const out = await maybeInjectShapesColdStartBlock(
      [], [MAJ_TRIAD_GOAL], [], 'full', 4,
    );
    const block = out.find(b => b.id === 'block-shapes-cold-start');
    expect(block).toBeDefined();
    expect(block!.moduleRef).toBe(SHAPES);
    expect(block!.isKeyboardRequired).toBe(true);
    expect(block!.weight).toBeGreaterThan(0);
    expect(block!.hasAcquiringItems).toBe(false);
    // Capped to a single block's worth of items.
    expect(block!.itemRefs.length).toBeGreaterThan(0);
    expect(block!.itemRefs.length).toBeLessThanOrEqual(20);
    // Every ref is scoped to the goal's coverage group.
    const matcher = itemRefMatcherForCoverageGroup('chord_shape_triads_maj')!;
    expect(block!.itemRefs.every(matcher)).toBe(true);
  });

  it('no-op when an S&P block was already built from spacing rows', async () => {
    const existing = [blk(SHAPES, 'block-sp-real')];
    const out = await maybeInjectShapesColdStartBlock(
      existing, [MAJ_TRIAD_GOAL], [], 'full', 4,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('block-sp-real');
  });

  it('excludes target items that already have a spacing row (un-started only)', async () => {
    // Seed rows for the C major-triad cells — those reach the
    // aggregator normally, so cold-start must not re-surface them.
    const startedRefs = [
      'chord-shape:maj:C:root',
      'chord-shape:maj:C:inv1',
      'chord-shape:maj:C:inv2',
      'chord-shape:maj:C:fluid',
    ];
    const rows = startedRefs.map(mkRow);
    const out = await maybeInjectShapesColdStartBlock(
      [], [MAJ_TRIAD_GOAL], rows, 'full', 4,
    );
    const block = out.find(b => b.id === 'block-shapes-cold-start')!;
    for (const ref of startedRefs) {
      expect(block.itemRefs).not.toContain(ref);
    }
  });

  it('drops qualities above the unlocked tier', async () => {
    // Overall S&P goal would enumerate every quality; with tier 1 only
    // tier-1 qualities may surface.
    const overall = mkGoal({ targetMetric: 'shapes_coverage_at_acquired' });
    const out = await maybeInjectShapesColdStartBlock([], [overall], [], 'full', 1);
    const block = out.find(b => b.id === 'block-shapes-cold-start')!;
    for (const ref of block.itemRefs) {
      const quality = ref.split(':')[1];
      expect(getTierForShape(quality)).toBeLessThanOrEqual(1);
    }
  });

  it('preserves existing blocks and appends the cold-start block at the end', async () => {
    const existing = [blk('harmonic-fluency', 'block-hf'), blk('repertoire', 'block-rep')];
    const out = await maybeInjectShapesColdStartBlock(
      existing, [MAJ_TRIAD_GOAL], [], 'full', 4,
    );
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe('block-hf');
    expect(out[1].id).toBe('block-rep');
    expect(out[2].id).toBe('block-shapes-cold-start');
  });
});
