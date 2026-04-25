import { db } from '../db';
import { supabase } from '../supabase';
import { SYNC_TABLES } from './tables';
import { enqueue, drain } from './engine';
import { getCurrentUserId } from './currentUser';

/**
 * One-shot recovery utility: walk every synced Dexie table, find local
 * rows whose id is not present in the cloud for this user, and enqueue
 * them for upsert. Then drain.
 *
 * Use case: a seeder (or other write) ran while a pull was in flight,
 * landed in local Dexie but skipped the sync queue because the write
 * hooks no-op during pulls. Without this utility those rows live only
 * locally and the next replace-mode pull will wipe them.
 *
 * Idempotent — rows already in the cloud are skipped, so running this
 * twice in a row is safe and the second run reports zero pushed.
 *
 * Console:
 *   await window.__backfillUnsyncedRows()
 */
export async function backfillUnsyncedRows(): Promise<
  Array<{ table: string; localCount: number; cloudCount: number; pushed: number; error?: string }>
> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in. Sign in before running backfill.');

  const results: Array<{ table: string; localCount: number; cloudCount: number; pushed: number; error?: string }> = [];

  for (const cfg of SYNC_TABLES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<unknown[]> } | undefined>)[cfg.dexie];
    if (!table || typeof table.toArray !== 'function') {
      results.push({ table: cfg.dexie, localCount: 0, cloudCount: 0, pushed: 0, error: 'table not found' });
      continue;
    }

    const localRows = (await table.toArray()) as Array<Record<string, unknown>>;
    if (localRows.length === 0) {
      results.push({ table: cfg.dexie, localCount: 0, cloudCount: 0, pushed: 0 });
      continue;
    }

    // Pull cloud ids for this table. Pagination keeps us under the
    // Supabase 1000-row default; same approach the engine uses.
    const cloudIds = new Set<string>();
    let from = 0;
    const PAGE = 1000;
    let cloudCount = 0;
    let fetchError: string | undefined;
    while (true) {
      const { data, error } = await supabase
        .from(cfg.pg)
        .select('id')
        .eq('user_id', userId)
        .range(from, from + PAGE - 1);
      if (error) {
        fetchError = error.message;
        break;
      }
      if (!data || data.length === 0) break;
      for (const row of data) {
        const id = (row as { id?: unknown }).id;
        if (typeof id === 'string') cloudIds.add(id);
      }
      cloudCount += data.length;
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (fetchError) {
      results.push({ table: cfg.dexie, localCount: localRows.length, cloudCount, pushed: 0, error: fetchError });
      continue;
    }

    let pushed = 0;
    for (const row of localRows) {
      const id = row[cfg.idField];
      if (typeof id !== 'string' || id === '') continue;
      if (cloudIds.has(id)) continue;
      await enqueue(cfg.dexie, 'upsert', id, row);
      pushed += 1;
    }

    results.push({ table: cfg.dexie, localCount: localRows.length, cloudCount, pushed });
  }

  // Push everything we just enqueued.
  await drain();

  return results;
}

/**
 * Expose the backfill on `window` so it can be invoked from the
 * browser console. Dev-only convenience — production callers would go
 * through a Settings UI button (deferred).
 */
declare global {
  interface Window {
    __backfillUnsyncedRows?: typeof backfillUnsyncedRows;
  }
}

if (typeof window !== 'undefined') {
  window.__backfillUnsyncedRows = backfillUnsyncedRows;
}
