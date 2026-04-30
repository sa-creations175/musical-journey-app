import {
  UNRECOVERABLE_MESSAGE,
  type FeasibilityRollup,
  type GoalFeasibility,
  type GoalFeasibilityStatus,
} from './progress';

/**
 * Phase 2 step 7e — text formatters for the expanded
 * feasibility detail slot. Pure helpers driven entirely by the
 * helper-layer output; the row components apply them.
 *
 * Three concerns:
 *
 *   1. `feasibilityDetailText(feasibility)` — what a single
 *      goal's expanded slot should say. Routes per kind:
 *        - measurable    → its calculated recommendation string
 *        - aspirational  → the goal-id-seeded motivational
 *                          placeholder
 *        - unknown / null→ null (caller renders nothing)
 *
 *   2. `formatRollupBreakdown(breakdown)` — umbrella's expanded
 *      detail summary in the mixed-status case ("2 on track · 1
 *      behind pace · 1 unrecoverable"). Zero-count statuses
 *      omitted. Word choice intentionally diverges from the
 *      pill labels: pills use action verbs ("Pick up pace",
 *      "Act now"); breakdowns use descriptive states ("behind
 *      pace", "urgent") because they're describing children's
 *      states, not directing action.
 *
 *   3. `formatUmbrellaDetail(rollup)` — one entry point for the
 *      umbrella row. All-unrecoverable umbrellas (status null
 *      with unrecoverable count > 0) surface the unified
 *      UNRECOVERABLE_MESSAGE per the 6h.2-amend spec; everything
 *      else falls through to the breakdown summary.
 */

const BREAKDOWN_LABEL: Record<GoalFeasibilityStatus, string> = {
  on_track: 'on track',
  at_risk: 'behind pace',
  critical: 'urgent',
  unrecoverable: 'unrecoverable',
};

const BREAKDOWN_ORDER: ReadonlyArray<GoalFeasibilityStatus> = [
  'on_track',
  'at_risk',
  'critical',
  'unrecoverable',
];

export function feasibilityDetailText(
  feasibility: GoalFeasibility | null,
): string | null {
  if (!feasibility) return null;
  if (feasibility.kind === 'measurable') return feasibility.recommendation;
  if (feasibility.kind === 'aspirational') return feasibility.message;
  return null;
}

export function formatRollupBreakdown(
  breakdown: Record<GoalFeasibilityStatus, number>,
): string {
  const parts: string[] = [];
  for (const status of BREAKDOWN_ORDER) {
    const count = breakdown[status];
    if (count > 0) parts.push(`${count} ${BREAKDOWN_LABEL[status]}`);
  }
  return parts.join(' · ');
}

/**
 * True when every measurable child is unrecoverable (no
 * actionable children remain). Used both for the umbrella's
 * own detail (renders the unified message) and for suppressing
 * per-child detail text (children render structure only — no
 * message underneath).
 */
export function isAllUnrecoverableRollup(rollup: FeasibilityRollup): boolean {
  return rollup.status === null && rollup.breakdown.unrecoverable > 0;
}

export function formatUmbrellaDetail(rollup: FeasibilityRollup): string | null {
  if (isAllUnrecoverableRollup(rollup)) return UNRECOVERABLE_MESSAGE;
  const summary = formatRollupBreakdown(rollup.breakdown);
  return summary === '' ? null : summary;
}
