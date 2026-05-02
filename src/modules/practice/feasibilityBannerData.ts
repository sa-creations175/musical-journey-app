/**
 * Phase 3 Step 7b — feasibility banner data assembly.
 *
 * Reads active goals + their feasibilities + filters to "behind
 * pace" + sorts by urgency. Pure-ish: the Dexie read happens here
 * but the sort and shape transformations are testable in
 * isolation via the exported pickBehindPaceEntries helper.
 *
 * Sort priority:
 *   1. Status — critical before at_risk
 *   2. Scope  — weekly > monthly > quarterly > yearly (closer
 *      deadlines need attention first)
 *   3. Tiebreak — goal description, alphabetical (stable)
 *
 * unrecoverable goals are intentionally excluded — those need the
 * unified "didn't hit this one" message which lives on the
 * goal-row expanded UI, not on the banner. The banner is for
 * actionable behind-pace, not retrospective acknowledgements.
 */

import { db, type Goal, type GoalScope } from '../../lib/db';
import {
  getGoalFeasibility,
  loadDayProfileMix,
  type GoalFeasibility,
  type GoalFeasibilityStatus,
} from '../../modules/goals/progress';
import { moduleForMetric } from '../../modules/goals/goalVocabulary';

export interface FeasibilityBannerEntry {
  goalId: string;
  status: 'at_risk' | 'critical';
  scope: GoalScope;
  /** Module ref derived from the goal's metric, or null when the
   *  goal isn't module-scoped (legacy or umbrella). */
  moduleRef: string | null;
  /** Display message — uses the goal's feasibility recommendation
   *  when present, otherwise a fallback derived from description. */
  message: string;
}

/**
 * Async — fetches goals, computes feasibilities, returns the
 * pre-sorted behind-pace entries. The component renders directly
 * from this list.
 */
export async function loadFeasibilityBannerEntries(
  today: Date = new Date(),
): Promise<FeasibilityBannerEntry[]> {
  const goals = await db.goals.where('status').equals('active').toArray();
  const mix = loadDayProfileMix();

  const annotated = goals.map(goal => ({
    goal,
    feasibility: getGoalFeasibility(goal, {
      currentValue: goal.currentValue,
      today,
      mix,
    }),
  }));

  return pickBehindPaceEntries(annotated);
}

/**
 * Pure transform — given goals + their feasibilities, returns the
 * banner entries sorted by urgency. Exported for tests.
 */
export function pickBehindPaceEntries(
  annotated: ReadonlyArray<{ goal: Goal; feasibility: GoalFeasibility }>,
): FeasibilityBannerEntry[] {
  const out: FeasibilityBannerEntry[] = [];
  for (const { goal, feasibility } of annotated) {
    if (feasibility.kind !== 'measurable') continue;
    const s: GoalFeasibilityStatus = feasibility.status;
    if (s !== 'at_risk' && s !== 'critical') continue;

    out.push({
      goalId: goal.id,
      status: s,
      scope: goal.scope,
      moduleRef: moduleRefFromMetric(goal.targetMetric),
      message:
        feasibility.recommendation && feasibility.recommendation.length > 0
          ? feasibility.recommendation
          : (goal.description || 'Behind pace'),
    });
  }

  out.sort((a, b) => {
    const sd = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (sd !== 0) return sd;
    const cd = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
    if (cd !== 0) return cd;
    return a.message.localeCompare(b.message);
  });

  return out;
}

const STATUS_RANK: Record<'at_risk' | 'critical', number> = {
  critical: 0,
  at_risk: 1,
};

const SCOPE_RANK: Record<GoalScope, number> = {
  weekly: 0,
  monthly: 1,
  quarterly: 2,
  yearly: 3,
  two_to_three_year: 4,
  lifetime: 5,
};

function moduleRefFromMetric(metric: string | null): string | null {
  // Reuse goalVocabulary's moduleForMetric (which returns the
  // GoalFlowModuleId) and pick a representative moduleRef for
  // moduleMeta lookup. The flow ids and meta ids align for the
  // single-module cases (harmonic-fluency, shapes-and-patterns,
  // production, repertoire); ear-training maps to a submodule
  // family rather than one moduleRef, so we surface 'ear-training'
  // and let moduleMetaById return the parent meta.
  const m = moduleForMetric(metric);
  if (!m) return null;
  return m;
}
