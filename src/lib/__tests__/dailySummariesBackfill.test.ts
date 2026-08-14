// @vitest-environment jsdom
/**
 * Rebuilding dailySummaries from attempts.
 *
 * The bug being fixed is a gap, not a wrong number: after attempts
 * start syncing, a day practised on the OTHER device leaves attempt
 * rows on this one with no summary row to match, because
 * updateDailySummary only ever recomputes today's. The calendar, the
 * streak and the daily-goal bar all read summaries, so those days
 * simply vanish.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newAttemptId, type AttemptRecord, type DailySummary } from '../db';
import { localDayKey } from '../dailyGoal';
import {
  backfillDailySummaries,
  rebuildDailySummaries,
} from '../dailySummariesBackfill';

/** Local-noon timestamp N days back, so a day key can't drift across
 *  a boundary because of the machine's timezone. */
function daysAgoAt(days: number): number {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: newAttemptId(),
    moduleId: 'intervals',
    itemId: 'm3',
    correct: true,
    timestamp: daysAgoAt(1),
    ...overrides,
  };
}

const goalOf10 = () => 10;

beforeEach(async () => {
  await db.attempts.clear();
  await db.dailySummaries.clear();
});

describe('rebuildDailySummaries', () => {
  it('creates a row for a day that has attempts but no summary', () => {
    // The synced-from-the-other-device case.
    const ts = daysAgoAt(3);
    const out = rebuildDailySummaries(
      [attempt({ timestamp: ts, correct: true }), attempt({ timestamp: ts, correct: false })],
      [],
      goalOf10,
    );
    expect(out.created).toBe(1);
    expect(out.rows).toEqual([{
      date: localDayKey(new Date(ts)),
      moduleId: 'intervals',
      correctCount: 1,
      wrongCount: 1,
      dailyGoal: 10,
      goalMet: false,
    }]);
  });

  it('groups by day AND module, matching the table key', () => {
    const day1 = daysAgoAt(1);
    const day2 = daysAgoAt(2);
    const out = rebuildDailySummaries(
      [
        attempt({ timestamp: day1, moduleId: 'intervals' }),
        attempt({ timestamp: day1, moduleId: 'reading' }),
        attempt({ timestamp: day2, moduleId: 'intervals' }),
      ],
      [],
      goalOf10,
    );
    expect(out.created).toBe(3);
  });

  it('corrects a row that under-counts because the other device also practised', () => {
    const ts = daysAgoAt(2);
    const date = localDayKey(new Date(ts));
    const existing: DailySummary[] = [{
      date, moduleId: 'intervals',
      correctCount: 1, wrongCount: 0, dailyGoal: 10, goalMet: false,
    }];
    const out = rebuildDailySummaries(
      [
        attempt({ timestamp: ts, correct: true }),
        attempt({ timestamp: ts, correct: true }),
        attempt({ timestamp: ts, correct: false }),
      ],
      existing,
      goalOf10,
    );
    expect(out.updated).toBe(1);
    expect(out.rows[0].correctCount).toBe(2);
    expect(out.rows[0].wrongCount).toBe(1);
  });

  it('writes nothing when the existing row already agrees', () => {
    // Re-running must be free — this is not a one-shot backfill.
    const ts = daysAgoAt(2);
    const date = localDayKey(new Date(ts));
    const existing: DailySummary[] = [{
      date, moduleId: 'intervals',
      correctCount: 1, wrongCount: 0, dailyGoal: 10, goalMet: false,
    }];
    const out = rebuildDailySummaries([attempt({ timestamp: ts })], existing, goalOf10);
    expect(out.unchanged).toBe(1);
    expect(out.rows).toEqual([]);
  });

  it('keeps the goal an existing row was written with', () => {
    // The goal is not stored historically, so a row that already
    // carries one is the only record of what it was. Recomputing it
    // from today's setting would silently rewrite history.
    const ts = daysAgoAt(2);
    const date = localDayKey(new Date(ts));
    const existing: DailySummary[] = [{
      date, moduleId: 'intervals',
      correctCount: 0, wrongCount: 0, dailyGoal: 3, goalMet: false,
    }];
    const out = rebuildDailySummaries(
      [attempt({ timestamp: ts }), attempt({ timestamp: ts }), attempt({ timestamp: ts })],
      existing,
      goalOf10,
    );
    expect(out.rows[0].dailyGoal).toBe(3);
    expect(out.rows[0].goalMet).toBe(true); // 3 attempts vs the goal of 3
  });

  it('counts excludeFromFluency attempts — the goal measures volume', () => {
    // The flag keeps small-pool focus sessions out of TIER math, not
    // off the calendar. updateDailySummary counts them, so a rebuilt
    // row must agree with a live one.
    const ts = daysAgoAt(2);
    const out = rebuildDailySummaries(
      [
        attempt({ timestamp: ts, excludeFromFluency: true }),
        attempt({ timestamp: ts }),
      ],
      [],
      goalOf10,
    );
    expect(out.rows[0].correctCount).toBe(2);
  });

  it('leaves summaries with no backing attempts alone', () => {
    // Pre-attempt-era history, or another feature's row. Deleting it
    // is not this function's call.
    const existing: DailySummary[] = [{
      date: '2020-01-01', moduleId: 'intervals',
      correctCount: 5, wrongCount: 1, dailyGoal: 10, goalMet: false,
    }];
    const out = rebuildDailySummaries([], existing, goalOf10);
    expect(out.rows).toEqual([]);
    expect(out.created + out.updated).toBe(0);
  });

  it('ignores attempts with an unusable timestamp', () => {
    const out = rebuildDailySummaries(
      [attempt({ timestamp: NaN }), attempt({ timestamp: undefined as unknown as number })],
      [],
      goalOf10,
    );
    expect(out.rows).toEqual([]);
  });
});

describe('backfillDailySummaries', () => {
  it('fills in a day that only exists as synced attempts', async () => {
    const ts = daysAgoAt(4);
    await db.attempts.bulkAdd([
      attempt({ timestamp: ts, correct: true }),
      attempt({ timestamp: ts, correct: false }),
    ]);
    const result = await backfillDailySummaries();
    expect(result.attemptsScanned).toBe(2);
    expect(result.created).toBe(1);

    const stored = await db.dailySummaries.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].date).toBe(localDayKey(new Date(ts)));
    expect(stored[0].correctCount).toBe(1);
    expect(stored[0].wrongCount).toBe(1);
  });

  it('is idempotent — a second run writes nothing', async () => {
    // It is ungated, so it has to be free to re-run. A one-shot gate
    // would fix the first divergence and no later one.
    await db.attempts.bulkAdd([attempt(), attempt({ correct: false })]);
    const first = await backfillDailySummaries();
    expect(first.written).toBeGreaterThan(0);

    const second = await backfillDailySummaries();
    expect(second.written).toBe(0);
    expect(second.unchanged).toBe(1);
  });

  it('does nothing at all with no attempts', async () => {
    const result = await backfillDailySummaries();
    expect(result).toMatchObject({ attemptsScanned: 0, written: 0 });
    expect(await db.dailySummaries.count()).toBe(0);
  });
});
