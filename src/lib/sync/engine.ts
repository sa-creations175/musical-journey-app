import { db, type SyncQueueItem } from '../db';
import { supabase } from '../supabase';
import {
  SYNC_TABLES,
  SYNC_TABLE_BY_DEXIE,
  type SyncTableConfig,
} from './tables';
import { beginPull, endPull } from './pullLock';
import { getCurrentUserId } from './currentUser';

/**
 * Translate a Dexie row into the Postgres row shape the sync layer
 * upserts. The whole Dexie row lives in `data` (JSONB) so nothing is
 * lost; the indexed top-level columns (`added_date`, `song_id`, etc.)
 * are extracted per the table config.
 */
function toPgRow(cfg: SyncTableConfig, dexieRow: unknown, userId: string): Record<string, unknown> {
  const row = dexieRow as Record<string, unknown>;
  const id = row[cfg.idField];
  if (typeof id !== 'string' || id === '') {
    throw new Error(`[sync] missing id for ${cfg.dexie}: ${JSON.stringify(row)}`);
  }
  const pgRow: Record<string, unknown> = {
    id,
    user_id: userId,
    data: row,
  };
  for (const col of cfg.topLevel) {
    const val = row[col.dexie];
    pgRow[col.pg] = val === undefined ? null : val;
  }
  return pgRow;
}

/** Pull every synced table for the current user and overwrite the
 *  local Dexie state. Called on sign-in — this is the "one-shot
 *  hydrate" that makes device B mirror device A before the user
 *  interacts.
 *
 *  Paginates in batches of 1000 to stay under the Supabase default
 *  row limit. Wraps the Dexie writes in `beginPull/endPull` so write
 *  hooks skip enqueueing (otherwise we'd immediately echo everything
 *  we just pulled back to the cloud).
 *
 *  `mode` decides what to do with local rows that DON'T appear in the
 *  cloud response:
 *    - 'additive' (default): leave them alone. Safe when the sync
 *      queue still has outbound writes — we don't want to delete a
 *      row the user just created locally but hasn't yet pushed.
 *    - 'replace': treat cloud as source of truth. Local rows whose
 *      id isn't in the cloud set get bulkDeleted so deletes made on
 *      another device propagate down. Use this only when the sync
 *      queue is empty (all local writes have reached the cloud). */
export async function pullAll(mode: 'additive' | 'replace' = 'additive'): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;
  beginPull();
  try {
    for (const cfg of SYNC_TABLES) {
      await pullOneTable(cfg, userId, mode);
    }
  } finally {
    endPull();
  }
}

async function pullOneTable(
  cfg: SyncTableConfig,
  userId: string,
  mode: 'additive' | 'replace',
): Promise<void> {
  const PAGE = 1000;
  let from = 0;
  const cloudRows: Record<string, unknown>[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(cfg.pg)
      .select('id, data, updated_at')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // Leave local state untouched on error — partial reconciliation
      // is worse than stale. The next pull (on focus / reconnect) will
      // try again.
      console.warn(`[sync] pull ${cfg.pg} failed`, error);
      return;
    }
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ data: Record<string, unknown> | null }>) {
      if (row.data) cloudRows.push(row.data);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const table = (db as unknown as Record<string, DexieMiniTable | undefined>)[cfg.dexie];
  if (!table) return;

  // Replace mode: drop local rows that aren't in cloud. Runs BEFORE
  // the bulkPut so bulkDelete/bulkPut aren't fighting over the same
  // primary keys. beginPull is already active, so the delete hooks
  // don't echo back to Supabase.
  if (mode === 'replace') {
    const cloudIds = new Set<string>();
    for (const row of cloudRows) {
      const id = row[cfg.idField];
      if (typeof id === 'string' && id !== '') cloudIds.add(id);
    }
    const localRows = (await table.toArray()) as Array<Record<string, unknown>>;
    const orphanIds = computeOrphanIdsForReplacePull(
      localRows,
      cloudIds,
      cfg.idField,
      Date.now(),
    );
    if (orphanIds.length > 0) {
      await table.bulkDelete(orphanIds);
    }
  }

  // Overwrite guard: never bulkPut a cloud row on top of a local row
  // that still has an un-pushed write sitting in the sync queue. In that
  // window the cloud copy we just fetched is stale relative to the
  // pending local edit (the classic "save during a session, then a
  // focus-triggered pull reverts it" race). The local version wins until
  // its queued write reaches the cloud; a later pull then reflects the
  // now-matching cloud state. Applies to ALL tables — any pending write,
  // upsert or delete (a pending delete must not be resurrected either).
  const pendingItems = await db.syncQueue.where('tableName').equals(cfg.dexie).toArray();
  const pendingIds = new Set<string>(pendingItems.map(it => it.rowId));
  const rowsToPut = pendingIds.size === 0
    ? cloudRows
    : cloudRows.filter(row => {
        const id = row[cfg.idField];
        return !(typeof id === 'string' && pendingIds.has(id));
      });

  if (rowsToPut.length > 0) {
    await table.bulkPut(rowsToPut);
  }
}

/** The slice of the Dexie Table type we actually need inside pull. */
type DexieMiniTable = {
  bulkPut: (rows: unknown[]) => Promise<unknown>;
  bulkDelete: (ids: string[]) => Promise<unknown>;
  toArray: () => Promise<unknown[]>;
};

/**
 * Local rows whose `updatedAt` falls within this window of the pull's
 * start are treated as pending-push candidates: they may have been
 * written milliseconds ago and not yet drained into Supabase, so
 * replace-pull mustn't delete them as orphans. 60 seconds covers the
 * `setTimeout(fn, 0)` defer in the Dexie write hook plus realistic
 * drain + network latency, with headroom for a slow connection.
 *
 * Tables without an `updatedAt` field get no protection — the legacy
 * behavior holds. Add the field to any table that needs guarding,
 * and the protection picks it up automatically.
 */
export const PENDING_PUSH_PROTECTION_MS = 60_000;

/**
 * Pure orphan-id computation for replace-mode pull. Extracted as an
 * export so the protection rule can be unit-tested without spinning
 * up Supabase. Returns the ids of local rows that:
 *   · have a valid string id
 *   · don't appear in the cloud id set
 *   · either lack an `updatedAt` field or have an `updatedAt` older
 *     than `now - PENDING_PUSH_PROTECTION_MS`
 *
 * The third clause is the recent-write protection — it preserves
 * local writes that haven't had a chance to push yet.
 */
export function computeOrphanIdsForReplacePull(
  localRows: ReadonlyArray<Record<string, unknown>>,
  cloudIds: ReadonlySet<string>,
  idField: string,
  now: number,
): string[] {
  const orphans: string[] = [];
  for (const row of localRows) {
    const id = row[idField];
    if (typeof id !== 'string' || id === '') continue;
    if (cloudIds.has(id)) continue;
    const updatedAt = row.updatedAt;
    if (
      typeof updatedAt === 'number'
      && now - updatedAt < PENDING_PUSH_PROTECTION_MS
    ) continue;
    orphans.push(id);
  }
  return orphans;
}

/**
 * Enqueue a sync job. Called from the Dexie write hooks on every
 * create/update/delete of a synced table. The queue survives page
 * reloads, so writes made while offline persist until the drain loop
 * succeeds.
 */
export async function enqueue(
  tableName: string,
  operation: 'upsert' | 'delete',
  rowId: string,
  rowData: unknown,
): Promise<void> {
  // Code-seeded "system" rows never sync — they're rebuilt from code on
  // every device (e.g. voicingPatterns; see VOICING_CAROUSEL_DESIGN.md).
  // Skipping at this single boundary covers BOTH the live write-hooks and
  // the initial backfill (both funnel through here). No-op for every other
  // table — none else carries an `isSystem` flag.
  if (
    operation === 'upsert' &&
    rowData != null &&
    (rowData as { isSystem?: unknown }).isSystem === true
  ) {
    return;
  }
  const item: SyncQueueItem = {
    tableName,
    operation,
    rowId,
    rowData: operation === 'upsert' ? rowData : undefined,
    queuedAt: Date.now(),
    attempts: 0,
  };
  try {
    await db.syncQueue.add(item);
  } catch (err) {
    // Enqueue failure is unusual (would mean Dexie itself is broken).
    // Log and move on — the local write already succeeded, so the
    // user isn't blocked.
    console.warn('[sync] enqueue failed', err);
  }
}

/** Drain-loop state. Prevents overlapping drains which would double-
 *  send the same queue entry. */
let draining = false;

/**
 * Process pending queue entries. Best effort — if a write fails we
 * leave it in the queue and try again next tick. Silent on success.
 *
 * Batches upserts by table for efficiency: all pending upserts to
 * `songs` go in one call, etc. Deletes are issued one at a time
 * (they're rare).
 */
export async function drain(): Promise<void> {
  if (draining) return;
  const userId = getCurrentUserId();
  if (!userId) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  draining = true;
  try {
    while (true) {
      const batch = await db.syncQueue.orderBy('id').limit(100).toArray();
      if (batch.length === 0) return;

      // Group upserts by table. Deletes are processed individually so
      // they stay ordered relative to any upserts that precede them.
      const upsertsByTable = new Map<string, SyncQueueItem[]>();
      const sequential: SyncQueueItem[] = [];
      for (const item of batch) {
        if (item.operation === 'upsert' && upsertsByTable.has(item.tableName)) {
          upsertsByTable.get(item.tableName)!.push(item);
        } else if (item.operation === 'upsert') {
          upsertsByTable.set(item.tableName, [item]);
        } else {
          sequential.push(item);
        }
      }

      const processed: number[] = [];

      // Bulk upserts, one call per table.
      for (const [tableName, items] of upsertsByTable) {
        const cfg = SYNC_TABLE_BY_DEXIE.get(tableName);
        if (!cfg) {
          // Drop unknown-table jobs so they don't clog the queue
          // (e.g., Phase B table added, then removed).
          for (const it of items) if (it.id != null) processed.push(it.id);
          continue;
        }
        // Dedup by rowId inside this batch — if the same row got
        // updated twice back-to-back, we only need the latest row
        // shape. Iterate in order; later writes override earlier.
        const latest = new Map<string, SyncQueueItem>();
        for (const it of items) latest.set(it.rowId, it);
        const rows = [...latest.values()]
          .map(it => {
            try {
              return toPgRow(cfg, it.rowData, userId);
            } catch (e) {
              console.warn('[sync] toPgRow failed', e);
              return null;
            }
          })
          .filter((r): r is Record<string, unknown> => r !== null);
        if (rows.length === 0) {
          for (const it of items) if (it.id != null) processed.push(it.id);
          continue;
        }
        const { error } = await supabase
          .from(cfg.pg)
          .upsert(rows, { onConflict: 'user_id,id' });
        if (error) {
          console.warn(`[sync] upsert ${cfg.pg} failed`, error.message);
          // Leave the batch in place; bump attempts so repeated
          // failures are visible.
          for (const it of items) {
            if (it.id != null) {
              await db.syncQueue.update(it.id, {
                attempts: (it.attempts ?? 0) + 1,
                lastError: error.message,
              });
            }
          }
          // Stop draining this tick — we'll retry next online event.
          return;
        }
        for (const it of items) if (it.id != null) processed.push(it.id);
      }

      // Sequential deletes.
      for (const it of sequential) {
        const cfg = SYNC_TABLE_BY_DEXIE.get(it.tableName);
        if (!cfg) {
          if (it.id != null) processed.push(it.id);
          continue;
        }
        const { error } = await supabase
          .from(cfg.pg)
          .delete()
          .eq('user_id', userId)
          .eq('id', it.rowId);
        if (error) {
          console.warn(`[sync] delete ${cfg.pg} failed`, error.message);
          if (it.id != null) {
            await db.syncQueue.update(it.id, {
              attempts: (it.attempts ?? 0) + 1,
              lastError: error.message,
            });
          }
          return;
        }
        if (it.id != null) processed.push(it.id);
      }

      if (processed.length > 0) {
        await db.syncQueue.bulkDelete(processed);
      }
      if (batch.length < 100) return;
    }
  } finally {
    draining = false;
  }
}

/**
 * User-facing "pull latest from cloud and reconcile". Safe to call
 * from anywhere — on sign-in, on tab focus, or from a settings
 * button. Order matters:
 *
 *   1. Drain first so any local writes reach the cloud before we
 *      decide what rows exist there.
 *   2. If the queue is now empty, run a replace pull — cloud is the
 *      source of truth, local orphans get deleted.
 *   3. If the queue still has items (drain partially failed), run an
 *      additive pull instead so we don't wipe local rows that just
 *      haven't made it to the cloud yet.
 *
 * Returns the number of rows pulled is intentionally NOT returned —
 * the caller should read live queries for the UI.
 */
export async function refreshFromCloud(): Promise<void> {
  if (!getCurrentUserId()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  await drain();
  const pending = await db.syncQueue.count();
  await pullAll(pending === 0 ? 'replace' : 'additive');
}

/**
 * Wipe every synced Dexie table AND the sync queue. Used when the
 * user signs out, so the next person signing in on the same browser
 * doesn't see the previous account's cached data.
 *
 * Runs with beginPull/endPull so hooks don't enqueue teardown writes
 * (they'd be stale by the time the drain runs anyway).
 */
export async function clearLocalCache(): Promise<void> {
  beginPull();
  try {
    for (const cfg of SYNC_TABLES) {
      const table = (db as unknown as Record<string, { clear: () => Promise<void> }>)[cfg.dexie];
      if (table) await table.clear();
    }
    await db.syncQueue.clear();
  } finally {
    endPull();
  }
}
