// @vitest-environment jsdom
/**
 * End-to-end confirmation that user-saved voicing patterns sync while
 * code-seeded system patterns do not — exercised through the REAL Dexie
 * write hooks (installSyncHooks), not by calling enqueue directly.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { installSyncHooks } from '../hooks';
import { setCurrentUserId } from '../currentUser';
import {
  buildSystemVoicingPatterns,
  // seeder not needed; we put one system row directly
} from '../../../modules/shapes-and-patterns/seedVoicingPatterns';
import { createUserVoicingPattern } from '../../../modules/shapes-and-patterns/voicingPatterns';

// Hooks defer the enqueue with setTimeout(fn, 0); wait a tick.
const flush = () => new Promise(r => setTimeout(r, 50));

beforeAll(() => {
  setCurrentUserId('test-user-1');
  installSyncHooks();
});

afterAll(() => {
  setCurrentUserId(null);
});

describe('voicing pattern sync via real write hooks', () => {
  it('enqueues a user-saved pattern but not a system pattern', async () => {
    await db.voicingPatterns.clear();
    await db.syncQueue.clear();

    // User pattern (isSystem:false) → should enqueue.
    const userPattern = await createUserVoicingPattern('maj7', [
      { offset: 0, hand: 'R' },
      { offset: 4, hand: 'R' },
    ]);
    await flush();

    let rows = await db.syncQueue.where('tableName').equals('voicingPatterns').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].rowId).toBe(userPattern.id);

    // System pattern (isSystem:true) → must be skipped at the enqueue boundary.
    const systemPattern = buildSystemVoicingPatterns()[0];
    expect(systemPattern.isSystem).toBe(true);
    await db.voicingPatterns.put(systemPattern);
    await flush();

    rows = await db.syncQueue.where('tableName').equals('voicingPatterns').toArray();
    expect(rows).toHaveLength(1); // unchanged — system row not queued
    expect(rows[0].rowId).toBe(userPattern.id);
  });
});
