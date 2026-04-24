import { useContext } from 'react';
import { SyncContext, type SyncStatus } from './SyncContext';

/** Read-only sync status — phase, offline flag, pending queue count. */
export function useSyncStatus(): SyncStatus {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    // Not inside <SyncProvider> (e.g. rendered at sign-in screen);
    // surface a benign default so the caller doesn't have to handle
    // null everywhere.
    return { phase: 'idle', offline: false, pending: 0, error: null };
  }
  return ctx;
}
