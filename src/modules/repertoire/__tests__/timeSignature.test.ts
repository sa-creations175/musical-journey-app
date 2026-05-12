// @vitest-environment jsdom
/**
 * Time-signature round-trip through Dexie. The field is optional and
 * unindexed — rides in the data JSONB blob across sync — so the
 * minimum guarantee is "what you write is what you read back."
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Song } from '../../../lib/db';

const NOW = 1_700_000_000_000;

function mkSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 's1',
    title: 'Test',
    artist: 'Test',
    learningOrder: 1,
    audioLinks: [],
    addedDate: NOW,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.songs.clear();
});

describe('Song.timeSignature persistence', () => {
  it('writes and reads a preset value (4/4)', async () => {
    await db.songs.put(mkSong({ id: 's-44', timeSignature: '4/4' }));
    const fresh = await db.songs.get('s-44');
    expect(fresh?.timeSignature).toBe('4/4');
  });

  it('writes and reads a non-preset value (9/8)', async () => {
    await db.songs.put(mkSong({ id: 's-98', timeSignature: '9/8' }));
    const fresh = await db.songs.get('s-98');
    expect(fresh?.timeSignature).toBe('9/8');
  });

  it('clears via undefined (no field stored)', async () => {
    await db.songs.put(mkSong({ id: 's-clr', timeSignature: '6/8' }));
    const initial = await db.songs.get('s-clr');
    expect(initial?.timeSignature).toBe('6/8');
    // Upsert with the field omitted (undefined) — read-back returns
    // undefined.
    await db.songs.put({ ...initial!, timeSignature: undefined });
    const cleared = await db.songs.get('s-clr');
    expect(cleared?.timeSignature).toBeUndefined();
  });

  it('survives an update that does not touch the field', async () => {
    await db.songs.put(mkSong({ id: 's-keep', timeSignature: '12/8' }));
    const initial = await db.songs.get('s-keep');
    await db.songs.put({ ...initial!, title: 'Renamed' });
    const after = await db.songs.get('s-keep');
    expect(after?.title).toBe('Renamed');
    expect(after?.timeSignature).toBe('12/8');
  });
});
