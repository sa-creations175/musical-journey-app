/**
 * Lean-to-goals intent multipliers + helpers.
 *
 * Step 3 of the Flexible Session Proposal build. When the user picks
 * the 'lean_to_goals' intent on the questionnaire, this module's
 * helpers reshape the proposal weighting so behind-pace modules /
 * submodules get a larger share at the expense of ahead-of-pace ones.
 *
 * Two hooks, applied at different layers:
 *
 *   1. Module-level (non-keys contexts only). `leanFactorByModule`
 *      returns a per-moduleId multiplier that REPLACES the existing
 *      weeklyPaceFactor in aggregateGoalCandidatesByModule. The keys
 *      context skips this hook because the graduated S&P/Rep split
 *      is a hard allocation that would override module-weight tilts
 *      anyway — better to be explicit and not pretend.
 *
 *   2. Within-S&P submodule (all contexts).
 *      `redistributePlannedSecondsBySubmodule` post-processes the
 *      proposal cards: for each S&P bucket with ≥ 2 non-warm-up
 *      segments, redistributes plannedSeconds proportionally to the
 *      per-submodule lean multipliers while preserving total bucket
 *      seconds. Warm-up segments are excluded from the redistribution
 *      (their durations stay locked — mirrors the block-delete rule).
 *
 * Multiplier mapping (collapses pace.ts's 5-band ladder to 3 tiers):
 *
 *   well-ahead             →  0.6   (pull-down — ahead can wait)
 *   ahead                  →  1.0   (neutral — already at pace)
 *   at-risk                →  1.0   (neutral — modest deficit, not urgent)
 *   behind                 →  1.5   (lift)
 *   significantly-behind   →  1.5   (lift — same as behind; lean is a
 *                                    coarse 3-tier signal)
 *
 * Per-submodule pace aggregation: when multiple coverage goals
 * target the same S&P submodule, the WORST (lowest) ratio wins —
 * matches the spec's "if VL goals are behind pace" framing: any
 * single behind goal makes the submodule behind.
 */

import type { Goal, SpacingState } from '../db';
import type { ProposalBlock } from '../../modules/practice/proposalTypes';
import { COVERED_STAGES } from '../../modules/goals/progress';
import { coverageGroupIdToActivityArea } from '../../modules/goals/shapesCoverageGroups';
import { isCoverageOverallMetric, isCoverageSpecificMetric } from '../../modules/goals/coverageMetrics';
import type { IntentChoice } from '../../modules/practice/inputs';
import type { PracticeSessionContext } from '../db';
import { candidateSpecForGoal } from './candidates';
import { bandForRatio, paceForCoverageGoal, type PaceBand } from './pace';
import type { WeeklyPaceResult } from './weeklyPace';

// =====================================================================
// Constants
// =====================================================================

export const LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER = 1.5;
export const LEAN_TO_GOALS_ON_TRACK_MULTIPLIER = 1.0;
export const LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER = 0.6;

// =====================================================================
// Band → lean multiplier
// =====================================================================

/**
 * Collapse pace.ts's 5-band PaceBand into the 3-tier lean multiplier.
 *
 * Design call: only `well-ahead` (ratio ≥ 1.5 — more than 50% past
 * the expected coverage) triggers the pull-down. The plain `ahead`
 * band (ratio 1.0-1.5) is "on pace, slight surplus" and stays
 * neutral. `at-risk` (ratio 0.85-1.0) is "slight deficit" — also
 * neutral; lean is a coarse signal, finer slips are the existing
 * pace ladder's job. Only `behind` and `significantly-behind`
 * (ratio < 0.85) get the lift.
 */
export function leanMultiplierForBand(band: PaceBand): number {
  switch (band) {
    case 'well-ahead':           return LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER;
    case 'ahead':                return LEAN_TO_GOALS_ON_TRACK_MULTIPLIER;
    case 'at-risk':              return LEAN_TO_GOALS_ON_TRACK_MULTIPLIER;
    case 'behind':               return LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER;
    case 'significantly-behind': return LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER;
  }
}

// =====================================================================
// Module-level: lean factor map (non-keys only)
// =====================================================================

/**
 * Build the per-module factor map for the algorithm's
 * weeklyPaceFactorByModule slot. When the intent is NOT
 * 'lean_to_goals', returns the existing factorByModule unchanged —
 * the lean curve only applies under explicit user request. When the
 * context IS 'keys', also returns the existing map: the graduated
 * S&P/Rep split is hard, so module-weight tilts at that level are a
 * lie; we keep behavior identical to non-lean for keys sessions.
 *
 * Modules without a band entry (no active weekly goal) default to
 * the on-track multiplier — leaning has nothing to point at, so the
 * module's weight is left at 1.0× (its base weight stands).
 */
export function leanFactorByModule(args: {
  weeklyPace: WeeklyPaceResult;
  intent: IntentChoice;
  context: PracticeSessionContext;
}): Map<string, number> {
  const { weeklyPace, intent, context } = args;

  if (intent.kind !== 'lean_to_goals') return weeklyPace.factorByModule;
  if (context === 'keys') return weeklyPace.factorByModule;

  const out = new Map<string, number>();
  for (const [moduleId, band] of weeklyPace.bandByModule) {
    out.set(moduleId, leanMultiplierForBand(band));
  }
  return out;
}

// =====================================================================
// Within-S&P submodule: per-submodule lean factor
// =====================================================================

/** Submodule keys this module uses for S&P internal redistribution. */
const SP_SUBMODULE_KEYS = {
  chordShape: 'shapes-and-patterns:chord-shape',
  scale:      'shapes-and-patterns:scale',
  vl:         'shapes-and-patterns:vl',
} as const;

/**
 * Per-S&P-submodule lean multiplier. Walks active S&P coverage goals,
 * computes pace for each (using the goal's targetValue as denominator
 * and the count of COVERED items in spacingState as numerator), and
 * aggregates the WORST ratio per submodule into a lean multiplier.
 *
 * Goal → submodule routing:
 *   coverage_specific with targetUnit in a S&P coverage group →
 *       map via coverageGroupIdToActivityArea → submodule key.
 *   coverage_overall → applies to all three submodules (the user
 *       is covering all of S&P; the same module-level ratio is the
 *       baseline for every submodule's lean tilt).
 *
 * Returns an empty map when intent is not 'lean_to_goals' OR when
 * no S&P coverage goals are active — caller treats absence as 1.0×
 * (no redistribution).
 */
export function leanFactorPerSPSubmodule(args: {
  goals: ReadonlyArray<Goal>;
  spacingRows: ReadonlyArray<SpacingState>;
  intent: IntentChoice;
  now: number;
}): Map<string, number> {
  const { goals, spacingRows, intent, now } = args;
  if (intent.kind !== 'lean_to_goals') return new Map();

  const minRatioBySubmodule = new Map<string, number>();

  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    if (goal.targetMetric === null) continue;
    if (!isCoverageOverallMetric(goal.targetMetric) &&
        !isCoverageSpecificMetric(goal.targetMetric)) continue;

    const spec = candidateSpecForGoal(goal);
    if (spec.kind !== 'coverage') continue;
    if (!spec.moduleRefs.includes('shapes-and-patterns')) continue;

    const totalItems = goal.targetValue ?? 0;
    if (totalItems <= 0) continue;

    const submodules = submodulesForSPGoal(goal);
    if (submodules.length === 0) continue;

    const actualCoverage = countCoveredItems(spec, spacingRows);
    const pace = paceForCoverageGoal({
      startDate: goal.startDate,
      targetDate: goal.targetDate,
      totalItems,
      actualCoverage,
      now,
    });

    for (const sm of submodules) {
      const prev = minRatioBySubmodule.get(sm);
      if (prev === undefined || pace.ratio < prev) {
        minRatioBySubmodule.set(sm, pace.ratio);
      }
    }
  }

  const out = new Map<string, number>();
  for (const [sm, ratio] of minRatioBySubmodule) {
    out.set(sm, leanMultiplierForBand(bandForRatio(ratio)));
  }
  return out;
}

/** Resolve an S&P coverage goal to the submodule(s) it targets.
 *  Overall coverage applies to all three submodules; specific
 *  coverage routes via the activity-area lookup on targetUnit. */
function submodulesForSPGoal(goal: Goal): string[] {
  const metric = goal.targetMetric;
  if (!metric) return [];

  if (isCoverageOverallMetric(metric) && metric === 'shapes_coverage_at_acquired') {
    return [SP_SUBMODULE_KEYS.chordShape, SP_SUBMODULE_KEYS.scale, SP_SUBMODULE_KEYS.vl];
  }

  if (isCoverageSpecificMetric(metric) && metric === 'shapes_coverage_at_acquired_specific') {
    const area = goal.targetUnit ? coverageGroupIdToActivityArea(goal.targetUnit) : null;
    if (area === 'chord_shape_drills') return [SP_SUBMODULE_KEYS.chordShape];
    if (area === 'scale_drills')       return [SP_SUBMODULE_KEYS.scale];
    if (area === 'voice_leading')      return [SP_SUBMODULE_KEYS.vl];
    return [];
  }

  return [];
}

/** Count spacingState rows the spec considers "already covered."
 *  Mirrors the goal-progress numerator the existing progress.ts
 *  computes, but local to keep this helper dependency-flat. */
function countCoveredItems(
  spec: ReturnType<typeof candidateSpecForGoal>,
  spacingRows: ReadonlyArray<SpacingState>,
): number {
  if (spec.kind !== 'coverage') return 0;
  const moduleSet = new Set(spec.moduleRefs);
  let count = 0;
  for (const row of spacingRows) {
    if (!moduleSet.has(row.moduleRef)) continue;
    if (!COVERED_STAGES.has(row.acquisitionStage)) continue;
    if (spec.itemRefFilter && !spec.itemRefFilter(row.itemRef)) continue;
    count++;
  }
  return count;
}

// =====================================================================
// Within-S&P redistribution
// =====================================================================

/** Classify a ProposalBlock into its S&P submodule key, or null when
 *  the block isn't an S&P segment. Mirrors the prefix-discriminator
 *  used by the swap picker (proposalSwap.submoduleKeyForBlock). */
function spSubmoduleKeyForBlock(block: ProposalBlock): string | null {
  if (block.moduleRef !== 'shapes-and-patterns') return null;
  const first = block.itemRefs[0];
  if (first?.startsWith('chord-shape:')) return SP_SUBMODULE_KEYS.chordShape;
  if (first?.startsWith('scale:'))       return SP_SUBMODULE_KEYS.scale;
  if (first?.startsWith('vl:'))          return SP_SUBMODULE_KEYS.vl;
  return null;
}

/**
 * Reshape the planned-seconds allocation within each S&P bucket
 * according to per-submodule lean multipliers. Pure: returns a fresh
 * blocks array; non-S&P blocks pass through unchanged.
 *
 * Algorithm:
 *   1. Identify S&P NON-WARM-UP segments and their submodule keys.
 *      Warm-up segments are excluded — their durations stay locked
 *      per the block-delete spec's "warm-up durations never change."
 *   2. Total S&P bucket seconds = sum of those non-warm-up segments.
 *   3. weightedSeconds = currentSeconds × leanMultiplier[submodule]
 *      (defaults to 1.0× when the submodule has no lean factor).
 *   4. Normalize: newSeconds = round(weighted × total / sumWeighted).
 *   5. Leftover from rounding lands on the first redistributed
 *      segment so the bucket sum stays exact.
 *
 * No-op when:
 *   - leanFactorBySubmodule is empty (caller computed no lean data)
 *   - fewer than 2 redistributable S&P segments in the block list
 *   - every redistributable segment has the same multiplier
 */
export function redistributePlannedSecondsBySubmodule(
  blocks: ReadonlyArray<ProposalBlock>,
  leanFactorBySubmodule: ReadonlyMap<string, number>,
): ProposalBlock[] {
  if (leanFactorBySubmodule.size === 0) return blocks.slice();

  type Candidate = { index: number; submoduleKey: string; multiplier: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.isWarmup) continue;
    const sm = spSubmoduleKeyForBlock(b);
    if (sm === null) continue;
    const mult = leanFactorBySubmodule.get(sm) ?? 1.0;
    candidates.push({ index: i, submoduleKey: sm, multiplier: mult });
  }

  if (candidates.length < 2) return blocks.slice();
  // All same multiplier → no shift would happen; skip the work.
  const allSame = candidates.every(c => c.multiplier === candidates[0].multiplier);
  if (allSame) return blocks.slice();

  const total = candidates.reduce((s, c) => s + blocks[c.index].plannedSeconds, 0);
  if (total <= 0) return blocks.slice();

  const weighted = candidates.map(c => blocks[c.index].plannedSeconds * c.multiplier);
  const sumWeighted = weighted.reduce((s, v) => s + v, 0);
  if (sumWeighted <= 0) return blocks.slice();

  const newSeconds = weighted.map(w => Math.round(w * (total / sumWeighted)));
  const drift = total - newSeconds.reduce((s, v) => s + v, 0);
  if (drift !== 0) newSeconds[0] += drift; // first-redistributed gets the leftover

  const next = blocks.slice();
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[k];
    next[c.index] = { ...blocks[c.index], plannedSeconds: newSeconds[k] };
  }
  return next;
}
