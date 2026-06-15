import { describe, expect, it } from 'vitest';
import type { Song, SongCell, SongKey } from '../../../lib/db';
import {
  decidePostComfortableBlock,
  findNextExpansionKey,
  isMaintenanceDue,
  MAINTENANCE_PATH_WEEK_MS,
  resolveProgressionPath,
} from '../songProgression';

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function mkSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 's1',
    title: 'Test Song',
    artist: 'Test',
    learningOrder: 1,
    audioLinks: [],
    addedDate: NOW,
    updatedAt: NOW,
    key: 'C',
    ...overrides,
  };
}

function mkKey(overrides: Partial<SongKey> = {}): SongKey {
  return {
    id: 'k-C',
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
    songKeyId: 'k-C',
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

describe('resolveProgressionPath', () => {
  it('returns "deepen" when progressionPath is null or undefined', () => {
    expect(resolveProgressionPath(mkSong({ progressionPath: null }))).toBe('deepen');
    expect(resolveProgressionPath(mkSong({}))).toBe('deepen');
  });

  it('preserves explicit paths', () => {
    expect(resolveProgressionPath(mkSong({ progressionPath: 'deepen' }))).toBe('deepen');
    expect(resolveProgressionPath(mkSong({ progressionPath: 'expand-keys' }))).toBe('expand-keys');
    expect(resolveProgressionPath(mkSong({ progressionPath: 'maintenance' }))).toBe('maintenance');
  });
});

describe('isMaintenanceDue', () => {
  it('true when lastEngagedAt is null', () => {
    expect(isMaintenanceDue(null, NOW)).toBe(true);
  });

  it('true when more than 7 days have passed', () => {
    expect(isMaintenanceDue(NOW - 8 * DAY_MS, NOW)).toBe(true);
  });

  it('true exactly at the 7-day boundary', () => {
    expect(isMaintenanceDue(NOW - MAINTENANCE_PATH_WEEK_MS, NOW)).toBe(true);
  });

  it('false when less than 7 days have passed', () => {
    expect(isMaintenanceDue(NOW - 3 * DAY_MS, NOW)).toBe(false);
    expect(isMaintenanceDue(NOW - MAINTENANCE_PATH_WEEK_MS + 1000, NOW)).toBe(false);
  });
});

describe('findNextExpansionKey', () => {
  it('returns null when expandKeysOrder is missing', () => {
    expect(findNextExpansionKey(mkSong({}), [], [])).toBeNull();
  });

  it('returns null when expandKeysOrder is empty', () => {
    expect(findNextExpansionKey(mkSong({ expandKeysOrder: [] }), [], [])).toBeNull();
  });

  it('returns the first key that has no songKeys row yet (fresh territory)', () => {
    const song = mkSong({ expandKeysOrder: ['F', 'Bb', 'Eb'] });
    // Only the original-key row exists.
    const keys = [mkKey()];
    expect(findNextExpansionKey(song, keys, [])).toBe('F');
  });

  it('returns the first key whose cells are not all comfortable', () => {
    const song = mkSong({ expandKeysOrder: ['F', 'Bb', 'Eb'] });
    const keys = [
      mkKey({ id: 'k-C', keyName: 'C', isOriginalKey: true }),
      // F has all-comfortable cells; Bb has a still-learning cell.
      mkKey({ id: 'k-F', keyName: 'F', isOriginalKey: false }),
      mkKey({ id: 'k-Bb', keyName: 'Bb', isOriginalKey: false }),
    ];
    const cells = [
      mkCell({ id: 'c-F1', songKeyId: 'k-F', cellState: 'comfortable' }),
      mkCell({ id: 'c-Bb1', songKeyId: 'k-Bb', cellState: 'learning' }),
    ];
    expect(findNextExpansionKey(song, keys, cells)).toBe('Bb');
  });

  it('returns null when every key in the walk is fully comfortable', () => {
    const song = mkSong({ expandKeysOrder: ['F', 'Bb'] });
    const keys = [
      mkKey({ id: 'k-C', keyName: 'C', isOriginalKey: true }),
      mkKey({ id: 'k-F', keyName: 'F', isOriginalKey: false }),
      mkKey({ id: 'k-Bb', keyName: 'Bb', isOriginalKey: false }),
    ];
    const cells = [
      mkCell({ id: 'c-F1', songKeyId: 'k-F', cellState: 'comfortable' }),
      mkCell({ id: 'c-Bb1', songKeyId: 'k-Bb', cellState: 'comfortable' }),
    ];
    expect(findNextExpansionKey(song, keys, cells)).toBeNull();
  });
});

describe('decidePostComfortableBlock', () => {
  it('deepen — whole-song-run in original key', () => {
    const song = mkSong({ progressionPath: 'deepen', key: 'C' });
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: [mkKey()],
        songCells: [mkCell()],
        lastEngagedAt: null,
        now: NOW,
      }),
    ).toEqual({ kind: 'whole-song-run', keyName: 'C' });
  });

  it('null path — treated as deepen, whole-song-run in original key', () => {
    const song = mkSong({ progressionPath: null, key: 'C' });
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: [mkKey()],
        songCells: [mkCell()],
        lastEngagedAt: null,
        now: NOW,
      }),
    ).toEqual({ kind: 'whole-song-run', keyName: 'C' });
  });

  it('expand-keys with un-mastered next key → cell-drill on that key', () => {
    const song = mkSong({
      progressionPath: 'expand-keys',
      expandKeysOrder: ['F', 'Bb'],
    });
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: [mkKey()],
        songCells: [],
        lastEngagedAt: null,
        now: NOW,
      }),
    ).toEqual({ kind: 'cell-drill-expansion', keyName: 'F' });
  });

  it('expand-keys with finished walk → whole-song-run in original key', () => {
    const song = mkSong({
      progressionPath: 'expand-keys',
      key: 'C',
      expandKeysOrder: ['F'],
    });
    const keys = [
      mkKey(),
      mkKey({ id: 'k-F', keyName: 'F', isOriginalKey: false }),
    ];
    const cells = [mkCell({ id: 'c-F1', songKeyId: 'k-F', cellState: 'comfortable' })];
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: keys,
        songCells: cells,
        lastEngagedAt: null,
        now: NOW,
      }),
    ).toEqual({ kind: 'whole-song-run', keyName: 'C' });
  });

  it('maintenance — surfaces when over 7 days stale', () => {
    const song = mkSong({ progressionPath: 'maintenance', key: 'C' });
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: [mkKey()],
        songCells: [mkCell()],
        lastEngagedAt: NOW - 8 * DAY_MS,
        now: NOW,
      }),
    ).toEqual({ kind: 'whole-song-run', keyName: 'C' });
  });

  it('maintenance — surfaces when never engaged (null lastEngagedAt)', () => {
    const song = mkSong({ progressionPath: 'maintenance', key: 'C' });
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: [mkKey()],
        songCells: [mkCell()],
        lastEngagedAt: null,
        now: NOW,
      }),
    ).toEqual({ kind: 'whole-song-run', keyName: 'C' });
  });

  it('maintenance — skip when last engaged within the 7-day floor', () => {
    const song = mkSong({ progressionPath: 'maintenance', key: 'C' });
    expect(
      decidePostComfortableBlock({
        song,
        songKeys: [mkKey()],
        songCells: [mkCell()],
        lastEngagedAt: NOW - 3 * DAY_MS,
        now: NOW,
      }),
    ).toEqual({ kind: 'skip' });
  });
});
