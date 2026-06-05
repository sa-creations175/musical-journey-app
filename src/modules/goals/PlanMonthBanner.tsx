import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal } from '../../lib/db';
import { monthBoundary } from './carryover';
import { ORDERED_GOAL_MODULES } from './goalsByModule';
import {
  goalOverlapsMonth,
  isRealMonthlyGoal,
  monthHasRealMonthlyGoals,
} from './monthMembership';

/**
 * Pure visibility predicate — true when the current calendar month
 * has a real (non-carry-over) monthly goal whose window overlaps it.
 * A carry-over stub doesn't count as planning the month. Exported for
 * tests.
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

export type PlanMonthBannerState =
  | { kind: 'complete' }
  | { kind: 'not-started' }
  | { kind: 'in-progress'; modulesRemaining: number };

/**
 * Shared state for the "Plan your month" banner — the SINGLE source of
 * truth rendered identically on Goals, Dashboard, and Practice
 * Sessions (all three mount <PlanMonthBanner>).
 *
 * Dismissal (kind: 'complete'): every module that has an active yearly
 * anchor (scope = 'yearly') ALSO has at least one real (non-carry-over)
 * monthly goal overlapping the current month. Modules without a yearly
 * anchor never block — they're not required. Zero anchored modules ⇒
 * vacuously complete (nothing to plan against).
 *
 * not-started: at least one anchored module is uncovered AND no real
 * monthly goal exists for the month at all (the original banner trigger).
 *
 * in-progress: at least one anchored module is uncovered but some real
 * monthly goal(s) already exist. `modulesRemaining` = how many anchored
 * modules still lack a current-month monthly goal.
 *
 * Module identity uses relatedModules.includes(moduleId) — the same
 * mapping anchorLookup.findAnchorGoalForModule relies on.
 */
export function planMonthBannerState(
  activeGoals: ReadonlyArray<Goal>,
  now: number,
): PlanMonthBannerState {
  const bounds = monthBoundary(now);

  // Modules that have an active yearly anchor → the ones required to
  // have a monthly goal before the month counts as planned.
  const anchoredModules = ORDERED_GOAL_MODULES.filter(m =>
    activeGoals.some(
      g => g.scope === 'yearly' && g.status === 'active' && g.relatedModules.includes(m),
    ),
  );

  const moduleHasMonthlyGoal = (moduleId: string): boolean =>
    activeGoals.some(
      g =>
        isRealMonthlyGoal(g) &&
        goalOverlapsMonth(g, bounds) &&
        g.relatedModules.includes(moduleId),
    );

  const remaining = anchoredModules.filter(m => !moduleHasMonthlyGoal(m));
  if (remaining.length === 0) return { kind: 'complete' };
  if (!monthHasRealMonthlyGoals(activeGoals, bounds)) return { kind: 'not-started' };
  return { kind: 'in-progress', modulesRemaining: remaining.length };
}

/**
 * Surfaces the monthly goal-creation flow until every anchored module
 * has a monthly goal for the current month (see planMonthBannerState).
 *
 * Two visible states:
 *   · not-started — "No [Month] goals set yet"
 *   · in-progress — "Continue planning [Month] — N modules still need
 *                    goals"
 *
 * Reactive via useLiveQuery: creating a monthly goal mutates the goals
 * table and the banner re-evaluates immediately. There is no manual
 * dismiss by design — it clears only when planning is complete.
 *
 * Sits below the "Plan your week" banner in the Goals-home banner stack.
 */

interface Props {
  /** Open the monthly goal-creation flow (scoped to this month). */
  onPlanMonth: () => void;
}

export default function PlanMonthBanner({ onPlanMonth }: Props) {
  const state = useLiveQuery(async () => {
    const active = await db.goals.where('status').equals('active').toArray();
    return planMonthBannerState(active, Date.now());
  }, []);

  // undefined = first query not resolved yet (don't flash); complete =
  // every anchored module is planned → hide.
  if (state === undefined || state.kind === 'complete') return null;

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const inProgress = state.kind === 'in-progress';
  const n = inProgress ? state.modulesRemaining : 0;

  return (
    <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          {inProgress
            ? `Continue planning ${monthName} — ${n} module${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} goals`
            : `No ${monthName} goals set yet`}
        </div>
        <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
          {inProgress
            ? 'Each module with a yearly anchor needs a monthly goal to derive from.'
            : "Set your monthly targets so each week's plan has something to derive from."}
        </div>
      </div>
      <button
        onClick={onPlanMonth}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {inProgress ? 'Continue planning →' : 'Plan your month →'}
      </button>
    </div>
  );
}
