/**
 * What a goal is called, on the screen that shows it.
 *
 * =====================================================================
 * "WHY DOESN'T IT JUST FOLLOW THE SETTING" — SILAS, 10 SEP 2026.
 *
 * A coverage goal's description is a sentence the app wrote at save
 * time: "Cover all 12 items in major 2m-5-1 (acquired)". It is stored,
 * so it froze the progression spelling that was in force that day — and
 * a reader who then switched to dots met a goal naming a row the grid
 * no longer had.
 *
 * The fix is not a migration. THE GOAL ALREADY STORES ITS TARGET AS
 * DATA — `targetMetric` says it is a coverage goal, `targetUnit` holds
 * the coverage group's id, `targetValue` holds the count — so the
 * sentence can be re-derived on every read from fields that were there
 * all along. Nothing stored moves; the frozen string is simply no
 * longer what gets rendered.
 *
 * =====================================================================
 * A GOAL THAT CANNOT BE RE-DERIVED KEEPS ITS OWN WORDS.
 *
 * Every goal the reader typed, every umbrella, every accuracy or
 * consistency target, and any coverage goal whose stored `targetUnit`
 * names a group that no longer exists. Falling back to what is stored
 * is what makes this safe to apply everywhere rather than to a list of
 * ids somebody has to maintain.
 * =====================================================================
 */
import type { Goal } from '../../lib/db';
import type { ProgressionSpelling } from '../../lib/progressionSpelling';
import { COVERAGE_SPECIFIC_METRIC } from './coverageMetrics';
import {
  SHAPES_COVERAGE_GROUP_DEFS, shapesCoverageGroupLabel,
  type ShapesCoverageGroupId,
} from './shapesCoverageGroups';

/** The fields a description can be re-derived from. A subset of `Goal`,
 *  so a caller holding a draft or a record can pass either. */
export interface DerivableGoal {
  description: string;
  targetMetric: string | null;
  targetValue: number | null;
  targetUnit: string | null;
}

/**
 * The sentence a Shapes & Patterns coverage goal is written as.
 *
 * ONE PLACE, and the creation flow calls it too — a goal saved today
 * and the same goal read tomorrow have to agree, and two copies of this
 * template is exactly how they would stop agreeing.
 */
export function shapesCoverageDescription(
  groupId: ShapesCoverageGroupId,
  denominator: number,
  bakedLabel: string,
  settings?: ProgressionSpelling,
): string {
  const label = shapesCoverageGroupLabel(
    groupId, bakedLabel, settings ? { settings } : {},
  );
  return `Cover all ${denominator} items in ${label} (acquired)`;
}

const SHAPES_GROUP_IDS: ReadonlySet<string> =
  new Set(SHAPES_COVERAGE_GROUP_DEFS.map(g => g.id));

/**
 * What to render for this goal.
 *
 * Re-derived where the goal's own fields allow it; the stored string
 * otherwise. Pass the reader's spelling; omitted, it uses the defaults.
 */
export function goalDescription(
  goal: DerivableGoal,
  settings?: ProgressionSpelling,
): string {
  if (goal.targetMetric !== COVERAGE_SPECIFIC_METRIC.SHAPES) return goal.description;
  const groupId = goal.targetUnit;
  if (groupId === null || !SHAPES_GROUP_IDS.has(groupId)) return goal.description;
  const group = SHAPES_COVERAGE_GROUP_DEFS.find(g => g.id === groupId)!;
  // THE STORED COUNT WINS over the catalog's current one: the goal is a
  // promise about a number the reader agreed to, and a catalog that
  // grew should not quietly move the finish line.
  const denominator = goal.targetValue ?? group.denominator;
  return shapesCoverageDescription(
    group.id, denominator, group.label, settings,
  );
}

/** The same, for a stored `Goal`. */
export function describeGoal(goal: Goal, settings?: ProgressionSpelling): string {
  return goalDescription(goal, settings);
}
