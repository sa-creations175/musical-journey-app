import { db, type Goal } from '../../lib/db';
import { isNewVocabMetric } from './goalVocabulary';
import {
  decodeEarTraining,
  decodeHarmonicFluency,
  decodeProduction,
  decodeShapesPatterns,
  defaultEarTraining,
  defaultHarmonicFluency,
  defaultProduction,
  defaultShapesPatterns,
  type EarTrainingTarget,
  type HarmonicFluencyTarget,
  type ProductionTarget,
  type ShapesPatternsTarget,
} from './GoalCreationFlow';
import {
  suggestPracticeConsistencyMonthly,
  type PracticeConsistencyMonthlyTarget,
} from './suggestions/practiceConsistencyMonthly';
import { SONG_OF_MONTH_METRIC } from '../repertoire/songOfMonth';

/**
 * Edit-mode prefill loaders for GoalSuggestionFlow.
 *
 * Given any monthly goal the user clicked edit on (umbrella, child,
 * or single-target standalone), walk to the umbrella (if any), pull
 * all sibling children, and decode them into the per-module body's
 * target shape. Bodies seed their initial state from the prefill
 * instead of calling suggest*().
 *
 * The merge strategy: start from defaults with all *Enabled flags
 * forced to false, then for each child OR the matching slice in via
 * the wizard's existing per-module decoders. Coverage slices that
 * each carry a single group id are concatenated. The result is a
 * single target that faithfully restores what the user saved.
 */

export type SuggestionFlowModule =
  | 'harmonic-fluency'
  | 'ear-training'
  | 'shapes-and-patterns'
  | 'repertoire'
  | 'production'
  | 'practice-consistency';

export interface RepertoireQueueItem {
  kind: 'song' | 'wtl' | 'tbd';
  refId: string | null;
}

export interface RepertoireDaysTarget {
  consistencyEnabled: boolean;
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

interface PrefillCommon {
  existingChildren: Goal[];
  umbrellaId: string | null;
  umbrella: Goal | null;
  targetDate: number;
}

export type EditPrefill =
  | (PrefillCommon & { moduleId: 'harmonic-fluency';    target: HarmonicFluencyTarget })
  | (PrefillCommon & { moduleId: 'ear-training';        target: EarTrainingTarget })
  | (PrefillCommon & { moduleId: 'shapes-and-patterns'; target: ShapesPatternsTarget })
  | (PrefillCommon & { moduleId: 'production';          target: ProductionTarget })
  | (PrefillCommon & { moduleId: 'practice-consistency';target: PracticeConsistencyMonthlyTarget })
  | (PrefillCommon & {
      moduleId: 'repertoire';
      queue: RepertoireQueueItem[];
      daysTarget: RepertoireDaysTarget;
    });

/**
 * Resolve which suggestion-flow module a goal belongs to. Umbrellas
 * and children both carry `relatedModules` (set by the persist path
 * via `relatedModulesForSuggestion`), so the first entry is the
 * canonical signal. Practice Consistency is special — its
 * relatedModules is empty on persist, so we recognise it via the
 * `practice_` metric prefix on the child.
 */
function moduleFromGoal(goal: Goal): SuggestionFlowModule | null {
  const first = goal.relatedModules[0];
  if (first === 'harmonic-fluency')    return 'harmonic-fluency';
  if (first === 'ear-training')        return 'ear-training';
  if (first === 'shapes-and-patterns') return 'shapes-and-patterns';
  if (first === 'production')          return 'production';
  if (first === 'repertoire')          return 'repertoire';
  if (goal.targetMetric && goal.targetMetric.startsWith('practice_')) {
    return 'practice-consistency';
  }
  return null;
}

/**
 * Walk to the umbrella (if any) and fetch all children. Three shapes
 * are possible:
 *   1. Root is an umbrella → children = goals with parentGoalId === root.id.
 *   2. Root has a parent which is an umbrella → load parent + siblings.
 *   3. Root is a standalone child (parent is the yearly anchor or
 *      null) → children = [root], umbrella = null.
 */
async function fetchUmbrellaAndChildren(
  rootGoal: Goal,
): Promise<{ umbrella: Goal | null; children: Goal[] }> {
  if (rootGoal.isUmbrella) {
    const children = await db.goals
      .where('parentGoalId').equals(rootGoal.id)
      .toArray();
    return { umbrella: rootGoal, children };
  }
  if (rootGoal.parentGoalId) {
    const parent = await db.goals.get(rootGoal.parentGoalId);
    if (parent && parent.isUmbrella) {
      const siblings = await db.goals
        .where('parentGoalId').equals(parent.id)
        .toArray();
      return { umbrella: parent, children: siblings };
    }
  }
  return { umbrella: null, children: [rootGoal] };
}

/**
 * Determine the prefill's target date. Prefer the umbrella's, fall
 * back to the first child's. Both share targetDate per persist's
 * baseFields, so any source is fine — we pick umbrella for clarity.
 */
function prefillTargetDate(umbrella: Goal | null, children: Goal[]): number {
  if (umbrella) return umbrella.targetDate;
  if (children[0]) return children[0].targetDate;
  return Date.now();
}

/**
 * Reset all `*Enabled` flags on a target to false. Defaults have
 * consistency on, but we want a clean slate so the decoded children
 * are the authority on what was actually saved.
 */
function blankHf(): HarmonicFluencyTarget {
  return {
    ...defaultHarmonicFluency(),
    coverageEnabled: false,
    accuracyEnabled: false,
    consistencyEnabled: false,
  };
}
function blankEt(): EarTrainingTarget {
  return {
    ...defaultEarTraining(),
    coverageEnabled: false,
    accuracyEnabled: false,
    consistencyEnabled: false,
  };
}
function blankShapes(): ShapesPatternsTarget {
  return {
    ...defaultShapesPatterns(),
    coverageEnabled: false,
    proficiencyEnabled: false,
    consistencyEnabled: false,
  };
}
function blankProduction(): ProductionTarget {
  return {
    ...defaultProduction(),
    coverageEnabled: false,
    completionEnabled: false,
    consistencyEnabled: false,
  };
}

function mergeHf(children: Goal[]): HarmonicFluencyTarget {
  const merged = blankHf();
  const decodedList = children.map(c => ({ c, d: decodeHarmonicFluency(c) }));
  mergeCoverage(merged, decodedList.map(x => x.d));
  for (const { c, d } of decodedList) {
    if (d.accuracyEnabled) {
      merged.accuracyEnabled = true;
      merged.accuracyScope = d.accuracyScope;
      merged.categoryId = d.categoryId;
      merged.accuracyPercent = d.accuracyPercent;
    }
    if (d.consistencyEnabled && isHfConsistencyChild(c)) {
      merged.consistencyEnabled = true;
      merged.consistencyCount = d.consistencyCount;
      merged.consistencyCadence = d.consistencyCadence;
    }
  }
  return merged;
}

/**
 * Two-pass coverage merge. Coverage is the only slice that can span
 * multiple child rows (one per picked group). `overall` wins if any
 * child is overall; otherwise group ids accumulate from every
 * `specific` child. Generic over the group-id type so Shapes
 * (ShapesCoverageGroupId) and the others (string) can both reuse it
 * without unsafe casts at the call site.
 */
function mergeCoverage<TGroupId extends string>(
  target: { coverageEnabled: boolean; coverageScope: 'overall' | 'specific'; coverageGroupIds: TGroupId[] },
  decodedList: ReadonlyArray<{ coverageEnabled: boolean; coverageScope: 'overall' | 'specific'; coverageGroupIds: ReadonlyArray<TGroupId> }>,
): void {
  const enabled = decodedList.filter(d => d.coverageEnabled);
  if (enabled.length === 0) return;
  target.coverageEnabled = true;
  if (enabled.some(d => d.coverageScope === 'overall')) {
    target.coverageScope = 'overall';
    target.coverageGroupIds = [];
    return;
  }
  target.coverageScope = 'specific';
  const seen = new Set<TGroupId>();
  for (const d of enabled) {
    for (const id of d.coverageGroupIds) {
      if (!seen.has(id)) {
        seen.add(id);
        target.coverageGroupIds.push(id);
      }
    }
  }
}

function mergeEt(children: Goal[]): EarTrainingTarget {
  const merged = blankEt();
  const decodedList = children.map(c => ({ c, d: decodeEarTraining(c) }));
  mergeCoverage(merged, decodedList.map(x => x.d));
  for (const { c, d } of decodedList) {
    if (d.accuracyEnabled) {
      merged.accuracyEnabled = true;
      merged.accuracyScope = d.accuracyScope;
      merged.drillTypeId = d.drillTypeId;
      merged.drillSubtypeId = d.drillSubtypeId;
      merged.accuracyPercent = d.accuracyPercent;
    }
    if (d.consistencyEnabled && isEtConsistencyChild(c)) {
      merged.consistencyEnabled = true;
      merged.consistencyCount = d.consistencyCount;
      merged.consistencyCadence = d.consistencyCadence;
    }
  }
  return merged;
}

function mergeShapes(children: Goal[]): ShapesPatternsTarget {
  const merged = blankShapes();
  const decodedList = children.map(c => ({ c, d: decodeShapesPatterns(c) }));
  mergeCoverage(merged, decodedList.map(x => x.d));
  for (const { c, d } of decodedList) {
    if (d.proficiencyEnabled) {
      merged.proficiencyEnabled = true;
      merged.proficiencyScope = d.proficiencyScope;
      merged.activityArea = d.activityArea;
      merged.shapeId = d.shapeId;
      merged.keyTarget = d.keyTarget;
      merged.proficiencyLevel = d.proficiencyLevel;
    }
    if (d.consistencyEnabled && isShapesConsistencyChild(c)) {
      merged.consistencyEnabled = true;
      merged.consistencyCount = d.consistencyCount;
      merged.consistencyCadence = d.consistencyCadence;
    }
  }
  return merged;
}

function mergeProduction(children: Goal[]): ProductionTarget {
  const merged = blankProduction();
  const decodedList = children.map(c => ({ c, d: decodeProduction(c) }));
  mergeCoverage(merged, decodedList.map(x => x.d));
  for (const { c, d } of decodedList) {
    if (d.completionEnabled) {
      merged.completionEnabled = true;
      merged.completionScope = d.completionScope;
      merged.pathId = d.pathId;
      merged.lessonCount = d.lessonCount;
    }
    if (d.consistencyEnabled && isProductionConsistencyChild(c)) {
      merged.consistencyEnabled = true;
      merged.consistencyCount = d.consistencyCount;
      merged.consistencyCadence = d.consistencyCadence;
    }
  }
  return merged;
}

function mergePracticeConsistency(children: Goal[]): PracticeConsistencyMonthlyTarget {
  // The body's PracticeConsistencyMonthlyTarget shape carries three
  // fields but only `daysPerWeek` is persisted today. Start from the
  // suggestion defaults so the two aspirational fields keep their
  // sensible defaults; pull the days count from any
  // `practice_days_per_cadence` child.
  const merged = { ...suggestPracticeConsistencyMonthly().target };
  for (const c of children) {
    if (c.targetMetric === 'practice_days_per_cadence') {
      if (typeof c.targetValue === 'number') merged.daysPerWeek = c.targetValue;
    }
  }
  return merged;
}

function mergeRepertoireQueueAndDays(children: Goal[]): {
  queue: RepertoireQueueItem[];
  daysTarget: RepertoireDaysTarget;
} {
  // Queue: collect spotlight (song_whole_at_level) + song_of_month
  // children, sort by slot index, densify gaps. Days: a single child
  // with targetMetric === 'repertoire_days_per_cadence'.
  const queueRaw: Array<{ slotIndex: number; item: RepertoireQueueItem }> = [];
  let daysTarget: RepertoireDaysTarget = {
    consistencyEnabled: false,
    consistencyCount: 6,
    consistencyCadence: 'week',
  };

  for (const c of children) {
    if (c.targetMetric === 'song_whole_at_level') {
      const refId = c.relatedItems[0] ?? null;
      queueRaw.push({
        slotIndex: 1,
        item: { kind: 'song', refId },
      });
    } else if (c.targetMetric === SONG_OF_MONTH_METRIC) {
      const slotIndex = typeof c.targetValue === 'number' ? c.targetValue : 1;
      const kind: RepertoireQueueItem['kind'] =
        c.targetUnit === 'song' ? 'song'
        : c.targetUnit === 'wtl' ? 'wtl'
        : 'tbd';
      const refId = kind === 'tbd' ? null : (c.relatedItems[0] ?? null);
      queueRaw.push({ slotIndex, item: { kind, refId } });
    } else if (c.targetMetric === 'repertoire_days_per_cadence') {
      daysTarget = {
        consistencyEnabled: true,
        consistencyCount: typeof c.targetValue === 'number' ? c.targetValue : 6,
        consistencyCadence: 'week',
      };
    }
  }

  queueRaw.sort((a, b) => a.slotIndex - b.slotIndex);
  return {
    queue: queueRaw.map(r => r.item),
    daysTarget,
  };
}

function isHfConsistencyChild(g: Goal): boolean {
  return g.targetMetric === 'harmonic_fluency_days_per_cadence'
    || g.targetMetric === 'harmonic_fluency_sessions_per_cadence';
}
function isEtConsistencyChild(g: Goal): boolean {
  return g.targetMetric === 'ear_training_days_per_cadence'
    || g.targetMetric === 'ear_training_sessions_per_cadence';
}
function isShapesConsistencyChild(g: Goal): boolean {
  return g.targetMetric === 'shapes_days_per_cadence'
    || g.targetMetric === 'shapes_minutes_per_cadence';
}
function isProductionConsistencyChild(g: Goal): boolean {
  return g.targetMetric === 'production_lessons_per_cadence'
    || g.targetMetric === 'production_hours_per_cadence';
}

/**
 * Decide whether a goal's shape can be rendered by GoalSuggestionFlow's
 * edit mode. Routing-only — independent of whether `loadGoalForEdit`
 * actually succeeds at runtime (which depends on Dexie content). Used
 * by Goals.tsx to pick the right modal for each edit click:
 *
 *   true  → GoalSuggestionFlow with existingGoal
 *   false → GoalCreationFlow (new-vocab non-monthly) or GoalFormModal
 *           (legacy generic vocabulary)
 *
 * Four positive cases:
 *   · new-vocab metric on a monthly goal
 *   · monthly umbrella row (targetMetric: null + relatedModules set)
 *   · monthly Repertoire song-of-month queue child (slots 2/3 + TBD)
 *   · monthly Repertoire spotlight song (song_whole_at_level)
 *
 * Closes the routing gap where umbrellas (targetMetric: null) and
 * song_of_month / song_whole_at_level metrics fell through to
 * GoalFormModal because `isNewVocabMetric(null) === false` matched
 * the legacy branch.
 */
export function isSuggestionFlowEditCandidate(goal: Goal): boolean {
  if (goal.scope !== 'monthly') return false;
  if (isNewVocabMetric(goal.targetMetric)) return true;
  if (goal.isUmbrella && goal.targetMetric === null && goal.relatedModules.length > 0) return true;
  if (goal.targetMetric === 'song_of_month') return true;
  if (
    goal.targetMetric === 'song_whole_at_level'
    && goal.relatedModules.includes('repertoire')
  ) return true;
  return false;
}

/**
 * Top-level entry: given any monthly goal the user clicked edit on,
 * return a fully-populated prefill the suggestion flow can render,
 * or null when the goal isn't eligible (unknown module, wrong scope,
 * etc.) — caller falls back to the legacy edit path.
 */
export async function loadGoalForEdit(rootGoal: Goal): Promise<EditPrefill | null> {
  const moduleId = moduleFromGoal(rootGoal);
  if (!moduleId) return null;

  const { umbrella, children } = await fetchUmbrellaAndChildren(rootGoal);
  if (children.length === 0) return null;

  const common: PrefillCommon = {
    existingChildren: children,
    umbrellaId: umbrella?.id ?? null,
    umbrella,
    targetDate: prefillTargetDate(umbrella, children),
  };

  switch (moduleId) {
    case 'harmonic-fluency':
      return { ...common, moduleId, target: mergeHf(children) };
    case 'ear-training':
      return { ...common, moduleId, target: mergeEt(children) };
    case 'shapes-and-patterns':
      return { ...common, moduleId, target: mergeShapes(children) };
    case 'production':
      return { ...common, moduleId, target: mergeProduction(children) };
    case 'practice-consistency':
      return { ...common, moduleId, target: mergePracticeConsistency(children) };
    case 'repertoire': {
      const { queue, daysTarget } = mergeRepertoireQueueAndDays(children);
      return { ...common, moduleId, queue, daysTarget };
    }
  }
}
