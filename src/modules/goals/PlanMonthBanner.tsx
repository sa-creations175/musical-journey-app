import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal } from '../../lib/db';
import { monthBoundary } from './carryover';
import { monthHasRealMonthlyGoals } from './monthMembership';

/**
 * Pure visibility predicate — true when the current calendar month
 * has a real (non-carry-over) monthly goal whose window overlaps it.
 * A carry-over stub doesn't count as planning the month. Exported for
 * tests; the banner shows when this returns false.
 *
 * Delegates to the shared {@link monthHasRealMonthlyGoals} predicate so
 * the "Plan your month" prompt and the weekly-derivation month gate
 * share one definition of "month M has goals".
 */
export function hasPlannedCurrentMonth(
  activeGoals: ReadonlyArray<Goal>,
  now: number,
): boolean {
  return monthHasRealMonthlyGoals(activeGoals, monthBoundary(now));
}

/**
 * Surfaces the monthly goal-creation flow whenever the current month
 * has no real monthly goal yet.
 *
 * Visibility rule (single condition): show while no active monthly
 * goal whose window overlaps the current calendar month exists —
 * EXCLUDING carry-over stubs. A carry-over (identified by its
 * `CARRYOVER_DESCRIPTION_PREFIX` description) is last month's leftover
 * work continuing forward, not an intentional plan for this month, so
 * it doesn't count as "planning the month."
 *
 * Mirrors WeeklyPlanBanner: reactive via useLiveQuery, no manual
 * dismiss — setting any non-carry-over monthly goal mutates the goals
 * table and the banner hides immediately.
 *
 * Sits below the "Plan your week" banner and above the month-end
 * cleanup banner in the Goals-home banner stack.
 */

interface Props {
  /** Open the monthly goal-creation flow (scoped to this month). */
  onPlanMonth: () => void;
}

export default function PlanMonthBanner({ onPlanMonth }: Props) {
  const needsPlan = useLiveQuery(async () => {
    const active = await db.goals.where('status').equals('active').toArray();
    return !hasPlannedCurrentMonth(active, Date.now());
  }, []);

  // undefined = first query not resolved yet (don't flash); false =
  // a real monthly goal exists → hide.
  if (needsPlan === undefined || needsPlan === false) return null;

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  return (
    <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          No {monthName} goals set yet
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
          Set your monthly targets so each week's plan has something to
          derive from.
        </div>
      </div>
      <button
        onClick={onPlanMonth}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
      >
        Plan your month →
      </button>
    </div>
  );
}
