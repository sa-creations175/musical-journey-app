/**
 * Phase 2 step 6a — slot resolution helpers for the redesigned
 * goal row.
 *
 * Pure unit tests against `goalRowSlots.ts`. The helpers drive
 * what the progress slot renders in collapsed AND expanded states
 * across measurable vs. aspirational layers, regular vs. umbrella
 * goals, and the not-started / in-progress split.
 *
 * The feasibility slot is intentionally inert in 6a (placeholder
 * pill) so Step 7 can drop in real status without retrofitting
 * the layout. We assert that aspirational layers skip slots
 * entirely; the inert visual is verified by manual smoke.
 */
import { describe, it, expect } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  shouldShowSlots,
  progressSlotState,
  progressSlotText,
  progressSlotPercent,
} from '../goalRowSlots';

const baseGoal: Goal = {
  id: 'g1',
  scope: 'monthly',
  description: 'Take 3 songs to Solid this month',
  targetMetric: 'songs_at_level',
  targetValue: 3,
  targetUnit: 'solid',
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
};

describe('shouldShowSlots', () => {
  it('shows slots on measurable layers (week/month/quarter/year)', () => {
    expect(shouldShowSlots('measurable')).toBe(true);
  });

  it('hides slots on aspirational layers (2-3 year, lifetime)', () => {
    expect(shouldShowSlots('aspirational')).toBe(false);
  });
});

describe('progressSlotState', () => {
  it('returns hidden on aspirational layers regardless of goal shape', () => {
    expect(progressSlotState(baseGoal, 'aspirational')).toEqual({ kind: 'hidden' });
    expect(progressSlotState({ ...baseGoal, currentValue: 2 }, 'aspirational')).toEqual({
      kind: 'hidden',
    });
  });

  it('returns hidden when targetValue is null on a measurable layer', () => {
    expect(
      progressSlotState({ ...baseGoal, targetValue: null }, 'measurable'),
    ).toEqual({ kind: 'hidden' });
  });

  it('returns umbrella for umbrella records with null target', () => {
    expect(
      progressSlotState(
        { ...baseGoal, isUmbrella: true, targetMetric: null, targetValue: null },
        'measurable',
      ),
    ).toEqual({ kind: 'umbrella' });
  });

  it('returns not-started when currentValue is 0 and target exists', () => {
    expect(progressSlotState(baseGoal, 'measurable')).toEqual({
      kind: 'not-started',
      targetValue: 3,
      targetUnit: 'solid',
    });
  });

  it('returns in-progress with current/target/unit when currentValue > 0', () => {
    const g = { ...baseGoal, currentValue: 2, targetValue: 3 };
    expect(progressSlotState(g, 'measurable')).toEqual({
      kind: 'in-progress',
      currentValue: 2,
      targetValue: 3,
      targetUnit: 'solid',
    });
  });

  it('renders umbrella state regardless of targetMetric when targetValue is null', () => {
    // Umbrella records may legitimately have targetMetric set
    // (e.g., a roll-up metric copied from children) while
    // targetValue is null. The defining trait is "no own target,
    // rolls up from children" — keyed off targetValue alone.
    const g = {
      ...baseGoal,
      isUmbrella: true,
      targetMetric: 'songs_at_level',
      targetValue: null,
    };
    expect(progressSlotState(g, 'measurable')).toEqual({ kind: 'umbrella' });
  });

  it('renders in-progress for an umbrella that has its own target', () => {
    // Edge case: an umbrella with both isUmbrella=true and a
    // concrete targetValue. The targetValue takes precedence —
    // the row shows real numbers, not the rollup placeholder.
    const g = { ...baseGoal, isUmbrella: true, currentValue: 1, targetValue: 5 };
    expect(progressSlotState(g, 'measurable')).toEqual({
      kind: 'in-progress',
      currentValue: 1,
      targetValue: 5,
      targetUnit: 'solid',
    });
  });
});

describe('progressSlotText', () => {
  it('renders integer current/target on in-progress', () => {
    expect(
      progressSlotText({
        kind: 'in-progress',
        currentValue: 43,
        targetValue: 143,
        targetUnit: 'items',
      }),
    ).toBe('43/143');
  });

  it('renders one decimal for fractional current values', () => {
    expect(
      progressSlotText({
        kind: 'in-progress',
        currentValue: 1.2,
        targetValue: 3,
        targetUnit: 'hours',
      }),
    ).toBe('1.2/3');
  });

  it('renders "Not started" for not-started', () => {
    expect(
      progressSlotText({ kind: 'not-started', targetValue: 3, targetUnit: 'solid' }),
    ).toBe('Not started');
  });

  it('renders "—" for umbrella rows', () => {
    expect(progressSlotText({ kind: 'umbrella' })).toBe('—');
  });

  it('returns null for hidden so callers skip render', () => {
    expect(progressSlotText({ kind: 'hidden' })).toBeNull();
  });
});

describe('progressSlotPercent', () => {
  it('returns the ratio as a percentage when in-progress', () => {
    expect(
      progressSlotPercent({
        kind: 'in-progress',
        currentValue: 43,
        targetValue: 143,
        targetUnit: 'items',
      }),
    ).toBeCloseTo((43 / 143) * 100, 5);
  });

  it('clamps to 100 when current exceeds target', () => {
    expect(
      progressSlotPercent({
        kind: 'in-progress',
        currentValue: 200,
        targetValue: 100,
        targetUnit: null,
      }),
    ).toBe(100);
  });

  it('clamps to 0 for negative current values (defensive)', () => {
    expect(
      progressSlotPercent({
        kind: 'in-progress',
        currentValue: -5,
        targetValue: 100,
        targetUnit: null,
      }),
    ).toBe(0);
  });

  it('returns null when targetValue is 0 (avoid divide-by-zero)', () => {
    expect(
      progressSlotPercent({
        kind: 'in-progress',
        currentValue: 5,
        targetValue: 0,
        targetUnit: null,
      }),
    ).toBeNull();
  });

  it('returns null on every non-in-progress kind', () => {
    expect(progressSlotPercent({ kind: 'not-started', targetValue: 3, targetUnit: null })).toBeNull();
    expect(progressSlotPercent({ kind: 'umbrella' })).toBeNull();
    expect(progressSlotPercent({ kind: 'hidden' })).toBeNull();
  });
});
