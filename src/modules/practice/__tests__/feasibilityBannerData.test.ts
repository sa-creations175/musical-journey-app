// @vitest-environment jsdom
/**
 * Phase 3 Step 7b — pickBehindPaceEntries sort + filter tests.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../lib/db';
import type { GoalFeasibility } from '../../../modules/goals/progress';
import { pickBehindPaceEntries } from '../feasibilityBannerData';

function goal(partial: Partial<Goal> = {}): Goal {
  return {
    id: partial.id ?? 'g',
    scope: partial.scope ?? 'weekly',
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
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: partial.lastEngagedAt ?? null,
  };
}

function measurable(
  status: 'on_track' | 'at_risk' | 'critical' | 'unrecoverable',
  recommendation = '',
): GoalFeasibility {
  return {
    kind: 'measurable',
    status,
    projected: 0,
    target: 0,
    currentValue: 0,
    daysRemaining: 0,
    recommendation,
  };
}

describe('pickBehindPaceEntries — filtering', () => {
  it('drops on_track and unrecoverable goals', () => {
    const out = pickBehindPaceEntries([
      { goal: goal({ id: 'a' }), feasibility: measurable('on_track') },
      { goal: goal({ id: 'b' }), feasibility: measurable('unrecoverable') },
      { goal: goal({ id: 'c' }), feasibility: measurable('at_risk', 'fix me') },
    ]);
    expect(out.map(e => e.goalId)).toEqual(['c']);
  });

  it('drops aspirational and unknown feasibilities', () => {
    const out = pickBehindPaceEntries([
      { goal: goal({ id: 'a' }), feasibility: { kind: 'aspirational', message: 'x' } },
      { goal: goal({ id: 'b' }), feasibility: { kind: 'unknown' } },
      { goal: goal({ id: 'c' }), feasibility: measurable('critical', 'urgent') },
    ]);
    expect(out.map(e => e.goalId)).toEqual(['c']);
  });
});

describe('pickBehindPaceEntries — sort priority', () => {
  it('critical leads at_risk', () => {
    const out = pickBehindPaceEntries([
      { goal: goal({ id: 'a' }), feasibility: measurable('at_risk', 'a') },
      { goal: goal({ id: 'b' }), feasibility: measurable('critical', 'b') },
    ]);
    expect(out.map(e => e.goalId)).toEqual(['b', 'a']);
  });

  it('shorter scope leads within same status', () => {
    const out = pickBehindPaceEntries([
      { goal: goal({ id: 'y', scope: 'yearly' }), feasibility: measurable('at_risk', 'y') },
      { goal: goal({ id: 'm', scope: 'monthly' }), feasibility: measurable('at_risk', 'm') },
      { goal: goal({ id: 'w', scope: 'weekly' }), feasibility: measurable('at_risk', 'w') },
    ]);
    expect(out.map(e => e.goalId)).toEqual(['w', 'm', 'y']);
  });

  it('alphabetical tiebreak by message within status + scope', () => {
    const out = pickBehindPaceEntries([
      { goal: goal({ id: 'x' }), feasibility: measurable('at_risk', 'zebra') },
      { goal: goal({ id: 'y' }), feasibility: measurable('at_risk', 'apple') },
    ]);
    expect(out.map(e => e.goalId)).toEqual(['y', 'x']);
  });
});

describe('pickBehindPaceEntries — message fallback', () => {
  it('uses goal.description when recommendation is empty', () => {
    const out = pickBehindPaceEntries([
      {
        goal: goal({ id: 'a', description: 'Practice Bach this week' }),
        feasibility: measurable('at_risk', ''),
      },
    ]);
    expect(out[0].message).toBe('Practice Bach this week');
  });
});

describe('pickBehindPaceEntries — Step 7d empty state', () => {
  it('returns [] when no goals are behind pace', () => {
    // All on-track + a couple aspirational/unknown — none qualify.
    const out = pickBehindPaceEntries([
      { goal: goal({ id: 'a' }), feasibility: measurable('on_track') },
      { goal: goal({ id: 'b' }), feasibility: measurable('on_track') },
      { goal: goal({ id: 'c' }), feasibility: { kind: 'aspirational', message: 'x' } },
      { goal: goal({ id: 'd' }), feasibility: { kind: 'unknown' } },
    ]);
    // FeasibilityBanner returns null on empty entries — the
    // banner-disappear-when-clear behavior (Step 7d) follows
    // automatically from this contract.
    expect(out).toEqual([]);
  });

  it('returns [] for an empty input list', () => {
    expect(pickBehindPaceEntries([])).toEqual([]);
  });
});
