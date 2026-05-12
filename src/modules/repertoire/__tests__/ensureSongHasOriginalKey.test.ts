// @vitest-environment jsdom
/**
 * Tests for ensureSongHasOriginalKey — the single-song variant of
 * matrixMigration. Idempotent: no-op when the song already has at
 * least one songKeys row; no-op when the song record is missing;
 * seeds the original-key row using Song.key when both conditions
 * are satisfied.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Song } from '../../../lib/db';
import { ensureSongHasOriginalKey } from '../matrixMigration';

const NOW = 1_700_000_000_000;
const SONG = 'song-no-weapon';

function mkSong(overrides: Partial<Song> = {}): Song {
  return {
    id: SONG,
    title: 'No Weapon',
    artist: '',
    addedDate: NOW,
    learningOrder: 1,
    audioLinks: [],
    ...overrides,
  } as Song;
}

beforeEach(async () => {
  await db.songs.clear();
  await db.songKeys.clear();
});

describe('ensureSongHasOriginalKey', () => {
  it('seeds the original-key row from Song.key when none exists', async () => {
    await db.songs.put(mkSong({ key: 'Ab' }));

    await ensureSongHasOriginalKey(SONG);

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(`songkey-${SONG}-Ab`);
    expect(rows[0].keyName).toBe('Ab');
    expect(rows[0].isOriginalKey).toBe(true);
  });

  it('defaults to "C" when Song.key is undefined', async () => {
    await db.songs.put(mkSong({ key: undefined }));

    await ensureSongHasOriginalKey(SONG);

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].keyName).toBe('C');
  });

  it('is a no-op when at least one songKeys row already exists', async () => {
    await db.songs.put(mkSong({ key: 'Ab' }));
    // Pretend a previous reassign already created the Ab row.
    await db.songKeys.put({
      id: `songkey-${SONG}-Ab`,
      songId: SONG,
      keyName: 'Ab',
      isOriginalKey: true,
      keyState: 'comfortable',
      solidAt: null,
      solidDecayState: null,
      lastDecayCheckAt: null,
      livedWithSessionCount: 5,
      livedWithFirstSessionAt: NOW - 1000,
      livedWithWindowStartAt: NOW - 1000,
      livedWithSessionsInWindow: 5,
      wholeSongTestPassedAt: null,
      isRetestRecommended: false,
      lastEngagedAt: NOW,
      createdAt: NOW - 1000,
      updatedAt: NOW - 500,
    });

    await ensureSongHasOriginalKey(SONG);

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows).toHaveLength(1);
    // Pre-existing progress preserved — the no-op didn't reset it.
    expect(rows[0].keyState).toBe('comfortable');
    expect(rows[0].livedWithSessionCount).toBe(5);
  });

  it('is a no-op when the song record is missing', async () => {
    // No song row; no songKeys row. Function should not throw and
    // must not create a row pointing at a phantom song.
    await ensureSongHasOriginalKey('nonexistent-song');

    const rows = await db.songKeys.where('songId').equals('nonexistent-song').toArray();
    expect(rows).toHaveLength(0);
  });

  it('does not touch other songs songKeys rows', async () => {
    await db.songs.put(mkSong({ key: 'C' }));
    await db.songs.put(mkSong({ id: 'other-song', title: 'Other', key: 'G' }));
    await db.songKeys.put({
      id: 'songkey-other-song-G',
      songId: 'other-song',
      keyName: 'G',
      isOriginalKey: true,
      keyState: 'learning',
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
      createdAt: NOW,
      updatedAt: NOW,
    });

    await ensureSongHasOriginalKey(SONG);

    const otherRows = await db.songKeys.where('songId').equals('other-song').toArray();
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].isOriginalKey).toBe(true);
    const ownRows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(ownRows).toHaveLength(1);
  });
});
