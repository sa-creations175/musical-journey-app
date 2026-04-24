import { useSyncStatus } from '../lib/sync/useSyncStatus';

/**
 * Compact sync status pill for the header. Shows one of three states:
 *
 *   - Offline  → amber "offline — changes will sync when you reconnect"
 *   - Pending  → subtle "syncing N…" while queue drains
 *   - (hidden) → fully in sync, online → nothing rendered
 */
export default function SyncIndicator() {
  const { offline, pending } = useSyncStatus();

  if (offline) {
    return (
      <span
        title="You're offline. Changes will upload when you reconnect."
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-amber-400/50 bg-amber-400/10 text-[11px] text-amber-700 dark:text-amber-300"
      >
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        offline
        {pending > 0 && <span className="text-[10px] opacity-70">· {pending}</span>}
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span
        title={`${pending} change${pending === 1 ? '' : 's'} queued to upload`}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-fluent/30 bg-fluent/5 text-[11px] text-fluent"
      >
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-fluent animate-pulse" />
        syncing {pending}
      </span>
    );
  }

  return null;
}
