/**
 * The band beneath the grade line, which used to be one band.
 *
 * The rule these lock: NOTHING and SOMETHING-NOT-YET-GRADED are two
 * different answers. Every assertion here would have passed on the old
 * `untouched`-for-everything-under-five function except the ones that
 * name `started` — those are the whole point.
 */
import { describe, it, expect } from 'vitest';
import {
  MASTERY_WINDOW,
  MIN_ATTEMPTS_FOR_TIER,
  STALE_DAYS,
  TIER_BAR_CLASS,
  TIER_LABEL,
  TIER_ORDER,
  TIER_WEIGHT,
  computeTier,
  type Tier,
} from '../tier';

const tier = (windowCorrect: number, windowTotal: number, days: number | null = 0): Tier =>
  computeTier({ windowCorrect, windowTotal, daysSinceLastAttempt: days });

describe('the split under the grade line', () => {
  it('calls zero attempts untouched', () => {
    expect(tier(0, 0, null)).toBe('untouched');
  });

  it('calls one attempt started, not untouched', () => {
    // THE DEFECT. One answer used to paint the same pixels as none.
    expect(tier(1, 1)).toBe('started');
    expect(tier(0, 1)).toBe('started');
  });

  it('calls every count below the minimum started', () => {
    for (let n = 1; n < MIN_ATTEMPTS_FOR_TIER; n += 1) {
      expect(tier(n, n)).toBe('started');
    }
  });

  it('grades from the minimum up, and never says started there', () => {
    expect(tier(MIN_ATTEMPTS_FOR_TIER, MIN_ATTEMPTS_FOR_TIER)).toBe('fluent');
    expect(tier(0, MIN_ATTEMPTS_FOR_TIER)).toBe('needsWork');
  });

  it('does not let a perfect run below the minimum read as fluent', () => {
    // The threshold has not moved — only what sits under it.
    expect(tier(MIN_ATTEMPTS_FOR_TIER - 1, MIN_ATTEMPTS_FOR_TIER - 1)).toBe('started');
  });
});

describe('the graded bands are unchanged', () => {
  it('keeps the four accuracy grades where they were', () => {
    expect(tier(MASTERY_WINDOW, MASTERY_WINDOW)).toBe('mastered');
    expect(tier(9, 10)).toBe('fluent');
    expect(tier(6, 10)).toBe('developing');
    expect(tier(4, 10)).toBe('needsWork');
  });

  it('still stales a good grade left alone, and only a good one', () => {
    expect(tier(10, 10, STALE_DAYS)).toBe('stale');
    expect(tier(4, 10, STALE_DAYS)).toBe('needsWork');
  });

  it('does not stale a started item — there is no grade to decay', () => {
    expect(tier(2, 2, STALE_DAYS * 10)).toBe('started');
  });
});

describe('every band is described exactly once', () => {
  it('lists all seven in the canonical order, best first', () => {
    expect(TIER_ORDER).toEqual([
      'mastered', 'fluent', 'developing', 'needsWork', 'stale', 'started', 'untouched',
    ]);
  });

  it('gives every tier a label, a colour and a weight', () => {
    for (const t of TIER_ORDER) {
      expect(TIER_LABEL[t]).toBeTruthy();
      expect(TIER_BAR_CLASS[t]).toBeTruthy();
      expect(typeof TIER_WEIGHT[t]).toBe('number');
    }
  });

  it('paints started differently from not started', () => {
    // The requirement in one line: they cannot be the same pixels.
    expect(TIER_BAR_CLASS.started).not.toBe(TIER_BAR_CLASS.untouched);
    expect(TIER_BAR_CLASS.started).not.toBe(TIER_BAR_CLASS.stale);
  });

  it('paints started differently from every graded tier', () => {
    for (const t of ['mastered', 'fluent', 'developing', 'needsWork'] as Tier[]) {
      expect(TIER_BAR_CLASS.started).not.toBe(TIER_BAR_CLASS[t]);
    }
  });

  it('leaves the scheduler where it was — started weighs what untouched weighs', () => {
    expect(TIER_WEIGHT.started).toBe(TIER_WEIGHT.untouched);
  });
});
