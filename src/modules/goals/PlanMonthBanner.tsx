import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal } from '../../lib/db';
import { monthBoundary } from './carryover';
import { goalModuleId } from './goalsByModule';
import type { GoalFlowModuleId } from './goalVocabulary';
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

  // Module identity goes through goalModuleId — the canonical
  // metric/umbrella-based mapping the by-module view uses — NOT
  // relatedModules. (Some goals, e.g. practice-consistency, carry empty
  // relatedModules, which made the old relatedModules check report a
  // permanently-uncovered module that never cleared.)

  // Modules that have an active yearly anchor → required to have a
  // monthly goal before the month counts as planned. Both the umbrella
  // anchor and any yearly child rows resolve to the same module.
  const anchoredModules = new Set<GoalFlowModuleId>();
  for (const g of activeGoals) {
    if (g.scope !== 'yearly' || g.status !== 'active') continue;
    const m = goalModuleId(g, activeGoals);
    if (m) anchoredModules.add(m);
  }

  // Modules covered by a real (non-carry-over) monthly goal overlapping
  // the current month.
  const coveredModules = new Set<GoalFlowModuleId>();
  for (const g of activeGoals) {
    if (!isRealMonthlyGoal(g) || !goalOverlapsMonth(g, bounds)) continue;
    const m = goalModuleId(g, activeGoals);
    if (m) coveredModules.add(m);
  }

  const remaining = [...anchoredModules].filter(m => !coveredModules.has(m));
  if (remaining.length === 0) return { kind: 'complete' };
  if (!monthHasRealMonthlyGoals(activeGoals, bounds)) return { kind: 'not-started' };
  return { kind: 'in-progress', modulesRemaining: remaining.length };
}

// ---------------------------------------------------------------------
// Snooze — local, 24h. Hides the banner for a day without permanently
// dismissing it; it auto-clears once every anchored module is planned.
// Stored in localStorage so it's shared across all three banner mounts
// (Goals, Dashboard, Practice Sessions) and survives a refresh.
// ---------------------------------------------------------------------

const SNOOZE_KEY = 'planMonthBannerSnoozedUntil';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function readSnoozedUntil(): number {
  if (typeof localStorage === 'undefined') return 0;
  const n = Number(localStorage.getItem(SNOOZE_KEY));
  return Number.isFinite(n) ? n : 0;
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
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => readSnoozedUntil());

  const state = useLiveQuery(async () => {
    const active = await db.goals.where('status').equals('active').toArray();
    return planMonthBannerState(active, Date.now());
  }, []);

  // undefined = first query not resolved yet (don't flash); complete =
  // every anchored module is planned → hide.
  if (state === undefined || state.kind === 'complete') return null;
  // Snoozed for the next 24h → hide until it lapses.
  if (Date.now() < snoozedUntil) return null;

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const inProgress = state.kind === 'in-progress';
  const n = inProgress ? state.modulesRemaining : 0;

  const snooze = () => {
    const until = Date.now() + SNOOZE_MS;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SNOOZE_KEY, String(until));
    }
    setSnoozedUntil(until);
  };

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
      <div className="shrink-0 flex flex-col items-stretch gap-1.5">
        <button
          onClick={onPlanMonth}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
        >
          {inProgress ? 'Continue planning →' : 'Plan your month →'}
        </button>
        <button
          onClick={snooze}
          title="Hide until tomorrow"
          className="inline-flex items-center justify-center gap-1 px-3 py-1 text-xs rounded-md text-emerald-800/80 dark:text-emerald-300/80 hover:underline"
        >
          <span aria-hidden>🕒</span> remind me tomorrow
        </button>
      </div>
    </div>
  );
}
