// @vitest-environment jsdom
/**
 * Finding the key rows the old migration invented.
 *
 * The property that matters is what this must NOT clear. A song
 * genuinely in C with real practice behind it looks superficially like
 * the phantom — same key, same kind of state — and the only thing
 * separating them is evidence. So the tests are mostly about survival,
 * not detection.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Song, type SongKey } from '../../../lib/db';
import {
  clearSeededKeyRow,
  countBySong,
  findSeededKeyRows,
} from '../seededKeyRows';

const ADDED = 1_700_000_000_000;
const LATER = ADDED + 5_000_000;

function song(over: Partial<Song> = {}): Song {
  return {
    id: 's1', title: 'Can We Talk', addedDate: ADDED, updatedAt: 0, ...over,
  } as Song;
}

function keyRow(over: Partial<SongKey> = {}): SongKey {
  return {
    id: 'sk-C', songId: 's1', keyName: 'C', isOriginalKey: false,
    keyState: 'learning', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: ADDED,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.songs.clear(), db.songKeys.clear(), db.songCells.clear(),
    db.songCellRunThroughs.clear(), db.songKeyRunThroughs.clear(),
  ]);
});

describe('finds the phantom', () => {
  it('a row claiming learning, stamped with the added date, with no evidence', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow());
    const found = await findSeededKeyRows();
    expect(found).toHaveLength(1);
    expect(found[0].keyName).toBe('C');
    expect(found[0].claimedState).toBe('learning');
  });

  it('finds it whether or not it is still the original key', async () => {
    // The common case is a reassignment leaving it behind as a
    // non-original row, but a song whose key was never corrected still
    // has the invented row as its anchor.
    await db.songs.add(song());
    await db.songKeys.bulkAdd([
      keyRow({ id: 'sk-C', isOriginalKey: false }),
      keyRow({ id: 'sk-F', keyName: 'F', isOriginalKey: true }),
    ]);
    expect(await findSeededKeyRows()).toHaveLength(2);
  });
});

describe('what it must NOT clear', () => {
  it('a song genuinely in C with real practice survives', async () => {
    // THE LOAD-BEARING ONE. Same key, same state, same timestamp — the
    // only difference is a run-through. Nothing in the detection may
    // look at the key name.
    await db.songs.add(song({ key: 'C' }));
    await db.songKeys.add(keyRow({ isOriginalKey: true }));
    await db.songCells.add({
      id: 'cell-1', songId: 's1', sectionId: 'sec-1', songKeyId: 'sk-C',
      cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 1,
      lastRunAt: LATER, lastRunWasClean: true, notes: null,
      lastEngagedAt: LATER, createdAt: 0, updatedAt: 0,
    });
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a key with a whole-song run-through survives', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow());
    await db.songKeyRunThroughs.add({
      id: 'kr-1', songKeyId: 'sk-C', songId: 's1', wasClean: true,
      consecutiveCleanCount: 1, tempoBpm: 100, notes: null,
      isRetest: false, createdAt: LATER,
    });
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a key with a cell run-through survives', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow());
    await db.songCells.add({
      id: 'cell-1', songId: 's1', sectionId: 'sec-1', songKeyId: 'sk-C',
      cellState: 'empty', comfortableAt: null, consecutiveCleanCount: 0,
      lastRunAt: null, lastRunWasClean: null, notes: null,
      lastEngagedAt: null, createdAt: 0, updatedAt: 0,
    });
    await db.songCellRunThroughs.add({
      id: 'cr-1', cellId: 'cell-1', songId: 's1', sectionId: 'sec-1',
      songKeyId: 'sk-C', wasClean: true, tempoBpm: 100, notes: null,
      createdAt: LATER,
    });
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a key that passed the whole-song test survives', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ wholeSongTestPassedAt: LATER }));
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a key with lived-with sessions survives', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ livedWithSessionCount: 3 }));
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a CROSS-KEY FOLLOW-UP row survives — it is an answer the user gave', async () => {
    // Those also claim a state with no practice behind them, but they
    // leave lastEngagedAt NULL. Clearing them would delete a statement
    // the user made about which keys they were working.
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ lastEngagedAt: null }));
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a row whose timestamp is NOT the added date survives', async () => {
    // Guard the guard: everything else about this row matches the
    // phantom, so only the fingerprint can be what spares it.
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ lastEngagedAt: LATER }));
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a not_started row is left alone', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ keyState: 'not_started' }));
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('a song with no added date is left alone rather than guessed at', async () => {
    // The migration stamped its own clock there, which is
    // indistinguishable from a real timestamp. A wrong line on one
    // screen is cheaper than deleted practice history.
    await db.songs.add(song({ addedDate: undefined }));
    await db.songKeys.add(keyRow({ lastEngagedAt: ADDED }));
    expect(await findSeededKeyRows()).toHaveLength(0);
  });
});

describe('reporting before writing', () => {
  it('groups by song, most affected first', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', title: 'Can We Talk' }),
      song({ id: 's2', title: 'Superstar' }),
    ]);
    await db.songKeys.bulkAdd([
      keyRow({ id: 'a', songId: 's1', keyName: 'C' }),
      keyRow({ id: 'b', songId: 's1', keyName: 'G' }),
      keyRow({ id: 'c', songId: 's2', keyName: 'C' }),
    ]);
    const report = countBySong(await findSeededKeyRows());
    expect(report[0]).toMatchObject({ songTitle: 'Can We Talk', count: 2 });
    expect(report[1]).toMatchObject({ songTitle: 'Superstar', count: 1 });
  });
});

describe('the repair', () => {
  it('resets the state and the timestamp, and keeps the row', async () => {
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ solidDecayState: 'solid', isRetestRecommended: true }));
    await clearSeededKeyRow('sk-C');

    const after = await db.songKeys.get('sk-C');
    expect(after).toBeDefined();          // all twelve stay materialised
    expect(after?.keyState).toBe('not_started');
    expect(after?.lastEngagedAt).toBeNull();
    expect(after?.solidDecayState).toBeNull();
    expect(after?.isRetestRecommended).toBe(false);
    expect(await findSeededKeyRows()).toHaveLength(0);
  });

  it('does NOT move the original-key anchor', async () => {
    // Whether this row is the song's anchor is a separate question
    // with its own repair. A cleanup that silently moved it would be
    // doing two things under one name.
    await db.songs.add(song());
    await db.songKeys.add(keyRow({ isOriginalKey: true }));
    await clearSeededKeyRow('sk-C');
    expect((await db.songKeys.get('sk-C'))?.isOriginalKey).toBe(true);
  });
});
