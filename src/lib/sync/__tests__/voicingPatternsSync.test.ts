// @vitest-environment jsdom
/**
 * Locks the voicing-carousel sync contract: code-seeded system voicing
 * patterns (isSystem: true) must NEVER be enqueued to the cloud, while
 * user-saved patterns (isSystem: false) sync normally. The guard lives at
 * the shared `enqueue` boundary so it covers both the live write-hooks and
 * the initial backfill — and must stay a no-op for tables without isSystem.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { enqueue } from '../engine';

beforeEach(async () => {
  await db.syncQueue.clear();
});

describe('enqueue isSystem skip-guard', () => {
  it('does NOT enqueue a system voicing-pattern upsert', async () => {
    await enqueue('voicingPatterns', 'upsert', 'vp:sys:maj:root', {
      id: 'vp:sys:maj:root',
      qualityId: 'maj',
      isSystem: true,
    });
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('DOES enqueue a user voicing-pattern upsert', async () => {
    await enqueue('voicingPatterns', 'upsert', 'user-1', {
      id: 'user-1',
      qualityId: 'maj7',
      isSystem: false,
    });
    expect(await db.syncQueue.count()).toBe(1);
    const row = await db.syncQueue.toCollection().first();
    expect(row?.tableName).toBe('voicingPatterns');
    expect(row?.rowId).toBe('user-1');
  });

  it('stays a no-op for tables without an isSystem flag', async () => {
    await enqueue('songs', 'upsert', 's1', { id: 's1', title: 'X' });
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('does not skip deletes (guard only applies to upserts)', async () => {
    await enqueue('voicingPatterns', 'delete', 'vp:sys:maj:root', undefined);
    expect(await db.syncQueue.count()).toBe(1);
  });
});
