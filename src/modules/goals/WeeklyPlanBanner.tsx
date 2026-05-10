import { useEffect, useState } from 'react';
import {
  dismissBannerForWeek,
  isBannerDismissedForWeek,
  isSundayLocal,
  loadWeeklyGoalsForWeek,
  startOfWeekLocal,
} from './weeklyPlanData';

/**
 * Phase 4 Step 3 — Sunday banner that surfaces the WeeklyPlan flow.
 *
 * Visibility rules:
 *   1. Today is Sunday in the user's local timezone.
 *   2. No weekly goals exist for this week's Sunday yet (i.e., the
 *      user hasn't already confirmed a plan).
 *   3. The user hasn't explicitly dismissed it for this week
 *      (localStorage flag keyed by weekStart epoch ms).
 *
 * When the user lands on a non-Sunday day, the banner stays
 * hidden — Step 5+ may add a more general "missed your Sunday
 * plan" affordance, but for now Sunday-only matches the design.
 *
 * The "Plan your week" button calls onOpenPlan to open the modal;
 * dismiss writes the localStorage flag and hides the banner this
 * week. Both Goals and Dashboard mount this and pass their own
 * onOpenPlan handler.
 */

interface Props {
  onOpenPlan: () => void;
}

export default function WeeklyPlanBanner({ onOpenPlan }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isSundayLocal()) return;
      const weekStart = startOfWeekLocal();
      if (isBannerDismissedForWeek(weekStart)) return;
      const existing = await loadWeeklyGoalsForWeek(weekStart);
      if (existing.length > 0) return;
      if (!cancelled) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  function handleDismiss() {
    dismissBannerForWeek(startOfWeekLocal());
    setVisible(false);
  }

  return (
    <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          It's Sunday — plan your week
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
          Review last week's pace, set this week's targets, and lock in your
          recommended daily pattern.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onOpenPlan}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Plan your week
        </button>
        <button
          onClick={handleDismiss}
          aria-label="dismiss"
          className="text-emerald-700/70 dark:text-emerald-300/70 hover:text-emerald-900 dark:hover:text-emerald-100 text-xl leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
