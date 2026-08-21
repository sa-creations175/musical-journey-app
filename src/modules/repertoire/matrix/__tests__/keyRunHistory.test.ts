// @vitest-environment jsdom
/**
 * Grouping past whole-song runs into sittings.
 *
 * The point of grouping is the consecutive rule: three clean runs on
 * one afternoon and three clean runs across three weeks are the same
 * six characters in a flat list and completely different claims. So
 * the tests that matter are the ones about where a sitting ENDS.
 */
import { describe, expect, it } from 'vitest';
import type { SongKeyRunThrough } from '../../../../lib/db';
import {
  HISTORY_WINDOW_DAYS,
  MAX_SITTINGS_SHOWN,
  SITTING_GAP_MS,
  summariseKeyRunHistory,
} from '../keyRunHistory';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function run(over: Partial<SongKeyRunThrough> = {}): SongKeyRunThrough {
  return {
    id: `r${seq++}`, songKeyId: 'sk1', songId: 's1',
    wasClean: true, consecutiveCleanCount: 1, tempoBpm: 100,
    notes: null, isRetest: false, createdAt: NOW,
    ...over,
  };
}

/** One test sitting of `marks`, stamped ms apart as a real save is. */
function sitting(at: number, marks: boolean[], kind?: 'test' | 'single'): SongKeyRunThrough[] {
  let streak = 0;
  return marks.map((clean, i) => {
    streak = clean ? Math.min(streak + 1, 3) : 0;
    return run({
      createdAt: at + i,
      wasClean: clean,
      consecutiveCleanCount: streak,
      ...(kind ? { kind } : {}),
    });
  });
}

describe('grouping into sittings', () => {
  it('holds one save together — its rows land milliseconds apart', () => {
    const h = summariseKeyRunHistory(sitting(NOW - DAY, [true, true, true]), NOW);
    expect(h.sittings).toHaveLength(1);
    expect(h.sittings[0].runs).toHaveLength(3);
    expect(h.totalRuns).toBe(3);
  });

  it('splits two sittings a day apart', () => {
    const h = summariseKeyRunHistory([
      ...sitting(NOW - 2 * DAY, [true, false]),
      ...sitting(NOW - DAY, [true, true, true]),
    ], NOW);
    expect(h.sittings).toHaveLength(2);
    // Newest first.
    expect(h.sittings[0].runs).toHaveLength(3);
    expect(h.sittings[1].runs).toHaveLength(2);
  });

  it('splits on a gap just over the threshold, and holds just under', () => {
    const under = summariseKeyRunHistory([
      run({ createdAt: NOW - DAY }),
      run({ createdAt: NOW - DAY + SITTING_GAP_MS - 1 }),
    ], NOW);
    expect(under.sittings).toHaveLength(1);

    const over = summariseKeyRunHistory([
      run({ createdAt: NOW - DAY }),
      run({ createdAt: NOW - DAY + SITTING_GAP_MS + 1 }),
    ], NOW);
    expect(over.sittings).toHaveLength(2);
  });

  it('never merges a single run into a test sitting, however close in time', () => {
    // Logging a single run and opening the test seconds later are two
    // events. Merging them would show a streak nobody demonstrated in
    // one go. Guard: the stamps are one millisecond apart, so time
    // alone would have held them together.
    const h = summariseKeyRunHistory([
      run({ createdAt: NOW - DAY, kind: 'single' }),
      run({ createdAt: NOW - DAY + 1, kind: 'test' }),
    ], NOW);
    expect(h.sittings).toHaveLength(2);
  });

  it('treats a row with no kind as a test row', () => {
    // Every row written before the field existed came from the test
    // modal, which was the table's only writer.
    const h = summariseKeyRunHistory([run({ createdAt: NOW - DAY })], NOW);
    expect(h.sittings[0].kind).toBe('test');
  });
});

describe('the window', () => {
  it('excludes runs older than the window', () => {
    const h = summariseKeyRunHistory([
      ...sitting(NOW - (HISTORY_WINDOW_DAYS + 1) * DAY, [true, true]),
      ...sitting(NOW - DAY, [true]),
    ], NOW);
    expect(h.totalRuns).toBe(1);
    expect(h.sittings).toHaveLength(1);
  });

  it('keeps a run right at the edge of the window', () => {
    const h = summariseKeyRunHistory(
      [run({ createdAt: NOW - HISTORY_WINDOW_DAYS * DAY })], NOW,
    );
    expect(h.totalRuns).toBe(1);
  });

  it('an empty window is an answer, not an error', () => {
    const h = summariseKeyRunHistory(
      sitting(NOW - (HISTORY_WINDOW_DAYS + 5) * DAY, [true, true, true]), NOW,
    );
    expect(h.sittings).toHaveLength(0);
    expect(h.totalSittings).toBe(0);
    expect(h.capped).toBe(false);
  });
});

describe('passing', () => {
  it('marks a sitting that reached three in a row', () => {
    const h = summariseKeyRunHistory(sitting(NOW - DAY, [true, true, true]), NOW);
    expect(h.sittings[0].bestStreak).toBe(3);
    expect(h.sittings[0].passed).toBe(true);
  });

  it('does NOT mark a sitting with the same clean runs broken up', () => {
    // Four clean runs, more than the passing sitting above, and it
    // did not pass. The distinction the whole rule exists for.
    const marks = [true, false, true, false, true, true];
    const h = summariseKeyRunHistory(sitting(NOW - DAY, marks), NOW);
    expect(marks.filter(Boolean)).toHaveLength(4);
    expect(h.sittings[0].bestStreak).toBe(2);
    expect(h.sittings[0].passed).toBe(false);
  });

  it('remembers the best streak even when the sitting ended badly', () => {
    // Reached three, then kept playing and dropped one. The sitting
    // still passed — the demonstration happened.
    const h = summariseKeyRunHistory(
      sitting(NOW - DAY, [true, true, true, false]), NOW,
    );
    expect(h.sittings[0].runs).toHaveLength(4);
    expect(h.sittings[0].bestStreak).toBe(3);
    expect(h.sittings[0].passed).toBe(true);
  });

  it('a lone single run can never pass', () => {
    const h = summariseKeyRunHistory(
      [run({ createdAt: NOW - DAY, kind: 'single', consecutiveCleanCount: 1 })], NOW,
    );
    expect(h.sittings[0].passed).toBe(false);
  });
});

describe('the cap', () => {
  it('says it capped rather than truncating silently', () => {
    const rows: SongKeyRunThrough[] = [];
    const n = MAX_SITTINGS_SHOWN + 5;
    for (let i = 0; i < n; i++) {
      rows.push(...sitting(NOW - (i + 1) * (SITTING_GAP_MS * 10), [true]));
    }
    const h = summariseKeyRunHistory(rows, NOW);
    expect(h.totalSittings).toBe(n);
    expect(h.sittings).toHaveLength(MAX_SITTINGS_SHOWN);
    expect(h.capped).toBe(true);
  });

  it('does not claim a cap when everything fits', () => {
    const h = summariseKeyRunHistory(sitting(NOW - DAY, [true, true]), NOW);
    expect(h.capped).toBe(false);
    expect(h.sittings).toHaveLength(h.totalSittings);
  });
});
