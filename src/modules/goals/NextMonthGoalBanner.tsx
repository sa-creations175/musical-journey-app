import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { monthBoundary, nextMonthBoundary } from './carryover';
import { monthHasRealMonthlyGoals } from './monthMembership';

/**
 * Days remaining in the current month, counting today. June 30 → 1,
 * June 24 → 7. Drives the "last 7 days of the month" trigger.
 */
export function daysLeftInMonth(now: number): number {
  const end = new Date(monthBoundary(now).end);
  const today = new Date(now);
  return end.getDate() - today.getDate() + 1;
}

/**
 * Prompt to set NEXT month's goals during the last 7 days of the
 * current month, so the month-boundary week can derive from them.
 *
 * Visibility: shown when (a) we're within the last 7 days of the month
 * AND (b) next month has no real (non-carry-over) monthly goal yet —
 * the SAME existence predicate the derivation gate uses
 * (monthHasRealMonthlyGoals against next month). Once next-month goals
 * exist the banner hides reactively.
 *
 * "Later" dismisses for the current load only (in-component state, not
 * persisted) — it returns on the next visit / refresh.
 */

interface Props {
  /** Open the monthly goal-creation flow scoped to NEXT month. */
  onSetGoals: () => void;
}

export default function NextMonthGoalBanner({ onSetGoals }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const state = useLiveQuery(async () => {
    const now = Date.now();
    const within7 = daysLeftInMonth(now) <= 7;
    if (!within7) return { show: false, monthName: '' };
    const active = await db.goals.where('status').equals('active').toArray();
    const nextExists = monthHasRealMonthlyGoals(active, nextMonthBoundary(now));
    const monthName = new Date(nextMonthBoundary(now).start).toLocaleDateString(
      'en-US',
      { month: 'long' },
    );
    return { show: !nextExists, monthName };
  }, []);

  if (dismissed || state === undefined || !state.show) return null;

  const { monthName } = state;

  return (
    <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Less than 7 days until {monthName}
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
          Want to set your {monthName} goals now? Planning ahead lets this
          week's plan start deriving from {monthName} as the month turns over.
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-stretch gap-1.5">
        <button
          onClick={onSetGoals}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
        >
          Set {monthName} goals →
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-1 text-xs rounded-md text-emerald-800/80 dark:text-emerald-300/80 hover:underline"
        >
          Later
        </button>
      </div>
    </div>
  );
}
