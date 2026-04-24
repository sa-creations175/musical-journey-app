/**
 * Reproduces the production bug: db.songs.add inside a Dexie
 * transaction whose scope doesn't include syncQueue. The sync hook
 * must enqueue WITHOUT aborting the parent transaction.
 *
 * Failure mode on broken code: parent transaction aborts with
 * "Table syncQueue not part of transaction" → song never lands
 * locally → enqueue warning logged.
 *
 * Pass criteria after fix: song persists in Dexie, AND a sync queue
 * entry exists for it.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie, { type Table } from 'dexie';

// Minimal in-test reproduction of our schema + hook strategy. We don't
// import the real db.ts because it pulls in Supabase/React modules.
// What we DO import for the system-under-test is the hook installation
// pattern as a near-identical inline copy — see installHooksUnderTest.

interface Song { id: string; title: string }
interface SyncQueueItem {
  id?: number;
  tableName: string;
  rowId: string;
  rowData: unknown;
  queuedAt: number;
}

class TestDB extends Dexie {
  songs!: Table<Song, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      songs: 'id, title',
      syncQueue: '++id, tableName, queuedAt',
    });
  }
}

let db: TestDB;
beforeEach(() => {
  db = new TestDB('test-' + Math.random().toString(36).slice(2));
});

/**
 * Original (broken) approach: queueMicrotask. Dexie 4 patches Promise
 * scheduling so PSD (transaction zone) propagates across microtasks
 * scheduled inside a hook. The syncQueue write inherits the parent
 * transaction's scope and throws NotFound.
 */
function installHooksWithQueueMicrotask(): void {
  db.songs.hook('creating', (_primKey, obj) => {
    const snapshot = { ...obj } as Song;
    queueMicrotask(() => {
      void enqueue(snapshot);
    });
  });
}

/**
 * Fixed approach: setTimeout(fn, 0). Schedules a fresh task (not a
 * microtask) so the parent transaction has fully committed before the
 * enqueue runs. PSD is clear → syncQueue write opens its own
 * implicit transaction.
 */
function installHooksWithSetTimeout(): void {
  db.songs.hook('creating', (_primKey, obj) => {
    const snapshot = { ...obj } as Song;
    setTimeout(() => {
      void enqueue(snapshot);
    }, 0);
  });
}

async function enqueue(song: Song): Promise<void> {
  try {
    await db.syncQueue.add({
      tableName: 'songs',
      rowId: song.id,
      rowData: song,
      queuedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[sync] enqueue failed', (err as Error).name, (err as Error).message);
  }
}

/** Wait long enough for any deferred work (microtasks AND timers) to flush. */
async function flush(): Promise<void> {
  // Two ticks: one for microtasks, one for setTimeout(0).
  await new Promise(r => setTimeout(r, 50));
}

describe('sync hooks inside transactions', () => {
  it('REPRODUCTION: queueMicrotask aborts the parent transaction', async () => {
    installHooksWithQueueMicrotask();
    let didThrow = false;
    try {
      await db.transaction('rw', [db.songs], async () => {
        await db.songs.add({ id: 's1', title: 'Diag Song' });
      });
    } catch {
      didThrow = true;
    }
    await flush();

    // The transaction either throws OR commits with no syncQueue
    // entry — both are bug states. Document the actual observed
    // behavior so a future Dexie version that fixes this gets caught.
    const songCount = await db.songs.count();
    const queueCount = await db.syncQueue.count();
    // Bug shape: queue empty AND/OR song missing.
    const broken = (queueCount === 0) || (songCount === 0) || didThrow;
    expect(broken).toBe(true);
  });

  it('FIX: setTimeout lets the parent transaction commit AND the enqueue land', async () => {
    installHooksWithSetTimeout();
    await db.transaction('rw', [db.songs], async () => {
      await db.songs.add({ id: 's2', title: 'Fixed Song' });
    });
    await flush();

    expect(await db.songs.count()).toBe(1);
    const song = await db.songs.get('s2');
    expect(song?.title).toBe('Fixed Song');

    expect(await db.syncQueue.count()).toBe(1);
    const queueRow = await db.syncQueue.toCollection().first();
    expect(queueRow?.tableName).toBe('songs');
    expect(queueRow?.rowId).toBe('s2');
    expect((queueRow?.rowData as Song).title).toBe('Fixed Song');
  });
});
