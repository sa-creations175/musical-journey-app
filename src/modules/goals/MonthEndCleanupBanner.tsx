import { useLiveQuery } from 'dexie-react-hooks';
import {
  deleteGoalsWithCascade,
  loadMonthEndCleanup,
  type MonthEndCleanup,
} from './monthEndCleanup';

/**
 * Month-start cleanup banner — "X May goals are unrecoverable.
 * Dismiss all / Select".
 *
 * Visibility rule (single condition): show while any previous-month
 * monthly goal is active AND mathematically unrecoverable (same
 * status the FeasibilityPill shows). Goals that hit their target
 * read as on_track past their deadline, so they never trigger this.
 *
 * useLiveQuery makes it reactive: Dismiss all (or deleting the last
 * qualifying goal through select mode / the row delete button)
 * mutates the goals table and the banner hides immediately.
 *
 * No confirmation dialog on Dismiss all by design — these goals are
 * mathematically done; dismissing them is acknowledgement, not a
 * destructive surprise. Visual language is the unrecoverable pill's
 * neutral gray ("in the past"), not an alarm color.
 */

interface Props {
  /** Enter select mode with the cleanup's goals pre-checked. */
  onSelect: (preselectedIds: string[]) => void;
}

export default function MonthEndCleanupBanner({ onSelect }: Props) {
  const cleanup = useLiveQuery<MonthEndCleanup>(
    () => loadMonthEndCleanup(),
    [],
  );

  // undefined = first query not resolved yet (don't flash);
  // count 0 = nothing to clean up → hide.
  if (cleanup === undefined || cleanup.count === 0) return null;

  const monthText = cleanup.monthLabel ?? 'past-month';
  const plural = cleanup.count !== 1;

  return (
    <div className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/40 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex-1 min-w-[12rem] text-sm text-neutral-700 dark:text-neutral-300">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {cleanup.count} {monthText} goal{plural ? 's' : ''}
        </span>{' '}
        {plural ? 'are' : 'is'} unrecoverable.
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            void deleteGoalsWithCascade(cleanup.goalIds).catch(err =>
              console.warn('[goals] month-end dismiss all failed', err),
            );
          }}
          className="px-3 py-1.5 text-sm rounded-md bg-neutral-700 dark:bg-neutral-600 text-white hover:bg-neutral-800 dark:hover:bg-neutral-500"
        >
          Dismiss all
        </button>
        <button
          type="button"
          onClick={() => onSelect(cleanup.goalIds)}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          Select
        </button>
      </div>
    </div>
  );
}
