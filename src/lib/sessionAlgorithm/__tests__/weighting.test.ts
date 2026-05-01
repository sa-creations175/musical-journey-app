// @vitest-environment jsdom
/**
 * Phase 3 Step 2d — item weighting contract tests.
 */
import { describe, expect, it } from 'vitest';
import type { AcquisitionStage } from '../../db';
import {
  ACQUISITION_FACTOR_ACQUIRING,
  ACQUISITION_FACTOR_NEUTRAL,
  FRESHNESS_FACTOR_AGING,
  FRESHNESS_FACTOR_NEUTRAL,
  FRESHNESS_FACTOR_STALE,
  FRESHNESS_FACTOR_TOO_RECENT,
  FRESHNESS_FACTOR_VERY_STALE,
  GOAL_ALIGNMENT_FACTOR_LONG_HORIZON,
  GOAL_ALIGNMENT_FACTOR_MONTHLY,
  GOAL_ALIGNMENT_FACTOR_NONE,
  GOAL_ALIGNMENT_FACTOR_QUARTERLY,
  GOAL_ALIGNMENT_FACTOR_WEEKLY,
  GOAL_ALIGNMENT_FACTOR_YEARLY,
  PRIORITY_FACTOR_COMFORT,
  PRIORITY_FACTOR_DEEP,
  PRIORITY_FACTOR_MAINTENANCE,
  acquisitionFactor,
  freshnessFactor,
  goalAlignmentFactor,
  priorityFactor,
  weightForItem,
} from '../weighting';
import type { SpacingRow } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

function row(stage: AcquisitionStage, lastEngagedAt: number | null = null): SpacingRow {
  return {
    itemRef: 'x',
    moduleRef: 'shapes-and-patterns',
    acquisitionStage: stage,
    lastEngagedAt,
    nextDueAt: null,
  };
}

describe('goalAlignmentFactor', () => {
  it('lifts shorter horizons more', () => {
    expect(goalAlignmentFactor('weekly')).toBe(GOAL_ALIGNMENT_FACTOR_WEEKLY);
    expect(goalAlignmentFactor('monthly')).toBe(GOAL_ALIGNMENT_FACTOR_MONTHLY);
    expect(goalAlignmentFactor('quarterly')).toBe(GOAL_ALIGNMENT_FACTOR_QUARTERLY);
    expect(goalAlignmentFactor('yearly')).toBe(GOAL_ALIGNMENT_FACTOR_YEARLY);
    expect(goalAlignmentFactor('two_to_three_year')).toBe(GOAL_ALIGNMENT_FACTOR_LONG_HORIZON);
    expect(goalAlignmentFactor('lifetime')).toBe(GOAL_ALIGNMENT_FACTOR_LONG_HORIZON);
  });

  it('weekly > monthly > quarterly > yearly > long-horizon', () => {
    expect(GOAL_ALIGNMENT_FACTOR_WEEKLY).toBeGreaterThan(GOAL_ALIGNMENT_FACTOR_MONTHLY);
    expect(GOAL_ALIGNMENT_FACTOR_MONTHLY).toBeGreaterThan(GOAL_ALIGNMENT_FACTOR_QUARTERLY);
    expect(GOAL_ALIGNMENT_FACTOR_QUARTERLY).toBeGreaterThan(GOAL_ALIGNMENT_FACTOR_YEARLY);
    expect(GOAL_ALIGNMENT_FACTOR_YEARLY).toBeGreaterThan(GOAL_ALIGNMENT_FACTOR_LONG_HORIZON);
  });
});

describe('acquisitionFactor', () => {
  it('lifts acquiring items', () => {
    expect(acquisitionFactor(row('acquiring'))).toBe(ACQUISITION_FACTOR_ACQUIRING);
  });

  it('is neutral for new / acquired / no-row', () => {
    expect(acquisitionFactor(row('new'))).toBe(ACQUISITION_FACTOR_NEUTRAL);
    expect(acquisitionFactor(row('acquired'))).toBe(ACQUISITION_FACTOR_NEUTRAL);
    expect(acquisitionFactor(undefined)).toBe(ACQUISITION_FACTOR_NEUTRAL);
  });
});

describe('freshnessFactor', () => {
  it('cools just-engaged items', () => {
    expect(freshnessFactor(row('acquired', T0 - 6 * 60 * 60 * 1000), T0)).toBe(FRESHNESS_FACTOR_TOO_RECENT);
  });

  it('1–3 days neutral', () => {
    expect(freshnessFactor(row('acquired', T0 - 2 * DAY), T0)).toBe(FRESHNESS_FACTOR_NEUTRAL);
  });

  it('4–7 days aging', () => {
    expect(freshnessFactor(row('acquired', T0 - 5 * DAY), T0)).toBe(FRESHNESS_FACTOR_AGING);
  });

  it('8–14 days stale', () => {
    expect(freshnessFactor(row('acquired', T0 - 10 * DAY), T0)).toBe(FRESHNESS_FACTOR_STALE);
  });

  it('15+ days very stale', () => {
    expect(freshnessFactor(row('acquired', T0 - 30 * DAY), T0)).toBe(FRESHNESS_FACTOR_VERY_STALE);
  });

  it('untouched items are neutral, not stale', () => {
    expect(freshnessFactor(row('new', null), T0)).toBe(FRESHNESS_FACTOR_NEUTRAL);
    expect(freshnessFactor(undefined, T0)).toBe(FRESHNESS_FACTOR_NEUTRAL);
  });
});

describe('priorityFactor', () => {
  it('deep > comfort > maintenance', () => {
    expect(priorityFactor('deep')).toBe(PRIORITY_FACTOR_DEEP);
    expect(priorityFactor('comfort')).toBe(PRIORITY_FACTOR_COMFORT);
    expect(priorityFactor('maintenance')).toBe(PRIORITY_FACTOR_MAINTENANCE);
  });

  it('undefined defaults to comfort (1.0)', () => {
    expect(priorityFactor(undefined)).toBe(PRIORITY_FACTOR_COMFORT);
  });
});

describe('weightForItem', () => {
  it('zero goals → all factors neutral except item-driven ones', () => {
    const r = weightForItem({
      row: row('acquiring', T0 - 5 * DAY),
      goals: [],
      now: T0,
    });
    expect(r.factors.goalAlignment).toBe(GOAL_ALIGNMENT_FACTOR_NONE);
    expect(r.factors.pace).toBe(1.0);
    expect(r.factors.acquisition).toBe(ACQUISITION_FACTOR_ACQUIRING);
    expect(r.factors.freshness).toBe(FRESHNESS_FACTOR_AGING);
    expect(r.factors.priority).toBe(PRIORITY_FACTOR_COMFORT);
    expect(r.weight).toBeCloseTo(1 * 1 * ACQUISITION_FACTOR_ACQUIRING * FRESHNESS_FACTOR_AGING * 1);
  });

  it('multiple goals → max alignment + max pace', () => {
    const r = weightForItem({
      row: row('new'),
      goals: [
        { scope: 'yearly', paceFactor: 2.0 },
        { scope: 'weekly', paceFactor: 1.0 },
      ],
      now: T0,
    });
    expect(r.factors.goalAlignment).toBe(GOAL_ALIGNMENT_FACTOR_WEEKLY);
    expect(r.factors.pace).toBe(2.0);
  });

  it('combines all five factors multiplicatively', () => {
    const r = weightForItem({
      row: row('acquiring', T0 - 10 * DAY),
      goals: [{ scope: 'weekly', paceFactor: 1.6 }],
      priority: 'deep',
      now: T0,
    });
    const expected =
      GOAL_ALIGNMENT_FACTOR_WEEKLY *
      1.6 *
      ACQUISITION_FACTOR_ACQUIRING *
      FRESHNESS_FACTOR_STALE *
      PRIORITY_FACTOR_DEEP;
    expect(r.weight).toBeCloseTo(expected);
  });

  it('items the user just touched cool down even with active goals', () => {
    const justNow = weightForItem({
      row: row('acquiring', T0 - 1 * 60 * 60 * 1000), // 1h ago
      goals: [{ scope: 'weekly', paceFactor: 2.0 }],
      now: T0,
    });
    const aDayAgo = weightForItem({
      row: row('acquiring', T0 - 2 * DAY),
      goals: [{ scope: 'weekly', paceFactor: 2.0 }],
      now: T0,
    });
    expect(justNow.weight).toBeLessThan(aDayAgo.weight);
  });
});
