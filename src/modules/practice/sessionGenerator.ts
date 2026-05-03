/**
 * Phase 3 Step 7 — Session generator integration.
 *
 * Pipes the input questionnaire result through Step 2's pure
 * helpers to produce ProposalCardData[] that the proposal screen
 * renders.
 *
 * Composition: each contributing goal yields a CandidateSpec
 * (Step 2a), which resolves to an itemRef set against spacing
 * rows. For every (item, module) pair, weightForItem (Step 2d)
 * combines goal alignment, pace urgency, acquisition lift, and
 * freshness into a single per-item weight. Per module, items
 * sort by weight desc and the block's weight is the MAX item
 * weight — so a single screaming-urgent item drives the block's
 * priority. Multi-goal compounding falls out of weightForItem's
 * MAX-across-goals semantics.
 *
 * The function is async because it reads spacingState + goals
 * from Dexie. Pure-logic Step 2 helpers compose underneath.
 */

import { db, type Goal, type GoalScope, type SpacingState } from '../../lib/db';
import { moduleMetaById } from '../../lib/moduleMeta';
import { getMemoryType } from '../../lib/memoryType';
import {
  detectAbundance,
  type AbundanceReason,
} from '../../lib/sessionAlgorithm/abundance';
import {
  candidateSpecForGoal,
  resolveCandidates,
} from '../../lib/sessionAlgorithm/candidates';
import {
  generateProposals,
  blockHasAcquiringItems,
} from '../../lib/sessionAlgorithm/proposal';
import type {
  AlgorithmBlock,
  AllocatedBlock,
} from '../../lib/sessionAlgorithm/timeAllocation';
import { weightForItem } from '../../lib/sessionAlgorithm/weighting';
import { paceForCoverageGoal } from '../../lib/sessionAlgorithm/pace';
import { isAcquiring } from '../../lib/sessionAlgorithm/acquisitionStage';
import type { CandidateSpec } from '../../lib/sessionAlgorithm/types';
import { getGoalFeasibility } from '../goals/progress';
import type {
  ProposalBlock,
  ProposalCardData,
} from './proposalTypes';
import type { InputQuestionnaireResult } from './inputs';

/**
 * Build proposals from the questionnaire result. Async because it
 * reads the user's active goals + spacing rows from Dexie.
 *
 * Strategy:
 *   1. Read active goals + all spacing rows.
 *   2. Per goal, derive a CandidateSpec + pace factor.
 *   3. For each (item, module) pair contributed by a goal, run
 *      weightForItem (Step 2d) to combine goal alignment, pace,
 *      acquisition stage, and freshness into a single weight.
 *   4. Group items by module; sort items by weight desc; cap at
 *      MAX_ITEMS_PER_BLOCK. Block weight = MAX item weight.
 *   5. Run generateProposals(blocks, availableSeconds) → 1 or 2
 *      AllocatedBlock-bearing proposals.
 *   6. Map AllocatedBlocks → ProposalBlocks (display shape) using
 *      moduleMeta + a per-module activity description.
 */
export async function buildSessionProposals(
  inputs: InputQuestionnaireResult,
): Promise<ProposalCardData[]> {
  const goals = await db.goals.where('status').equals('active').toArray();
  const spacingRows = await db.spacingState.toArray();

  const moduleBlocks = aggregateGoalCandidatesByModule(goals, spacingRows);
  if (moduleBlocks.length === 0) {
    return [];
  }

  return generateAndShape(moduleBlocks, inputs.timeMinutes * 60);
}

// ---------------------------------------------------------------------
// Step 8a — Session planning (abundance-aware orchestration)
// ---------------------------------------------------------------------

/**
 * Step 8a — high-level orchestration that wraps proposal generation
 * with the abundance trigger detection from Step 2j. Returns a
 * discriminated union so the caller (PracticeSessions) can route to
 * either the standard ProposalScreen or the abundance three-path
 * screen.
 *
 * Reasons surface back to the path-screen header copy:
 *   queue-cleared / ahead-of-pace / nothing-urgent — abundance flow
 *   zero-goals — fallback flow (8f) with creative + rest paths
 */
export type SessionPlanReason = AbundanceReason | 'zero-goals';

export type SessionPlan =
  | { kind: 'proposals'; cards: ProposalCardData[] }
  | { kind: 'abundance'; reason: SessionPlanReason };

export interface SessionPlanContext {
  /** Sessions logged earlier today — gates the nothing-urgent
   *  abundance signal. Caller usually passes
   *  countEarlierSessionsToday(). */
  earlierSessionsToday: number;
}

export async function buildSessionPlan(
  inputs: InputQuestionnaireResult,
  context: SessionPlanContext,
): Promise<SessionPlan> {
  const goals = await db.goals.where('status').equals('active').toArray();

  // Zero-goals: nothing for the algorithm to chew on. Surfaces the
  // 8f fallback paths instead of a confusing empty proposal screen.
  if (goals.length === 0) {
    return { kind: 'abundance', reason: 'zero-goals' };
  }

  const spacingRows = await db.spacingState.toArray();
  const moduleBlocks = aggregateGoalCandidatesByModule(goals, spacingRows);

  const candidatePoolSize = moduleBlocks.reduce(
    (sum, b) => sum + b.itemRefs.length,
    0,
  );
  const topItemWeight = moduleBlocks.reduce(
    (max, b) => Math.max(max, b.weight),
    0,
  );
  const goalPaceRatios = computeGoalPaceRatios(goals);

  const abundance = detectAbundance({
    candidatePoolSize,
    topItemWeight,
    goalPaceRatios,
    earlierSessionsToday: context.earlierSessionsToday,
  });

  if (abundance.triggered && abundance.reason) {
    return { kind: 'abundance', reason: abundance.reason };
  }

  if (moduleBlocks.length === 0) {
    // Defensive — detectAbundance would normally fire queue-cleared
    // here (candidatePoolSize=0), but if the thresholds ever drift
    // we still want a sensible fallback rather than an empty
    // proposal screen.
    return { kind: 'abundance', reason: 'queue-cleared' };
  }

  return {
    kind: 'proposals',
    cards: generateAndShape(moduleBlocks, inputs.timeMinutes * 60),
  };
}

/**
 * Pace ratio per measurable goal — used by the abundance detector's
 * ahead-of-pace branch. Aspirational + unknown feasibilities are
 * skipped (not measurable). Ratio = projected / target; >= 1.0 means
 * on or ahead of the straight-line trajectory.
 */
function computeGoalPaceRatios(goals: ReadonlyArray<Goal>): number[] {
  const today = new Date();
  const ratios: number[] = [];
  for (const goal of goals) {
    const f = getGoalFeasibility(goal, {
      currentValue: goal.currentValue,
      today,
    });
    if (f.kind === 'measurable' && f.target > 0) {
      ratios.push(f.projected / f.target);
    }
  }
  return ratios;
}

function generateAndShape(
  moduleBlocks: AlgorithmBlock[],
  availableSeconds: number,
): ProposalCardData[] {
  const proposals = generateProposals({
    blocks: moduleBlocks,
    availableSeconds,
  });
  return proposals.map(p => ({
    kind: p.kind,
    title: p.title,
    blocks: p.blocks.map(b => toProposalBlock(b)),
    totalSeconds: p.totalSeconds,
  }));
}

// ---------------------------------------------------------------------
// Step 8c — Path-specific proposal generation
// ---------------------------------------------------------------------

export type AbundancePath = 'get-ahead' | 'drive-home' | 'expand';

/**
 * Build proposals scoped to one of the abundance paths. Filters
 * spacing rows by the path's semantic intent before running the
 * standard module-aggregation + generation pipeline:
 *
 *   get-ahead   — items not yet due (nextDueAt > now). Bank
 *                 progress on what's coming up.
 *   drive-home  — items already in motion (acquiring) or
 *                 consolidated (acquired). Reinforcement.
 *   expand      — items at the 'new' stage. Break new ground.
 *
 * Items are shuffled per call so Regenerate (8e) returns a fresh
 * selection each time. If the path filter eliminates everything,
 * we fall back to the unfiltered pool so the user still gets a
 * proposal — better to be slightly off-intent than to land on an
 * empty screen.
 */
export async function buildSessionProposalsForPath(
  path: AbundancePath,
  inputs: InputQuestionnaireResult,
): Promise<ProposalCardData[]> {
  const goals = await db.goals.where('status').equals('active').toArray();
  if (goals.length === 0) return [];

  const spacingRows = await db.spacingState.toArray();
  const filteredRows = filterSpacingRowsByPath(spacingRows, path);
  const shuffledFiltered = shuffleInPlace(filteredRows.slice());

  const availableSeconds = inputs.timeMinutes * 60;

  const filteredBlocks = aggregateGoalCandidatesByModule(goals, shuffledFiltered);
  if (filteredBlocks.length > 0) {
    return generateAndShape(filteredBlocks, availableSeconds);
  }

  // Fallback — shuffle the full pool so we still introduce fresh
  // variety even though the path filter came up empty.
  const fallbackBlocks = aggregateGoalCandidatesByModule(
    goals,
    shuffleInPlace(spacingRows.slice()),
  );
  if (fallbackBlocks.length === 0) return [];
  return generateAndShape(fallbackBlocks, availableSeconds);
}

export function filterSpacingRowsByPath(
  rows: ReadonlyArray<SpacingState>,
  path: AbundancePath,
): SpacingState[] {
  const now = Date.now();
  switch (path) {
    case 'get-ahead':
      return rows.filter(r => r.nextDueAt !== null && r.nextDueAt > now);
    case 'drive-home':
      return rows.filter(
        r => r.acquisitionStage === 'acquiring' || r.acquisitionStage === 'acquired',
      );
    case 'expand':
      return rows.filter(r => r.acquisitionStage === 'new');
  }
}

/** Fisher–Yates shuffle. Mutates the array. */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------
// Goal-driven module aggregation
// ---------------------------------------------------------------------

/** Cap on items carried into a block. Beyond this the per-item
 *  weight ranking still picks the most urgent items first. */
const MAX_ITEMS_PER_BLOCK = 20;

/**
 * Per-goal pace factor — applies to goals with an item-count
 * denominator (coverage, production_count). Returns 1.0 (neutral)
 * for accuracy / consistency / song / unsupported goals; their
 * pace shape needs a different model and is deferred. Also
 * returns 1.0 when the goal lacks a usable target value or has a
 * zero-length period.
 */
export function paceFactorForGoal(
  goal: Goal,
  spec: CandidateSpec,
  now: number,
): number {
  if (spec.kind !== 'coverage' && spec.kind !== 'production_count') return 1.0;
  if (goal.targetValue === null || goal.targetValue <= 0) return 1.0;
  if (goal.targetDate <= goal.startDate) return 1.0;
  return paceForCoverageGoal({
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    totalItems: goal.targetValue,
    actualCoverage: goal.currentValue,
    now,
  }).factor;
}

/**
 * Aggregate active goals + spacing rows into one AlgorithmBlock
 * per module. Per-item weighting (Step 2d) drives the block
 * weight; items sort by weight desc so the urgent ones survive
 * the per-block cap.
 *
 * Behavior note: the block weight is now the MAX per-item weight
 * (was MAX goalAlignmentFactor). This ranges higher (up to ~13)
 * than the old [1.0, 1.8] range; downstream consumers
 * (proposal sort, drop priority, focused split) are scale-
 * invariant. The abundance detector's nothing-urgent threshold
 * (1.5) now reflects "no pressure across all signals" rather
 * than "no goal-scope lift" — semantic shift; recalibrate after
 * real-data sessions if the branch fires too rarely or too often.
 *
 * The `now` parameter exists as a test seam so weighting outputs
 * are deterministic. Production callers pass Date.now().
 */
export function aggregateGoalCandidatesByModule(
  goals: ReadonlyArray<Goal>,
  spacingRows: ReadonlyArray<SpacingState>,
  now: number = Date.now(),
): AlgorithmBlock[] {
  const acquiringItemRefs = new Set<string>();
  const rowByItemRef = new Map<string, SpacingState>();
  for (const row of spacingRows) {
    rowByItemRef.set(row.itemRef, row);
    if (isAcquiring(row)) acquiringItemRefs.add(row.itemRef);
  }

  // (itemRef, moduleRef) -> contributing goals (scope + paceFactor).
  // Same item can land in different moduleRefs across goals (e.g. an
  // ET overall goal + a sub-area goal both touching one note). Keying
  // on the joint pair keeps per-module aggregation clean while
  // letting weightForItem's MAX-across-goals do multi-goal
  // compounding inside each (item, module) cell.
  const contributingByItemModule = new Map<
    string,
    { scope: GoalScope; paceFactor: number }[]
  >();

  for (const goal of goals) {
    const spec = candidateSpecForGoal(goal);
    if (spec.kind === 'umbrella' || spec.kind === 'unsupported') continue;

    const candidateModuleRefs =
      'moduleRefs' in spec ? spec.moduleRefs : [];
    if (candidateModuleRefs.length === 0) continue;

    const paceFactor = paceFactorForGoal(goal, spec, now);
    const itemRefs = resolveCandidates(spec, spacingRows);

    for (const itemRef of itemRefs) {
      const row = rowByItemRef.get(itemRef);
      if (!row) continue;
      if (!candidateModuleRefs.includes(row.moduleRef)) continue;

      const key = `${itemRef}\x00${row.moduleRef}`;
      const list = contributingByItemModule.get(key);
      if (list) {
        list.push({ scope: goal.scope, paceFactor });
      } else {
        contributingByItemModule.set(key, [
          { scope: goal.scope, paceFactor },
        ]);
      }
    }
  }

  // Compute per-item weight, group by module.
  type ItemWithWeight = { itemRef: string; weight: number };
  const byModule = new Map<string, ItemWithWeight[]>();

  for (const [key, contributingGoals] of contributingByItemModule) {
    const sep = key.indexOf('\x00');
    const itemRef = key.slice(0, sep);
    const moduleRef = key.slice(sep + 1);
    const row = rowByItemRef.get(itemRef);

    const { weight } = weightForItem({
      row,
      goals: contributingGoals,
      priority: undefined, // Phase 3: no per-item priority UI yet.
      now,
    });

    const arr = byModule.get(moduleRef);
    if (arr) arr.push({ itemRef, weight });
    else byModule.set(moduleRef, [{ itemRef, weight }]);
  }

  const blocks: AlgorithmBlock[] = [];
  let idx = 0;
  for (const [moduleRef, items] of byModule) {
    items.sort((a, b) => b.weight - a.weight);
    const top = items.slice(0, MAX_ITEMS_PER_BLOCK);
    if (top.length === 0) continue;

    const itemRefs = top.map(i => i.itemRef);
    const blockWeight = top[0].weight;

    blocks.push({
      id: `block-${idx}-${moduleRef}`,
      moduleRef,
      memoryType: safeMemoryType(moduleRef),
      itemRefs,
      weight: blockWeight,
      hasAcquiringItems: blockHasAcquiringItems(itemRefs, acquiringItemRefs),
    });
    idx++;
  }

  return blocks;
}

function safeMemoryType(moduleRef: string): AlgorithmBlock['memoryType'] {
  try {
    return getMemoryType(moduleRef);
  } catch {
    return 'declarative';
  }
}

// ---------------------------------------------------------------------
// AlgorithmBlock → ProposalBlock display mapping
// ---------------------------------------------------------------------

function toProposalBlock(block: AllocatedBlock): ProposalBlock {
  const meta = moduleMetaById(block.moduleRef);
  const moduleLabel = meta?.label ?? block.moduleRef;
  const moduleAccentHex = meta?.accentHex ?? '#4a9088';

  return {
    id: block.id,
    moduleRef: block.moduleRef,
    moduleLabel,
    moduleAccentHex,
    activityDescription: describeActivity(block),
    plannedSeconds: block.plannedSeconds,
    whySnippet: deriveWhySnippet(block),
    itemRefs: block.itemRefs,
    isWarmup: false,
  };
}

/**
 * Tier-1 activity descriptions: per-memory-type generic templates
 * keyed off block.memoryType + moduleRef + item count. The
 * SessionBlock UI already renders the module label (upper line)
 * and the duration (right side) separately — this string fills
 * the lower line, so it should NOT repeat either.
 *
 * Tier 2 (deferred — see BUILD_SEQUENCER_2.md polish-sprint
 * deferred list) adds itemRef → display-name resolvers per module
 * so the line can surface specific lesson titles, song names,
 * card categories, etc.
 */
export function describeActivity(block: AllocatedBlock): string {
  const count = block.itemRefs.length;
  const plural = (n: number, singular: string, pluralForm: string) =>
    `${n} ${n === 1 ? singular : pluralForm}`;

  switch (block.memoryType) {
    case 'declarative':
      return `flashcards · ${plural(count, 'card', 'cards')}`;
    case 'procedural':
      return `drills · ${plural(count, 'item', 'items')}`;
    case 'integration':
      if (block.moduleRef === 'repertoire') {
        return `repertoire · ${plural(count, 'song', 'songs')}`;
      }
      if (block.moduleRef === 'production') {
        return `lessons · ${plural(count, 'lesson', 'lessons')}`;
      }
      return `session work · ${plural(count, 'item', 'items')}`;
    case 'expression':
      return 'freeform play';
  }
}

function deriveWhySnippet(block: AllocatedBlock): string {
  const itemCount = block.itemRefs.length;
  if (block.hasAcquiringItems) {
    return `${itemCount} item${itemCount === 1 ? '' : 's'} in motion · keep the touch density up`;
  }
  if (itemCount > 0) {
    return `${itemCount} item${itemCount === 1 ? '' : 's'} ready for review`;
  }
  return 'Cold-start — building from your goals';
}
