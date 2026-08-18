// @vitest-environment jsdom
/**
 * Writing a practice session.
 *
 * These assert on the ROW and on the spacing signal — not on any UI.
 * A test that a timer renders would pass on a build that records
 * nothing, which is the exact failure being fixed: the surface looked
 * usable and the matrix stayed empty.
 *
 * The recurring theme is what is NOT written. An unrated session must
 * not acquire a rating, and must not emit a spacing signal, because
 * both would put a judgement into the record that the user declined to
 * make — and the whole point of the fast path is that declining is
 * allowed.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { getSpacingState } from '../../../lib/spacingState';
import { feelToRating, logPracticeSession } from '../logPractice';

const SONG = 'song-1';

beforeEach(async () => {
  await Promise.all([db.songPracticeLog.clear(), db.spacingState.clear()]);
});

async function onlyLog() {
  const rows = await db.songPracticeLog.toArray();
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('the fast path — duration and nothing else', () => {
  it('writes a complete row from a duration alone', async () => {
    await logPracticeSession({ songId: SONG, durationMin: 40 });
    const row = await onlyLog();
    expect(row.songId).toBe(SONG);
    expect(row.durationMin).toBe(40);
  });

  it('records unattributed practice as [] — a real value, not a gap', async () => {
    // "40 minutes, couldn't tell you which sections" is the record the
    // per-cell model structurally cannot hold, since every run-through
    // needs exactly one section and one key.
    await logPracticeSession({ songId: SONG, durationMin: 40 });
    const row = await onlyLog();
    expect(row.sectionIds).toEqual([]);
    expect(row.keys).toEqual([]);
  });

  it('does NOT invent a feel rating', async () => {
    // PracticeLogModal defaults its picker to 3, so every unrated
    // session is stored as "comfortable" — a judgement the user never
    // made, which then feeds stage advancement.
    await logPracticeSession({ songId: SONG, durationMin: 40 });
    const row = await onlyLog();
    expect(row.feelRating).toBeUndefined();
    expect('feelRating' in row).toBe(false);
  });

  it('emits NO spacing signal when unrated', async () => {
    // Repertoire is `integration` memory, which accepts only a
    // `rating` signal — so an unrated session has nothing honest to
    // send, and inventing one would feed the spacing curve.
    await logPracticeSession({ songId: SONG, durationMin: 40 });
    expect(await getSpacingState(SONG, 'repertoire')).toBeUndefined();
  });

  it('never writes a zero-minute session', async () => {
    await logPracticeSession({ songId: SONG, durationMin: 0.4 });
    expect((await onlyLog()).durationMin).toBe(1);
  });
});

describe('the elaborated path', () => {
  it('keeps the section and key the cell surface knows', async () => {
    await logPracticeSession({
      songId: SONG, durationMin: 15,
      sectionIds: ['sec-verse'], keys: ['Ab'],
    });
    const row = await onlyLog();
    expect(row.sectionIds).toEqual(['sec-verse']);
    expect(row.keys).toEqual(['Ab']);
  });

  it('emits a spacing signal when the session WAS rated', async () => {
    await logPracticeSession({ songId: SONG, durationMin: 15, feelRating: 4 });
    const state = await getSpacingState(SONG, 'repertoire');
    expect(state).toBeDefined();
    expect(state!.performanceHistory).toHaveLength(1);
  });

  it('stores the rating it was given', async () => {
    await logPracticeSession({ songId: SONG, durationMin: 15, feelRating: 2 });
    expect((await onlyLog()).feelRating).toBe(2);
  });

  it('returns an id the run-throughs can point at', async () => {
    const id = await logPracticeSession({ songId: SONG, durationMin: 10 });
    expect(id).toMatch(/^plog-/);
    expect((await onlyLog()).id).toBe(id);
  });

  it('does not touch the deprecated cross-key table', async () => {
    // db.ts marks songCrossKeyProgress @deprecated with "Do NOT route
    // new writes here"; the matrix cells already hold section × key
    // better. A second writer would move away from retiring it.
    await db.songCrossKeyProgress.clear();
    await logPracticeSession({
      songId: SONG, durationMin: 15,
      sectionIds: ['sec-verse'], keys: ['Ab'], feelRating: 3,
    });
    expect(await db.songCrossKeyProgress.count()).toBe(0);
  });
});

describe('feelToRating', () => {
  it('maps in flow to flying, now that it is the top of the scale', () => {
    // Flying used to be reserved for "breakthrough". With that step
    // gone, holding it back would leave the top grade unreachable.
    expect(feelToRating(4)).toBe('flying');
    expect(feelToRating(3)).toBe('cruising');
    expect(feelToRating(2)).toBe('crawling');
    expect(feelToRating(1)).toBe('crawling');
  });
});
