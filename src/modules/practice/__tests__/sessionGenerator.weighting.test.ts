// @vitest-environment jsdom
/**
 * Polish-sprint test — verifies aggregateGoalCandidatesByModule
 * actually consumes Step 2's per-item weighting (pace urgency,
 * acquisition lift, freshness, multi-goal compounding).
 *
 * Pre-wiring the block weight was MAX(goalAlignmentFactor) only —
 * a flat per-module value capped at 1.8 for weekly goals. Post-
 * wiring it's the MAX per-item weight, so an acquiring + stale
 * item drives the block above any goal-alignment baseline.
 */
import { describe, expect, it } from 'vitest';
import { aggregateGoalCandidatesByModule } from '../sessionGenerator';
import type { Goal, SpacingState } from '../../../lib/db';
import {
  ACQUISITION_FACTOR_ACQUIRING,
  FRESHNESS_FACTOR_VERY_STALE,
  GOAL_ALIGNMENT_FACTOR_MONTHLY,
} from '../../../lib/sessionAlgorithm/weighting';
import { PACE_FACTOR_SIGNIFICANTLY_BEHIND } from '../../../lib/sessionAlgorithm/pace';

const NOW = 1_700_000_000_000; // arbitrary fixed instant for determinism
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function spacingRow(partial: Partial<SpacingState>): SpacingState {
  return {
    id: 'row-x',
    itemRef: 'item-x',
    hand: 'both',
    moduleRef: 'harmonic-fluency',
    memoryType: 'declarative',
    acquisitionStage: 'new',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...partial,
  };
}

function coverageGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-hf-monthly',
    scope: 'monthly',
    description: 'Cover HF cards this month',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 50,
    targetUnit: null,
    currentValue: 5,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: NOW - 10 * MS_PER_DAY,
    targetDate: NOW + 20 * MS_PER_DAY,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

describe('aggregateGoalCandidatesByModule — per-item weighting', () => {
  // Phase 4 Step 5 context arc: HF rows are excluded from keys/mixed
  // contexts; tests using HF must pass an explicit non-keys context.
  // 'laptop' chosen because (a) HF passes the hard filter there, and
  // (b) the per-block contextFactor (HF on laptop = 1.2) is a stable
  // constant we can multiply into expected values without coupling
  // the test to the full per-context weight table.
  const HF_LAPTOP_CONTEXT_FACTOR = 1.2;

  it('block weight reflects per-item factors, not just goal-alignment', () => {
    const goal = coverageGoal();
    const acquiringStaleRow = spacingRow({
      id: 'r1',
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
      acquisitionStage: 'acquiring',
      lastEngagedAt: NOW - 30 * MS_PER_DAY, // very stale
    });

    const blocks = aggregateGoalCandidatesByModule(
      [goal],
      [acquiringStaleRow],
      NOW,
      'laptop',
    );

    expect(blocks).toHaveLength(1);
    // 5/50 covered after 10 of 30 days → ratio ~0.30 → significantly-behind.
    // Expected: monthly × significantly-behind pace × acquiring × very-stale × laptop HF contextFactor
    const expected =
      GOAL_ALIGNMENT_FACTOR_MONTHLY *
      PACE_FACTOR_SIGNIFICANTLY_BEHIND *
      ACQUISITION_FACTOR_ACQUIRING *
      FRESHNESS_FACTOR_VERY_STALE *
      HF_LAPTOP_CONTEXT_FACTOR;
    expect(blocks[0].weight).toBeCloseTo(expected, 5);
    // And clearly above the old goal-alignment-only ceiling.
    expect(blocks[0].weight).toBeGreaterThan(GOAL_ALIGNMENT_FACTOR_MONTHLY);
  });

  it('sorts items by weight desc inside the block before the cap', () => {
    const goal = coverageGoal();
    const coldNeverEngaged = spacingRow({
      id: 'r-cold',
      itemRef: 'card-cold',
      moduleRef: 'harmonic-fluency',
      acquisitionStage: 'new',
      lastEngagedAt: null,
    });
    const hotAcquiringStale = spacingRow({
      id: 'r-hot',
      itemRef: 'card-hot',
      moduleRef: 'harmonic-fluency',
      acquisitionStage: 'acquiring',
      lastEngagedAt: NOW - 30 * MS_PER_DAY,
    });

    const blocks = aggregateGoalCandidatesByModule(
      [goal],
      // Insert in cold-then-hot order so we know the sort actually ran.
      [coldNeverEngaged, hotAcquiringStale],
      NOW,
      'laptop',
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].itemRefs[0]).toBe('card-hot');
    expect(blocks[0].itemRefs[1]).toBe('card-cold');
  });

  it('compounds via MAX across goals when an item is referenced by multiple goals', () => {
    const monthly = coverageGoal({ id: 'g-monthly', scope: 'monthly' });
    const weekly = coverageGoal({
      id: 'g-weekly',
      scope: 'weekly',
      targetMetric: 'harmonic_fluency_coverage_at_acquired',
    });
    const row = spacingRow({
      id: 'r1',
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
      acquisitionStage: 'new',
      lastEngagedAt: null, // freshness neutral
    });

    const monthlyOnly = aggregateGoalCandidatesByModule([monthly], [row], NOW, 'laptop');
    const both = aggregateGoalCandidatesByModule([monthly, weekly], [row], NOW, 'laptop');

    // Weekly has higher goalAlignmentFactor → adding it should
    // raise the block weight; monthly alone shouldn't move.
    expect(both[0].weight).toBeGreaterThan(monthlyOnly[0].weight);
  });

  it('skips umbrella + unsupported goals without throwing', () => {
    const umbrella: Goal = {
      ...coverageGoal({ id: 'g-umbrella' }),
      isUmbrella: true,
      targetMetric: null,
      targetValue: null,
    };
    const unsupported = coverageGoal({
      id: 'g-unsupported',
      targetMetric: 'something_unhandled',
    });

    const row = spacingRow({
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
    });

    const blocks = aggregateGoalCandidatesByModule(
      [umbrella, unsupported],
      [row],
      NOW,
    );
    expect(blocks).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Phase 4 Step 4 + Step 5 — post-multiplier integration
// ---------------------------------------------------------------------

describe('aggregateGoalCandidatesByModule — weekly-pace + context post-multipliers', () => {
  it('applies weeklyPaceFactor as a per-module block-weight multiplier', () => {
    const goal = coverageGoal();
    const row = spacingRow({
      id: 'r1',
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
      acquisitionStage: 'new',
      lastEngagedAt: null,
    });
    // Laptop HF contextFactor = 1.2 in both runs; the only variable
    // is the weekly-pace map. A 1.6 lift should multiply the
    // resulting block weight by 1.6 exactly.
    const baseline = aggregateGoalCandidatesByModule([goal], [row], NOW, 'laptop');
    const boosted = aggregateGoalCandidatesByModule(
      [goal], [row], NOW, 'laptop',
      new Map([['harmonic-fluency', 1.6]]),
    );
    expect(boosted[0].weight).toBeCloseTo(baseline[0].weight * 1.6, 5);
  });

  it('applies contextFactor differently across laptop and phone', () => {
    const goal = coverageGoal();
    const row = spacingRow({
      id: 'r1',
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
      acquisitionStage: 'new',
      lastEngagedAt: null,
    });
    const laptop = aggregateGoalCandidatesByModule([goal], [row], NOW, 'laptop');
    const phone = aggregateGoalCandidatesByModule([goal], [row], NOW, 'phone');
    // Phone HF factor 1.4 > laptop HF factor 1.2 → phone weight is higher.
    expect(phone[0].weight).toBeGreaterThan(laptop[0].weight);
    expect(phone[0].weight / laptop[0].weight).toBeCloseTo(1.4 / 1.2, 5);
  });

  it('keys context drops HF entirely from the candidate pool', () => {
    const goal = coverageGoal();
    const row = spacingRow({
      id: 'r1',
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
    });
    const blocks = aggregateGoalCandidatesByModule([goal], [row], NOW, 'keys');
    expect(blocks).toEqual([]);
  });

  it('forceIncludeModules overrides the keys hard filter for the named module', () => {
    const goal = coverageGoal();
    const row = spacingRow({
      id: 'r1',
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
    });
    // Without override: keys drops HF.
    const withoutOverride = aggregateGoalCandidatesByModule(
      [goal], [row], NOW, 'keys',
    );
    expect(withoutOverride).toEqual([]);

    // With override: HF passes; context factor for HF on keys is the
    // default (1.0) since the keys table doesn't list HF — so the
    // block weight equals the base per-item weight unchanged.
    const withOverride = aggregateGoalCandidatesByModule(
      [goal], [row], NOW, 'keys',
      new Map(),
      ['harmonic-fluency'],
    );
    expect(withOverride).toHaveLength(1);
    expect(withOverride[0].moduleRef).toBe('harmonic-fluency');
  });

  it('forceIncludeModules ear-training expands to all four ET sub-modules', () => {
    const goal = coverageGoal({
      targetMetric: 'ear_training_coverage_at_acquired',
      relatedModules: ['ear-training'],
    });
    const intervalsRow = spacingRow({
      id: 'r-int',
      itemRef: 'int-M3',
      moduleRef: 'intervals',
    });
    const chordRecRow = spacingRow({
      id: 'r-cr',
      itemRef: 'cr-maj',
      moduleRef: 'chord-recognition',
    });
    const blocks = aggregateGoalCandidatesByModule(
      [goal], [intervalsRow, chordRecRow], NOW, 'keys',
      new Map(),
      ['ear-training'],
    );
    // Both sub-modules survive the override; each emits its own block.
    expect(blocks.map(b => b.moduleRef).sort()).toEqual(
      ['chord-recognition', 'intervals'],
    );
  });
});
