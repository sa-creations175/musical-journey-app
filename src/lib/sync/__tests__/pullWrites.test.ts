/**
 * The pull's own writes must not echo; the app's writes during a pull
 * must not be lost.
 *
 * Both halves matter, and they used to be one blunt flag that got the
 * second one wrong. Getting the FIRST one wrong is worse — an upsert
 * that re-enqueues every pulled row is an endless push/pull loop — so
 * that is the test to trust here.
 *
 * The hook body is a near-identical inline copy of `hooks.ts`, for the
 * reason the existing `hooks.test.ts` gives: importing the real module
 * pulls in `db.ts` and the Supabase/React chain. The system under test
 * that IS imported for real is `pullWrites.ts`, which has no
 * dependencies. Noted plainly rather than implied: this pins the
 * registry's behaviour and the shape of the hook that consults it, not
 * the wiring in `installSyncHooks`.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie, { type Table } from 'dexie';
import {
  activePullWriteCount,
  isPullWrite,
  registerPullWrites,
  releasePullWrites,
  resetPullWritesForTest,
} from '../pullWrites';

interface Row { id: string; title: string }
interface QueueItem { id?: number; tableName: string; rowId: string }

class TestDB extends Dexie {
  songs!: Table<Row, string>;
  syncQueue!: Table<QueueItem, number>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ songs: 'id, title', syncQueue: '++id, tableName' });
  }
}

let db: TestDB;

/** The shipped hook shape: skip a row the pull registered, enqueue
 *  everything else. `broken` restores the pre-fix behaviour. */
function installHooks(opts: { broken?: boolean } = {}) {
  const enqueue = (rowId: string) => {
    setTimeout(() => { void db.syncQueue.add({ tableName: 'songs', rowId }); }, 0);
  };
  db.songs.hook('creating', (...args: unknown[]) => {
    const obj = args[1] as Row;
    const id = obj.id ?? (args[0] as string);
    if (!opts.broken && isPullWrite('songs', id)) return;
    enqueue(id);
  });
  db.songs.hook('updating', (...args: unknown[]) => {
    const obj = (args[2] as Row) ?? ({} as Row);
    const mods = (args[0] as Partial<Row>) ?? {};
    const merged = { ...obj, ...mods };
    const id = merged.id ?? (args[1] as string);
    if (!opts.broken && isPullWrite('songs', id)) return;
    enqueue(id);
  });
}

/** What `putFromCloud` does in engine.ts. */
async function putFromCloud(rows: Row[]) {
  const ids = rows.map(r => r.id);
  registerPullWrites('songs', ids);
  try {
    await db.songs.bulkPut(rows);
  } finally {
    releasePullWrites('songs', ids);
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 5));

beforeEach(async () => {
  resetPullWritesForTest();
  db = new TestDB('pw-' + Math.random().toString(36).slice(2));
  await db.open();
});

describe("a pull's own bulkPut does not enqueue", () => {
  it('inserting cloud rows queues nothing', async () => {
    installHooks();
    await putFromCloud([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    await settle();
    expect(await db.syncQueue.count()).toBe(0);
    expect(await db.songs.count()).toBe(2);
  });

  it('OVERWRITING an existing row queues nothing either', async () => {
    // bulkPut fires `updating`, not `creating`, when the row exists.
    // A fix that only covered inserts would loop on every changed row.
    await db.songs.add({ id: 'a', title: 'old' });
    installHooks();
    await putFromCloud([{ id: 'a', title: 'new' }]);
    await settle();
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.songs.get('a'))?.title).toBe('new');
  });

  it('WITHOUT the fix, the same pull enqueues every row it wrote', async () => {
    // The endless push/pull loop, demonstrated. If this ever passes
    // with 0, the guard has stopped guarding.
    installHooks({ broken: true });
    await putFromCloud([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    await settle();
    expect(await db.syncQueue.count()).toBe(2);
  });
});

describe("an app write DURING a pull is enqueued", () => {
  it('a different row written while the pull holds ids still queues', async () => {
    installHooks();
    registerPullWrites('songs', ['cloud-1']);
    try {
      await db.songs.add({ id: 'mine', title: 'written by the app' });
      await settle();
    } finally {
      releasePullWrites('songs', ['cloud-1']);
    }
    const queued = await db.syncQueue.toArray();
    expect(queued.map(q => q.rowId)).toEqual(['mine']);
  });

  it('is the regression this whole change exists for', async () => {
    // Under the old rule this row was dropped, never pushed, and then
    // deleted by the orphan sweep for not being in the cloud.
    installHooks();
    registerPullWrites('songs', ['unrelated']);
    await db.songs.add({ id: 'songCell:c1', title: 'charting signal' });
    await settle();
    releasePullWrites('songs', ['unrelated']);
    expect(await db.syncQueue.count()).toBe(1);
  });
});

describe('the registry itself', () => {
  it('claims and releases', () => {
    expect(isPullWrite('songs', 'a')).toBe(false);
    registerPullWrites('songs', ['a']);
    expect(isPullWrite('songs', 'a')).toBe(true);
    releasePullWrites('songs', ['a']);
    expect(isPullWrite('songs', 'a')).toBe(false);
  });

  it('counts, so overlapping pulls do not release each other early', () => {
    // Two pulls writing the same row. The first to finish must not
    // un-suppress it while the second is still writing.
    registerPullWrites('songs', ['a']);
    registerPullWrites('songs', ['a']);
    releasePullWrites('songs', ['a']);
    expect(isPullWrite('songs', 'a')).toBe(true);
    releasePullWrites('songs', ['a']);
    expect(isPullWrite('songs', 'a')).toBe(false);
  });

  it('scopes by table — same id in two tables is two claims', () => {
    registerPullWrites('songs', ['x']);
    expect(isPullWrite('songs', 'x')).toBe(true);
    expect(isPullWrite('goals', 'x')).toBe(false);
  });

  it('leaves nothing behind after a balanced cycle', () => {
    registerPullWrites('songs', ['a', 'b', 'c']);
    releasePullWrites('songs', ['a', 'b', 'c']);
    expect(activePullWriteCount()).toBe(0);
  });

  it('releasing something never claimed is a no-op, not a negative count', () => {
    releasePullWrites('songs', ['ghost']);
    expect(activePullWriteCount()).toBe(0);
    expect(isPullWrite('songs', 'ghost')).toBe(false);
  });

  it('a failed write still releases, so the row is not suppressed forever', async () => {
    installHooks();
    await expect(
      (async () => {
        const ids = ['boom'];
        registerPullWrites('songs', ids);
        try {
          throw new Error('write failed');
        } finally {
          releasePullWrites('songs', ids);
        }
      })(),
    ).rejects.toThrow('write failed');
    expect(isPullWrite('songs', 'boom')).toBe(false);
    // And the row still syncs normally afterwards.
    await db.songs.add({ id: 'boom', title: 'later edit' });
    await settle();
    expect(await db.syncQueue.count()).toBe(1);
  });
});
