import { db } from '../db';
import { isPulling } from './pullLock';
import { enqueue } from './engine';
import { SYNC_TABLES, type SyncTableConfig } from './tables';
import { getCurrentUserId } from './currentUser';

type DexieHookTable = {
  hook: (
    event: 'creating' | 'updating' | 'deleting',
    fn: (...args: unknown[]) => void,
  ) => void;
};

type UnknownRow = Record<string, unknown>;

/**
 * Epoch ms of the most recent genuine local write (any synced table).
 * Set SYNCHRONOUSLY inside the write-hook bodies — before the deferred
 * `setTimeout(0)` enqueue — so it is recorded even when the tab is
 * backgrounded immediately after the write (which throttles/pauses the
 * timer and would otherwise leave `syncQueue` empty when a return-
 * triggered pull checks it). refreshFromCloud reads this to gate a
 * destructive pull until the deferred enqueue has had a chance to land.
 * Only set after the sync guards pass, so pull-induced echo writes and
 * signed-out writes don't move it.
 */
let lastLocalWriteAt = 0;

export function getLastLocalWriteAt(): number {
  return lastLocalWriteAt;
}

/**
 * Install Dexie write hooks on every synced table. After this runs,
 * ordinary Dexie writes (db.songs.put(...), etc.) are automatically
 * mirrored to Supabase — no refactor of existing call sites needed.
 *
 * Echo prevention: while the sync engine is pulling cloud data into
 * Dexie, `isPulling()` returns true and all hooks no-op. Otherwise
 * every pulled row would immediately re-push to the cloud.
 *
 * --- IMPORTANT: why setTimeout(fn, 0) and NOT queueMicrotask ---
 *
 * Dexie 4 uses native Promises but patches Promise scheduling to
 * preserve its PSD (Promise State Domain — Dexie's transaction
 * zone) across async boundaries. queueMicrotask is part of that
 * patched plumbing (see dexie.mjs around line 1090), so a microtask
 * scheduled inside a hook INHERITS the parent transaction's PSD.
 *
 * When AddSongModal does:
 *   await db.transaction('rw', [songs, songSections], async () => {
 *     await db.songs.add(song);
 *   });
 *
 * the `creating` hook fires inside that transaction's PSD. If we
 * had used queueMicrotask, the deferred `db.syncQueue.add(item)`
 * would still run in the parent PSD — Dexie checks the storeNames
 * list, finds syncQueue isn't in scope, and throws
 * `NotFoundError: Table syncQueue not part of transaction`
 * (minified to "N" in the production bundle). Even with a try/catch
 * around the inner add, the rejection-inside-PSD aborts the parent
 * transaction → the user's song never lands locally.
 *
 * setTimeout(fn, 0) schedules a fresh task (not a microtask). The
 * parent transaction has fully committed and unwound by the time it
 * runs, PSD is empty, and the syncQueue write opens its own
 * implicit transaction normally.
 *
 * Verified by src/lib/sync/__tests__/hooks.test.ts.
 *
 * Call this ONCE, as soon as the db singleton exists.
 */
export function installSyncHooks(): void {
  for (const cfg of SYNC_TABLES) {
    const table = (db as unknown as Record<string, DexieHookTable | undefined>)[cfg.dexie];
    if (!table || typeof table.hook !== 'function') continue;

    table.hook('creating', (...args: unknown[]) => {
      if (!shouldSync()) return;
      lastLocalWriteAt = Date.now();
      const obj = args[1] as UnknownRow;
      // Snapshot now — Dexie may mutate `obj` between the hook and
      // our deferred work (e.g. if downstream code fills fields).
      const snapshot = { ...obj };
      setTimeout(() => queueUpsert(cfg, snapshot), 0);
    });

    table.hook('updating', (...args: unknown[]) => {
      if (!shouldSync()) return;
      lastLocalWriteAt = Date.now();
      const mods = (args[0] as UnknownRow) ?? {};
      const obj = (args[2] as UnknownRow) ?? {};
      // Post-update row = old obj merged with new mods.
      const merged = { ...obj, ...mods };
      setTimeout(() => queueUpsert(cfg, merged), 0);
    });

    table.hook('deleting', (...args: unknown[]) => {
      // Deletes always enqueue when a user is signed in, regardless
      // of isPulling(). The pulling guard is correct for upserts —
      // it prevents echo loops when replace-pull bulkPuts cloud
      // rows into Dexie — but it was silently dropping explicit
      // user deletes that raced a tab-focus pull (verified by
      // diagnostic logs: confirmed-plan Re-plan + concurrent pull
      // left the syncQueue empty and the next replace-pull
      // restored the rows).
      //
      // Replace-pull's own orphan-bulkDelete also fires this hook
      // and will enqueue 'delete' ops for already-deleted cloud
      // rows. That's benign — Supabase delete on a non-existent
      // row is a no-op (no error). The extra round-trips are
      // wasteful but correct, and they're rare in practice
      // (orphan deletes happen only when cross-device state
      // diverges).
      if (!getCurrentUserId()) return;
      // Genuine user deletes move the recency marker; the orphan
      // bulkDelete inside a replace-pull (which also fires this hook —
      // see below) must not, or every cross-device reconcile would gate
      // the next pull. creating/updating already skip during a pull via
      // shouldSync(); deletes need the explicit check.
      if (!isPulling()) lastLocalWriteAt = Date.now();
      const obj = (args[1] as UnknownRow | undefined) ?? {};
      const id = obj[cfg.idField];
      setTimeout(() => {
        if (typeof id === 'string' && id !== '') {
          void enqueue(cfg.dexie, 'delete', id, undefined);
        }
      }, 0);
    });
  }
}

function shouldSync(): boolean {
  if (isPulling()) return false;
  if (!getCurrentUserId()) return false;
  return true;
}

function queueUpsert(cfg: SyncTableConfig, row: UnknownRow): void {
  const id = row[cfg.idField];
  if (typeof id !== 'string' || id === '') return;
  void enqueue(cfg.dexie, 'upsert', id, row);
}
