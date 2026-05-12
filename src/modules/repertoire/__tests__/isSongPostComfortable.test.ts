// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Song, SongCell, SongKey } from '../../../lib/db';
import { isSongPostComfortable } from '../songComfortable';

/**
 * Synchronous variant — drives the session algorithm's per-song
 * branch. Same predicate as isSongComfortableInOriginalKey but with
 * pre-loaded records, so it can run inside a tight loop without
 * waiting on Dexie per song.
 */

const NOW = 1_700_000_000_000;

function mkSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 's1',
    title: 'Test Song',
    artist: 'Test',
    learningOrder: 1,
    audioLinks: [],
    addedDate: NOW,
    key: 'C',
    ...overrides,
  };
}

function mkKey(overrides: Partial<SongKey> = {}): SongKey {
  return {
    id: 'k1',
    songId: 's1',
    keyName: 'C',
    isOriginalKey: true,
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function mkCell(overrides: Partial<SongCell> = {}): SongCell {
  return {
    id: 'c1',
    songId: 's1',
    sectionId: 'sec-1',
    songKeyId: 'k1',
    cellState: 'comfortable',
    comfortableAt: NOW,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('isSongPostComfortable', () => {
  it('true when every original-key cell is comfortable', () => {
    const song = mkSong();
    const keys = [mkKey()];
    const cells = [
      mkCell({ id: 'c1', sectionId: 'sec-1' }),
      mkCell({ id: 'c2', sectionId: 'sec-2' }),
    ];
    expect(isSongPostComfortable(song, keys, cells)).toBe(true);
  });

  it('false when any original-key cell is below comfortable', () => {
    const song = mkSong();
    const keys = [mkKey()];
    const cells = [
      mkCell({ id: 'c1', sectionId: 'sec-1' }),
      mkCell({ id: 'c2', sectionId: 'sec-2', cellState: 'learning' }),
    ];
    expect(isSongPostComfortable(song, keys, cells)).toBe(false);
  });

  it('false when the song has no original-key songKeys row', () => {
    const song = mkSong();
    // Only a non-original key exists.
    const keys = [mkKey({ id: 'k1', keyName: 'F', isOriginalKey: false })];
    const cells = [mkCell({ songKeyId: 'k1' })];
    expect(isSongPostComfortable(song, keys, cells)).toBe(false);
  });

  it('false when zero cells exist at the original key', () => {
    const song = mkSong();
    const keys = [mkKey()];
    expect(isSongPostComfortable(song, keys, [])).toBe(false);
  });

  it('ignores cells at non-original keys', () => {
    const song = mkSong();
    const keys = [
      mkKey({ id: 'k1', keyName: 'C', isOriginalKey: true }),
      mkKey({ id: 'k2', keyName: 'F', isOriginalKey: false }),
    ];
    // Original-key cells all comfortable; expanded-key cell is empty.
    // Post-comfortable is determined by the original key only.
    const cells = [
      mkCell({ id: 'c1', sectionId: 'sec-1', songKeyId: 'k1' }),
      mkCell({ id: 'c2', sectionId: 'sec-1', songKeyId: 'k2', cellState: 'empty' }),
    ];
    expect(isSongPostComfortable(song, keys, cells)).toBe(true);
  });

  it('ignores cells from other songs (same input arrays, multi-song fixture)', () => {
    const song = mkSong({ id: 's1' });
    const keys = [
      mkKey({ id: 'k1', songId: 's1', isOriginalKey: true }),
      mkKey({ id: 'k99', songId: 's2', isOriginalKey: true }),
    ];
    const cells = [
      mkCell({ id: 'c1', songId: 's1', songKeyId: 'k1' }),
      // s2's row is in the working set but shouldn't count toward s1.
      mkCell({ id: 'c99', songId: 's2', songKeyId: 'k99', cellState: 'empty' }),
    ];
    expect(isSongPostComfortable(song, keys, cells)).toBe(true);
  });
});
