// @vitest-environment jsdom
/**
 * Phase 2 step 6c — tests for getDailyActivity + the binning
 * helpers that adapt the daily series into chart shapes.
 *
 * Per-module branches:
 *   - ear-training       → dailySummaries (sub-quizzes summed)
 *   - harmonic-fluency   → dailySummaries (single moduleId)
 *   - shapes-and-patterns→ drillSessions  (durationSeconds → min)
 *   - repertoire         → songPracticeLog (durationMin)
 *   - production         → productionLessonSessions (optional durationSeconds)
 *   - practice-consistency → returns [] (no chart yet)
 *
 * fake-indexeddb backs the live db. Each test resets the tables
 * it touches so cross-test pollution doesn't show up as flake.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../lib/db';
import {
  getDailyActivity,
  activityUnitForModule,
  binToWeek,
  binToMonth,
  binToYear,
  mondayOf,
  weeklyRange,
  monthlyRange,
  yearlyRange,
  type DateRangeMs,
} from '../activity/dailyActivity';

beforeEach(async () => {
  await db.dailySummaries.clear();
  await db.drillSessions.clear();
  await db.songPracticeLog.clear();
  await db.productionLessonSessions.clear();
});

const APRIL_29 = new Date(2026, 3, 29, 12, 0, 0); // Wednesday
const APRIL_29_RANGE: DateRangeMs = {
  startMs: new Date(2026, 3, 1).getTime(),
  endMs: new Date(2026, 4, 1).getTime(),
};

describe('activityUnitForModule', () => {
  it('returns "cards" for card modules', () => {
    expect(activityUnitForModule('ear-training')).toBe('cards');
    expect(activityUnitForModule('harmonic-fluency')).toBe('cards');
  });

  it('returns "minutes" for time modules', () => {
    expect(activityUnitForModule('shapes-and-patterns')).toBe('minutes');
    expect(activityUnitForModule('repertoire')).toBe('minutes');
    expect(activityUnitForModule('production')).toBe('minutes');
  });

  it('returns "minutes" for practice-consistency (defensive default)', () => {
    expect(activityUnitForModule('practice-consistency')).toBe('minutes');
  });
});

describe('getDailyActivity — ear-training', () => {
  it('aggregates correct + wrong across all four ET sub-quizzes', async () => {
    await db.dailySummaries.bulkPut([
      { date: '2026-04-29', moduleId: 'intervals',          correctCount: 5, wrongCount: 2, dailyGoal: 10, goalMet: false },
      { date: '2026-04-29', moduleId: 'chord-recognition',  correctCount: 3, wrongCount: 1, dailyGoal: 10, goalMet: false },
      { date: '2026-04-29', moduleId: 'chord-progressions', correctCount: 4, wrongCount: 0, dailyGoal: 10, goalMet: false },
      { date: '2026-04-29', moduleId: 'scales-modes',       correctCount: 1, wrongCount: 1, dailyGoal: 10, goalMet: false },
    ]);

    const out = await getDailyActivity('ear-training', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-29', count: 17 }]);
  });

  it('ignores rows outside the ET sub-module set', async () => {
    await db.dailySummaries.bulkPut([
      { date: '2026-04-29', moduleId: 'intervals',        correctCount: 5, wrongCount: 0, dailyGoal: 10, goalMet: false },
      { date: '2026-04-29', moduleId: 'harmonic-fluency', correctCount: 9, wrongCount: 0, dailyGoal: 10, goalMet: false },
    ]);

    const out = await getDailyActivity('ear-training', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-29', count: 5 }]);
  });

  it('filters dates outside the range', async () => {
    await db.dailySummaries.bulkPut([
      { date: '2026-03-31', moduleId: 'intervals', correctCount: 9, wrongCount: 1, dailyGoal: 10, goalMet: false },
      { date: '2026-04-15', moduleId: 'intervals', correctCount: 4, wrongCount: 0, dailyGoal: 10, goalMet: false },
      { date: '2026-05-01', moduleId: 'intervals', correctCount: 5, wrongCount: 0, dailyGoal: 10, goalMet: false },
    ]);

    const out = await getDailyActivity('ear-training', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-15', count: 4 }]);
  });

  it('sorts results chronologically', async () => {
    await db.dailySummaries.bulkPut([
      { date: '2026-04-20', moduleId: 'intervals', correctCount: 3, wrongCount: 0, dailyGoal: 10, goalMet: false },
      { date: '2026-04-10', moduleId: 'intervals', correctCount: 2, wrongCount: 0, dailyGoal: 10, goalMet: false },
      { date: '2026-04-25', moduleId: 'intervals', correctCount: 1, wrongCount: 0, dailyGoal: 10, goalMet: false },
    ]);

    const out = await getDailyActivity('ear-training', APRIL_29_RANGE);
    expect(out.map(p => p.date)).toEqual(['2026-04-10', '2026-04-20', '2026-04-25']);
  });
});

describe('getDailyActivity — harmonic-fluency', () => {
  it('reads from harmonic-fluency moduleId only', async () => {
    await db.dailySummaries.bulkPut([
      { date: '2026-04-29', moduleId: 'harmonic-fluency', correctCount: 8, wrongCount: 2, dailyGoal: 10, goalMet: true },
      { date: '2026-04-29', moduleId: 'intervals',        correctCount: 5, wrongCount: 0, dailyGoal: 10, goalMet: false },
    ]);

    const out = await getDailyActivity('harmonic-fluency', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-29', count: 10 }]);
  });
});

describe('getDailyActivity — shapes-and-patterns', () => {
  it('aggregates drillSessions duration into minutes per local day', async () => {
    await db.drillSessions.bulkPut([
      { id: '1', drillTypeId: 'maj-shape', skillId: 's', durationSeconds: 600, feelRating: 3, timestamp: new Date(2026, 3, 29, 9, 0).getTime() },
      { id: '2', drillTypeId: 'min-shape', skillId: 's', durationSeconds: 540, feelRating: 4, timestamp: new Date(2026, 3, 29, 18, 0).getTime() },
    ]);

    const out = await getDailyActivity('shapes-and-patterns', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-29', count: 19 }]); // 600+540 sec = 19 min
  });

  it('rounds minutes per day', async () => {
    await db.drillSessions.bulkPut([
      { id: '1', drillTypeId: 'd', skillId: 's', durationSeconds: 90,  feelRating: 3, timestamp: new Date(2026, 3, 10, 9).getTime() }, // 1.5 min
      { id: '2', drillTypeId: 'd', skillId: 's', durationSeconds: 105, feelRating: 3, timestamp: new Date(2026, 3, 10, 12).getTime() }, // 1.75
    ]);

    const out = await getDailyActivity('shapes-and-patterns', APRIL_29_RANGE);
    // (90 + 105) / 60 = 3.25 → rounds to 3
    expect(out).toEqual([{ date: '2026-04-10', count: 3 }]);
  });

  it('excludes sessions outside the range', async () => {
    await db.drillSessions.bulkPut([
      { id: '1', drillTypeId: 'd', skillId: 's', durationSeconds: 600, feelRating: 3, timestamp: new Date(2026, 2, 31, 12).getTime() }, // March 31
      { id: '2', drillTypeId: 'd', skillId: 's', durationSeconds: 600, feelRating: 3, timestamp: new Date(2026, 3, 15, 12).getTime() }, // April 15
    ]);

    const out = await getDailyActivity('shapes-and-patterns', APRIL_29_RANGE);
    expect(out.map(p => p.date)).toEqual(['2026-04-15']);
  });
});

describe('getDailyActivity — repertoire', () => {
  it('reads songPracticeLog durationMin directly', async () => {
    await db.songPracticeLog.bulkPut([
      { id: '1', songId: 's1', timestamp: new Date(2026, 3, 29, 10).getTime(), durationMin: 12, sectionIds: [], keys: ['C'], feelRating: 4 },
      { id: '2', songId: 's1', timestamp: new Date(2026, 3, 29, 18).getTime(), durationMin: 8,  sectionIds: [], keys: ['C'], feelRating: 3 },
    ]);

    const out = await getDailyActivity('repertoire', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-29', count: 20 }]);
  });
});

describe('getDailyActivity — production', () => {
  it('treats sessions without durationSeconds as zero contribution', async () => {
    await db.productionLessonSessions.bulkPut([
      { id: '1', lessonId: 'l1', timestamp: new Date(2026, 3, 15, 10).getTime(), openedDeepDive: false /* no duration */ },
      { id: '2', lessonId: 'l1', timestamp: new Date(2026, 3, 15, 11).getTime(), durationSeconds: 1200, openedDeepDive: true },
    ]);

    const out = await getDailyActivity('production', APRIL_29_RANGE);
    expect(out).toEqual([{ date: '2026-04-15', count: 20 }]); // 1200 sec = 20 min
  });

  it('returns nothing when all sessions in range lack durationSeconds', async () => {
    await db.productionLessonSessions.bulkPut([
      { id: '1', lessonId: 'l1', timestamp: new Date(2026, 3, 15).getTime(), openedDeepDive: false },
    ]);

    const out = await getDailyActivity('production', APRIL_29_RANGE);
    expect(out).toEqual([]);
  });
});

describe('getDailyActivity — practice-consistency', () => {
  it('returns empty array (no chart yet)', async () => {
    const out = await getDailyActivity('practice-consistency', APRIL_29_RANGE);
    expect(out).toEqual([]);
  });
});

describe('binToWeek', () => {
  it('lays out 7 entries Mon–Sun, missing days as 0', () => {
    const monday = mondayOf(APRIL_29);
    const out = binToWeek(
      [
        { date: '2026-04-27', count: 5 }, // Mon
        { date: '2026-04-29', count: 12 }, // Wed
      ],
      monday,
    );
    expect(out).toEqual([5, 0, 12, 0, 0, 0, 0]);
  });
});

describe('binToMonth', () => {
  it('emits one entry per day in the month, in order', () => {
    const out = binToMonth(
      [{ date: '2026-04-15', count: 7 }],
      2026,
      3, // April
    );
    expect(out.length).toBe(30);
    expect(out[14]).toEqual({ date: new Date(2026, 3, 15), count: 7 });
    expect(out[0].count).toBe(0);
    expect(out[29].count).toBe(0);
  });

  it('handles February in a non-leap year (28 days)', () => {
    const out = binToMonth([], 2026, 1);
    expect(out.length).toBe(28);
  });
});

describe('binToYear', () => {
  it('sums daily activity into 12 monthly totals', () => {
    const out = binToYear(
      [
        { date: '2026-01-05', count: 10 },
        { date: '2026-01-20', count: 15 },
        { date: '2026-04-29', count: 50 },
        { date: '2025-12-31', count: 99 }, // outside year, ignored
      ],
      2026,
    );
    expect(out[0]).toBe(25); // Jan
    expect(out[3]).toBe(50); // Apr
    expect(out[5]).toBe(0);  // June, untouched
  });
});

describe('range builders', () => {
  it('mondayOf snaps to local Monday at 00:00', () => {
    const wed = new Date(2026, 3, 29, 14, 30); // Wed Apr 29 14:30
    const mon = mondayOf(wed);
    expect(mon.getDay()).toBe(1); // Monday
    expect(mon.getHours()).toBe(0);
    expect(mon.getDate()).toBe(27);
  });

  it('mondayOf returns the same Monday when called on a Monday', () => {
    const mon = new Date(2026, 3, 27, 9);
    const out = mondayOf(mon);
    expect(out.getDate()).toBe(27);
    expect(out.getDay()).toBe(1);
  });

  it('mondayOf handles Sunday correctly (rolls back 6 days)', () => {
    const sun = new Date(2026, 4, 3, 9); // Sun May 3
    const out = mondayOf(sun);
    expect(out.getDate()).toBe(27); // back to Mon Apr 27
    expect(out.getMonth()).toBe(3);
  });

  it('weeklyRange spans 7 days starting Monday 00:00', () => {
    const r = weeklyRange(APRIL_29);
    expect(new Date(r.startMs).getDay()).toBe(1);
    expect(r.endMs - r.startMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('monthlyRange spans the calendar month containing today', () => {
    const r = monthlyRange(APRIL_29);
    expect(new Date(r.startMs).getDate()).toBe(1);
    expect(new Date(r.startMs).getMonth()).toBe(3); // April
    expect(new Date(r.endMs).getMonth()).toBe(4);   // May
    expect(new Date(r.endMs).getDate()).toBe(1);
  });

  it('yearlyRange spans Jan 1 → next Jan 1', () => {
    const r = yearlyRange(APRIL_29);
    expect(new Date(r.startMs).getFullYear()).toBe(2026);
    expect(new Date(r.startMs).getMonth()).toBe(0);
    expect(new Date(r.startMs).getDate()).toBe(1);
    expect(new Date(r.endMs).getFullYear()).toBe(2027);
  });
});
