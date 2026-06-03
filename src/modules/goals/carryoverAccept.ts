/**
 * Phase B Step 9b follow-up — Accept's goal-modification side effect.
 *
 * For each module the user accepts in the carry-over review modal,
 * push the leftover itemRefs into THIS month's monthly goal scope:
 *
 *   · Existing current-month monthly for the module → append the
 *     leftover refs to its `relatedItems` (deduped) and bump
 *     `targetValue` by the count of newly-added refs. The Step 9b
 *     follow-up wires `relatedItems` into the candidate pool
 *     (candidates.ts `extendWithRelatedItems`), so accepted items
 *     get full monthly-scope weighting, not just the 1.15 backlog
 *     factor.
 *
 *   · No current-month monthly for the module → create a minimal
 *     stub monthly anchored to this calendar month with the source
 *     goal's metric/subArea + the leftover items as relatedItems
 *     and as the initial target. Routing through GoalCreationFlow
 *     (the design's other option) is a heavier integration round —
 *     the stub creation keeps the carry-over flow self-contained
 *     and the user can edit the stub via the regular goal UI.
 *
 * Decline → no goal mutation. The localStorage decision marker
 * (carryoverBannerState) is the only persistence: the items stay
 * in the backlog and continue to surface via the 1.15 pace lift
 * from Commit 1.
 *
 * Multi-monthly-per-module: if more than one current-month monthly
 * exists for the same module (rare), the latest-`startDate` one is
 * the Accept target. Mirrors the "most-recently-configured wins"
 * tiebreaker used throughout carryover.ts.
 */

import { db, type Goal } from '../../lib/db';
import {
  monthBoundary,
  type ModuleUncoveredEntry,
} from './carryover';
import { moduleForMetric, type GoalFlowModuleId } from './goalVocabulary';
import { startOfWeekLocal } from './weeklyPlanData';
import type {
  CarryoverDecision,
  DecisionsByModule,
} from './carryoverBannerState';

/** Shared prefix for every carry-over stub's description. The weekly
 *  derivation start-date migration (cleanup.ts) and any other
 *  carry-over-aware surface key off this — keep them in lockstep. */
export const CARRYOVER_DESCRIPTION_PREFIX = 'Carry-over from last month';

/**
 * Apply per-module Accept decisions to the user's current-month
 * goal records. Declines are skipped — the localStorage marker is
 * the sole persistence for those.
 *
 * Idempotent: re-running with the same decisions produces no new
 * mutations because `relatedItems` is deduped and the new-items
 * count drops to zero.
 */
export async function applyCarryoverAcceptance(
  entries: ReadonlyArray<ModuleUncoveredEntry>,
  decisions: DecisionsByModule,
  now: number = Date.now(),
): Promise<void> {
  const currentBounds = monthBoundary(now);
  const allGoals = await db.goals.toArray();
  const currentMonthliesByModule = currentMonthMonthliesByModule(
    allGoals, currentBounds,
  );

  for (const entry of entries) {
    const decision: CarryoverDecision | undefined = decisions[entry.moduleId];
    if (decision !== 'accepted') continue;

    const sourceGoal = allGoals.find(g => g.id === entry.monthlyGoalId);
    if (!sourceGoal) continue; // defensive — source vanished

    const existing = currentMonthliesByModule.get(entry.moduleId);
    if (existing) {
      await extendExistingMonthly(existing, entry.uncoveredItemRefs);
    } else {
      await createStubMonthly(
        entry, sourceGoal, currentBounds, now,
      );
    }
  }
}

/** Latest-`startDate` current-month monthly per Phase B module.
 *  Multiple current monthlies per module is rare; the most-recently-
 *  configured one wins — same tiebreaker as the carryover detection. */
function currentMonthMonthliesByModule(
  allGoals: ReadonlyArray<Goal>,
  bounds: { start: number; end: number },
): Map<GoalFlowModuleId, Goal> {
  const out = new Map<GoalFlowModuleId, Goal>();
  for (const g of allGoals) {
    if (g.scope !== 'monthly') continue;
    if (g.status !== 'active') continue;
    if (g.isUmbrella) continue;
    if (!g.targetMetric) continue;
    if (g.startDate > bounds.end || g.targetDate < bounds.start) continue;
    const modId = moduleForMetric(g.targetMetric);
    if (!modId) continue;
    const prev = out.get(modId);
    if (!prev || g.startDate > prev.startDate) out.set(modId, g);
  }
  return out;
}

/** Append leftover refs to `relatedItems` (deduped) and bump
 *  `targetValue` by the count of refs that were genuinely new. */
async function extendExistingMonthly(
  goal: Goal,
  leftover: ReadonlyArray<string>,
): Promise<void> {
  const before = new Set(goal.relatedItems);
  const newRefs = leftover.filter(r => !before.has(r));
  if (newRefs.length === 0) return;
  const nextRelated = [...goal.relatedItems, ...newRefs];
  const nextTarget = (goal.targetValue ?? 0) + newRefs.length;
  await db.goals.update(goal.id, {
    relatedItems: nextRelated,
    targetValue: nextTarget,
  });
}

/** Create a stub monthly anchored to the current calendar month.
 *  Mirrors the source goal's metric/subArea + relatedModules and
 *  carries the leftover items as both `relatedItems` and the initial
 *  target. The user can edit it via the regular Goals UI. */
async function createStubMonthly(
  entry: ModuleUncoveredEntry,
  sourceGoal: Goal,
  bounds: { start: number; end: number },
  now: number,
): Promise<void> {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `g-${Math.random().toString(36).slice(2, 12)}-${now.toString(36)}`;
  // Anchor startDate at the start of the acceptance week (Sunday),
  // NOT `now`. A carry-over is a month-long continuation of last
  // month's leftover work, not a goal that "starts mid-week" — so it
  // must NOT trip weeklyDerivation's mid-week proration branch (which
  // fires when startDate falls strictly inside the current week and
  // shrinks the first week's target as the days elapse: e.g. a 202-
  // item HF carry-over showed 349 instead of the even ~404/week
  // split). Week-aligning startDate (≤ weekStart) routes it through
  // the reset-clean "remaining ÷ weeks" formula every week, including
  // the first. weekStart-1 is before this goal exists, so the
  // attempts-so-far window stays empty.
  const stub: Goal = {
    id,
    scope: 'monthly',
    description: `${CARRYOVER_DESCRIPTION_PREFIX} — ${entry.uncoveredItemRefs.length} items`,
    targetMetric: sourceGoal.targetMetric,
    targetValue: entry.uncoveredItemRefs.length,
    targetUnit: sourceGoal.targetUnit,
    currentValue: 0,
    contextTag: sourceGoal.contextTag,
    relatedModules: [...sourceGoal.relatedModules],
    relatedItems: [...entry.uncoveredItemRefs],
    startDate: startOfWeekLocal(now),
    targetDate: bounds.end,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
  };
  await db.goals.add(stub);
}
