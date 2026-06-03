/**
 * Month-start cleanup — previous-month unrecoverable goal detection
 * and bulk dismissal.
 *
 * Powers the MonthEndCleanupBanner ("X May goals are unrecoverable.
 * Dismiss all / Select") and the Goals-home select mode's bulk
 * delete. Follows the feasibilityBannerData.ts pattern: an async
 * loader does the Dexie read, a pure picker does the decision math
 * so it stays testable without IndexedDB.
 *
 * "Unrecoverable" is the same status the FeasibilityPill shows —
 * computed by getGoalFeasibility. A previous-month goal that HIT its
 * target reads as on_track even past the deadline (see
 * classifyCoverageStatus), so it is never swept up by this cleanup;
 * only goals that are mathematically done-for get dismissed.
 *
 * Deletion goes through plain Dexie deletes — the sync layer's
 * 'deleting' hook (src/lib/sync/hooks.ts) enqueues a Supabase delete
 * per row automatically, same as every other delete in the app.
 */

import { db, type Goal } from '../../lib/db';
import { monthBoundary } from './carryover';
import {
  getGoalFeasibility,
  loadDayProfileMix,
  type GoalFeasibility,
} from './progress';

/** A goal paired with its computed feasibility — the picker's input. */
export interface AnnotatedGoal {
  goal: Goal;
  feasibility: GoalFeasibility;
}

export interface MonthEndCleanup {
  /**
   * Every goal record the cleanup will delete: unrecoverable
   * non-umbrella goals from previous months, plus any previous-month
   * umbrella container whose children are ALL in the delete set
   * (deleting a container while children survive would orphan them;
   * keeping a container with zero surviving children leaves a husk).
   */
  goalIds: string[];
  /**
   * Banner-facing count — non-umbrella goals only. Umbrella
   * containers are bookkeeping; the goals the user actually set and
   * missed are the leaves.
   */
  count: number;
  /**
   * "May" when every counted goal falls in the same calendar month;
   * null when they span months (the banner falls back to
   * "past-month" wording).
   */
  monthLabel: string | null;
}

/**
 * Pure picker — previous-month active monthly goals whose pace
 * status is 'unrecoverable'. Exported for tests.
 *
 * "Previous month" = the goal's targetDate falls before the first ms
 * of the month containing `today`. That covers last month AND any
 * older stragglers, so the cleanup can't strand goals from two
 * months back.
 */
export function pickPreviousMonthUnrecoverable(
  annotated: ReadonlyArray<AnnotatedGoal>,
  today: Date,
): MonthEndCleanup {
  const currentMonthStart = monthBoundary(today.getTime()).start;

  const prevMonthly = annotated.filter(
    a =>
      a.goal.scope === 'monthly' &&
      a.goal.status === 'active' &&
      a.goal.targetDate < currentMonthStart,
  );

  // Leaves: non-umbrella goals that are mathematically done.
  // 'unknown' / 'aspirational' feasibility kinds never qualify —
  // we only dismiss what the math has actually established as
  // unrecoverable.
  const leaves = prevMonthly.filter(
    a =>
      !a.goal.isUmbrella &&
      a.feasibility.kind === 'measurable' &&
      a.feasibility.status === 'unrecoverable',
  );
  const leafIds = new Set(leaves.map(a => a.goal.id));

  // Umbrella containers: included only when every child is itself
  // being deleted. A container with any surviving child stays.
  const umbrellaIds: string[] = [];
  for (const a of prevMonthly) {
    if (!a.goal.isUmbrella) continue;
    const children = annotated.filter(
      c =>
        c.goal.parentGoalId === a.goal.id && c.goal.scope === a.goal.scope,
    );
    if (children.length > 0 && children.every(c => leafIds.has(c.goal.id))) {
      umbrellaIds.push(a.goal.id);
    }
  }

  return {
    goalIds: [...leafIds, ...umbrellaIds],
    count: leaves.length,
    monthLabel: sharedMonthLabel(leaves.map(a => a.goal)),
  };
}

/** "May" when all goals share a calendar month, else null. */
function sharedMonthLabel(goals: ReadonlyArray<Goal>): string | null {
  if (goals.length === 0) return null;
  const months = new Set(
    goals.map(g => {
      const d = new Date(g.targetDate);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  );
  if (months.size !== 1) return null;
  return new Date(goals[0].targetDate).toLocaleDateString('en-US', {
    month: 'long',
  });
}

/**
 * Async loader — active goals → feasibilities → picker. The Dexie
 * read makes this reactive under useLiveQuery: any goals-table write
 * re-runs it, so the banner hides itself the moment the last
 * previous-month unrecoverable goal is gone.
 */
export async function loadMonthEndCleanup(
  today: Date = new Date(),
): Promise<MonthEndCleanup> {
  const goals = await db.goals.where('status').equals('active').toArray();
  const mix = loadDayProfileMix();
  const annotated: AnnotatedGoal[] = goals.map(goal => ({
    goal,
    feasibility: getGoalFeasibility(goal, {
      currentValue: goal.currentValue,
      today,
      mix,
    }),
  }));
  return pickPreviousMonthUnrecoverable(annotated, today);
}

/**
 * Delete a set of goals, cascading any umbrella in the set into its
 * same-scope children — the same scope-filtered cascade rule as
 * Goals.tsx's hardDeleteGoal (cross-scope children like monthly
 * stowaways under a yearly anchor are left alone).
 *
 * One bulkDelete at the end so the sync layer sees each row's
 * 'deleting' hook exactly once.
 */
export async function deleteGoalsWithCascade(
  ids: ReadonlyArray<string>,
): Promise<void> {
  if (ids.length === 0) return;
  const goals = await db.goals.bulkGet([...ids]);
  const toDelete = new Set<string>();
  for (const g of goals) {
    if (!g) continue;
    toDelete.add(g.id);
    if (g.isUmbrella) {
      const children = await db.goals
        .where('parentGoalId')
        .equals(g.id)
        .filter(c => c.scope === g.scope)
        .toArray();
      for (const c of children) toDelete.add(c.id);
    }
  }
  await db.goals.bulkDelete([...toDelete]);
}
