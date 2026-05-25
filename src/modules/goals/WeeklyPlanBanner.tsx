import { useLiveQuery } from 'dexie-react-hooks';
import { loadWeeklyGoalsForWeek, startOfWeekLocal } from './weeklyPlanData';

/**
 * Surfaces the WeeklyPlan flow whenever the current week has no plan.
 *
 * Visibility rule (single condition): show while no weekly plan has been
 * confirmed for the *current* week. It is intentionally NOT day-gated —
 * if the user misses Sunday it stays available Monday–Saturday until they
 * plan. The ONLY thing that dismisses it is completing the planning flow,
 * which writes this week's weekly goals (startDate = this week's Sunday
 * midnight, matched by loadWeeklyGoalsForWeek).
 *
 * useLiveQuery makes that reactive: confirming a plan mutates the goals
 * table and the banner hides immediately, no remount needed. There is no
 * manual dismiss — by design it can't be hidden without planning.
 *
 * Both Goals and Dashboard mount this and pass their own onOpenPlan.
 */

interface Props {
  onOpenPlan: () => void;
}

export default function WeeklyPlanBanner({ onOpenPlan }: Props) {
  const weekStart = startOfWeekLocal();
  const existing = useLiveQuery(
    () => loadWeeklyGoalsForWeek(weekStart),
    [weekStart],
  );

  // undefined = first query not resolved yet (don't flash); a non-empty
  // result = plan already set for this week → hide.
  if (existing === undefined || existing.length > 0) return null;

  return (
    <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Plan your week
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
          You haven't set this week's plan yet. Review last week's pace, set
          this week's targets, and lock in your recommended daily pattern.
        </div>
      </div>
      <button
        onClick={onOpenPlan}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
      >
        Plan your week
      </button>
    </div>
  );
}
