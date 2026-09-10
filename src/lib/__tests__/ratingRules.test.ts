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
  DEFAULT_RATING_RULES, NEEDS_WORK_FLOOR, bandOf, bandPercent,
  itemsToClear, ratingBands, ratingFloor, ratingRules, type BandKey,
} from '../ratingRules';
import { computeTier } from '../tier';
import { bandFor } from '../../modules/dashboard/bands';

describe('the bands are the 25 August ruling', () => {
  it('is under 60, 60–79, 80–94, 95 and up', () => {
    const r = DEFAULT_RATING_RULES;
    expect(bandPercent(NEEDS_WORK_FLOOR)).toBe(0);
    expect(bandPercent(r.developingFloor)).toBe(60);
    expect(bandPercent(r.fluentFloor)).toBe(80);
    expect(bandPercent(r.masteredFloor)).toBe(95);
  });

  it('is twenty answers, floor five — three when self-rated', () => {
    const r = DEFAULT_RATING_RULES;
    expect(r.window).toBe(20);
    expect(r.measuredFloor).toBe(5);
    expect(r.selfRatedFloor).toBe(3);
    expect(ratingFloor('measured')).toBe(5);
    expect(ratingFloor('self-rated')).toBe(3);
  });

  it('opens on the defaults, so an untouched install grades as ruled', () => {
    expect(ratingRules()).toEqual(DEFAULT_RATING_RULES);
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
  const COLOUR_OF: Readonly<Record<BandKey, string>> = {
    mastered: 'green', fluent: 'yellow-green',
    developing: 'amber', needsWork: 'red',
  };

  it('agrees between the tier grader and the dashboard column', () => {
    for (let pct = 0; pct <= 100; pct += 1) {
      const expected = bandOf(pct / 100);
      // The tier grader, over a full window so the floor is not in play.
      expect(
        computeTier({
          windowCorrect: Math.round((pct / 100) * DEFAULT_RATING_RULES.window),
          windowTotal: DEFAULT_RATING_RULES.window,
          daysSinceLastAttempt: 0,
        }),
        `tier at ${pct}%`,
      ).toBe(bandOf(
        Math.round((pct / 100) * DEFAULT_RATING_RULES.window)
          / DEFAULT_RATING_RULES.window,
      ));
      // And the dashboard's colour column.
      expect(bandFor(pct, 'measured'), `band at ${pct}%`)
        .toBe(COLOUR_OF[expected]);
    }
  });

  it('walks the bands best first, so a legend cannot invert', () => {
    const floors = ratingBands().map(b => b.floor);
    expect([...floors].sort((a, b) => b - a)).toEqual(floors);
    expect(ratingBands().map(b => b.key))
      .toEqual(['mastered', 'fluent', 'developing', 'needsWork']);
  });
});

describe('what it takes to open a tier', () => {
  it('is ten attempts at eighty per cent passed, per item', () => {
    expect(DEFAULT_RATING_RULES.itemClearAttempts).toBe(10);
    // THE CLEAR BAR IS `fluentFloor` ITSELF, not a copy of it:
    // one number for "good enough", across the app, and moving Fluent
    // moves the Tier bar with it.
    expect(DEFAULT_RATING_RULES.fluentFloor).toBe(0.80);
  });

  it('opens a tier at eighty per cent of its items, rounded up', () => {
    expect(DEFAULT_RATING_RULES.tierOpenShare).toBe(0.80);
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
      expect(itemsToClear(n) / n, `${n}`)
        .toBeGreaterThanOrEqual(DEFAULT_RATING_RULES.tierOpenShare);
      expect(itemsToClear(n), `${n}`).toBeLessThanOrEqual(n);
    }
  });
});
