import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { Link } from 'react-router-dom';
import { getPref, setPref } from '../lib/userPrefs';
import { MODULE_ORDER, type ModuleMeta } from '../lib/moduleMeta';
import {
  DAILY_GOAL_UNITS,
  DAILY_GOAL_UNIT_LABEL,
  DEFAULT_MODULE_GOAL,
  MAX_DAILY_GOAL,
  isNumericGoal,
  isValidGoalAmount,
  moduleGoalKey,
  normaliseModuleGoal,
  type DailyGoalUnit,
  type ModuleDailyGoal,
} from '../lib/goalConfig';
import { useUserName } from '../modules/dashboard/userName';
import { useAuth } from '../lib/auth/useAuth';
import { useSyncStatus } from '../lib/sync/useSyncStatus';
import { useDevMode } from '../lib/devMode';
import SyncDiagnosticsSection from './SyncDiagnosticsSection';
import RepertoireKeyDiagnostics from './RepertoireKeyDiagnostics';
import PracticeWindowSettingsSection from '../modules/repertoire/PracticeWindowSettingsSection';
import FreshnessSettingsSection from '../modules/dashboard/mobile/FreshnessSettingsSection';
import SeededKeyRowsPanel from '../modules/repertoire/SeededKeyRowsPanel';
import SettingsSection from './settings/SettingsSection';
import SpellingSection from './settings/SpellingSection';
import {
  SETTINGS_SECTIONS, readOpenSection, sectionNumber, sectionTitle,
  titleCaseModule, writeOpenSection, type SettingsSectionId,
} from './settings/settingsSections';
import RatingsSection from './settings/RatingsSection';
import UnlockingSection from './settings/UnlockingSection';
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
        Account & Sync
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <p className="text-xs text-neutral-500 mb-3">
        Practice data syncs automatically across devices.
        {pending > 0 && ` ${pending} change${pending === 1 ? '' : 's'} pending upload.`}
        {offline && ' Currently offline.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRefresh}
          disabled={refreshing || offline}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-50"
        >
          {refreshing ? 'refreshing…' : 'Refresh from Cloud'}
        </button>
        <button
          onClick={signOut}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-needswork hover:text-needswork"
        >
          Sign Out
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2">
        Signing out clears this device&apos;s local cache. Your cloud data is untouched. Sign back in to restore.
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
        Developer
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
            Dev Mode: Suppress Practice Data Writes
          </span>
          <span className="block text-[11px] text-neutral-500 mt-0.5">
            Skips attempts, spacing, and drill-session writes. Resets to off
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

/**
 * Daily goals, one block per module.
 *
 * =====================================================================
 * THE UNIT COMES FIRST, AND IT DECIDES WHETHER THERE IS A NUMBER.
 *
 * Picking "any practice" does not set the number to zero — it stores a
 * goal with no `amount` field at all, so nothing stale sits behind the
 * hidden input and nothing can read a number that is not there. See
 * `ModuleDailyGoal`.
 * =====================================================================
 *
 * THE MODULE LIST IS `MODULE_ORDER`, not a list typed here: a module
 * added to the app arrives in this panel with the goal every module
 * ships with, and in the same pedagogical order the sidebar uses.
 */
function ModuleGoalRow({ module }: { module: ModuleMeta }) {
  /**
   * The SELECTED unit and the TYPED number are held apart from the
   * stored goal, and only a valid pair is written.
   *
   * The alternative — one `ModuleDailyGoal` in state — needs a value
   * for `amount` the moment a numeric unit is picked, before anything
   * has been typed. The only value available is 0, which is the
   * number this whole design exists to keep out of a goal. So an
   * unfinished edit stays unfinished: the module keeps the goal it
   * had until a usable number exists.
   */
  const [unit, setUnit] = useState<DailyGoalUnit>(DEFAULT_MODULE_GOAL.unit);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let live = true;
    void getPref<unknown>(moduleGoalKey(module.id), null)
      .then(raw => {
        if (!live) return;
        const stored = normaliseModuleGoal(raw);
        setUnit(stored.unit);
        setDraft(isNumericGoal(stored) ? String(stored.amount) : '');
      });
    return () => { live = false; };
  }, [module.id]);

  const store = (next: ModuleDailyGoal) => {
    void setPref(moduleGoalKey(module.id), next);
  };

  const pickUnit = (next: DailyGoalUnit) => {
    setUnit(next);
    if (next === 'any-practice') {
      // The stored goal loses its amount entirely, so nothing stale
      // waits behind the hidden field.
      setDraft('');
      store({ unit: next });
      return;
    }
    const amount = Number(draft);
    if (isValidGoalAmount(amount)) store({ unit: next, amount });
  };

  const pickAmount = (raw: string) => {
    setDraft(raw);
    if (unit === 'any-practice') return;
    const amount = Number(raw);
    if (isValidGoalAmount(amount)) store({ unit, amount });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* TITLE CASE ON THIS PAGE ONLY — see `titleCaseModule`. A
          settings screen naming "ear training" beside a section called
          "Understanding App Ratings" reads as two different products. */}
      <span className="text-sm min-w-[9rem]">{titleCaseModule(module.label)}</span>
      <select
        value={unit}
        onChange={e => pickUnit(e.target.value as DailyGoalUnit)}
        aria-label={`${module.label} daily goal unit`}
        data-testid="module-goal-unit"
        data-module={module.id}
        className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
      >
        {DAILY_GOAL_UNITS.map(u => (
          <option key={u} value={u}>{DAILY_GOAL_UNIT_LABEL[u]}</option>
        ))}
      </select>
      {/* NO FIELD AT ALL ON "ANY PRACTICE" — not a disabled one holding
          a number the goal no longer has. */}
      {unit !== 'any-practice' && (
        <input
          type="number"
          min={1}
          max={MAX_DAILY_GOAL}
          value={draft}
          onChange={e => pickAmount(e.target.value)}
          aria-label={`${module.label} daily goal amount`}
          data-testid="module-goal-amount"
          data-module={module.id}
          className="w-20 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
        />
      )}
    </div>
  );
}

function DailyGoalsSection() {
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        Daily Goals Per Module
      </h4>
      <div className="space-y-2" data-testid="daily-goals">
        {MODULE_ORDER.map(m => <ModuleGoalRow key={m.id} module={m} />)}
      </div>
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

  /**
   * Which section is open, remembered per device.
   *
   * ONE AT A TIME, and `null` is a legitimate state — every section
   * closed is what the page opens as on a device that has never been
   * here. Toggling the open one closes it rather than opening another.
   */
  const [openSection, setOpen] = useState<SettingsSectionId | null>(readOpenSection);
  const setOpenSection = (id: SettingsSectionId | null) => {
    setOpen(id);
    writeOpenSection(id);
  };

  /**
   * The props every section shares.
   *
   * A HELPER RETURNING PROPS, not a component defined in render. The
   * first draft was `const Section = ({id, children}) => …`, which
   * React treats as a NEW component type on every render — so every
   * open section unmounted and remounted whenever anything on the page
   * changed, and the name field lost the caret as you typed in it.
   */
  const sectionProps = (id: SettingsSectionId) => ({
    id,
    number: sectionNumber(id),
    title: sectionTitle(id),
    open: openSection === id,
    onToggle: () => setOpenSection(openSection === id ? null : id),
  });

  return (
    <>
      <Modal open={open} onClose={onClose} title="Settings">
        {/* =========================================================
            EIGHT SECTIONS, ALL CLOSED, IN A RULED ORDER.

            Silas's walked prototype of 10 Sep 2026. The page was one
            scroll of fourteen unlabelled lowercase blocks in the order
            they happened to be built; finding the export button meant
            reading everything above it.

            The chip row jumps to a section AND opens it, which is the
            whole of the navigation — see `SettingsSection`.
            ========================================================= */}
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
          Every section starts closed. Tap a title to open it, or a chip to
          jump to it.
        </p>
        <nav className="flex flex-wrap gap-1.5 mb-4" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              data-testid={`settings-chip-${s.id}`}
              onClick={() => setOpenSection(s.id)}
              aria-current={openSection === s.id}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                openSection === s.id
                  ? 'bg-fluent text-white font-semibold'
                  : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="space-y-3">
          <SettingsSection {...sectionProps('you')}>
            <section>
              <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                Your Name
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2">
                Used in the dashboard greeting. Leave blank to reset to the default.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="Your Name"
                  className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                />
                <button
                  onClick={commitName}
                  className="px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent"
                >
                  Save
                </button>
              </div>
            </section>

            <AccountSection />

            <section>
              <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                Harmonic Diary
              </h4>
              <p className="text-sm text-neutral-500">
                The diary currently uses a single earthy botanical palette. Dynamic
                emotion-based theming is planned for a future update.
              </p>
            </section>
          </SettingsSection>

          <SettingsSection {...sectionProps('ratings')}>
            <RatingsSection />
          </SettingsSection>

          <SettingsSection {...sectionProps('unlocking')}>
            <UnlockingSection />
          </SettingsSection>

          <SettingsSection {...sectionProps('spelling')}>
            <SpellingSection />
          </SettingsSection>

          <SettingsSection {...sectionProps('effort')}>
            <DailyGoalsSection />
            {/* BESIDE THE DAILY GOALS, because it is the same kind of
                setting: how much practice the reader asks of
                themselves. Not beside the spacing numbers, which decide
                when a CLAIM has to be re-proven. */}
            <PracticeWindowSettingsSection />
            {/* Beside the other two "how long before this counts as
                neglected" numbers. */}
            <FreshnessSettingsSection />
          </SettingsSection>

          <SettingsSection {...sectionProps('spacing')}>
            {/* THE NUMBERS MOVED. Four controls used to sit here — first
                interval, longest interval, due-soon and grace — editing
                song-key timing in a second place. They are now the Songs
                row of the spacing tree, which is the one place any
                timing number is set for anything. */}
            <section>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
                Every number that decides <em>when</em> something comes back to
                you, for songs and every other module, on one page. Ratings above
                decide what a card is; spacing decides when you see it again.
              </p>
              <Link
                to="/settings/spacing"
                onClick={onClose}
                className="inline-block px-4 min-h-[40px] leading-[40px] rounded-lg border
                  border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent
                  hover:text-fluent"
              >
                Open Spacing &amp; Scheduling
              </Link>
            </section>
          </SettingsSection>

          <SettingsSection {...sectionProps('data')}>
            <section>
              <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                Data Backup &amp; Restore
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
                Your practice data is stored in this browser. Export regularly to back it up,
                or to move data between devices.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={handleExport}
                  className="px-4 min-h-[40px] rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
                >
                  Export My Data
                </button>
                <button
                  onClick={handlePickFile}
                  className="px-4 min-h-[40px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent"
                >
                  Import Backup File
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
                Last exported: {lastExportedAt > 0 ? formatDate(lastExportedAt) : 'never exported'}
              </p>

              {status.kind === 'exported' && (
                <div className="mt-3 rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
                  Backup downloaded. Save it somewhere safe (Google Drive, iCloud, your Documents folder).
                </div>
              )}
              {status.kind === 'restoring' && (
                <div className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs text-neutral-500">
                  Restoring…
                </div>
              )}
              {status.kind === 'restored' && (
                <div className="mt-3 rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
                  Backup restored successfully. Refreshing the page…
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

            <SyncDiagnosticsSection />
            <RepertoireKeyDiagnostics />
            <SeededKeyRowsPanel />
          </SettingsSection>

          <SettingsSection {...sectionProps('dev')}>
            <DeveloperSection />
          </SettingsSection>
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
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                className="px-4 min-h-[44px] rounded-lg bg-needswork text-white text-sm font-medium hover:opacity-90"
              >
                Yes, Restore Backup
              </button>
            </div>
          }
        >
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            This will replace <span className="font-medium">All</span> your current practice data
            with the backup from <span className="font-medium">{pendingBackupDate}</span>.
            Your current data will be lost. This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
