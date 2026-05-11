import { useEffect, useMemo, useState } from 'react';
import {
  getDaysWithActivity,
  getWeeklyAttempts,
} from '../../lib/weeklyAttempts';
import {
  endOfWeekLocal,
  startOfWeekLocal,
} from './weeklyPlanData';
import type { GoalFlowModuleId } from './goalVocabulary';

/**
 * Hook for the by-module view's pace + "X of Y days" surfaces.
 *
 * For each module ID in `modules`, fetches:
 *   · attempts so far this week (Sunday 00:00 local → now)
 *   · distinct days with practice this week
 *
 * Both numbers feed the per-goal pace pill / days text count.
 * Re-runs whenever `goals` reference changes (goal create / edit
 * / delete bumps the underlying list) AND whenever the visible
 * module set changes. No polling — the user sees fresh numbers
 * on every page visit and on every goal mutation.
 *
 * The returned `loaded` flag turns true after the first fetch
 * resolves. Callers can render a placeholder or "—" while
 * `!loaded`.
 */
export interface ThisWeekActivity {
  /** Sunday 00:00 local for the current week. */
  weekStart: number;
  /** Saturday 23:59:59.999 local for the current week. */
  weekEnd: number;
  /** Attempts in [weekStart, now] per module. Missing entries
   *  read as 0. */
  attemptsByModule: Partial<Record<GoalFlowModuleId, number>>;
  /** Distinct days with practice in [weekStart, now] per module.
   *  Missing entries read as 0. */
  daysByModule: Partial<Record<GoalFlowModuleId, number>>;
  /** True after the first fetch settles. */
  loaded: boolean;
}

export function useThisWeekActivity({
  modules,
  goalsVersion,
}: {
  /** Modules whose current-week activity we care about. Typically
   *  the set of modules with at least one current weekly /
   *  monthly / yearly goal in view. */
  modules: ReadonlyArray<GoalFlowModuleId>;
  /** The current goals list. Used as a re-run trigger only — the
   *  hook doesn't read individual goals. */
  goalsVersion: number;
}): ThisWeekActivity {
  const weekStart = useMemo(() => startOfWeekLocal(), []);
  const weekEnd = useMemo(() => endOfWeekLocal(weekStart), [weekStart]);

  const [attemptsByModule, setAttemptsByModule] = useState<
    Partial<Record<GoalFlowModuleId, number>>
  >({});
  const [daysByModule, setDaysByModule] = useState<
    Partial<Record<GoalFlowModuleId, number>>
  >({});
  const [loaded, setLoaded] = useState(false);

  // Stable string key for the module list so the effect re-runs
  // only on real membership changes, not on every render.
  const moduleKey = useMemo(
    () => [...modules].sort().join(','),
    [modules],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = Date.now();
      // Window for actuals is [weekStart, now] — comparing against
      // future days within the week would inflate the denominator
      // unfairly. weekEnd is kept on the result for callers that
      // need it (e.g. labelling the row).
      const attempts: Partial<Record<GoalFlowModuleId, number>> = {};
      const days: Partial<Record<GoalFlowModuleId, number>> = {};
      await Promise.all(
        modules.map(async (m) => {
          const [a, d] = await Promise.all([
            getWeeklyAttempts(m, weekStart, now),
            getDaysWithActivity(m, weekStart, now),
          ]);
          attempts[m] = a;
          days[m] = d;
        }),
      );
      if (cancelled) return;
      setAttemptsByModule(attempts);
      setDaysByModule(days);
      setLoaded(true);
    })().catch(err => {
      // Defensive: a bad goal record or stale schema shouldn't
      // crash the goals page. Surface the error in console so a
      // dev notices, but leave the hook in its previous state.
      console.warn('[useThisWeekActivity] fetch failed', err);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey, weekStart, goalsVersion]);

  return { weekStart, weekEnd, attemptsByModule, daysByModule, loaded };
}
