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
import { DEFAULT_RATING_RULES, ratingBands } from '../ratingRules';

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
    // MASTERED, NOT FLUENT, SINCE 10 SEP 2026. Five out of five is
    // 100% and the top band is 95% of the window — it used to demand
    // a full twenty with nothing wrong.
    expect(tier(MIN_ATTEMPTS_FOR_TIER, MIN_ATTEMPTS_FOR_TIER)).toBe('mastered');
    expect(tier(0, MIN_ATTEMPTS_FOR_TIER)).toBe('needsWork');
  });

  it('grades a self-rated drill from three', () => {
    // TWO FLOORS, AND THE GAP IS THE POINT. A measured answer can be
    // lucky; a self-rated rep is a judgement the player made about a
    // shape they just played, and three of those is a rating.
    const selfRated = (correct: number, total: number) => computeTier({
      windowCorrect: correct, windowTotal: total,
      daysSinceLastAttempt: 0, kind: 'self-rated',
    });
    expect(selfRated(3, 3)).toBe('mastered');
    expect(selfRated(2, 3)).toBe('developing');
    expect(selfRated(2, 2)).toBe('started');
    // And a measured drill at the same count is still ungraded.
    expect(tier(3, 3)).toBe('started');
  });

  it('does not let a perfect run below the minimum read as fluent', () => {
    // The threshold has not moved — only what sits under it.
    expect(tier(MIN_ATTEMPTS_FOR_TIER - 1, MIN_ATTEMPTS_FOR_TIER - 1)).toBe('started');
  });
});

describe('the four bands are the ruling', () => {
  /**
   * =====================================================================
   * UNDER 60 · 60–79 · 80–94 · 95 AND UP.
   *
   * Rules of the Game, 25 Aug 2026, in the code since 10 Sep. This file
   * used to be headed "the graded bands are unchanged" and asserted
   * 50 / 80 with Mastered reserved for a perfect window of twenty.
   *
   * Both edges of every band, because "80 is fluent" alone passes on a
   * function where 79 is fluent too.
   * =====================================================================
   */
  it('puts every cut-off on the right side', () => {
    for (const [correct, band] of [
      [0, 'needsWork'], [11, 'needsWork'],     // 55%
      [12, 'developing'], [15, 'developing'],  // 60% .. 75%
      [16, 'fluent'], [18, 'fluent'],          // 80% .. 90%
      [19, 'mastered'], [20, 'mastered'],      // 95% .. 100%
    ] as const) {
      expect(tier(correct, 20), `${correct}/20`).toBe(band);
    }
  });

  it('takes its numbers from the shared rules rather than its own', () => {
    // Guard the guard: the cases above would still pass on a second
    // copy of the thresholds typed into `tier.ts`.
    for (const { key, floor } of ratingBands()) {
      expect(tier(Math.round(floor * 20), 20), key).toBe(key);
    }
    expect(MASTERY_WINDOW).toBe(DEFAULT_RATING_RULES.window);
    expect(MIN_ATTEMPTS_FOR_TIER).toBe(DEFAULT_RATING_RULES.measuredFloor);
  });

  it('no longer demands perfection for the top band', () => {
    // Nineteen of twenty used to throw away the other nineteen.
    expect(tier(19, 20)).toBe('mastered');
    expect(tier(MASTERY_WINDOW, MASTERY_WINDOW)).toBe('mastered');
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
