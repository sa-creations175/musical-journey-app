/**
 * The one place the app's numbers live.
 *
 * =====================================================================
 * THE FAILURE THIS FILE EXISTS TO CATCH IS A SECOND LADDER.
 *
 * There were two. `lib/tier.ts` graded 50 / 80 and reserved Mastered
 * for a perfect window of twenty; the desktop dashboard's `bands.ts`
 * graded 50 / 70 / 85 and painted four colours. One item could be
 * Developing on one screen and amber on another, and each file was
 * right about itself — which is what made it invisible for a fortnight
 * after the ruling that settled it.
 *
 * So these assertions are not really about arithmetic. They are about
 * every reader arriving at the same answer, which is why each one is
 * checked THROUGH a reader rather than against a literal here.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  DEVELOPING_FLOOR, FLUENT_FLOOR, ITEM_CLEAR_MIN_ACCURACY,
  ITEM_CLEAR_MIN_ATTEMPTS, MASTERED_FLOOR, MEASURED_RATING_FLOOR,
  NEEDS_WORK_FLOOR, RATING_BANDS, RATING_WINDOW, SELF_RATED_RATING_FLOOR,
  TIER_OPEN_SHARE, bandOf, bandPercent, itemsToClear, ratingFloor,
} from '../ratingRules';
import { computeTier } from '../tier';
import { bandFor } from '../../modules/dashboard/bands';

describe('the bands are the 25 August ruling', () => {
  it('is under 60, 60–79, 80–94, 95 and up', () => {
    expect(bandPercent(NEEDS_WORK_FLOOR)).toBe(0);
    expect(bandPercent(DEVELOPING_FLOOR)).toBe(60);
    expect(bandPercent(FLUENT_FLOOR)).toBe(80);
    expect(bandPercent(MASTERED_FLOOR)).toBe(95);
  });

  it('is twenty answers, floor five — three when self-rated', () => {
    expect(RATING_WINDOW).toBe(20);
    expect(MEASURED_RATING_FLOOR).toBe(5);
    expect(SELF_RATED_RATING_FLOOR).toBe(3);
    expect(ratingFloor('measured')).toBe(5);
    expect(ratingFloor('self-rated')).toBe(3);
  });

  it('puts every boundary on the right side, at both edges', () => {
    for (const [pct, band] of [
      [0, 'needsWork'], [59, 'needsWork'],
      [60, 'developing'], [79, 'developing'],
      [80, 'fluent'], [94, 'fluent'],
      [95, 'mastered'], [100, 'mastered'],
    ] as const) {
      expect(bandOf(pct / 100), `${pct}%`).toBe(band);
    }
  });
});

describe('every reader lands on the same band', () => {
  /**
   * The load-bearing assertion. Both graders are driven across the
   * whole 0–100 range and must agree, band for band, at every single
   * percentage point — not at four sampled thresholds, which is what a
   * per-file test would check and what let the two drift.
   */
  const COLOUR_OF = {
    mastered: 'green', fluent: 'yellow-green',
    developing: 'amber', needsWork: 'red',
  } as const;

  it('agrees between the tier grader and the dashboard column', () => {
    for (let pct = 0; pct <= 100; pct += 1) {
      const expected = bandOf(pct / 100);
      // The tier grader, over a full window so the floor is not in play.
      expect(
        computeTier({
          windowCorrect: Math.round((pct / 100) * RATING_WINDOW),
          windowTotal: RATING_WINDOW,
          daysSinceLastAttempt: 0,
        }),
        `tier at ${pct}%`,
      ).toBe(bandOf(Math.round((pct / 100) * RATING_WINDOW) / RATING_WINDOW));
      // And the dashboard's colour column.
      expect(bandFor(pct, 'measured'), `band at ${pct}%`)
        .toBe(COLOUR_OF[expected]);
    }
  });

  it('walks the bands best first, so a legend cannot invert', () => {
    const floors = RATING_BANDS.map(b => b.floor);
    expect([...floors].sort((a, b) => b - a)).toEqual(floors);
    expect(RATING_BANDS.map(b => b.key))
      .toEqual(['mastered', 'fluent', 'developing', 'needsWork']);
  });
});

describe('what it takes to open a tier', () => {
  it('is ten attempts at eighty per cent passed, per item', () => {
    expect(ITEM_CLEAR_MIN_ATTEMPTS).toBe(10);
    expect(ITEM_CLEAR_MIN_ACCURACY).toBe(0.80);
    // THE SAME NUMBER THE FLUENT RATING IS DRAWN AT, deliberately: one
    // number for "good enough", across the app.
    expect(ITEM_CLEAR_MIN_ACCURACY).toBe(FLUENT_FLOOR);
  });

  it('opens a tier at eighty per cent of its items, rounded up', () => {
    expect(TIER_OPEN_SHARE).toBe(0.80);
    // Silas's own six worked examples, 10 Sep 2026.
    for (const [items, needed] of [
      [6, 5], [15, 12], [12, 10], [4, 4], [5, 4], [2, 2],
    ] as const) {
      expect(itemsToClear(items), `${items} items`).toBe(needed);
    }
  });

  it('rounds up rather than down, so the share is never undersold', () => {
    // A tier of three at 80% is 2.4 items, and clearing two would open
    // it on 66%. Every count from one to forty is checked because the
    // fractional ones are the only place this can go wrong.
    for (let n = 1; n <= 40; n += 1) {
      expect(itemsToClear(n) / n, `${n}`).toBeGreaterThanOrEqual(TIER_OPEN_SHARE);
      expect(itemsToClear(n), `${n}`).toBeLessThanOrEqual(n);
    }
  });
});
