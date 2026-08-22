// @vitest-environment jsdom
/**
 * The four spacing settings, and the sequence they produce.
 *
 * The sequence is the part the user actually reads — "2 → 4 → 8 → 16
 * → 30 days" is what makes a floor of 2 mean anything — so it is
 * derived from the two ends by the same doubling the engine walks
 * rather than listed. A preview that could disagree with the engine
 * would be worse than no preview.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { computeIntervalDays } from '../../../lib/spacingState';
import {
  FIRST_INTERVAL_DEFAULT,
  LONGEST_INTERVAL_DEFAULT,
  PREF_FIRST_INTERVAL_DAYS,
  PREF_LONGEST_INTERVAL_DAYS,
  SPACING_DEFAULTS,
  boundsFrom,
  getSpacingSettings,
  intervalSequence,
} from '../spacingPrefs';

beforeEach(async () => { await db.userPrefs.clear(); });

describe('the sequence', () => {
  it('is what the defaults actually produce', () => {
    expect(intervalSequence(SPACING_DEFAULTS)).toEqual([2, 4, 8, 16, 30]);
  });

  it('follows the floor when the floor moves', () => {
    expect(intervalSequence({ ...SPACING_DEFAULTS, firstIntervalDays: 4 }))
      .toEqual([4, 8, 16, 30]);
  });

  it('is clamped by the ceiling, not extended past it', () => {
    const seq = intervalSequence({ ...SPACING_DEFAULTS, longestIntervalDays: 10 });
    expect(seq).toEqual([2, 4, 8, 10]);
    expect(Math.max(...seq)).toBe(10);
  });

  it('collapses to one entry when the ends meet', () => {
    expect(intervalSequence({
      ...SPACING_DEFAULTS, firstIntervalDays: 14, longestIntervalDays: 14,
    })).toEqual([14]);
  });

  it('terminates when the ceiling is below the floor', () => {
    // A user dragging one past the other. The clamp in the settings
    // reader stops this reaching here, but a preview that could spin
    // would hang the panel rather than show a wrong number.
    expect(intervalSequence({
      ...SPACING_DEFAULTS, firstIntervalDays: 30, longestIntervalDays: 5,
    })).toEqual([30]);
  });
});

describe('the preview matches the engine', () => {
  it('walks the same values computeIntervalDays produces', () => {
    // THE LOAD-BEARING ONE. The panel shows this sequence as a promise
    // about what will happen; if the engine walks different numbers,
    // the promise is a lie that nobody can see being broken.
    const settings = SPACING_DEFAULTS;
    const bounds = boundsFrom(settings);
    const shown = intervalSequence(settings);

    const walked: number[] = [];
    let prior = 0;
    for (let i = 0; i < shown.length; i++) {
      prior = computeIntervalDays({
        memoryType: 'integration',
        priorInterval: prior,
        signal: { kind: 'rating', rating: 'flying' },
        bounds,
      });
      walked.push(prior);
    }
    expect(walked).toEqual(shown);
  });

  it('still matches when the ends are moved', () => {
    const settings = { ...SPACING_DEFAULTS, firstIntervalDays: 3, longestIntervalDays: 20 };
    const bounds = boundsFrom(settings);
    const shown = intervalSequence(settings);
    const walked: number[] = [];
    let prior = 0;
    for (let i = 0; i < shown.length; i++) {
      prior = computeIntervalDays({
        memoryType: 'integration', priorInterval: prior,
        signal: { kind: 'rating', rating: 'flying' }, bounds,
      });
      walked.push(prior);
    }
    expect(walked).toEqual(shown);
  });
});

describe('reading stored settings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await getSpacingSettings()).toEqual(SPACING_DEFAULTS);
  });

  it('reproduces the behaviour the app already had', () => {
    // The defaults are not arbitrary: the shared engine's initial of 1
    // doubles to 2, and integration caps at 30. A user who never opens
    // the panel sees no change.
    expect(FIRST_INTERVAL_DEFAULT).toBe(2);
    expect(LONGEST_INTERVAL_DEFAULT).toBe(30);
    expect(computeIntervalDays({
      memoryType: 'integration', priorInterval: 0,
      signal: { kind: 'rating', rating: 'flying' },
    })).toBe(FIRST_INTERVAL_DEFAULT);
  });

  it('never lets the ceiling sit below the floor', async () => {
    // Otherwise every pass would SHORTEN the interval — the sequence
    // would start above its own cap.
    await db.userPrefs.put({ key: PREF_FIRST_INTERVAL_DAYS, value: 20 });
    await db.userPrefs.put({ key: PREF_LONGEST_INTERVAL_DAYS, value: 5 });
    const s = await getSpacingSettings();
    expect(s.longestIntervalDays).toBeGreaterThanOrEqual(s.firstIntervalDays);
  });

  it('clamps a value that could make every key permanently overdue', async () => {
    // These cross a sync boundary and can arrive from another device
    // or an older build. A zero or a negative is not a preference.
    await db.userPrefs.put({ key: PREF_FIRST_INTERVAL_DAYS, value: 0 });
    expect((await getSpacingSettings()).firstIntervalDays).toBe(FIRST_INTERVAL_DEFAULT);
    await db.userPrefs.put({ key: PREF_FIRST_INTERVAL_DAYS, value: -5 });
    expect((await getSpacingSettings()).firstIntervalDays).toBe(FIRST_INTERVAL_DEFAULT);
  });
});
