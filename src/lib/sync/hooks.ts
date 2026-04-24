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
 * Install Dexie write hooks on every synced table. After this runs,
 * ordinary Dexie writes (db.songs.put(...), etc.) are automatically
 * mirrored to Supabase — no refactor of existing call sites needed.
 *
 * We defer enqueue to a microtask so the Dexie transaction doesn't
 * need to include the syncQueue table, and so a hook can't block the
 * user's write.
 *
 * Echo prevention: while the sync engine is pulling cloud data into
 * Dexie, `isPulling()` returns true and all hooks no-op. Otherwise
 * every pulled row would immediately re-push to the cloud.
 *
 * Call this ONCE, as soon as the db singleton exists.
 */
export function installSyncHooks(): void {
  for (const cfg of SYNC_TABLES) {
    const table = (db as unknown as Record<string, DexieHookTable | undefined>)[cfg.dexie];
    if (!table || typeof table.hook !== 'function') continue;

    table.hook('creating', (...args: unknown[]) => {
      if (!shouldSync()) return;
      const obj = args[1] as UnknownRow;
      // Snapshot now — Dexie may mutate `obj` between the hook and
      // our deferred work (e.g. if downstream code fills fields).
      const snapshot = { ...obj };
      queueMicrotask(() => queueUpsert(cfg, snapshot));
    });

    table.hook('updating', (...args: unknown[]) => {
      if (!shouldSync()) return;
      const mods = (args[0] as UnknownRow) ?? {};
      const obj = (args[2] as UnknownRow) ?? {};
      // Post-update row = old obj merged with new mods.
      const merged = { ...obj, ...mods };
      queueMicrotask(() => queueUpsert(cfg, merged));
    });

    table.hook('deleting', (...args: unknown[]) => {
      if (!shouldSync()) return;
      const obj = (args[1] as UnknownRow | undefined) ?? {};
      const id = obj[cfg.idField];
      queueMicrotask(() => {
        if (typeof id === 'string' && id !== '') {
          void enqueue(cfg.dexie, 'delete', id, undefined);
        }
      });
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
