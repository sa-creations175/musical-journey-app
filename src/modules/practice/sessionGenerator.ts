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

import {
  db,
  type FlashcardState,
  type Goal,
  type GoalScope,
  type PracticeSessionContext,
  type SpacingState,
} from '../../lib/db';
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
  contextFactorForModule,
  isModuleAllowedForContext,
} from '../../lib/sessionAlgorithm/contextWeighting';
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
import {
  computeWeeklyPaceByModule,
  type BehindPaceNotice,
} from '../../lib/sessionAlgorithm/weeklyPace';
import { isAcquiring } from '../../lib/sessionAlgorithm/acquisitionStage';
import {
  loadRepertoireSplitContext,
  splitRepertoireAllocation,
  type RepertoireSplitContext,
} from './repertoireSplit';
import type { CandidateSpec } from '../../lib/sessionAlgorithm/types';
import {
  ET_MODULE_REFS,
  getGoalFeasibility,
  HF_MODULE_REF,
  PRODUCTION_MODULE_REF,
  REPERTOIRE_MODULE_REF,
  SHAPES_MODULE_REF,
} from '../goals/progress';
import {
  endOfWeekLocal,
  startOfWeekLocal,
} from '../goals/weeklyPlanData';
import { getWeeklyAttempts } from '../../lib/weeklyAttempts';
import {
  getEligibleItems as getChordRecognitionEligibleItems,
  getUnlockedTier as getChordRecognitionUnlockedTier,
} from '../ear-training/chord-recognition/tierUnlock';
import type { GoalFlowModuleId } from '../goals/goalVocabulary';
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
/**
 * Resolve the chord-recognition progressive-difficulty gate once
 * per session. Reads attempt history (for the unlock walk) +
 * spacingState rows (for the staged-introduction signal), then
 * returns the set of itemRefs the chord-recognition module is
 * allowed to surface this session. Passed through
 * `aggregateGoalCandidatesByModule` → `resolveCandidates` so locked
 * tiers + not-yet-introduced items drop before they reach proposal
 * weighting.
 */
async function loadChordRecognitionEligibleSet(
  spacingRows: ReadonlyArray<SpacingState>,
): Promise<ReadonlySet<string>> {
  const tier = await getChordRecognitionUnlockedTier();
  return new Set(getChordRecognitionEligibleItems(tier, spacingRows));
}

export async function buildSessionProposals(
  inputs: InputQuestionnaireResult,
): Promise<ProposalCardData[]> {
  const goals = await db.goals.where('status').equals('active').toArray();
  const spacingRows = await db.spacingState.toArray();
  const now = Date.now();
  const weeklyPace = await loadWeeklyPace(now);
  const chordRecognitionEligibleItems = await loadChordRecognitionEligibleSet(spacingRows);

  const moduleBlocks = aggregateGoalCandidatesByModule(
    goals,
    spacingRows,
    now,
    inputs.context,
    weeklyPace.factorByModule,
    undefined,
    chordRecognitionEligibleItems,
  );

  const repertoireSplit = await loadRepertoireSplitContext(inputs.context, now);
  const withColdStart = maybeInjectRepertoireColdStartBlock(
    moduleBlocks,
    goals,
    repertoireSplit,
    inputs.context,
  );
  if (withColdStart.length === 0) return [];
  const itemLabels = await loadShapesDrillLabels(withColdStart);
  return generateAndShape(withColdStart, inputs.timeMinutes * 60, repertoireSplit, itemLabels);
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
  | {
      kind: 'proposals';
      cards: ProposalCardData[];
      /** Phase 4 Step 4 — modules meaningfully behind on this week's
       *  attempt cadence (below 50% of weekly target with > 2 days
       *  left). Surfaced on the proposal screen as user-actionable
       *  nudges ("You're behind on HF this week — add it to this
       *  session?"). Independent of the context hard filter — a
       *  user on a keys session can still get a notice for HF.
       *  Empty array when no module qualifies. */
      behindPaceNotices: BehindPaceNotice[];
    }
  | { kind: 'abundance'; reason: SessionPlanReason };

export interface SessionPlanContext {
  /** Sessions logged earlier today — gates the nothing-urgent
   *  abundance signal. Caller usually passes
   *  countEarlierSessionsToday(). */
  earlierSessionsToday: number;
}

/**
 * Phase 4 Step 4 — proposal-generation options that don't belong on
 * the questionnaire input itself. `forceIncludeModules` overrides
 * the context hard filter for the named GoalFlowModuleIds so a
 * user acting on a behind-pace notice ("add HF to this session?")
 * gets HF candidates even on a keys session.
 */
export interface SessionPlanOptions {
  /** Module ids the hard filter should let through regardless of
   *  context. Useful when the user explicitly accepts a behind-pace
   *  notice for a module that the context arc would otherwise
   *  exclude. Empty array (the default) means honor the hard filter
   *  unchanged. */
  forceIncludeModules?: ReadonlyArray<GoalFlowModuleId>;
}

export async function buildSessionPlan(
  inputs: InputQuestionnaireResult,
  context: SessionPlanContext,
  options: SessionPlanOptions = {},
): Promise<SessionPlan> {
  const goals = await db.goals.where('status').equals('active').toArray();

  // Zero-goals: nothing for the algorithm to chew on. Surfaces the
  // 8f fallback paths instead of a confusing empty proposal screen.
  if (goals.length === 0) {
    return { kind: 'abundance', reason: 'zero-goals' };
  }

  const now = Date.now();
  const spacingRows = await db.spacingState.toArray();
  // Phase 4 Step 4 — weekly-pace pressure resolved upstream so the
  // module-level factor map can be applied during block aggregation.
  // Behind-pace notices ride alongside the cards back to the UI.
  // Notices are computed from raw weekly goals BEFORE context
  // filtering so a user on a keys session can still see "behind on
  // HF" — the yes-action uses + Add module to inject the named
  // module past the hard filter.
  const weeklyPace = await loadWeeklyPace(now);
  const chordRecognitionEligibleItems = await loadChordRecognitionEligibleSet(spacingRows);
  const aggregated = aggregateGoalCandidatesByModule(
    goals,
    spacingRows,
    now,
    inputs.context,
    weeklyPace.factorByModule,
    options.forceIncludeModules,
    chordRecognitionEligibleItems,
  );
  const repertoireSplit = await loadRepertoireSplitContext(inputs.context, now);
  // Inject a Repertoire cold-start block before abundance detection so
  // a song goal with no spacing data doesn't trigger queue-cleared —
  // there IS work waiting (the spotlight + maintenance songs), it
  // just isn't recorded in spacingState yet.
  const moduleBlocks = maybeInjectRepertoireColdStartBlock(
    aggregated,
    goals,
    repertoireSplit,
    inputs.context,
  );

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

  // Decide on the Production-vocab block BEFORE allocation so its
  // duration fits inside the user's requested time instead of
  // bolting on top of it. The prior order — allocate full budget →
  // prepend vocab → bump totalSeconds — meant a 15-min request
  // rendered as a 25-min proposal (commit 26c4768 introduced the
  // prepend; this restores honesty of the requested-time cap).
  //
  // maybeBuildProductionVocabBlock now sizes the block proportional
  // to the session (15%, clamped to [3 min, 10 min]) and returns
  // null when the carve-out would push practice below
  // MIN_VIABLE_PRACTICE_SECONDS — in which case the full requested
  // time flows to practice.
  const requestedSeconds = inputs.timeMinutes * 60;
  const vocabBlock = await maybeBuildProductionVocabBlock({
    goals,
    context: inputs.context,
    now,
    availableSeconds: requestedSeconds,
  });
  const availableSeconds = vocabBlock !== null
    ? requestedSeconds - vocabBlock.plannedSeconds
    : requestedSeconds;

  const itemLabels = await loadShapesDrillLabels(moduleBlocks);
  const cards = generateAndShape(
    moduleBlocks,
    availableSeconds,
    repertoireSplit,
    itemLabels,
  );
  return {
    kind: 'proposals',
    cards: vocabBlock ? cards.map(c => prependVocabBlock(c, vocabBlock)) : cards,
    behindPaceNotices: weeklyPace.notices,
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
  repertoireSplit: RepertoireSplitContext | null = null,
  /** itemRef → human label resolver, supplied by the async caller
   *  via `loadShapesDrillLabels`. Used by describeActivity for
   *  Shapes & Patterns blocks so the proposal card names the
   *  actual drill ("Major triads · 6 items") instead of the
   *  generic "drills · 6 items". Undefined → no labels (fallback
   *  behaviour preserved for callers / tests that haven't
   *  pre-loaded). */
  itemLabels: ReadonlyMap<string, string> | null = null,
): ProposalCardData[] {
  const proposals = generateProposals({
    blocks: moduleBlocks,
    availableSeconds,
  });
  return proposals.map(p => ({
    kind: p.kind,
    title: p.title,
    blocks: p.blocks.flatMap(b => toProposalBlocks(b, repertoireSplit, itemLabels)),
    totalSeconds: p.totalSeconds,
  }));
}

/**
 * Pre-load denormalised labels from `db.drillSkills` for every
 * Shapes & Patterns itemRef across the given block list. The
 * proposal screen renders these in `describeActivity` so the user
 * sees "Major triads · 6 items" instead of "drills · 6 items".
 *
 * Single bulkGet — the typical S&P session targets a handful of
 * skills (one drill kind across a few keys), so the query is
 * cheap. Non-S&P blocks are filtered out before the lookup.
 */
async function loadShapesDrillLabels(
  blocks: ReadonlyArray<AlgorithmBlock>,
): Promise<Map<string, string>> {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.moduleRef !== SHAPES_MODULE_REF) continue;
    for (const ref of b.itemRefs) ids.push(ref);
  }
  if (ids.length === 0) return new Map();
  const rows = await db.drillSkills.bulkGet(ids);
  const out = new Map<string, string>();
  rows.forEach((row, i) => {
    if (row?.label) out.set(ids[i], row.label);
  });
  return out;
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
  const now = Date.now();
  const weeklyPace = await loadWeeklyPace(now);
  // Eligibility set built off the FULL spacingRows snapshot so the
  // "introduced" signal isn't accidentally narrowed by the path
  // filter. Path-filtered + fallback aggregations both consume the
  // same set.
  const chordRecognitionEligibleItems = await loadChordRecognitionEligibleSet(spacingRows);

  const filteredBlocks = aggregateGoalCandidatesByModule(
    goals,
    shuffledFiltered,
    now,
    inputs.context,
    weeklyPace.factorByModule,
    undefined,
    chordRecognitionEligibleItems,
  );
  const repertoireSplit = await loadRepertoireSplitContext(inputs.context, now);
  const filteredWithColdStart = maybeInjectRepertoireColdStartBlock(
    filteredBlocks,
    goals,
    repertoireSplit,
    inputs.context,
  );
  if (filteredWithColdStart.length > 0) {
    const filteredItemLabels = await loadShapesDrillLabels(filteredWithColdStart);
    return generateAndShape(
      filteredWithColdStart,
      availableSeconds,
      repertoireSplit,
      filteredItemLabels,
    );
  }

  // Fallback — shuffle the full pool so we still introduce fresh
  // variety even though the path filter came up empty.
  const fallbackBlocks = aggregateGoalCandidatesByModule(
    goals,
    shuffleInPlace(spacingRows.slice()),
    now,
    inputs.context,
    weeklyPace.factorByModule,
    undefined,
    chordRecognitionEligibleItems,
  );
  const fallbackWithColdStart = maybeInjectRepertoireColdStartBlock(
    fallbackBlocks,
    goals,
    repertoireSplit,
    inputs.context,
  );
  if (fallbackWithColdStart.length === 0) return [];
  const fallbackItemLabels = await loadShapesDrillLabels(fallbackWithColdStart);
  return generateAndShape(
    fallbackWithColdStart,
    availableSeconds,
    repertoireSplit,
    fallbackItemLabels,
  );
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

// ---------------------------------------------------------------------
// Phase 4 Step 4 — Weekly-pace integration helpers
// ---------------------------------------------------------------------

const ET_MODULE_REFS_SET: ReadonlySet<string> = new Set(ET_MODULE_REFS);

/**
 * Map a spacingState moduleRef onto the GoalFlowModuleId space used
 * by weekly goals + getWeeklyAttempts. Each ET sub-module rolls up
 * to 'ear-training' so a weekly ET goal's pace boost lifts every
 * sub-module's blocks uniformly. Returns null for moduleRefs we
 * don't recognise (e.g. mental-viz, future modules) so the caller
 * skips applying a weekly factor rather than crashing.
 */
export function goalFlowModuleForSpacingModuleRef(
  moduleRef: string,
): GoalFlowModuleId | null {
  if (moduleRef === HF_MODULE_REF) return 'harmonic-fluency';
  if (ET_MODULE_REFS_SET.has(moduleRef)) return 'ear-training';
  if (moduleRef === SHAPES_MODULE_REF) return 'shapes-and-patterns';
  if (moduleRef === REPERTOIRE_MODULE_REF) return 'repertoire';
  if (moduleRef === PRODUCTION_MODULE_REF) return 'production';
  return null;
}

/**
 * Load the current week's actual attempt counts per GoalFlowModuleId,
 * for use by computeWeeklyPaceByModule. One getWeeklyAttempts call
 * per module — five total. Practice-consistency is excluded because
 * a "practice consistency" weekly goal doesn't drive item-level
 * boosting; its cadence is met by ANY module's session count,
 * already covered by the generic block weighting.
 */
async function loadAttemptsByModule(
  weekStart: number,
  weekEnd: number,
): Promise<Map<string, number>> {
  const modules: ReadonlyArray<GoalFlowModuleId> = [
    'harmonic-fluency',
    'ear-training',
    'shapes-and-patterns',
    'repertoire',
    'production',
  ];
  const out = new Map<string, number>();
  await Promise.all(
    modules.map(async m => {
      out.set(m, await getWeeklyAttempts(m, weekStart, weekEnd));
    }),
  );
  return out;
}

/**
 * Resolve weekly-pace factors + behind-pace notices for the current
 * week. Async wrapper around `computeWeeklyPaceByModule` that does
 * the Dexie load for weekly Goal records + per-module attempt
 * counts. Pure helpers underneath; this just bridges to storage.
 */
export async function loadWeeklyPace(now: number = Date.now()): Promise<{
  factorByModule: Map<string, number>;
  notices: BehindPaceNotice[];
}> {
  const weekStart = startOfWeekLocal(now);
  const weekEnd = endOfWeekLocal(weekStart);
  const allGoals = await db.goals.toArray();
  const weeklyGoals = allGoals.filter(
    g =>
      g.scope === 'weekly' &&
      g.status === 'active' &&
      g.startDate <= now &&
      g.targetDate >= now,
  );
  if (weeklyGoals.length === 0) {
    return { factorByModule: new Map(), notices: [] };
  }
  const attemptsByModule = await loadAttemptsByModule(weekStart, weekEnd);
  return computeWeeklyPaceByModule({
    weeklyGoals,
    attemptsByModule,
    now,
  });
}

// ---------------------------------------------------------------------
// Context-based hard filtering
// ---------------------------------------------------------------------

/**
 * Capability rank per practice context. A user on a higher-rank
 * context can do anything a lower-rank context can do, plus more.
 * Mixed is treated as keys-equivalent (most permissive).
 */
const CONTEXT_RANK: Record<PracticeSessionContext, number> = {
  keys: 3,
  mixed: 3,
  laptop: 2,
  phone: 1,
};

/**
 * True when the user's current context can satisfy the goal's
 * required context. Goals with no contextTag (null) always pass —
 * they're not constrained to any particular setup.
 */
export function isGoalCompatibleWithContext(
  goal: Goal,
  userContext: PracticeSessionContext,
): boolean {
  if (goal.contextTag === null) return true;
  return CONTEXT_RANK[userContext] >= CONTEXT_RANK[goal.contextTag];
}

/**
 * Module-level item filter — Phase 3 polish + Phase 4 Step 5
 * context-arc extension. Two rules layered:
 *
 *   non-keys / non-mixed  → Shapes & Patterns dropped (physical-keys
 *                           only; mental-viz isn't in spacingState).
 *
 *   keys / mixed          → only Shapes + Repertoire surface; HF +
 *                           every ET sub-module + Production excluded
 *                           by default. Keeps physical-instrument
 *                           sessions focused on Shapes drills and
 *                           song work; cognitive modules get the
 *                           laptop/phone arcs instead. User can
 *                           manually inject excluded modules via
 *                           the + Add module affordance — this
 *                           hard filter only governs default
 *                           proposals.
 *
 * Mental-viz remains reachable from the Shapes tab; it never enters
 * algorithm-generated blocks because it doesn't write spacingState
 * rows.
 *
 * Delegated to `isModuleAllowedForContext` in contextWeighting.ts so
 * the per-module rules live alongside the per-module weight tables.
 */
export function isSpacingRowCompatibleWithContext(
  row: SpacingState,
  userContext: PracticeSessionContext,
): boolean {
  return isModuleAllowedForContext(row.moduleRef, userContext);
}

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
  context: PracticeSessionContext = 'mixed',
  /** Phase 4 Step 4 — per-GoalFlowModuleId pace boost applied as a
   *  block-weight multiplier. Falls through to 1.0 (no boost) when
   *  the module isn't in the map or when no weekly goal exists for
   *  it. Production callers pre-compute via `loadWeeklyPace()`;
   *  tests pass a literal Map. */
  weeklyPaceFactorByModule: ReadonlyMap<string, number> = new Map(),
  /** Phase 4 Step 4 — modules that should bypass the context hard
   *  filter for this proposal (e.g. user accepted a behind-pace
   *  notice on a keys session for HF). Mapped to spacingState
   *  moduleRefs internally via goalFlowModuleForSpacingModuleRef's
   *  inverse. Empty by default. */
  forceIncludeModules: ReadonlyArray<GoalFlowModuleId> = [],
  /** Chord-recognition progressive-difficulty eligibility set —
   *  passed through to `resolveCandidates`. Undefined preserves
   *  pre-progressive-difficulty behaviour, used by tests of the
   *  surrounding aggregation logic that don't care about
   *  chord-recognition tiering. Production callers compute via
   *  `getUnlockedTier` + `getEligibleItems` once per session. */
  chordRecognitionEligibleItems?: ReadonlySet<string>,
): AlgorithmBlock[] {
  // Build the inverse of goalFlowModuleForSpacingModuleRef: which
  // spacingState moduleRefs are protected from the hard filter for
  // this proposal. Done once per call so the row-filter step stays
  // O(rows).
  const forcedSpacingModuleRefs = new Set<string>();
  for (const m of forceIncludeModules) {
    if (m === 'harmonic-fluency') forcedSpacingModuleRefs.add(HF_MODULE_REF);
    else if (m === 'ear-training') for (const r of ET_MODULE_REFS) forcedSpacingModuleRefs.add(r);
    else if (m === 'shapes-and-patterns') forcedSpacingModuleRefs.add(SHAPES_MODULE_REF);
    else if (m === 'repertoire') forcedSpacingModuleRefs.add(REPERTOIRE_MODULE_REF);
    else if (m === 'production') forcedSpacingModuleRefs.add(PRODUCTION_MODULE_REF);
    // 'practice-consistency' has no spacingState rows of its own;
    // force-including it is a no-op at this layer.
  }

  // Hard-filter spacing rows by context before any aggregation. Drops
  // rows the context arc excludes (e.g. HF/ET/Production under keys,
  // shapes under non-keys). Rows whose moduleRef is in
  // forcedSpacingModuleRefs bypass the filter — the user explicitly
  // opted that module in via the behind-pace notice.
  const filteredRows = spacingRows.filter(r =>
    forcedSpacingModuleRefs.has(r.moduleRef)
      || isSpacingRowCompatibleWithContext(r, context),
  );

  const acquiringItemRefs = new Set<string>();
  const rowByItemRef = new Map<string, SpacingState>();
  for (const row of filteredRows) {
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
    // Skip goals whose required context the current session can't
    // satisfy (rank ladder: keys/mixed > laptop > phone). Goals with
    // a null contextTag always pass.
    if (!isGoalCompatibleWithContext(goal, context)) continue;

    const spec = candidateSpecForGoal(goal);
    if (spec.kind === 'umbrella' || spec.kind === 'unsupported') continue;

    const candidateModuleRefs =
      'moduleRefs' in spec ? spec.moduleRefs : [];
    if (candidateModuleRefs.length === 0) continue;

    const paceFactor = paceFactorForGoal(goal, spec, now);
    // Resolve against filtered rows so module-level drops cascade
    // automatically — a goal that targets only Shapes items will
    // produce zero candidates under non-keys.
    const itemRefs = resolveCandidates(spec, filteredRows, chordRecognitionEligibleItems);

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

    // Phase 4 Step 4 + Step 5 — block-weight post-multipliers:
    //   weeklyPaceFactor  — boosts modules behind on the current
    //                       week's attempt cadence (per-module,
    //                       not per-item). MAX item weight already
    //                       carries per-item pace lift from
    //                       weighting.ts; this layers on top.
    //   contextFactor     — tunes module priority per session
    //                       context (laptop foregrounds Production
    //                       + chord-progressions; phone foregrounds
    //                       HF/ET). Pure multiplier on the block.
    const goalFlowModule = goalFlowModuleForSpacingModuleRef(moduleRef);
    const weeklyPaceFactor = goalFlowModule
      ? weeklyPaceFactorByModule.get(goalFlowModule) ?? 1.0
      : 1.0;
    const contextFactor = contextFactorForModule(moduleRef, context);
    const blockWeight = top[0].weight * weeklyPaceFactor * contextFactor;

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

/**
 * Moderate weight for synthetic cold-start Repertoire blocks. Pitched
 * to land between "neutral" (~1.0) and "heavy pace pressure" (~13)
 * so a Repertoire goal with no spacing data still ranks competitively
 * but doesn't crowd out genuinely urgent items elsewhere.
 */
const COLD_START_REPERTOIRE_WEIGHT = 5;

/**
 * Cold-start support for song goals. The aggregator above only emits a
 * Repertoire block when at least one spacingState row carries
 * moduleRef='repertoire' — which only happens after the user has
 * logged practice on a song. Goals on songs with no songCellRunThroughs
 * (the cold-start case) would otherwise never surface in proposals.
 *
 * loadRepertoireSplitContext already finds the right spotlight +
 * maintenance candidate (lowest-learningOrder not-yet-comfortable
 * song), so the only missing piece is injecting an AlgorithmBlock so
 * generateProposals + toProposalBlocks have something to allocate
 * Repertoire time to. The downstream split (toProposalBlocks) reads
 * the split context as its source of truth and overwrites itemRefs
 * with the spotlight/maintenance songIds.
 *
 * Conditions for injection:
 *   · at least one active song_proficiency goal (Song of the Month,
 *     song_whole_at_level, etc.)
 *   · context permits Repertoire (not phone/laptop arcs)
 *   · no Repertoire block was generated from spacing rows
 *   · loadRepertoireSplitContext returned a candidate (spotlight OR
 *     maintenance — TBD-only spotlight still counts, since the split
 *     surfaces an "Add a song in Goals" inline action).
 */
export function maybeInjectRepertoireColdStartBlock(
  blocks: AlgorithmBlock[],
  goals: ReadonlyArray<Goal>,
  repertoireSplit: RepertoireSplitContext | null,
  context: PracticeSessionContext,
): AlgorithmBlock[] {
  if (blocks.some(b => b.moduleRef === REPERTOIRE_MODULE_REF)) return blocks;
  if (!isModuleAllowedForContext(REPERTOIRE_MODULE_REF, context)) return blocks;
  const hasSongGoal = goals.some(
    g => candidateSpecForGoal(g).kind === 'song_proficiency',
  );
  if (!hasSongGoal) return blocks;
  if (!repertoireSplit) return blocks;
  const hasSpotlight = !!repertoireSplit.spotlight;
  const hasMaintenance = !!repertoireSplit.maintenanceSong;
  if (!hasSpotlight && !hasMaintenance) return blocks;

  // Collect concrete songIds as itemRefs (downstream split overwrites
  // these from the split context, but having them here keeps the
  // block coherent with its eventual content for any consumer that
  // inspects itemRefs pre-split). TBD spotlight contributes nothing
  // here — refId is null — but the split still produces a TBD block.
  const itemRefs: string[] = [];
  const s = repertoireSplit.spotlight;
  if (s && s.kind === 'song' && s.refId) itemRefs.push(s.refId);
  if (repertoireSplit.maintenanceSong) {
    itemRefs.push(repertoireSplit.maintenanceSong.id);
  }

  return [
    ...blocks,
    {
      id: 'block-repertoire-cold-start',
      moduleRef: REPERTOIRE_MODULE_REF,
      memoryType: safeMemoryType(REPERTOIRE_MODULE_REF),
      itemRefs,
      weight: COLD_START_REPERTOIRE_WEIGHT,
      hasAcquiringItems: false,
    },
  ];
}

// ---------------------------------------------------------------------
// AlgorithmBlock → ProposalBlock display mapping
// ---------------------------------------------------------------------

/**
 * Translate one AllocatedBlock to one OR two ProposalBlocks.
 *
 * For Repertoire blocks with a known split context (spotlight +
 * maintenance candidates), the block splits into two display rows
 * per the Song-of-the-Month spec. For every other module the
 * function returns a single ProposalBlock — same shape as before.
 */
function toProposalBlocks(
  block: AllocatedBlock,
  repertoireSplit: RepertoireSplitContext | null,
  itemLabels: ReadonlyMap<string, string> | null = null,
): ProposalBlock[] {
  const meta = moduleMetaById(block.moduleRef);
  const moduleLabel = meta?.label ?? block.moduleRef;
  const moduleAccentHex = meta?.accentHex ?? '#4a9088';

  // Repertoire split — only when we have at least one of spotlight
  // OR maintenance. When both are absent the original single block
  // passes through unchanged. Setup + chord-quiz blocks ride the
  // same mapping; their `label` + `why` come straight from the
  // splitter, and chord-quiz blocks render with the warm-up badge.
  if (block.moduleRef === 'repertoire' && repertoireSplit) {
    const splits = splitRepertoireAllocation(block.plannedSeconds, repertoireSplit);
    if (splits.length > 0) {
      return splits.map((s, idx) => ({
        // Include the array index so paired chord-quiz blocks (one
        // per half on keys/mixed ready) keep distinct ids — kind
        // alone would collide.
        id: `${block.id}-${s.kind}-${idx}`,
        moduleRef: block.moduleRef,
        moduleLabel,
        moduleAccentHex,
        activityDescription: s.label,
        plannedSeconds: s.plannedSeconds,
        whySnippet: s.why,
        // Carry the per-block song id (when known) so the quick-
        // launch destination can route into the specific song's
        // matrix / setup view rather than the generic Repertoire list.
        itemRefs: s.songId ? [s.songId] : [],
        // Chord quiz is the warm-up affordance — surfaces the badge.
        isWarmup: s.kind === 'chord-quiz',
        // Whole-song-run blocks deep-link to the song's detail view
        // so the WholeSongTestBanner (already prominent at the top
        // of the matrix when the song is comfortable) is one tap
        // away. Repertoire.tsx reads the `songId` URL param and
        // jumps to the detail tab.
        ...(s.kind === 'whole-song-run' && s.songId
          ? {
              quickLaunchRoute: `/repertoire?tab=detail&songId=${encodeURIComponent(s.songId)}&action=whole-song-test`,
            }
          : {}),
        // TBD spotlight surfaces an inline "Add a song in Goals"
        // action — the block still renders normally so the
        // sibling Maintenance block keeps its allocation; this is
        // a discoverability nudge, not a hard gate.
        ...(s.isTbdSpotlight
          ? {
              inlineActionText: 'Add a song in Goals to continue',
              inlineActionTarget: 'goals' as const,
            }
          : {}),
      }));
    }
  }

  return [
    {
      id: block.id,
      moduleRef: block.moduleRef,
      moduleLabel,
      moduleAccentHex,
      activityDescription: describeActivity(block, itemLabels),
      plannedSeconds: block.plannedSeconds,
      whySnippet: deriveWhySnippet(block),
      itemRefs: block.itemRefs,
      isWarmup: false,
    },
  ];
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
export function describeActivity(
  block: AllocatedBlock,
  itemLabels: ReadonlyMap<string, string> | null = null,
): string {
  const count = block.itemRefs.length;
  const plural = (n: number, singular: string, pluralForm: string) =>
    `${n} ${n === 1 ? singular : pluralForm}`;

  switch (block.memoryType) {
    case 'declarative':
      return `flashcards · ${plural(count, 'card', 'cards')}`;
    case 'procedural': {
      // Shapes & Patterns: name the actual drills via the
      // pre-loaded itemLabels map (denormalised `label` field on
      // db.drillSkills). When the map is empty / not supplied
      // (tests, fallback paths), drop to the generic noun. Show
      // up to 2 unique labels + a "+N more" tail so long
      // sessions stay readable.
      const labels = block.itemRefs
        .map(id => itemLabels?.get(id))
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
      if (labels.length === 0) {
        return `drills · ${plural(count, 'item', 'items')}`;
      }
      const unique = Array.from(new Set(labels));
      const head = unique.slice(0, 2).join(', ');
      const rest = unique.length - 2;
      const labelText = rest > 0 ? `${head}, +${rest} more` : head;
      return `${labelText} · ${plural(count, 'item', 'items')}`;
    }
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

// ---------------------------------------------------------------------
// Production Vocab — parallel candidate stream (laptop / phone only)
// ---------------------------------------------------------------------

/**
 * The Production Vocab block is sized proportionally to the user's
 * requested session length: 15% of the session, clamped to the
 * [PRODUCTION_VOCAB_MIN_SECONDS, PRODUCTION_VOCAB_MAX_SECONDS]
 * window. A 60-min session yields ~9 min of vocab; a 15-min session
 * yields the 3-min floor so practice still has room.
 *
 * The block is then subtracted from the budget passed to the
 * allocator (see buildSessionPlan) so the displayed total stays at
 * what the user asked for — not requested + vocab on top.
 */
export const PRODUCTION_VOCAB_MIN_SECONDS = 3 * 60;
export const PRODUCTION_VOCAB_MAX_SECONDS = 10 * 60;
export const PRODUCTION_VOCAB_FRACTION = 0.15;

/**
 * Floor on practice time AFTER carving out the Production Vocab
 * block. When the user's requested session is short enough that
 * subtracting vocab would leave less than this for the algorithm
 * to distribute, the vocab block is dropped entirely and the full
 * requested time flows to practice. Anything below 5 min of
 * practice is mostly vocab — not a real session.
 */
export const MIN_VIABLE_PRACTICE_SECONDS = 5 * 60;

/**
 * Compute the Production Vocab block duration for a session of
 * `availableSeconds`. Pure helper exposed so tests + callers share
 * the same clamp math.
 */
export function computeProductionVocabSeconds(availableSeconds: number): number {
  const raw = Math.round(availableSeconds * PRODUCTION_VOCAB_FRACTION);
  return Math.max(
    PRODUCTION_VOCAB_MIN_SECONDS,
    Math.min(PRODUCTION_VOCAB_MAX_SECONDS, raw),
  );
}

/** Internal: the cardId prefix that marks a Production-vocabulary
 *  flashcard row in the shared db.flashcardStates table (the same
 *  table holds HF cards). Mirrors VOCAB_CARD_ID_PREFIX in
 *  vocabularyFlashcards.ts; duplicated here to keep this file's
 *  imports off the production module surface. */
const PROD_VOCAB_CARDID_PREFIX = 'prod-vocab:';

/** True when the goal touches the Production module via candidate
 *  resolution. Covers coverage / accuracy / consistency / production-
 *  count specs. Umbrella + unsupported goals return false (the
 *  algorithm delegates umbrella aggregation to children separately). */
export function hasProductionGoal(goals: ReadonlyArray<Goal>): boolean {
  return goals.some(g => {
    const spec = candidateSpecForGoal(g);
    return 'moduleRefs' in spec
      && spec.moduleRefs.includes(PRODUCTION_MODULE_REF);
  });
}

/** Count Production-vocab cards whose SR schedule says they're due
 *  on or before `now`. Reads the indexed `nextReviewDate` range
 *  first, then filters by the prod-vocab cardId prefix. */
export async function countDueProductionVocabCards(
  now: number,
): Promise<number> {
  const rows: FlashcardState[] = await db.flashcardStates
    .where('nextReviewDate')
    .belowOrEqual(now)
    .toArray();
  let n = 0;
  for (const r of rows) {
    if (r.cardId.startsWith(PROD_VOCAB_CARDID_PREFIX)) n++;
  }
  return n;
}

/** Pure eligibility check — laptop/phone only, Production goal
 *  exists, at least one vocab card is due. */
export function isProductionVocabBlockEligible(opts: {
  goals: ReadonlyArray<Goal>;
  context: PracticeSessionContext;
  dueVocabCount: number;
}): boolean {
  if (opts.context !== 'laptop' && opts.context !== 'phone') return false;
  if (opts.dueVocabCount <= 0) return false;
  return hasProductionGoal(opts.goals);
}

/** Construct the injected Production Vocab ProposalBlock at the
 *  given duration. `plannedSeconds` is computed by
 *  `computeProductionVocabSeconds(availableSeconds)` so the block
 *  scales with the session length. Routes the active-session
 *  quick-launch into the Vocabulary tab. */
export function buildProductionVocabBlock(
  dueCount: number,
  plannedSeconds: number,
): ProposalBlock {
  const meta = moduleMetaById(PRODUCTION_MODULE_REF);
  return {
    id: 'block-production-vocab',
    moduleRef: PRODUCTION_MODULE_REF,
    moduleLabel: 'Production Vocab',
    moduleAccentHex: meta?.accentHex ?? '#3a4875',
    activityDescription: 'Flashcard review — terms and concepts',
    plannedSeconds,
    whySnippet: `${dueCount} card${dueCount === 1 ? '' : 's'} due — quick refresh on terms and concepts`,
    itemRefs: [],
    isWarmup: false,
    quickLaunchRoute: '/production?view=vocabulary',
  };
}

/**
 * Async wrapper: returns the Production Vocab block when the user
 * is on laptop/phone, has a Production goal, and has at least one
 * due vocab card. The block's duration is computed from
 * `availableSeconds` via `computeProductionVocabSeconds`. Returns
 * null when ineligible OR when the resulting block would leave
 * less than `MIN_VIABLE_PRACTICE_SECONDS` for practice after the
 * subtraction. Caller subtracts the block's plannedSeconds from
 * the budget before allocating, then prepends the block to each
 * proposal card so the displayed total equals the user's request.
 */
export async function maybeBuildProductionVocabBlock(opts: {
  goals: ReadonlyArray<Goal>;
  context: PracticeSessionContext;
  now: number;
  /** The user's full requested session time in seconds, BEFORE any
   *  vocab carve-out. Used to compute the block's duration + to
   *  gate on the minimum-practice floor. */
  availableSeconds: number;
}): Promise<ProposalBlock | null> {
  if (opts.context !== 'laptop' && opts.context !== 'phone') return null;
  if (!hasProductionGoal(opts.goals)) return null;
  const dueCount = await countDueProductionVocabCards(opts.now);
  if (dueCount <= 0) return null;
  const vocabSeconds = computeProductionVocabSeconds(opts.availableSeconds);
  if (opts.availableSeconds - vocabSeconds < MIN_VIABLE_PRACTICE_SECONDS) {
    return null;
  }
  return buildProductionVocabBlock(dueCount, vocabSeconds);
}

function prependVocabBlock(
  card: ProposalCardData,
  block: ProposalBlock,
): ProposalCardData {
  return {
    ...card,
    blocks: [block, ...card.blocks],
    totalSeconds: card.totalSeconds + block.plannedSeconds,
  };
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
