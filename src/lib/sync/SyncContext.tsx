import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { installSyncHooks } from './hooks';
import { installMatrixSectionsHook } from '../../modules/repertoire/matrix/matrixSectionsSync';
import { setCurrentUserId } from './currentUser';
import { pullAll, drain, clearLocalCache, refreshFromCloud } from './engine';
import { markSyncReady, resetSyncReady } from './syncReady';
import './backfill'; // side-effect: registers window.__backfillUnsyncedRows
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export type SyncPhase = 'idle' | 'hydrating' | 'ready' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** True when navigator.onLine === false. Drives the offline banner. */
  offline: boolean;
  /** Count of queued sync jobs yet to push. 0 when fully synced. */
  pending: number;
  /** Last initial-pull error message, if any. */
  error: string | null;
  /** Manually trigger drain + pull. Used by the Settings "refresh
   *  from cloud" button when the user wants to force a reconcile. */
  refresh: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const SyncContext = createContext<SyncStatus | null>(null);

/**
 * Top-level sync controller. Rendered INSIDE <AuthGate> so it only
 * runs for signed-in users.
 *
 * On sign-in:
 *   1. Register the user id with the module-level sync state
 *      (so Dexie hooks know who to attribute writes to).
 *   2. Install write hooks on every Phase A Dexie table — once.
 *   3. Run an initial full pull from Supabase into Dexie so this
 *      device mirrors whatever other devices have written.
 *   4. Flip phase to 'ready' and render children.
 *
 * While the user is signed in:
 *   - A background timer calls drain() every few seconds. Each call
 *     pops queued jobs and pushes them to Supabase.
 *   - Online/offline events flip the offline flag and trigger drain
 *     whenever we reconnect.
 *
 * On sign-out:
 *   - Wipe local Dexie tables + sync queue so the next user on the
 *     same browser starts fresh.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [offline, setOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [error, setError] = useState<string | null>(null);
  const hooksInstalledRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Diagnostic: fires once per render. Confirms whether SyncProvider
  // is actually mounting and what its observable state is when it
  // does. Primary use is debugging "no sync logs appeared" — if this
  // line doesn't fire, the whole provider is AWOL.
  console.log('[sync] SyncProvider render', { phase, userId: user?.id ?? null });

  // Live count of pending queue items → drives the UI badge.
  const pending = useLiveQuery(async () => db.syncQueue.count(), []) ?? 0;

  // Install hooks exactly once, before any user-triggered writes.
  // Also reset the syncReady gate on every mount so a fresh sign-in
  // cycle (after the previous sign-out unmounted us) starts in
  // not-ready state — otherwise stale `isReady = true` from the prior
  // session would let seeders run during the new initial pull.
  useEffect(() => {
    resetSyncReady();
    if (hooksInstalledRef.current) return;
    installSyncHooks();
    // Matrix-sections reconciler: derives songMatrixSections from
    // songSections on every lead-sheet write. Installed alongside
    // the cloud sync hooks so both arrive in lockstep at app boot;
    // the reconciler is also idempotent + guarded against double
    // install internally, so order between the two doesn't matter.
    installMatrixSectionsHook();
    hooksInstalledRef.current = true;
  }, []);

  // Publish user id to module-level sync state + run initial pull on
  // sign-in, clear local cache on sign-out.
  useEffect(() => {
    const previousUserId = lastUserIdRef.current;
    const currentUserId = user?.id ?? null;

    if (currentUserId === previousUserId) return;
    lastUserIdRef.current = currentUserId;

    setCurrentUserId(currentUserId);

    if (!currentUserId) {
      // Signed out → wipe Dexie so the next sign-in starts clean.
      // State-in-effect is deliberate here: the `user` prop change
      // IS the external signal we're responding to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('idle');
      setError(null);
      resetSyncReady();
      void clearLocalCache();
      return;
    }

    // Signed in → hydrate from cloud.
    if (previousUserId && previousUserId !== currentUserId) {
      // Different user than before on the same page — clear local
      // first to avoid mixing two users' rows in Dexie.
      void clearLocalCache().then(runInitialPull);
    } else {
      void runInitialPull();
    }

    async function runInitialPull() {
      setPhase('hydrating');
      setError(null);
      try {
        // Drain first to push anything that queued up before the
        // user existed (stray writes on the sign-in screen, etc.),
        // then pull in replace mode so local orphans from a prior
        // broken-sync session get cleaned up.
        await drain();
        const pending = await db.syncQueue.count();
        await pullAll(pending === 0 ? 'replace' : 'additive');
        setPhase('ready');
        // Unblock seeders / migrations waiting on `whenSyncReady()`.
        // Must come AFTER the replace-mode pull so anything they write
        // lands in a quiet sync state (hooks enqueue normally, no
        // in-flight pull to wipe orphans).
        markSyncReady();
        // Final drain — any rows the replace-pull wrote that hadn't
        // settled to the cloud, plus anything enqueued during
        // hydration (shouldn't happen, but defensive).
        void drain();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'sync error';
        setError(msg);
        setPhase('error');
      }
    }
  }, [user?.id]);

  // Online/offline tracking. When we come back online, drain queued
  // writes AND pull latest (catches changes made on other devices
  // while this one was offline).
  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      void refreshFromCloud();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Refresh-on-focus. When the tab becomes visible again (user
  // switched back from another app, woke the phone, etc.), drain
  // local writes then pull latest from cloud. This is the main
  // mechanism for a change made on one device to land on another:
  // drain → pull replace → local mirrors cloud.
  //
  // Attached ONCE, at SyncProvider mount. No phase gate — the phase
  // gate previously here was the bug: if `phase` never reached
  // `'ready'` (e.g. because the initial pull errored into a caught
  // branch, or because runInitialPull was skipped on a rehydrated
  // session), listeners never attached at all. refreshFromCloud has
  // its own internal guards (signed-in + online checks), and the
  // pullLock is now reference-counted, so a focus-triggered pull
  // racing the initial-hydration pull is safe.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      console.log('[sync] tab focused, pulling from cloud');
      void refreshFromCloud().then(() => {
        console.log('[sync] tab-focused refresh complete');
      }).catch(err => {
        console.warn('[sync] tab-focused refresh errored', err);
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    console.log('[sync] tab-focus listeners attached');
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // Periodic drain — catches queue entries enqueued while online but
  // after the last drain (e.g. a burst of user edits). 5s is frequent
  // enough that the user doesn't wait long for their device B to see
  // changes, but not so frequent that we hammer Supabase. drain() is
  // itself a no-op when not signed in or offline, so leaving this
  // always-on is safe.
  useEffect(() => {
    const h = window.setInterval(() => { void drain(); }, 5000);
    return () => window.clearInterval(h);
  }, []);

  const value: SyncStatus = useMemo(
    () => ({
      phase,
      offline,
      pending,
      error,
      refresh: refreshFromCloud,
    }),
    [phase, offline, pending, error],
  );

  // While we're hydrating (first pull after sign-in), show a small
  // inline loading screen instead of the app — this prevents a flash
  // of empty data before cloud rows arrive, and ensures seed
  // functions that run on mount see the cloud-hydrated state.
  if (phase === 'hydrating') {
    return (
      <SyncContext.Provider value={value}>
        <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
          syncing your practice…
        </div>
      </SyncContext.Provider>
    );
  }

  if (phase === 'error') {
    return (
      <SyncContext.Provider value={value}>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-sm text-center space-y-2">
            <div className="text-sm font-medium">Can't reach the cloud.</div>
            <div className="text-xs text-neutral-500">
              {error ?? 'Please check your internet connection.'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
            >
              retry
            </button>
          </div>
        </div>
      </SyncContext.Provider>
    );
  }

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
