import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { localDayKey } from '../lib/dailyGoal';
import { getPref, setPref } from '../lib/userPrefs';
import { PREF_LAST_EXPORTED_AT, exportBackup } from '../lib/backup';

const PREF_SNOOZE = 'exportReminderSnoozedUntil';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const REMINDER_THRESHOLD_DAYS = 7;

// Shows when the user has practiced on 7+ distinct days since their last
// export (or 7+ distinct practice days total if they've never exported)
// and isn't currently snoozed. Dismisses gracefully — no pop-ups, no
// browser notifications.
export default function BackupReminderBanner() {
  const shouldShow = useLiveQuery(async () => {
    const snoozedUntil = await getPref<number>(PREF_SNOOZE, 0);
    if (Date.now() < snoozedUntil) return false;
    const lastExport = await getPref<number>(PREF_LAST_EXPORTED_AT, 0);
    const attempts = await db.attempts.where('timestamp').above(lastExport).toArray();
    const distinctDays = new Set<string>();
    for (const a of attempts) distinctDays.add(localDayKey(new Date(a.timestamp)));
    return distinctDays.size >= REMINDER_THRESHOLD_DAYS;
  }, []) ?? false;

  if (!shouldShow) return null;

  const onExport = async () => {
    try { await exportBackup(); } catch {
      // Swallow; user can try again from settings if it failed.
    }
  };

  const onSnooze = async () => {
    await setPref(PREF_SNOOZE, Date.now() + SNOOZE_MS);
  };

  return (
    <div className="border-b border-developing/30 bg-developing/10 px-4 sm:px-6 py-2 flex items-center gap-3 flex-wrap text-sm">
      <span className="text-neutral-700 dark:text-neutral-200">
        it's been a while since your last backup. export now to keep your practice data safe.
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onExport}
          className="px-2.5 py-1 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
        >
          export now
        </button>
        <button
          onClick={onSnooze}
          className="px-2.5 py-1 rounded-md text-xs text-neutral-600 dark:text-neutral-300 hover:text-fluent"
        >
          remind me later
        </button>
      </div>
    </div>
  );
}
