// @vitest-environment jsdom
/**
 * The per-song spelling override, and what its reset has to actually do.
 *
 * THREE STATES, AND UNDEFINED IS THE LOAD-BEARING ONE. A song with no
 * opinion follows the global setting and keeps following it when that
 * setting changes. If a song pinned a concrete value at creation, the
 * global would only ever apply to songs added afterwards — which is not
 * a global setting.
 *
 * The write is a read-then-put. A suspected reason for that turned out
 * to be wrong and is worth recording: `db.songs.update` was believed to
 * treat an `undefined` value as "leave this field alone", which would
 * have made the reset silently do nothing once a song was pinned. It
 * does not — Dexie 4.4.2 deletes the key. The characterisation test
 * below pins that, so a future version quietly changing it is caught
 * rather than assumed in either direction.
 *
 * The read-then-put stays for the reason `saveMeta` already documents
 * in this codebase: `.update` can no-op silently when its internal
 * lookup-and-merge fails, and a reset that looks like it worked is
 * worse than one that throws.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Song } from '../../../lib/db';
import { resolveSpelling } from '../../../lib/spelling';

const NOW = 1_700_000_000_000;

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Mirror',
    artist: 'Someone',
    key: 'F#',
    learningOrder: 1,
    addedDate: NOW,
    stage: 'learning',
    ...overrides,
  } as Song;
}

/** The production write, mirrored from SongDetailView's handler. */
async function setSongSpelling(id: string, next: 'flat' | 'sharp' | undefined) {
  const fresh = await db.songs.get(id);
  if (!fresh) return;
  const updated = { ...fresh, updatedAt: Date.now() };
  if (next === undefined) delete updated.spelling;
  else updated.spelling = next;
  await db.songs.put(updated);
}

beforeEach(async () => {
  await db.open();
  await db.songs.clear();
});

describe('the reset actually resets', () => {
  it('removes the field, so the song follows the global again', async () => {
    await db.songs.add(song({ spelling: 'sharp' }));
    await setSongSpelling('song-1', undefined);

    const after = await db.songs.get('song-1');
    expect(after?.spelling, 'the override survived the reset').toBeUndefined();
    expect('spelling' in (after as object), 'the key is still on the row')
      .toBe(false);
  });

  it('CHARACTERISATION — Dexie 4.4.2 update() also clears an undefined field', async () => {
    // Not the production path, and not an endorsement of it. Pinned
    // because the handler's shape was nearly justified by the opposite
    // belief: if a future Dexie makes update() a no-op here, this fails
    // and the reset must stay a read-then-put for a NEW reason. Either
    // way the next reader learns it by test rather than by folklore.
    await db.songs.add(song({ spelling: 'sharp' }));
    const changed = await db.songs.update('song-1', { spelling: undefined });

    const after = await db.songs.get('song-1') as unknown as Record<string, unknown>;
    expect(changed).toBe(1);
    expect(after.spelling).toBeUndefined();
    expect('spelling' in after, 'update() left the key in place').toBe(false);
  });

  it('round-trips through both overrides and back to inheriting', async () => {
    await db.songs.add(song());
    expect((await db.songs.get('song-1'))?.spelling).toBeUndefined();

    await setSongSpelling('song-1', 'sharp');
    expect((await db.songs.get('song-1'))?.spelling).toBe('sharp');

    await setSongSpelling('song-1', 'flat');
    expect((await db.songs.get('song-1'))?.spelling).toBe('flat');

    await setSongSpelling('song-1', undefined);
    expect((await db.songs.get('song-1'))?.spelling).toBeUndefined();
  });

  it('leaves the rest of the song alone', async () => {
    // The read-then-put writes a whole record. A careless version would
    // drop fields it did not know about.
    await db.songs.add(song({ spelling: 'sharp', tempo: 96, genre: 'gospel' }));
    await setSongSpelling('song-1', undefined);

    const after = await db.songs.get('song-1');
    expect(after?.tempo).toBe(96);
    expect(after?.genre).toBe('gospel');
    expect(after?.key, 'the stored identity moved').toBe('F#');
  });
});

describe('what undefined MEANS', () => {
  it('follows the global, and keeps following when the global flips', () => {
    const inheriting = song();
    expect(resolveSpelling(inheriting.spelling, 'flat')).toBe('flat');
    expect(resolveSpelling(inheriting.spelling, 'sharp')).toBe('sharp');
  });

  it('an overridden song ignores the global in both directions', () => {
    const pinned = song({ spelling: 'sharp' });
    expect(resolveSpelling(pinned.spelling, 'flat')).toBe('sharp');
    expect(resolveSpelling(pinned.spelling, 'sharp')).toBe('sharp');
  });

  it('is not the same as storing the default value', () => {
    // The distinction the three-state design exists for: these two
    // songs look identical today and diverge the moment the global
    // setting changes.
    const inheriting = song();
    const pinnedToDefault = song({ spelling: 'flat' });
    expect(resolveSpelling(inheriting.spelling, 'flat'))
      .toBe(resolveSpelling(pinnedToDefault.spelling, 'flat'));
    expect(resolveSpelling(inheriting.spelling, 'sharp')).toBe('sharp');
    expect(resolveSpelling(pinnedToDefault.spelling, 'sharp')).toBe('flat');
  });
});
