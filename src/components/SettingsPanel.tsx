import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { getPref } from '../lib/userPrefs';
import { useUserName } from '../modules/dashboard/userName';
import { useAuth } from '../lib/auth/useAuth';
import { useSyncStatus } from '../lib/sync/useSyncStatus';
import { useDevMode } from '../lib/devMode';
import {
  PREF_LAST_EXPORTED_AT,
  exportBackup,
  readBackupFile,
  restoreBackup,
  type BackupFile,
} from '../lib/backup';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'exported' }
  | { kind: 'error'; message: string }
  | { kind: 'restoring' }
  | { kind: 'restored' };

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function AccountSection() {
  const { user, signOut } = useAuth();
  const { offline, pending, refresh } = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  if (!user) return null;
  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        account
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2">
        signed in as <span className="font-medium">{user.email}</span>
      </p>
      <p className="text-xs text-neutral-500 mb-3">
        practice data syncs automatically across devices.
        {pending > 0 && ` ${pending} change${pending === 1 ? '' : 's'} pending upload.`}
        {offline && ' currently offline.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRefresh}
          disabled={refreshing || offline}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-50"
        >
          {refreshing ? 'refreshing…' : 'refresh from cloud'}
        </button>
        <button
          onClick={signOut}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-needswork hover:text-needswork"
        >
          sign out
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2">
        signing out clears this device's local cache. your cloud data is untouched — sign back in to restore.
      </p>
    </section>
  );
}

/**
 * Developer section — Dev Mode toggle. When ON, practice-data writes
 * (attempts, spacingState, drillSessions) are suppressed so test
 * sessions don't pollute real history. Lives in sessionStorage, so it
 * resets to OFF on every refresh — the toggle copy says so, and the
 * header DEV badge makes an active session impossible to miss.
 */
function DeveloperSection() {
  const { devMode, toggleDevMode } = useDevMode();
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        developer
      </h4>
      <button
        type="button"
        role="switch"
        aria-checked={devMode}
        onClick={toggleDevMode}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm text-neutral-700 dark:text-neutral-200">
            Dev Mode — suppress practice data writes
          </span>
          <span className="block text-[11px] text-neutral-500 mt-0.5">
            skips attempts, spacing, and drill-session writes. resets to off
            on refresh.
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${
            devMode ? 'bg-fluent' : 'bg-neutral-300 dark:bg-neutral-600'
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform ${
              devMode ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
    </section>
  );
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userName, saveUserName] = useUserName();
  const [nameDraft, setNameDraft] = useState(userName);
  // Sync the draft with the stored pref whenever the panel opens (or
  // when the stored value changes via the Dashboard inline editor).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setNameDraft(userName);
  }, [open, userName]);
  const commitName = async () => {
    if (nameDraft !== userName) await saveUserName(nameDraft);
  };

  const lastExportedAt = useLiveQuery(
    async () => getPref<number>(PREF_LAST_EXPORTED_AT, 0),
    [],
  ) ?? 0;

  const handleExport = async () => {
    setStatus({ kind: 'idle' });
    try {
      await exportBackup();
      setStatus({ kind: 'exported' });
    } catch {
      setStatus({ kind: 'error', message: 'Export failed. Please try again.' });
    }
  };

  const handlePickFile = () => {
    setStatus({ kind: 'idle' });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    const result = await readBackupFile(file);
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    setPendingBackup(result.backup);
  };

  const handleConfirmRestore = async () => {
    if (!pendingBackup) return;
    setStatus({ kind: 'restoring' });
    try {
      await restoreBackup(pendingBackup);
      setPendingBackup(null);
      setStatus({ kind: 'restored' });
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      setPendingBackup(null);
      setStatus({ kind: 'error', message: 'Restore failed. Your data is unchanged.' });
    }
  };

  const pendingBackupDate = pendingBackup
    ? new Date(pendingBackup.exportedAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : '';

  return (
    <>
      <Modal open={open} onClose={onClose} title="settings">
        <div className="space-y-6">
          <section>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
              your name
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2">
              used in the dashboard greeting. leave blank to reset to the default.
            </p>
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                placeholder="your name"
                className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              />
              <button
                onClick={commitName}
                className="px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent"
              >
                save
              </button>
            </div>
          </section>

          <section>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
              data backup &amp; restore
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
              your practice data is stored in this browser. export regularly to back it up,
              or to move data between devices.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={handleExport}
                className="px-4 min-h-[40px] rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                export my data
              </button>
              <button
                onClick={handlePickFile}
                className="px-4 min-h-[40px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent"
              >
                import backup file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <p className="text-xs text-neutral-500">
              last exported: {lastExportedAt > 0 ? formatDate(lastExportedAt) : 'never exported'}
            </p>

            {status.kind === 'exported' && (
              <div className="mt-3 rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
                backup downloaded. save it somewhere safe (google drive, icloud, your documents folder).
              </div>
            )}
            {status.kind === 'restoring' && (
              <div className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs text-neutral-500">
                restoring…
              </div>
            )}
            {status.kind === 'restored' && (
              <div className="mt-3 rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
                backup restored successfully. refreshing the page…
              </div>
            )}
            {status.kind === 'error' && (
              <div className="mt-3 rounded-lg border border-needswork/40 bg-needswork/10 px-3 py-2 text-xs text-needswork flex items-start justify-between gap-2">
                <span>{status.message}</span>
                <button
                  onClick={() => setStatus({ kind: 'idle' })}
                  aria-label="dismiss"
                  className="shrink-0 hover:opacity-80"
                >
                  ×
                </button>
              </div>
            )}
          </section>

          <section>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
              harmonic diary
            </h4>
            <p className="text-sm text-neutral-500">
              the diary currently uses a single earthy botanical palette. dynamic
              emotion-based theming is planned for a future update.
            </p>
          </section>

          <AccountSection />

          <section>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
              more settings
            </h4>
            <p className="text-sm text-neutral-500">
              more settings coming soon — daily goals per module, notification preferences,
              theme options, and more.
            </p>
          </section>

          <DeveloperSection />
        </div>
      </Modal>

      {pendingBackup && (
        <Modal
          open
          onClose={() => setPendingBackup(null)}
          title="restore from backup?"
          footer={
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <button
                data-autofocus
                onClick={() => setPendingBackup(null)}
                className="px-4 min-h-[44px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-neutral-400"
              >
                cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                className="px-4 min-h-[44px] rounded-lg bg-needswork text-white text-sm font-medium hover:opacity-90"
              >
                yes, restore backup
              </button>
            </div>
          }
        >
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            this will replace <span className="font-medium">all</span> your current practice data
            with the backup from <span className="font-medium">{pendingBackupDate}</span>.
            your current data will be lost. this cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
