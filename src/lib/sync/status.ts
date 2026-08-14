import { db } from '../db';
import { supabase } from '../supabase';
import { SYNC_TABLES } from './tables';
import { getCurrentUserId } from './currentUser';

/**
 * Read-only sync diagnostics — per-table local vs cloud row counts,
 * outbound queue depth, and the last error the drain recorded.
 *
 * ---------------------------------------------------------------
 * WHY THIS EXISTS AS UI RATHER THAN A CONSOLE HELPER
 *
 * The console handles (`__backfillUnsyncedRows`, `__backfillDailySummaries`)
 * are unreachable inside the installed PWA on iOS, which is exactly
 * the device whose sync state is hardest to reason about. A sync
 * problem you cannot inspect on the device having the problem is not
 * diagnosable.
 *
 * `db` stays off `window` in production — that gate is correct, since
 * it would hand out unguarded deletes. This module is the alternative:
 * a fixed, read-only report.
 * ---------------------------------------------------------------
 *
 * NOTHING HERE WRITES. No enqueue, no upsert, no Dexie mutation. It is
 * safe to run at any time, including mid-drain, and safe to run twice.
 *
 * Cloud counts use a HEAD request with `count: 'exact'` rather than
 * fetching ids. `backfillUnsyncedRows` has to paginate every id because
 * it diffs them; a count needs one cheap round trip per table, which
 * across ~40 tables is the difference between a usable button and a
 * slow one on a phone.
 */

export interface SyncTableStatus {
  /** Dexie table name. */
  table: string;
  /** Postgres table name. */
  pg: string;
  /** Rows in the local database. */
  local: number;
  /** Rows in the cloud for this user, or null when the query failed. */
  cloud: number | null;
  /** Present when the cloud count could not be read. */
  error?: string;
}

export interface SyncStatusReport {
  tables: SyncTableStatus[];
  /** Un-pushed writes waiting in the outbound queue. Should settle at 0. */
  queueDepth: number;
  /** Most recent drain failure still recorded on a queued item. */
  lastError: string | null;
  lastErrorTable: string | null;
  /** Highest retry count on any queued item — a climbing number means
   *  the queue is wedged rather than merely busy. */
  maxAttempts: number;
  signedIn: boolean;
  offline: boolean;
  checkedAt: number;
}

/**
 * Order rows so the interesting ones are at the top: `attempts` first
 * (the table being verified after the cross-device merge), then any
 * table whose local and cloud counts disagree, then the rest
 * alphabetically.
 *
 * Pure, and exported for its own tests — on a 40-row readout the
 * ordering IS the usability.
 */
export function orderStatusRows(
  rows: ReadonlyArray<SyncTableStatus>,
): SyncTableStatus[] {
  const rank = (row: SyncTableStatus): number => {
    if (row.table === 'attempts') return 0;
    // Unknown cloud count is a problem, not agreement.
    if (row.cloud === null) return 1;
    if (row.cloud !== row.local) return 1;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.table.localeCompare(b.table);
  });
}

/** Local row count for one configured table, 0 when the table is absent. */
async function localCount(dexieTable: string): Promise<number> {
  const table = (db as unknown as Record<string, { count?: () => Promise<number> }>)[dexieTable];
  if (!table || typeof table.count !== 'function') return 0;
  try {
    return await table.count();
  } catch {
    return 0;
  }
}

/**
 * Collect the full report. Never throws — a table that cannot be read
 * reports `cloud: null` with its error rather than aborting the sweep,
 * because a partial report still tells you which tables are fine.
 */
export async function collectSyncStatus(): Promise<SyncStatusReport> {
  const userId = getCurrentUserId();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const queueItems = await db.syncQueue.toArray().catch(() => []);
  const errored = queueItems.filter(it => it.lastError);
  const withMostAttempts = queueItems.reduce<number>(
    (max, it) => Math.max(max, it.attempts ?? 0),
    0,
  );

  const tables = await Promise.all(
    SYNC_TABLES.map(async (cfg): Promise<SyncTableStatus> => {
      const local = await localCount(cfg.dexie);
      if (!userId || offline) {
        return { table: cfg.dexie, pg: cfg.pg, local, cloud: null,
          error: !userId ? 'not signed in' : 'offline' };
      }
      const { count, error } = await supabase
        .from(cfg.pg)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) {
        return { table: cfg.dexie, pg: cfg.pg, local, cloud: null, error: error.message };
      }
      return { table: cfg.dexie, pg: cfg.pg, local, cloud: count ?? 0 };
    }),
  );

  return {
    tables: orderStatusRows(tables),
    queueDepth: queueItems.length,
    lastError: errored.length > 0 ? (errored[errored.length - 1].lastError ?? null) : null,
    lastErrorTable: errored.length > 0 ? errored[errored.length - 1].tableName : null,
    maxAttempts: withMostAttempts,
    signedIn: Boolean(userId),
    offline,
    checkedAt: Date.now(),
  };
}

/**
 * Console handle, alongside `__backfillUnsyncedRows`. Read-only, so it
 * carries none of the risk that keeps `db` dev-gated. The Settings UI
 * is the real interface — this is convenience on a desktop where a
 * console is available.
 */
declare global {
  interface Window {
    __syncStatus?: typeof collectSyncStatus;
  }
}

if (typeof window !== 'undefined') {
  window.__syncStatus = collectSyncStatus;
}
