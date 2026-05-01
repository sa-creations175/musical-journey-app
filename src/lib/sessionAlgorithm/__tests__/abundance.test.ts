/**
 * Phase 3 Step 2j — abundance trigger detection tests.
 */
import { describe, expect, it } from 'vitest';
import {
  NOTHING_URGENT_POOL_THRESHOLD,
  NOTHING_URGENT_WEIGHT_THRESHOLD,
  detectAbundance,
  shouldFireAbundanceFlow,
} from '../abundance';

const baseInput = {
  candidatePoolSize: 10,
  topItemWeight: 2.0,
  goalPaceRatios: [0.5, 0.7],
  earlierSessionsToday: 0,
};

describe('detectAbundance — queue-cleared', () => {
  it('fires when the candidate pool is empty', () => {
    expect(
      detectAbundance({ ...baseInput, candidatePoolSize: 0, topItemWeight: 0 }),
    ).toEqual({ triggered: true, reason: 'queue-cleared' });
  });

  it('takes precedence over ahead-of-pace', () => {
    expect(
      detectAbundance({
        ...baseInput,
        candidatePoolSize: 0,
        topItemWeight: 0,
        goalPaceRatios: [1.5, 2.0], // would also be ahead-of-pace
      }),
    ).toEqual({ triggered: true, reason: 'queue-cleared' });
  });
});

describe('detectAbundance — ahead-of-pace', () => {
  it('fires when every goal pace ratio is at or above 1.0', () => {
    expect(
      detectAbundance({
        ...baseInput,
        goalPaceRatios: [1.0, 1.5, 2.0],
      }),
    ).toEqual({ triggered: true, reason: 'ahead-of-pace' });
  });

  it('does not fire when any goal is behind pace', () => {
    expect(
      detectAbundance({
        ...baseInput,
        goalPaceRatios: [1.5, 0.9, 1.2],
      }),
    ).toEqual({ triggered: false, reason: null });
  });

  it('does not fire with zero goals', () => {
    expect(
      detectAbundance({
        ...baseInput,
        goalPaceRatios: [],
      }),
    ).toEqual({ triggered: false, reason: null });
  });
});

describe('detectAbundance — nothing-urgent', () => {
  it('fires when pool is thin, top weight is mild, and the user practiced earlier', () => {
    expect(
      detectAbundance({
        candidatePoolSize: NOTHING_URGENT_POOL_THRESHOLD,
        topItemWeight: NOTHING_URGENT_WEIGHT_THRESHOLD - 0.1,
        goalPaceRatios: [0.8],
        earlierSessionsToday: 1,
      }),
    ).toEqual({ triggered: true, reason: 'nothing-urgent' });
  });

  it('does not fire on a cold-start morning (no earlier sessions)', () => {
    expect(
      detectAbundance({
        candidatePoolSize: 2,
        topItemWeight: 1.2,
        goalPaceRatios: [0.7],
        earlierSessionsToday: 0,
      }),
    ).toEqual({ triggered: false, reason: null });
  });

  it('does not fire when the top item is pulling hard', () => {
    expect(
      detectAbundance({
        candidatePoolSize: 2,
        topItemWeight: 2.5, // well above urgency threshold
        goalPaceRatios: [0.7],
        earlierSessionsToday: 1,
      }),
    ).toEqual({ triggered: false, reason: null });
  });

  it('does not fire when the pool is large', () => {
    expect(
      detectAbundance({
        candidatePoolSize: NOTHING_URGENT_POOL_THRESHOLD + 1,
        topItemWeight: 1.2,
        goalPaceRatios: [0.7],
        earlierSessionsToday: 1,
      }),
    ).toEqual({ triggered: false, reason: null });
  });
});

describe('detectAbundance — precedence ordering', () => {
  it('ahead-of-pace beats nothing-urgent', () => {
    // Pool is thin, weight mild, sessions logged → would qualify
    // for nothing-urgent; goals also all ahead → ahead-of-pace wins.
    expect(
      detectAbundance({
        candidatePoolSize: 2,
        topItemWeight: 1.2,
        goalPaceRatios: [1.5, 1.8],
        earlierSessionsToday: 1,
      }),
    ).toEqual({ triggered: true, reason: 'ahead-of-pace' });
  });
});

describe('shouldFireAbundanceFlow', () => {
  it('routes through detectAbundance and returns just the boolean', () => {
    expect(
      shouldFireAbundanceFlow({ ...baseInput, candidatePoolSize: 0, topItemWeight: 0 }),
    ).toBe(true);
    expect(shouldFireAbundanceFlow(baseInput)).toBe(false);
  });
});
