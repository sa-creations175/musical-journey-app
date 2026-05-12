// @vitest-environment jsdom
/**
 * Tests for reassignOriginalKey — the helper that keeps the matrix's
 * `isOriginalKey` flag in lockstep with Song.key when the user edits
 * the key field in SongDetailView's meta editor.
 *
 * Coverage:
 *   · existing target row → flag swap (old → false, target → true)
 *   · no target row → create with deterministic id + fresh defaults
 *   · same-key reassignment → no-op (no extra writes)
 *   · multiple isOriginalKey rows (defensive) → flip every extra off
 *   · matrix cell state survives a reassignment (cells stay linked to
 *     the old row, which keeps its id + cellState fields)
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SongCell, type SongKey } from '../../../../lib/db';
import { reassignOriginalKey } from '../reassignOriginalKey';

const NOW = 1_700_000_000_000;
const LATER = NOW + 60_000;
const SONG = 's1';

function mkKey(overrides: Partial<SongKey> = {}): SongKey {
  return {
    id: overrides.id ?? `k-${Math.random().toString(36).slice(2, 6)}`,
    songId: SONG,
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function mkCell(overrides: Partial<SongCell> = {}): SongCell {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2, 6)}`,
    songId: SONG,
    sectionId: 'sec-1',
    songKeyId: 'k-c',
    cellState: 'empty',
    comfortableAt: null,
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

beforeEach(async () => {
  await db.songKeys.clear();
  await db.songCells.clear();
});

describe('reassignOriginalKey — target row exists', () => {
  it('flips the old original off and the new target on', async () => {
    await db.songKeys.bulkPut([
      mkKey({ id: 'k-c', keyName: 'C', isOriginalKey: true, keyState: 'comfortable' }),
      mkKey({ id: 'k-g', keyName: 'G', isOriginalKey: false, keyState: 'learning' }),
    ]);

    await reassignOriginalKey(SONG, 'G', LATER);

    const c = await db.songKeys.get('k-c');
    const g = await db.songKeys.get('k-g');
    expect(c?.isOriginalKey).toBe(false);
    expect(g?.isOriginalKey).toBe(true);
    // Existing keyState / progress preserved on both rows.
    expect(c?.keyState).toBe('comfortable');
    expect(g?.keyState).toBe('learning');
    // updatedAt refreshes on flipped rows.
    expect(c?.updatedAt).toBe(LATER);
    expect(g?.updatedAt).toBe(LATER);
  });
});

describe('reassignOriginalKey — target row does not exist', () => {
  it('creates a fresh row with the deterministic id pattern', async () => {
    await db.songKeys.put(mkKey({ id: 'k-c', keyName: 'C', isOriginalKey: true }));

    await reassignOriginalKey(SONG, 'G', LATER);

    const newRow = await db.songKeys.get(`songkey-${SONG}-G`);
    expect(newRow).toBeDefined();
    expect(newRow?.songId).toBe(SONG);
    expect(newRow?.keyName).toBe('G');
    expect(newRow?.isOriginalKey).toBe(true);
    // Fresh row defaults — no practice has happened in this key yet.
    expect(newRow?.keyState).toBe('not_started');
    expect(newRow?.solidAt).toBeNull();
    expect(newRow?.livedWithSessionCount).toBe(0);
    expect(newRow?.createdAt).toBe(LATER);

    // Old original row demoted, not deleted.
    const c = await db.songKeys.get('k-c');
    expect(c?.isOriginalKey).toBe(false);
  });
});

describe('reassignOriginalKey — zero rows (un-migrated song)', () => {
  it('creates the original-key row when songKeys is empty for the song', async () => {
    // No rows at all — matches the production bug case where the
    // user edited the key via the meta editor before
    // matrixMigration had ever run on the song.
    await reassignOriginalKey(SONG, 'Ab', LATER);

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(`songkey-${SONG}-Ab`);
    expect(rows[0].keyName).toBe('Ab');
    expect(rows[0].isOriginalKey).toBe(true);
    expect(rows[0].keyState).toBe('not_started');
    expect(rows[0].createdAt).toBe(LATER);
    expect(rows[0].updatedAt).toBe(LATER);
  });

  it('zero-rows path does not interfere with other songs songKeys rows', async () => {
    // Write a row for a DIFFERENT song. The zero-rows query is
    // scoped to songId, so this row must remain untouched.
    await db.songKeys.put(mkKey({
      id: 'other-c',
      songId: 'other-song',
      keyName: 'C',
      isOriginalKey: true,
    }));

    await reassignOriginalKey(SONG, 'Ab', LATER);

    const otherRow = await db.songKeys.get('other-c');
    expect(otherRow?.isOriginalKey).toBe(true);
    expect(otherRow?.songId).toBe('other-song');
  });
});

describe('reassignOriginalKey — no-op cases', () => {
  it('is a no-op when the current original already matches', async () => {
    const existing = mkKey({
      id: 'k-c',
      keyName: 'C',
      isOriginalKey: true,
      updatedAt: NOW,
    });
    await db.songKeys.put(existing);

    await reassignOriginalKey(SONG, 'C', LATER);

    const c = await db.songKeys.get('k-c');
    // updatedAt unchanged → no write happened.
    expect(c?.updatedAt).toBe(NOW);
  });
});

describe('reassignOriginalKey — defensive multi-original cleanup', () => {
  it('flips every isOriginalKey: true row off and promotes the target', async () => {
    await db.songKeys.bulkPut([
      mkKey({ id: 'k-c', keyName: 'C', isOriginalKey: true }),
      mkKey({ id: 'k-d', keyName: 'D', isOriginalKey: true }),
      mkKey({ id: 'k-g', keyName: 'G', isOriginalKey: false }),
    ]);

    await reassignOriginalKey(SONG, 'G', LATER);

    const rows = await db.songKeys.where('songId').equals(SONG).toArray();
    const originals = rows.filter(r => r.isOriginalKey);
    expect(originals).toHaveLength(1);
    expect(originals[0].keyName).toBe('G');
  });
});

describe('reassignOriginalKey — matrix data survives the flip', () => {
  it('cells linked to the old original row keep their state', async () => {
    await db.songKeys.bulkPut([
      mkKey({ id: 'k-c', keyName: 'C', isOriginalKey: true }),
      mkKey({ id: 'k-g', keyName: 'G', isOriginalKey: false }),
    ]);
    await db.songCells.put(
      mkCell({
        id: 'cell-1',
        songKeyId: 'k-c',
        cellState: 'comfortable',
        comfortableAt: NOW,
      }),
    );

    await reassignOriginalKey(SONG, 'G', LATER);

    const cell = await db.songCells.get('cell-1');
    // Cell still points at the old row id (k-c), still comfortable —
    // the schema's "matrix data stays intact, only the designation
    // changes" contract holds.
    expect(cell?.songKeyId).toBe('k-c');
    expect(cell?.cellState).toBe('comfortable');
    expect(cell?.comfortableAt).toBe(NOW);
  });
});
