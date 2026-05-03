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
    );

    expect(blocks).toHaveLength(1);
    // 5/50 covered after 10 of 30 days → ratio ~0.30 → significantly-behind.
    // Expected: monthly × significantly-behind pace × acquiring × very-stale × neutral priority
    const expected =
      GOAL_ALIGNMENT_FACTOR_MONTHLY *
      PACE_FACTOR_SIGNIFICANTLY_BEHIND *
      ACQUISITION_FACTOR_ACQUIRING *
      FRESHNESS_FACTOR_VERY_STALE;
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

    const monthlyOnly = aggregateGoalCandidatesByModule([monthly], [row], NOW);
    const both = aggregateGoalCandidatesByModule([monthly, weekly], [row], NOW);

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
