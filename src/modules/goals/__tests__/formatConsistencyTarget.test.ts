// @vitest-environment jsdom
/**
 * formatConsistencyTarget — the consistency goal meta sub-line.
 * Cadence units render as "N×/week" / "N×/month" (was the
 * ungrammatical "6 week"); other units keep the plain join.
 */
import { describe, expect, it } from 'vitest';
import { formatConsistencyTarget, goalRowMetaStatus } from '../Goals';
import type { Goal } from '../../../lib/db';
import type { ProgressSlotState } from '../goalRowSlots';

describe('formatConsistencyTarget', () => {
  it('renders a weekly frequency as N×/week (was "6 week")', () => {
    expect(formatConsistencyTarget(6, 'week')).toBe('6×/week');
  });

  it('renders a monthly frequency as N×/month', () => {
    expect(formatConsistencyTarget(12, 'month')).toBe('12×/month');
  });

  it('leaves a non-cadence unit as a plain join', () => {
    expect(formatConsistencyTarget(5, 'days')).toBe('5 days');
  });
});

describe('goalRowMetaStatus — consistency not-started', () => {
  const consistencyGoal = {
    targetMetric: 'practice_days_per_cadence',
  } as Goal;

  it('uses the ×/week format for a not-started weekly consistency goal', () => {
    const slot: ProgressSlotState = {
      kind: 'not-started',
      targetValue: 6,
      targetUnit: 'week',
    };
    expect(goalRowMetaStatus(consistencyGoal, slot)).toBe('6×/week');
  });

  it('still shows X/Y for an in-progress goal', () => {
    const slot: ProgressSlotState = {
      kind: 'in-progress',
      currentValue: 3,
      targetValue: 6,
      targetUnit: 'week',
    };
    expect(goalRowMetaStatus(consistencyGoal, slot)).toBe('3/6');
  });
});
