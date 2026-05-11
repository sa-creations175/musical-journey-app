// @vitest-environment jsdom
/**
 * Unit tests for the Song-of-the-Month comfortable predicates.
 * Pins the exact triggers the queue advancement + TBD nudge fire on.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SongCell, type SongKey } from '../../../lib/db';
import {
  comfortableCellRatioInOriginalKey,
  isSongComfortableInOriginalKey,
} from '../songComfortable';

function songKey(overrides: Partial<SongKey> = {}): SongKey {
  const now = Date.now();
  return {
    id: 'k-' + Math.random().toString(36).slice(2, 6),
    songId: 's1',
    keyName: 'C',
    isOriginalKey: false,
    keyState: 'not_started',
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    lastEngagedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function songCell(overrides: Partial<SongCell> = {}): SongCell {
  const now = Date.now();
  return {
    id: 'c-' + Math.random().toString(36).slice(2, 6),
    songId: 's1',
    sectionId: 'sec-1',
    songKeyId: 'k-1',
    cellState: 'empty',
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.songKeys.clear();
  await db.songCells.clear();
});

describe('isSongComfortableInOriginalKey', () => {
  it('returns false when no original-key row exists', async () => {
    expect(await isSongComfortableInOriginalKey('missing-song')).toBe(false);
  });

  it('returns false when the original key has zero cells', async () => {
    await db.songKeys.add(songKey({ id: 'k-orig', isOriginalKey: true }));
    expect(await isSongComfortableInOriginalKey('s1')).toBe(false);
  });

  it('returns false when any cell at the original key is non-comfortable', async () => {
    await db.songKeys.add(songKey({ id: 'k-orig', isOriginalKey: true }));
    await db.songCells.bulkAdd([
      songCell({ id: 'c1', songKeyId: 'k-orig', cellState: 'comfortable' }),
      songCell({ id: 'c2', songKeyId: 'k-orig', cellState: 'learning' }),
      songCell({ id: 'c3', songKeyId: 'k-orig', cellState: 'comfortable' }),
    ]);
    expect(await isSongComfortableInOriginalKey('s1')).toBe(false);
  });

  it('returns true when every cell at the original key is comfortable', async () => {
    await db.songKeys.add(songKey({ id: 'k-orig', isOriginalKey: true }));
    await db.songCells.bulkAdd([
      songCell({ id: 'c1', songKeyId: 'k-orig', cellState: 'comfortable' }),
      songCell({ id: 'c2', songKeyId: 'k-orig', cellState: 'comfortable' }),
    ]);
    expect(await isSongComfortableInOriginalKey('s1')).toBe(true);
  });

  it('ignores cells in non-original keys', async () => {
    await db.songKeys.bulkAdd([
      songKey({ id: 'k-orig', keyName: 'C', isOriginalKey: true }),
      songKey({ id: 'k-other', keyName: 'G', isOriginalKey: false }),
    ]);
    await db.songCells.bulkAdd([
      // Comfortable at original key — satisfies the predicate.
      songCell({ id: 'c1', songKeyId: 'k-orig', cellState: 'comfortable' }),
      // Empty at a non-original key — must NOT trip the predicate.
      songCell({ id: 'c2', songKeyId: 'k-other', cellState: 'empty' }),
    ]);
    expect(await isSongComfortableInOriginalKey('s1')).toBe(true);
  });

  it('scopes cells to the correct song', async () => {
    await db.songKeys.bulkAdd([
      songKey({ id: 'k-orig-1', songId: 's1', isOriginalKey: true }),
      songKey({ id: 'k-orig-2', songId: 's2', isOriginalKey: true }),
    ]);
    await db.songCells.bulkAdd([
      songCell({ id: 'c1', songId: 's1', songKeyId: 'k-orig-1', cellState: 'comfortable' }),
      // Other song's empty cell — must not bleed into s1's predicate.
      songCell({ id: 'c2', songId: 's2', songKeyId: 'k-orig-2', cellState: 'empty' }),
    ]);
    expect(await isSongComfortableInOriginalKey('s1')).toBe(true);
    expect(await isSongComfortableInOriginalKey('s2')).toBe(false);
  });
});

describe('comfortableCellRatioInOriginalKey', () => {
  it('returns 0 when no original-key row exists', async () => {
    expect(await comfortableCellRatioInOriginalKey('missing-song')).toBe(0);
  });

  it('returns 0 when the original key has zero cells', async () => {
    await db.songKeys.add(songKey({ id: 'k-orig', isOriginalKey: true }));
    expect(await comfortableCellRatioInOriginalKey('s1')).toBe(0);
  });

  it('returns 0.5 when half the cells are comfortable', async () => {
    await db.songKeys.add(songKey({ id: 'k-orig', isOriginalKey: true }));
    await db.songCells.bulkAdd([
      songCell({ id: 'c1', songKeyId: 'k-orig', cellState: 'comfortable' }),
      songCell({ id: 'c2', songKeyId: 'k-orig', cellState: 'comfortable' }),
      songCell({ id: 'c3', songKeyId: 'k-orig', cellState: 'learning' }),
      songCell({ id: 'c4', songKeyId: 'k-orig', cellState: 'empty' }),
    ]);
    expect(await comfortableCellRatioInOriginalKey('s1')).toBe(0.5);
  });

  it('returns 1 when every cell is comfortable', async () => {
    await db.songKeys.add(songKey({ id: 'k-orig', isOriginalKey: true }));
    await db.songCells.bulkAdd([
      songCell({ id: 'c1', songKeyId: 'k-orig', cellState: 'comfortable' }),
      songCell({ id: 'c2', songKeyId: 'k-orig', cellState: 'comfortable' }),
    ]);
    expect(await comfortableCellRatioInOriginalKey('s1')).toBe(1);
  });

  it('ignores non-original-key cells when counting both numerator and denominator', async () => {
    await db.songKeys.bulkAdd([
      songKey({ id: 'k-orig', isOriginalKey: true }),
      songKey({ id: 'k-other', isOriginalKey: false }),
    ]);
    await db.songCells.bulkAdd([
      // Original key: 1/2 comfortable → 0.5.
      songCell({ id: 'c1', songKeyId: 'k-orig', cellState: 'comfortable' }),
      songCell({ id: 'c2', songKeyId: 'k-orig', cellState: 'learning' }),
      // Other key cells — must not enter the ratio.
      songCell({ id: 'c3', songKeyId: 'k-other', cellState: 'comfortable' }),
      songCell({ id: 'c4', songKeyId: 'k-other', cellState: 'comfortable' }),
    ]);
    expect(await comfortableCellRatioInOriginalKey('s1')).toBe(0.5);
  });
});
