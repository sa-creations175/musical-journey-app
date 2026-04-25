/**
 * Defer-until-ready primitive for code that writes to synced Dexie
 * tables on app mount (seeders, migrations, "ensure X exists" helpers).
 *
 * The bug this fixes: Dexie write hooks check `isPulling()` and
 * `getCurrentUserId()` to decide whether to enqueue a row to the sync
 * queue. If a seeder runs while the initial pull is in flight (true
 * during `phase === 'hydrating'`), every row it writes lands in local
 * Dexie BUT skips the queue. Worse, the in-flight pull is in 'replace'
 * mode for the initial sign-in and bulk-deletes those just-seeded rows
 * as orphans before they ever reach the cloud.
 *
 * Awaiting `whenSyncReady()` blocks the caller until SyncProvider has
 * finished its initial pull and flipped phase to 'ready'. After that
 * point, write hooks fire normally and the periodic drain will push
 * to the cloud.
 *
 * Lifecycle:
 *   - On import: a fresh promise is created in pending state.
 *   - SyncProvider calls `markSyncReady()` when phase flips to 'ready',
 *     which resolves the promise.
 *   - SyncProvider calls `resetSyncReady()` on sign-out so the next
 *     sign-in goes through the wait again.
 */

let resolveReady: (() => void) | null = null;
let readyPromise: Promise<void> = new Promise(resolve => { resolveReady = resolve; });
let isReady = false;

export function whenSyncReady(): Promise<void> {
  if (isReady) return Promise.resolve();
  return readyPromise;
}

export function markSyncReady(): void {
  if (isReady) return;
  isReady = true;
  resolveReady?.();
  resolveReady = null;
}

export function resetSyncReady(): void {
  isReady = false;
  readyPromise = new Promise(resolve => { resolveReady = resolve; });
}
