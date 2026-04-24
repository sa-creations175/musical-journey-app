import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { installSyncHooks } from './hooks';
import { setCurrentUserId } from './currentUser';
import { pullAll, drain, clearLocalCache } from './engine';
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

  // Live count of pending queue items → drives the UI badge.
  const pending = useLiveQuery(async () => db.syncQueue.count(), []) ?? 0;

  // Install hooks exactly once, before any user-triggered writes.
  useEffect(() => {
    if (hooksInstalledRef.current) return;
    installSyncHooks();
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
        await pullAll();
        setPhase('ready');
        // Kick the drain in case hooks had queued anything before
        // the user existed (first page load).
        void drain();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'sync error';
        setError(msg);
        setPhase('error');
      }
    }
  }, [user?.id]);

  // Online/offline tracking. When we come back online, try to drain.
  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      void drain();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Periodic drain — catches queue entries enqueued while online but
  // after the last drain (e.g. a burst of user edits). 5s is frequent
  // enough that the user doesn't wait long for their device B to see
  // changes, but not so frequent that we hammer Supabase.
  useEffect(() => {
    if (phase !== 'ready') return;
    const h = window.setInterval(() => { void drain(); }, 5000);
    return () => window.clearInterval(h);
  }, [phase]);

  const value: SyncStatus = useMemo(
    () => ({ phase, offline, pending, error }),
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
