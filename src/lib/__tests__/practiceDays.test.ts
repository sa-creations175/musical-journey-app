// @vitest-environment jsdom
/**
 * Days practised, per module, from the dates already recorded.
 *
 * =====================================================================
 * THE MODULES KEEP THEIR DATES IN DIFFERENT TABLES.
 *
 * Answered drills write `attempts`; shapes & patterns writes timed
 * `drillSessions`; song repertoire writes `songPracticeLog`. A streak
 * that only knew about attempts would report zero for two modules that
 * had been practised all week, which is worse than no streak.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newAttemptId, type AttemptRecord } from '../db';
import { localDayKey } from '../dailyGoal';
import {
  attemptModuleIds,
  dayClearsGoal,
  dayStreakFrom,
  loadPracticeDays,
  practisedDayKeys,
} from '../practiceDays';
import { DEFAULT_MODULE_GOAL } from '../goalConfig';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const today = localDayKey(new Date(NOW));
const yesterday = localDayKey(new Date(NOW - DAY));
const twoDaysAgo = localDayKey(new Date(NOW - 2 * DAY));

const attempt = (moduleId: string, ts: number): AttemptRecord =>
  ({ id: newAttemptId(), moduleId, itemId: 'x', correct: true, timestamp: ts });

beforeEach(async () => {
  await db.attempts.clear();
  await db.drillSessions.clear();
  await db.songPracticeLog.clear();
});

describe('where each module’s dates come from', () => {
  it('reads attempts for an answered drill', async () => {
    await db.attempts.bulkAdd([attempt('reading', NOW), attempt('reading', NOW - DAY)]);
    const days = await loadPracticeDays('reading');
    expect(days.get(today)!.answers).toBe(1);
    expect(days.get(yesterday)!.answers).toBe(1);
  });

  it('reads timed sessions for shapes & patterns', async () => {
    await db.drillSessions.bulkAdd([
      { id: 'd1', drillTypeId: 't', skillId: 's', hand: 'both', style: 'solid',
        durationSeconds: 300, feelRating: 3, timestamp: NOW } as never,
    ]);
    const days = await loadPracticeDays('shapes-and-patterns');
    expect(days.get(today)!.minutes).toBe(5);
    // No attempts anywhere — the module records none.
    expect(days.get(today)!.answers).toBe(0);
  });

  it('reads the practice log for song repertoire', async () => {
    await db.songPracticeLog.bulkAdd([
      { id: 'l1', songId: 's1', timestamp: NOW, durationMin: 20, sectionIds: [], keys: [] } as never,
    ]);
    const days = await loadPracticeDays('repertoire');
    expect(days.get(today)!.minutes).toBe(20);
  });

  it('counts ear training across its four sub-modules', async () => {
    await db.attempts.bulkAdd([
      attempt('intervals', NOW),
      attempt('chord-recognition', NOW - DAY),
    ]);
    const days = await loadPracticeDays('ear-training');
    expect(days.get(today)!.answers).toBe(1);
    expect(days.get(yesterday)!.answers).toBe(1);
    expect(attemptModuleIds('ear-training').length).toBeGreaterThan(1);
    expect(attemptModuleIds('reading')).toEqual(['reading']);
  });
});

describe('what clears a day', () => {
  it('on "any practice", anything recorded at all', () => {
    expect(dayClearsGoal({ answers: 1, minutes: 0 }, DEFAULT_MODULE_GOAL)).toBe(true);
    expect(dayClearsGoal({ answers: 0, minutes: 3 }, DEFAULT_MODULE_GOAL)).toBe(true);
    expect(dayClearsGoal({ answers: 0, minutes: 0 }, DEFAULT_MODULE_GOAL)).toBe(false);
    expect(dayClearsGoal(undefined, DEFAULT_MODULE_GOAL)).toBe(false);
  });

  it('on a numeric goal, the amount in its own unit', () => {
    const answers = { unit: 'answers', amount: 10 } as const;
    expect(dayClearsGoal({ answers: 10, minutes: 0 }, answers)).toBe(true);
    expect(dayClearsGoal({ answers: 9, minutes: 999 }, answers)).toBe(false);

    const minutes = { unit: 'minutes', amount: 15 } as const;
    expect(dayClearsGoal({ answers: 999, minutes: 15 }, minutes)).toBe(true);
    expect(dayClearsGoal({ answers: 999, minutes: 14 }, minutes)).toBe(false);
  });
});

describe('the streak', () => {
  const days = (...keys: string[]) =>
    new Map(keys.map(k => [k, { answers: 1, minutes: 0 }]));

  it('counts consecutive days ending today', () => {
    expect(dayStreakFrom(days(today, yesterday, twoDaysAgo), DEFAULT_MODULE_GOAL, today))
      .toBe(3);
  });

  it('survives a today not yet practised', () => {
    // The chain is alive until yesterday goes unclaimed too — a streak
    // must not read as broken at one minute past midnight.
    expect(dayStreakFrom(days(yesterday, twoDaysAgo), DEFAULT_MODULE_GOAL, today)).toBe(2);
  });

  it('stops at the first gap', () => {
    expect(dayStreakFrom(days(today, twoDaysAgo), DEFAULT_MODULE_GOAL, today)).toBe(1);
  });

  it('is zero for a module never practised', () => {
    expect(dayStreakFrom(new Map(), DEFAULT_MODULE_GOAL, today)).toBe(0);
  });

  it('terminates on a record that is entirely blank days', () => {
    // The walk is bounded by the record, not by the goal — the failure
    // mode that hung `computeDayStreak` cannot occur here.
    const blank = new Map([[today, { answers: 0, minutes: 0 }]]);
    expect(dayStreakFrom(blank, DEFAULT_MODULE_GOAL, today)).toBe(0);
  });
});

describe('the days a calendar shades', () => {
  it('are the ones with something recorded', () => {
    const keys = practisedDayKeys(new Map([
      [today, { answers: 3, minutes: 0 }],
      [yesterday, { answers: 0, minutes: 12 }],
      [twoDaysAgo, { answers: 0, minutes: 0 }],
    ]));
    expect([...keys].sort()).toEqual([yesterday, today].sort());
  });
});
