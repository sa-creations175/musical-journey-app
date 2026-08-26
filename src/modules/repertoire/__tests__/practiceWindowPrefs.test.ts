/**
 * How long a song may go untouched before its card says so.
 *
 * The rule that earns the test: this is NEGLECT, which is a different
 * question from whether a rung has decayed. The two are computed from
 * different evidence — a practice log against a per-stage window here,
 * a spacing schedule against a per-key due date in `songRetestState` —
 * and a card can honestly show one without the other.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db, type RepertoireStage } from '../../../lib/db';
import { STAGES } from '../stage';
import {
  PRACTICE_WINDOW_DEFAULTS,
  getPracticeWindows,
  practiceIsStale,
  practiceWindowKey,
  setPracticeWindow,
} from '../practiceWindowPrefs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 25, 12);

afterEach(async () => {
  await db.userPrefs.clear();
});

const daysAgo = (n: number) => NOW - n * DAY;

describe('the starting values', () => {
  it('ships the four Silas asked for', () => {
    expect(PRACTICE_WINDOW_DEFAULTS).toEqual({
      'learning': 7,
      'comfortable': 14,
      'cross-key': 14,
      'internalized': 21,
    });
  });

  it('covers every rung on the ladder, derived rather than listed', () => {
    // A fifth rung would arrive here with no window and read as
    // `undefined` days — every song on it permanently stale.
    for (const stage of STAGES) {
      expect(PRACTICE_WINDOW_DEFAULTS[stage], stage).toBeGreaterThan(0);
    }
    expect(Object.keys(PRACTICE_WINDOW_DEFAULTS).sort()).toEqual([...STAGES].sort());
  });
});

describe('what is stored and read back', () => {
  it('reads the defaults when nothing has been set', async () => {
    expect(await getPracticeWindows()).toEqual(PRACTICE_WINDOW_DEFAULTS);
  });

  it('reads back what was written, per rung', async () => {
    await setPracticeWindow('comfortable', 30);
    const windows = await getPracticeWindows();
    expect(windows.comfortable).toBe(30);
    // And leaves the others where they were — one rung at a time.
    expect(windows.learning).toBe(PRACTICE_WINDOW_DEFAULTS.learning);
  });

  it('refuses a value that would make every song stale forever', async () => {
    // These cross a sync boundary, so a zero can arrive from an older
    // build or another device rather than from the input.
    await db.userPrefs.put({ key: practiceWindowKey('learning'), value: 0 });
    expect((await getPracticeWindows()).learning)
      .toBe(PRACTICE_WINDOW_DEFAULTS.learning);

    await db.userPrefs.put({ key: practiceWindowKey('learning'), value: -5 });
    expect((await getPracticeWindows()).learning)
      .toBe(PRACTICE_WINDOW_DEFAULTS.learning);
  });

  it('clamps a write rather than storing it', async () => {
    await setPracticeWindow('learning', 0);
    expect((await getPracticeWindows()).learning).toBe(1);
  });
});

describe('when a song is stale', () => {
  const stale = (last: number | null, stage: RepertoireStage) =>
    practiceIsStale(last, stage, NOW, PRACTICE_WINDOW_DEFAULTS);

  it('is not stale inside the window', () => {
    expect(stale(daysAgo(6), 'learning')).toBe(false);
    expect(stale(daysAgo(13), 'comfortable')).toBe(false);
    expect(stale(daysAgo(20), 'internalized')).toBe(false);
  });

  it('is stale past it', () => {
    expect(stale(daysAgo(8), 'learning')).toBe(true);
    expect(stale(daysAgo(15), 'comfortable')).toBe(true);
    expect(stale(daysAgo(22), 'internalized')).toBe(true);
  });

  it('reads each rung against its OWN window', () => {
    // ASYMMETRIC on purpose: ten days is past learning's window and
    // inside every other one, so a function using a single window for
    // all four differs from this in a way the assertion can see.
    const ten = daysAgo(10);
    expect(stale(ten, 'learning')).toBe(true);
    expect(stale(ten, 'comfortable')).toBe(false);
    expect(stale(ten, 'cross-key')).toBe(false);
    expect(stale(ten, 'internalized')).toBe(false);
  });

  it('never calls a song that has never been practised stale', () => {
    // Amber on a song added this morning would be scolding the reader
    // for one they have not started rather than one they have let go.
    // The card says "not practised yet" in words instead.
    for (const stage of STAGES) {
      expect(stale(null, stage), stage).toBe(false);
    }
  });

  it('follows the stored window, not the default', () => {
    expect(practiceIsStale(daysAgo(10), 'learning', NOW, {
      ...PRACTICE_WINDOW_DEFAULTS, learning: 30,
    })).toBe(false);
  });
});
