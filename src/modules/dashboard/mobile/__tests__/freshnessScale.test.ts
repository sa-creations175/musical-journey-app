/**
 * The freshness scale: seven rungs, evenly spaced, full to empty.
 *
 * NOT A LAYOUT TEST. Whether seven rungs printed under a list is a
 * useful amount of screen on a phone is Silas's call on a phone. What
 * is checked here is that the rungs a bar lands on and the rungs the
 * printed scale draws are the same list, and that the stored step
 * actually moves them.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../../../lib/db';
import {
  FRESHNESS_STEPS,
  FRESHNESS_STEP_DEFAULT_DAYS,
  freshnessFraction,
  freshnessRungs,
  freshnessWords,
} from '../freshnessScale';
import {
  PREF_FRESHNESS_STEP_DAYS,
  getFreshnessStepDays,
  setFreshnessStepDays,
} from '../freshnessPrefs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 25, 12);
const STEP = FRESHNESS_STEP_DEFAULT_DAYS;

afterEach(async () => {
  await db.userPrefs.clear();
});

const daysAgo = (n: number) => NOW - n * DAY;
const words = (n: number | null, step = STEP) =>
  freshnessWords(n === null ? null : daysAgo(n), NOW, step);

describe('the rungs', () => {
  it('names the seven Silas asked for, freshest first', () => {
    expect(freshnessRungs(STEP).map(r => r.label)).toEqual([
      'today',
      'within 1 week',
      'within 2 weeks',
      'within 3 weeks',
      'within 4 weeks',
      'over a month',
      'never',
    ]);
  });

  it('runs full to empty in even steps', () => {
    const fractions = freshnessRungs(STEP).map(r => r.fraction);
    expect(fractions[0]).toBe(1);
    expect(fractions[fractions.length - 1]).toBe(0);
    // EVENLY SPACED, which is what makes the bar honest as a picture:
    // every rung down costs the same amount of bar as the last.
    const gaps = fractions.slice(1).map((f, i) => fractions[i] - f);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 10);
  });

  it('carries a day bound for the closed rungs and none for the open ones', () => {
    const rungs = freshnessRungs(STEP);
    expect(rungs[0].upToDays).toBe(0);
    for (let n = 1; n <= FRESHNESS_STEPS; n += 1) {
      expect(rungs[n].upToDays, rungs[n].label).toBe(n * STEP);
    }
    // "over a month" has no upper bound and "never" is not a number of
    // days — null rather than a figure nobody could act on.
    expect(rungs[FRESHNESS_STEPS + 1].upToDays).toBeNull();
    expect(rungs[FRESHNESS_STEPS + 2].upToDays).toBeNull();
  });
});

describe('which rung a timestamp lands on', () => {
  it('is full today and empty never', () => {
    expect(freshnessFraction(NOW, NOW, STEP)).toBe(1);
    expect(freshnessFraction(null, NOW, STEP)).toBe(0);
    expect(words(0)).toBe('today');
    expect(words(null)).toBe('never');
  });

  it('steps down a rung a week at a time', () => {
    expect(words(1)).toBe('within 1 week');
    expect(words(7)).toBe('within 1 week');
    expect(words(8)).toBe('within 2 weeks');
    expect(words(14)).toBe('within 2 weeks');
    expect(words(21)).toBe('within 3 weeks');
    expect(words(28)).toBe('within 4 weeks');
    expect(words(29)).toBe('over a month');
    expect(words(400)).toBe('over a month');
  });

  it('gets shorter as time passes, never longer', () => {
    // The rule the whole screen rests on, checked across the range
    // rather than at the boundaries it was written from.
    let previous = freshnessFraction(NOW, NOW, STEP);
    for (let d = 1; d <= 60; d += 1) {
      const f = freshnessFraction(daysAgo(d), NOW, STEP);
      expect(f, `${d}d`).toBeLessThanOrEqual(previous);
      previous = f;
    }
  });

  it('moves with the step, which is the point of storing it', () => {
    // Ten days is "within 2 weeks" at the default and "within 1 week"
    // once a step is a fortnight.
    expect(words(10)).toBe('within 2 weeks');
    expect(words(10, 14)).toBe('within 1 week');
  });
});

describe('the stored step', () => {
  it('is the default until it is set', async () => {
    expect(await getFreshnessStepDays()).toBe(FRESHNESS_STEP_DEFAULT_DAYS);
  });

  it('reads back what was written', async () => {
    await setFreshnessStepDays(10);
    expect(await getFreshnessStepDays()).toBe(10);
  });

  it('refuses a value that would collapse every rung', async () => {
    // Crosses a sync boundary, so a zero can arrive from an older build
    // rather than from the input.
    await db.userPrefs.put({ key: PREF_FRESHNESS_STEP_DAYS, value: 0 });
    expect(await getFreshnessStepDays()).toBe(FRESHNESS_STEP_DEFAULT_DAYS);
    await db.userPrefs.put({ key: PREF_FRESHNESS_STEP_DAYS, value: -3 });
    expect(await getFreshnessStepDays()).toBe(FRESHNESS_STEP_DEFAULT_DAYS);
  });

  it('clamps a write rather than storing it', async () => {
    await setFreshnessStepDays(0);
    expect(await getFreshnessStepDays()).toBe(1);
  });
});
