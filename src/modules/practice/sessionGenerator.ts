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
  type PracticeSessionContext,
  type Song,
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
// `computeSessionNeedByModule` (the Phase B prototype loader) and
// the legacy `buildBlockTimeNeeds` are no longer called from this
// file — Phase B Step 6 routed the allocation path through the
// keystone `loadModuleWeeklyNeeds`. The ModuleSessionNeed type is
// still imported because the legacy `buildBlockTimeNeeds` helper
// stays exported (its existing test pins behaviour); the prototype
// loader itself is still used by GoalsNeedTodayScreen via
// dailyGoalNeed.ts (Step 7 will retire it).
import type { ModuleSessionNeed } from '../../lib/sessionAlgorithm/sessionNeed';
import {
  loadModuleWeeklyNeeds,
  phaseBModulesFromNeeds,
  type ModuleWeeklyNeed,
  type WeeklyPace,
} from '../../lib/sessionAlgorithm/moduleWeeklyNeed';
import { computeAlgoSpacingDemandSeconds } from '../../lib/sessionAlgorithm/algoSpacingDemand';
import { getCarryoverBacklogItemRefs } from '../goals/carryover';
import {
  durationTierFor,
  type AlgorithmBlock,
  type AllocatedBlock,
} from '../../lib/sessionAlgorithm/timeAllocation';
import { SCALE_KIND_SECONDS } from '../../lib/sessionAlgorithm/timePerAttempt';
import {
  COLD_START_REPERTOIRE_WEIGHT,
  CONTEXT_RANK,
  LAPTOP_TARGET_SHARES,
  MAX_ITEMS_PER_BLOCK,
  MENTAL_VIZ_PLANNED_SECONDS,
  MENTAL_VIZ_WEIGHT_FULL,
  MENTAL_VIZ_WEIGHT_PHONE,
  MIN_VIABLE_PRACTICE_SECONDS,
  PRODUCTION_VOCAB_FRACTION,
  PRODUCTION_VOCAB_MAX_SECONDS,
  PRODUCTION_VOCAB_MIN_SECONDS,
} from '../../lib/sessionAlgorithm/sessionDesign';
import {
  weightForItem,
  type GoalContribution,
} from '../../lib/sessionAlgorithm/weighting';
import { paceForCoverageGoal } from '../../lib/sessionAlgorithm/pace';
import {
  computeWeeklyPaceByModule,
  type BehindPaceNotice,
  type WeeklyPaceResult,
} from '../../lib/sessionAlgorithm/weeklyPace';
import {
  applyDeepFocusAllocation,
  leanFactorByModule,
  leanFactorPerSPSubmodule,
  redistributePlannedSecondsBySubmodule,
} from '../../lib/sessionAlgorithm/flexibleProposal';
import {
  applyLaptopBlockOrdering,
  applyLaptopTargetShares,
} from '../../lib/sessionAlgorithm/laptopAllocator';
import { applyFullArcShares } from '../../lib/sessionAlgorithm/fullArcAllocator';
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
import { loadProgressionsEligibleSet } from '../ear-training/chord-progressions/progressionTierUnlock';
import { loadHiddenItemRefs } from '../ear-training/etCuration';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { loadScaleModesEligibleSet } from '../ear-training/scales-modes/scaleModeTierUnlock';
import { labelForShapesItemRef } from '../shapes-and-patterns/drillModel';
import {
  shapeShapesBlock,
  type ShapesSplitContext,
} from '../shapes-and-patterns/shapesSplit';
import {
  getSPUnlockedTier,
  getTierForShape,
  isTrackedShape,
  type SPTier,
} from '../shapes-and-patterns/spTiers';
import { parseScaleItemRef } from '../shapes-and-patterns/scaleSkills';
import {
  itemRefMatcherForCoverageGroup,
  enumerateChordShapeItemRefs,
} from '../goals/shapesCoverageGroups';
import { COVERAGE_SPECIFIC_METRIC } from '../goals/coverageMetrics';
// loadActiveSpotlight / isSongComfortableInOriginalKey are no longer
// imported here — the SotM-anchor injection into the general Scales
// warm-up was removed (see loadShapesSplitContext for the rationale).
// A future scales-before-song loader will re-introduce these where
// they actually belong.
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
 * Resolve every ET-submodule tier/stage gate once per session.
 * Reads attempt history (for the unlock walks) + spacingState rows
 * (for staged-introduction signals) and returns the per-moduleRef
 * eligibility map that flows through
 * `aggregateGoalCandidatesByModule` → `resolveCandidates`.
 *
 * Today this covers:
 *   · 'chord-recognition' — T1-T5 tier progression
 *   · 'chord-progressions' — Stage 1-4 progression, cross-gated by
 *     chord-recognition Tier 1 (see progressionTierUnlock.ts)
 *
 * Submodules without a tier system (intervals, scales-modes today)
 * are omitted from the map and stay ungated. They'll land here as
 * the ET tier-progression build extends them.
 */
async function loadEtEligibleByModule(
  spacingRows: ReadonlyArray<SpacingState>,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const [crTier, progressions, scalesModes, hidden] = await Promise.all([
    getChordRecognitionUnlockedTier(),
    loadProgressionsEligibleSet(spacingRows),
    loadScaleModesEligibleSet(spacingRows),
    loadHiddenItemRefs(),
  ]);
  const cr = new Set(getChordRecognitionEligibleItems(crTier, spacingRows));

  // Intervals don't have a tier system; the full catalog is always
  // eligible. itemRef format on spacingState is `${interval.id}:${dir}`
  // (asc / desc) — emit both variants so the candidates filter
  // matches actual row shape rather than bare IDs (the C4 wiring
  // used bare IDs by mistake, silently filtering all interval rows
  // out of sessions; fixed here).
  const intervalAll = new Set<string>();
  for (const seed of INTERVAL_SEEDS) {
    intervalAll.add(`${seed.id}:asc`);
    intervalAll.add(`${seed.id}:desc`);
  }

  // Per-module hidden-variant expansion. Curation stores bare IDs
  // (the curation buttons in fluency trackers pass chord.id / iv.id
  // / progression.id / mode.id), but spacingState rows carry the
  // variant suffix forms. Expand on subtraction so a single hide of
  // 'maj' kills all four 'maj:0..3' inversions, hide of 'm3' kills
  // both 'm3:asc' + 'm3:desc', etc.
  const expandHidden = (moduleRef: string): Set<string> => {
    const out = new Set<string>();
    for (const id of hidden) {
      if (moduleRef === 'intervals') {
        out.add(`${id}:asc`); out.add(`${id}:desc`);
      } else if (moduleRef === 'scales-modes') {
        out.add(`${id}-tab1`); out.add(`${id}-tab2`);
      } else if (moduleRef === 'chord-recognition' && !id.includes(':')) {
        // Bare chord id → kill root + all three inversions.
        out.add(`${id}:0`); out.add(`${id}:1`); out.add(`${id}:2`); out.add(`${id}:3`);
      } else {
        // chord-progressions, or already-specific chord inversion
        // refs (e.g. 'maj:1' — though those aren't authored via the
        // tracker UI today): pass through unchanged.
        out.add(id);
      }
    }
    return out;
  };
  const subtractHidden = (
    set: ReadonlySet<string>,
    moduleRef: string,
  ): ReadonlySet<string> => {
    if (hidden.size === 0) return set;
    const expanded = expandHidden(moduleRef);
    const out = new Set<string>();
    for (const ref of set) if (!expanded.has(ref)) out.add(ref);
    return out;
  };

  return new Map<string, ReadonlySet<string>>([
    ['chord-recognition', subtractHidden(cr, 'chord-recognition')],
    ['chord-progressions', subtractHidden(progressions, 'chord-progressions')],
    ['intervals', subtractHidden(intervalAll, 'intervals')],
    ['scales-modes', subtractHidden(scalesModes, 'scales-modes')],
  ]);
}

/**
 * Step 4 of Flexible Session Proposal — load the (at most one) song
 * referenced by a `push_on_item` intent so `applyDeepFocusAllocation`
 * can build the dedicated song block at 60+ min sessions. Returns an
 * empty map on any other intent / when the user hasn't picked a song.
 */
async function loadDeepFocusSongsById(
  intent: InputQuestionnaireResult['intent'],
): Promise<ReadonlyMap<string, Song>> {
  if (intent.kind !== 'push_on_item') return new Map();
  if (!intent.songId) return new Map();
  const song = await db.songs.get(intent.songId);
  if (!song) return new Map();
  return new Map([[song.id, song]]);
}

export async function buildSessionProposals(
  inputs: InputQuestionnaireResult,
): Promise<ProposalCardData[]> {
  const goals = await db.goals.where('status').equals('active').toArray();
  const spacingRows = await db.spacingState.toArray();
  const now = Date.now();
  // Phase B Step 6 — load weeklyPace + keystone needs together so
  // factorByModule can be neutralized for Phase-B-active modules
  // BEFORE aggregation (design-doc "double-counting urgency" fix):
  // Phase B's time allocation already encodes urgency, so the
  // weight-boost on top would double-count.
  const [weeklyPace, moduleWeeklyNeeds, carryoverBacklog] = await Promise.all([
    loadWeeklyPace(now),
    loadModuleWeeklyNeeds(now),
    // Phase B Step 9b — surface items in the carryover backlog with
    // a modest pace lift so the candidate pool keeps them visible
    // even after the user dismissed their carry-over banner.
    getCarryoverBacklogItemRefs(now),
  ]);
  const phaseBModules = phaseBModulesFromNeeds(moduleWeeklyNeeds);
  // Step 3 of Flexible Session Proposal — when intent is
  // 'lean_to_goals' on a non-keys session, swap the existing
  // weeklyPaceFactor for the lean band-mapped multiplier (1.5×
  // behind / 1.0× on-track / 0.6× ahead). Keys context + non-lean
  // intents pass through unchanged.
  const intentFactor = leanFactorByModule({
    weeklyPace, intent: inputs.intent, context: inputs.context,
  });
  const factorByModule = neutralizePhaseBPaceFactors(intentFactor, phaseBModules);
  const etEligibleByModule = await loadEtEligibleByModule(spacingRows);

  const moduleBlocks = aggregateGoalCandidatesByModule(
    goals,
    spacingRows,
    now,
    inputs.context,
    factorByModule,
    undefined,
    etEligibleByModule,
    carryoverBacklog,
  );

  const repertoireSplit = await loadRepertoireSplitContext(inputs.context, now);
  const withRepColdStart = maybeInjectRepertoireColdStartBlock(
    moduleBlocks,
    goals,
    repertoireSplit,
    inputs.context,
  );
  const withNonKbColdStart = maybeInjectNonKeyboardColdStartBlocks(
    withRepColdStart,
    goals,
    inputs.context,
    etEligibleByModule,
  );
  // S&P cold-start — seeds a chord-shape block (+ scales warm-up) when
  // a coverage goal's target items have no spacingState rows yet.
  const withColdStart = await maybeInjectShapesColdStartBlock(
    withNonKbColdStart,
    goals,
    spacingRows,
    inputs.context,
  );
  if (withColdStart.length === 0) return [];
  const itemLabels = resolveShapesDrillLabels(withColdStart);
  const shapesContext = await loadShapesSplitContext(spacingRows, now);
  // Phase B Step 6 — keystone-derived time budgets + pace. Modules
  // with no active weekly coverage goal are absent from both maps
  // and fall back to the memory-type tier inside the allocator.
  // Step 9a Part B — spacingRows + now flow through so over-practice
  // slices can expand to cover the algo's actual due-today demand.
  const { blockTimeNeeds, paceByBlock } =
    buildBlockBudgetsFromWeeklyNeeds(
      withColdStart, moduleWeeklyNeeds, spacingRows, now,
    );
  const cards = generateAndShape(
    withColdStart,
    inputs.timeMinutes * 60,
    repertoireSplit,
    itemLabels,
    shapesContext,
    blockTimeNeeds,
    paceByBlock,
    inputs.context,
  );
  const leanedCards = applyLeanWithinSPSubmodule(cards, {
    goals, spacingRows, intent: inputs.intent, now,
  });
  const songsById = await loadDeepFocusSongsById(inputs.intent);
  const deepFocusedCards = applyDeepFocusAllocation({
    cards: leanedCards,
    intent: inputs.intent,
    timeMinutes: inputs.timeMinutes,
    songsById,
  });
  const laptopShared = applyLaptopTargetShares({
    cards: deepFocusedCards,
    context: inputs.context,
  });
  const reordered = applyLaptopBlockOrdering({
    cards: laptopShared,
    context: inputs.context,
  });
  return applyFullArcShares({
    cards: reordered,
    context: inputs.context,
  });
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
  //
  // Phase B Step 6 — load keystone needs alongside weeklyPace so
  // factorByModule is neutralized for Phase-B-active modules BEFORE
  // aggregation (design-doc "double-counting urgency" fix).
  const [weeklyPace, moduleWeeklyNeeds, carryoverBacklog] = await Promise.all([
    loadWeeklyPace(now),
    loadModuleWeeklyNeeds(now),
    // Phase B Step 9b — backlog items get a modest pace lift in the
    // candidate pool so they stay visible after the user dismissed
    // their carry-over banner.
    getCarryoverBacklogItemRefs(now),
  ]);
  const phaseBModules = phaseBModulesFromNeeds(moduleWeeklyNeeds);
  // Lean-to-goals intent: swap weeklyPaceFactor for lean band-mapped
  // multiplier (non-keys only). See buildSessionProposals for the
  // rationale + the matching submodule post-process at the bottom.
  const intentFactor = leanFactorByModule({
    weeklyPace, intent: inputs.intent, context: inputs.context,
  });
  const factorByModule = neutralizePhaseBPaceFactors(intentFactor, phaseBModules);
  const etEligibleByModule = await loadEtEligibleByModule(spacingRows);
  const aggregated = aggregateGoalCandidatesByModule(
    goals,
    spacingRows,
    now,
    inputs.context,
    factorByModule,
    options.forceIncludeModules,
    etEligibleByModule,
    carryoverBacklog,
  );
  const repertoireSplit = await loadRepertoireSplitContext(inputs.context, now);
  // Inject a Repertoire cold-start block before abundance detection so
  // a song goal with no spacing data doesn't trigger queue-cleared —
  // there IS work waiting (the spotlight + maintenance songs), it
  // just isn't recorded in spacingState yet.
  const repBlocks = maybeInjectRepertoireColdStartBlock(
    aggregated,
    goals,
    repertoireSplit,
    inputs.context,
  );
  // Full-session cold-start for non-keyboard modules — when the user
  // has HF / ET / Production goals but no spacing-state rows yet, the
  // aggregator produces zero candidates for them. This seeds a
  // discoverable entry point per module so first full sessions don't
  // surface keyboard-only proposals.
  const withNonKbColdStart = maybeInjectNonKeyboardColdStartBlocks(
    repBlocks,
    goals,
    inputs.context,
    etEligibleByModule,
  );
  // S&P cold-start — injected BEFORE abundance detection so an S&P-only
  // coverage goal with no spacing rows yet contributes to the candidate
  // pool instead of falsely tripping the queue-cleared path.
  const moduleBlocks = await maybeInjectShapesColdStartBlock(
    withNonKbColdStart,
    goals,
    spacingRows,
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
  const afterVocabSeconds = vocabBlock !== null
    ? requestedSeconds - vocabBlock.plannedSeconds
    : requestedSeconds;
  // Mental viz block — fires on laptop / phone / full, carving
  // off MENTAL_VIZ_PLANNED_SECONDS × per-context weight (no
  // SpacingState; no goal check). Stacks with the vocab carve-out
  // so the displayed total stays at the user's requested time.
  const mentalVizBlock = await maybeBuildMentalVizBlock({
    context: inputs.context,
    availableSeconds: afterVocabSeconds,
    sessionSecondsTotal: requestedSeconds,
  });
  const availableSeconds = mentalVizBlock !== null
    ? afterVocabSeconds - mentalVizBlock.plannedSeconds
    : afterVocabSeconds;

  const itemLabels = resolveShapesDrillLabels(moduleBlocks);
  const shapesContext = await loadShapesSplitContext(spacingRows, now);
  // Phase B Step 6 — keystone-derived time budgets + pace from the
  // moduleWeeklyNeeds load above. Modules without an active weekly
  // coverage goal stay absent → fall back to MEMORY_TYPE_DURATIONS
  // inside the allocator. Step 9a Part B — spacingRows + now flow
  // through so over-practice slices can expand to cover algo demand.
  const { blockTimeNeeds, paceByBlock } =
    buildBlockBudgetsFromWeeklyNeeds(
      moduleBlocks, moduleWeeklyNeeds, spacingRows, now,
    );
  const cards = generateAndShape(
    moduleBlocks,
    availableSeconds,
    repertoireSplit,
    itemLabels,
    shapesContext,
    blockTimeNeeds,
    paceByBlock,
    inputs.context,
  );
  // Prepend mental viz THEN vocab so the rendered order reads
  // vocab → mental viz → allocator blocks (vocab is the outermost
  // prepend, mental viz sits between vocab and the allocator output).
  // SESSION_DESIGN.md § "Non-keyboard session — Block order" puts
  // mental viz first inside the non-keyboard arc, with Production
  // vocab coming after the ET stack — for now the prepend order
  // (vocab outermost) keeps the existing vocab-first card shape;
  // explicit non-keyboard sequencing inside the allocator output
  // lands via sequenceBlocks' NON_KEYBOARD_MODULE_ORDER rule below.
  let shapedCards = cards;
  if (mentalVizBlock) {
    shapedCards = shapedCards.map(c => prependMentalVizBlock(c, mentalVizBlock));
  }
  if (vocabBlock) {
    shapedCards = shapedCards.map(c => prependVocabBlock(c, vocabBlock));
  }
  shapedCards = applyLeanWithinSPSubmodule(shapedCards, {
    goals, spacingRows, intent: inputs.intent, now,
  });
  const songsById = await loadDeepFocusSongsById(inputs.intent);
  shapedCards = applyDeepFocusAllocation({
    cards: shapedCards,
    intent: inputs.intent,
    timeMinutes: inputs.timeMinutes,
    songsById,
  });
  shapedCards = applyLaptopTargetShares({
    cards: shapedCards,
    context: inputs.context,
  });
  shapedCards = applyLaptopBlockOrdering({
    cards: shapedCards,
    context: inputs.context,
  });
  shapedCards = applyFullArcShares({
    cards: shapedCards,
    context: inputs.context,
  });
  return {
    kind: 'proposals',
    cards: shapedCards,
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

/**
 * Phase B — translate a per-module session-need map into a per-block
 * time-need map (keyed by block.id) for the allocators.
 *
 * A module need (e.g. "Ear Training needs 600 s today") may span
 * multiple AlgorithmBlocks — ET in particular fans out into one
 * block per sub-module (intervals / chord-recognition / …). The
 * module's time need is split EVENLY across its blocks so the
 * allocator sees a coherent total rather than each block claiming
 * the full module budget. Over-practice modules contribute nothing
 * — their blocks fall through to the memory-type tier.
 */
export function buildBlockTimeNeeds(
  blocks: ReadonlyArray<AlgorithmBlock>,
  sessionNeedByModule: ReadonlyMap<GoalFlowModuleId, ModuleSessionNeed>,
): Map<string, number> {
  const blocksByModule = new Map<GoalFlowModuleId, AlgorithmBlock[]>();
  for (const b of blocks) {
    const moduleId = goalFlowModuleForSpacingModuleRef(b.moduleRef);
    if (!moduleId) continue;
    const need = sessionNeedByModule.get(moduleId);
    if (!need || need.isOverPractice || need.timeNeededSeconds <= 0) continue;
    const arr = blocksByModule.get(moduleId) ?? [];
    arr.push(b);
    blocksByModule.set(moduleId, arr);
  }
  const out = new Map<string, number>();
  for (const [moduleId, moduleBlocks] of blocksByModule) {
    const need = sessionNeedByModule.get(moduleId);
    if (!need) continue;
    const perBlock = need.timeNeededSeconds / moduleBlocks.length;
    for (const b of moduleBlocks) out.set(b.id, perBlock);
  }
  return out;
}

/**
 * Phase B Step 6 — translate the keystone's per-module ModuleWeeklyNeed
 * list into the per-block inputs the allocator consumes:
 *
 *   · blockTimeNeeds → block.id → goal-pace seconds (pinned tier band)
 *   · paceByBlock    → block.id → weekly pace (drives pace-aware
 *                                  overflow in allocateBlockTime)
 *   · phaseBModules  → modules with a live Phase B budget — used by
 *                      neutralizePhaseBPaceFactors to drop the
 *                      weeklyPace boost for those modules (the
 *                      design-doc "double-counting urgency" fix).
 *
 * A module's `estimatedMinutesNeeded` is split EVENLY across its
 * blocks — same shape as the legacy buildBlockTimeNeeds. ET fans out
 * into per-sub-module blocks; the keystone's sub-activity breakdown
 * (intervals / chord-recognition) is informational here, not yet a
 * sub-allocation driver (the goal model doesn't carry per-sub-activity
 * weekly targets — that's a later Phase B step). S&P and Repertoire
 * stay one block at the allocator; their sub-module split happens
 * downstream in shapeShapesBlock / repertoireSplit, which already
 * implements the design-doc fallback ratios.
 *
 * Modules with no Phase B budget (no active weekly coverage goal, or
 * remaining = 0) are absent from both maps — their blocks fall back
 * to MEMORY_TYPE_DURATIONS inside the allocator, matching the
 * "no active goal" path the design doc specifies.
 */
export function buildBlockBudgetsFromWeeklyNeeds(
  blocks: ReadonlyArray<AlgorithmBlock>,
  moduleNeeds: ReadonlyArray<ModuleWeeklyNeed>,
  /** Phase B Step 9a Part B — spacingState rows + now, threaded through
   *  to `moduleTotalSliceSeconds` so the over-practice slice can expand
   *  to the algo's actual due-today demand (capped at the tier).
   *  Optional for callers / tests that don't have rows handy; absent →
   *  Part B's floor is 0 (Part A behaviour preserved).
   */
  spacingRows: ReadonlyArray<SpacingState> = [],
  asOf: number = Date.now(),
): {
  blockTimeNeeds: Map<string, number>;
  paceByBlock: Map<string, WeeklyPace>;
  phaseBModules: Set<GoalFlowModuleId>;
} {
  const needByModule = new Map<GoalFlowModuleId, ModuleWeeklyNeed>();
  for (const n of moduleNeeds) needByModule.set(n.moduleId, n);

  const blocksByModule = new Map<GoalFlowModuleId, AlgorithmBlock[]>();
  for (const b of blocks) {
    const moduleId = goalFlowModuleForSpacingModuleRef(b.moduleRef);
    if (!moduleId) continue;
    const need = needByModule.get(moduleId);
    if (!need) continue;
    // Keep blocks for modules with a Phase B budget OR an over-practice
    // state (Step 9a). The over-practice branch applies a fractional
    // tier slice instead of skipping to the memory-type default, so
    // saved time can flow to behind-pace modules via Step 6 overflow.
    const hasBudget = need.estimatedMinutesNeeded > 0;
    const isOverPractice = need.overPractice !== 'none';
    if (!hasBudget && !isOverPractice) continue;
    const arr = blocksByModule.get(moduleId) ?? [];
    arr.push(b);
    blocksByModule.set(moduleId, arr);
  }

  const blockTimeNeeds = new Map<string, number>();
  const paceByBlock = new Map<string, WeeklyPace>();
  const phaseBModules = new Set<GoalFlowModuleId>();
  for (const [moduleId, moduleBlocks] of blocksByModule) {
    const need = needByModule.get(moduleId);
    if (!need) continue;
    const totalSeconds = moduleTotalSliceSeconds(
      need, moduleBlocks, spacingRows, asOf,
    );
    if (totalSeconds <= 0) continue;
    phaseBModules.add(moduleId);
    const perBlockSeconds = totalSeconds / moduleBlocks.length;
    for (const b of moduleBlocks) {
      blockTimeNeeds.set(b.id, perBlockSeconds);
      paceByBlock.set(b.id, need.pace);
    }
  }

  return { blockTimeNeeds, paceByBlock, phaseBModules };
}

/**
 * Phase B Step 9a — the slice a module gets, in seconds, before
 * distribution across its blocks.
 *
 *   · 'none'    → the keystone's `estimatedMinutesNeeded × 60`
 *                 (the Step 5/6 path).
 *   · 'weekly'  → 50% of the memory-type tier's typical-high.
 *   · 'monthly' → 25% of the same tier.
 *
 * Step 9a Part B — the slice expands to clear the algo's actual
 * due-today demand when that exceeds the target. Final shape:
 *
 *   slice = min(max(target, spacing_demand), tier_cap)
 *
 * - target  = 50% / 25% of typical-high (the Part A fractional floor)
 * - spacing_demand = `computeAlgoSpacingDemandSeconds` — items the
 *   SR algorithm has scheduled at-or-before now, weighted by the
 *   module's per-attempt time seed.
 * - tier_cap = typical-high — the slice never grows larger than a
 *   normal session.
 *
 * Modules without a clean due-today concept (repertoire, production)
 * return demand = 0 from the helper and so fall through to the Part
 * A target. See algoSpacingDemand.ts.
 *
 * All blocks within a module share `memoryType` and `moduleRef`
 * (S&P is one block, ET fans out but every fan-out has memoryType
 * 'declarative'), so the first block's tier defines the module-level
 * tier — `durationTierFor` already respects MODULE_DURATION_OVERRIDES
 * for repertoire.
 */
function moduleTotalSliceSeconds(
  need: ModuleWeeklyNeed,
  moduleBlocks: ReadonlyArray<AlgorithmBlock>,
  spacingRows: ReadonlyArray<SpacingState>,
  asOf: number,
): number {
  if (need.overPractice === 'none') {
    return need.estimatedMinutesNeeded * 60;
  }
  const firstBlock = moduleBlocks[0];
  if (!firstBlock) return 0;
  const tier = durationTierFor(firstBlock.memoryType, firstBlock.moduleRef);
  const fraction = need.overPractice === 'monthly' ? 0.25 : 0.50;
  const target = tier.typicalHighSeconds * fraction;
  const spacingFloorSeconds = computeAlgoSpacingDemandSeconds(
    need.moduleId, spacingRows, asOf,
  );
  const cap = tier.typicalHighSeconds;
  return Math.min(Math.max(target, spacingFloorSeconds), cap);
}

/**
 * Phase B Step 6 — neutralize the weeklyPace weight boost for modules
 * Phase B is already budgeting time for. Design doc §"Legacy Systems":
 * "factorByModule double-counting urgency. When Phase B is active for
 * a module, set factorByModule = 1.0 (neutral) for that module. Phase
 * B handles urgency through time allocation — weight boosting on top
 * is double-counting."
 *
 * factorByModule consumers (aggregateGoalCandidatesByModule) default
 * to 1.0 for absent keys, so dropping a key is equivalent to setting
 * it to 1.0 — no extra work needed at the call sites.
 */
export function neutralizePhaseBPaceFactors(
  factorByModule: ReadonlyMap<string, number>,
  phaseBModules: ReadonlySet<GoalFlowModuleId>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [moduleId, factor] of factorByModule) {
    if (phaseBModules.has(moduleId as GoalFlowModuleId)) continue;
    out.set(moduleId, factor);
  }
  return out;
}

/**
 * Post-process for lean-to-goals intent: shift the within-S&P
 * submodule allocation toward behind-pace submodules without
 * touching the outer S&P-vs-Repertoire split (which is hard on
 * keys). No-op on non-lean intents, on cards with < 2 S&P segments,
 * or when the user has no S&P coverage goals to drive a tilt.
 *
 * The module-level lean factor is applied earlier (during
 * aggregateGoalCandidatesByModule). This handles the second half of
 * the lean intent: per-submodule redistribution within whatever S&P
 * bucket the allocator produced.
 */
function applyLeanWithinSPSubmodule(
  cards: ProposalCardData[],
  args: {
    goals: ReadonlyArray<Goal>;
    spacingRows: ReadonlyArray<SpacingState>;
    intent: import('./inputs').IntentChoice;
    now: number;
  },
): ProposalCardData[] {
  if (args.intent.kind !== 'lean_to_goals') return cards;
  const leanBySubmodule = leanFactorPerSPSubmodule(args);
  if (leanBySubmodule.size === 0) return cards;
  return cards.map(c => ({
    ...c,
    blocks: redistributePlannedSecondsBySubmodule(c.blocks, leanBySubmodule),
  }));
}

function generateAndShape(
  moduleBlocks: AlgorithmBlock[],
  availableSeconds: number,
  repertoireSplit: RepertoireSplitContext | null = null,
  /** itemRef → human label resolver, supplied by the caller via
   *  `resolveShapesDrillLabels`. Used by describeActivity for
   *  Shapes & Patterns blocks so the proposal card names the
   *  actual drill ("Major triads · 6 items") instead of the
   *  generic "drills · 6 items". Undefined → no labels (fallback
   *  behaviour preserved for callers / tests that haven't
   *  pre-loaded). */
  itemLabels: ReadonlyMap<string, string> | null = null,
  /** S&P key-by-key reshape context. When supplied,
   *  toProposalBlocks routes shapes-and-patterns blocks through
   *  `shapeShapesBlock` for ordered itemRefs + a richer label.
   *  Null preserves the pre-reshape behaviour for tests + fallback
   *  paths. */
  shapesContext: ShapesSplitContext | null = null,
  /** Phase B — per-block goal-pace time needs. When supplied, the
   *  allocators target the goal-pace time for Phase B blocks
   *  instead of the memory-type typical band. Omit for the legacy
   *  fixed-tier behaviour (path proposals + tests). */
  blockTimeNeeds?: ReadonlyMap<string, number>,
  /** Phase B Step 6 — per-block weekly pace. Drives the pace-aware
   *  overflow distribution: when a session runs past the typical-high
   *  total, behind-pace blocks claim the extra time first. Omit and
   *  every block reads as on-pace (equal-split overflow). */
  paceByBlock?: ReadonlyMap<string, WeeklyPace>,
  /** Practice context. Threaded into generateProposals so the
   *  'full' context's keyboard-first block ordering can fire. */
  context?: PracticeSessionContext,
): ProposalCardData[] {
  const proposals = generateProposals({
    blocks: moduleBlocks,
    availableSeconds,
    blockTimeNeeds,
    paceByBlock,
    context,
  });
  return proposals.map(p => ({
    kind: p.kind,
    title: p.title,
    blocks: p.blocks.flatMap(b =>
      toProposalBlocks(b, repertoireSplit, itemLabels, shapesContext),
    ),
    totalSeconds: p.totalSeconds,
  }));
}

/**
 * Pre-load the Shapes & Patterns reshape context: spacingState
 * rows indexed by itemRef (drives starting-key pick + dueness),
 * the user's unlocked tier (filters higher-tier items out of the
 * walk), and the goal-aware Scales budget. Awaited once per
 * session by the callers of generateAndShape; passed through to
 * toProposalBlocks where shapeShapesBlock consumes it.
 *
 * Song-derived key data is no longer threaded in — see the comment
 * inside loadShapesSplitContext for the rationale.
 */
/** Coverage-group ids that map to "this user has a Scales goal".
 *  Used by loadShapesSplitContext to decide whether the warm-up's
 *  time budget grows proportionally (active goal) or stays at the
 *  fixed 5/8-min fallback (no goal). The legacy `scale_drills`
 *  bucket is included so pre-Scales-submodule goals still flip on
 *  the proportional path. */
const SCALE_COVERAGE_GROUP_IDS: ReadonlySet<string> = new Set([
  'scale_drills',
  'scale_major',
  'scale_natural_minor',
  'scale_major_pentatonic',
  'scale_major_pentatonic_1',
  'scale_major_pentatonic_5',
  'scale_major_pentatonic_6',
  'scale_minor_pentatonic',
  'scale_minor_pentatonic_1',
  'scale_minor_pentatonic_b3',
  'scale_minor_pentatonic_b7',
]);

// Per-cell scale drill seconds — the loader sums these to size the
// proportional Scales warm-up budget. Previously a local mirror of
// shapesSplit.ts's table (PER_CELL_SECONDS_FALLBACK / _NAT_MIN); it
// now reads the canonical SCALE_KIND_SECONDS from
// sessionAlgorithm/timePerAttempt.ts directly (Phase B Step 1).

export async function loadShapesSplitContext(
  spacingRows: ReadonlyArray<SpacingState>,
  now: number,
): Promise<ShapesSplitContext> {
  const rowsByItemRef = new Map<string, SpacingState>();
  for (const r of spacingRows) {
    if (r.moduleRef === SHAPES_MODULE_REF) rowsByItemRef.set(r.itemRef, r);
  }
  const [unlockedTier, allGoals] = await Promise.all([
    getSPUnlockedTier(),
    db.goals.toArray(),
  ]);

  // Note: song-derived key data (formerly activeSongKeys +
  // activeSongTitlesByKey + sotmAnchorKey) is no longer threaded
  // into the warm-up — the general Scales warm-up is purely
  // spacing-state-driven. Song-key priming lives in the per-song
  // `scale-prep` blocks built by repertoireSplit.ts, which run
  // immediately before each Repertoire song block.

  // Scales goal awareness — when at least one active Scales goal
  // exists, the warm-up budget scales proportionally with the
  // user's actual due-cell load. The loader does the cell-counting
  // here (DB access lives here, not in the pure splitter) and
  // hands shapesSplit a single number.
  //
  // Sum = Σ (per-cell drill seconds) for every scale spacingState
  // row that (a) is due now AND (b) matches at least one active
  // Scales goal's itemRefMatcher. Returns null when no Scales
  // goal is active → shapesSplit falls back to the fixed 5/8-min
  // warm-up.
  const scaleMatchers: Array<(itemRef: string) => boolean> = [];
  for (const g of allGoals) {
    if (g.status !== 'active') continue;
    if (g.targetMetric !== COVERAGE_SPECIFIC_METRIC.SHAPES) continue;
    if (!g.targetUnit || !SCALE_COVERAGE_GROUP_IDS.has(g.targetUnit)) continue;
    const m = itemRefMatcherForCoverageGroup(g.targetUnit);
    if (m) scaleMatchers.push(m);
  }
  let scalesGoalDueSeconds: number | null = null;
  if (scaleMatchers.length > 0) {
    let total = 0;
    for (const row of rowsByItemRef.values()) {
      const desc = parseScaleItemRef(row.itemRef);
      if (!desc) continue;
      // Due means "no nextDueAt set yet" (cold-start cell) or
      // nextDueAt has passed.
      if (row.nextDueAt !== null && row.nextDueAt > now) continue;
      // Union match — any active Scales goal pulls the cell in.
      if (!scaleMatchers.some(m => m(row.itemRef))) continue;
      total += SCALE_KIND_SECONDS[desc.kind];
    }
    scalesGoalDueSeconds = total;
  }

  return {
    rowsByItemRef,
    unlockedTier,
    now,
    scalesGoalDueSeconds,
  };
}

/**
 * Resolve human labels for every Shapes & Patterns itemRef across
 * the given block list. The proposal screen renders these in
 * `describeActivity` so the user sees "Cmaj7 (major seventh) · 6
 * items" instead of "drills · 6 items".
 *
 * No DB lookup: spacingState itemRefs for S&P are descriptor
 * strings (`chord-shape:{quality}:{keyName}[:{inversionState}]`,
 * `scale:{scale}:{keyName}`, `vl:{patternId}:{keyName}`) — the
 * inverse of `itemRefForSkill`. We parse the string back into a
 * descriptor and run `labelFor` directly. Earlier versions of this
 * function tried `db.drillSkills.bulkGet(itemRefs)` and got 0
 * matches every time because drillSkills.id is an unrelated random
 * `skill-…` uid; the namespaces never overlapped.
 */
function resolveShapesDrillLabels(
  blocks: ReadonlyArray<AlgorithmBlock>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of blocks) {
    if (b.moduleRef !== SHAPES_MODULE_REF) continue;
    for (const ref of b.itemRefs) {
      if (out.has(ref)) continue;
      const label = labelForShapesItemRef(ref);
      if (label) out.set(ref, label);
    }
  }
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
  const deepFocusSongsById = await loadDeepFocusSongsById(inputs.intent);
  const applyPostProcesses = (cards: ProposalCardData[]) =>
    applyFullArcShares({
      cards: applyLaptopBlockOrdering({
        cards: applyLaptopTargetShares({
          cards: applyDeepFocusAllocation({
            cards,
            intent: inputs.intent,
            timeMinutes: inputs.timeMinutes,
            songsById: deepFocusSongsById,
          }),
          context: inputs.context,
        }),
        context: inputs.context,
      }),
      context: inputs.context,
    });
  // Eligibility set built off the FULL spacingRows snapshot so the
  // "introduced" signal isn't accidentally narrowed by the path
  // filter. Path-filtered + fallback aggregations both consume the
  // same set.
  const etEligibleByModule = await loadEtEligibleByModule(spacingRows);

  // Lean-to-goals intent: swap weeklyPaceFactor for lean band-mapped
  // multiplier (non-keys only). See buildSessionProposals for rationale.
  const intentFactor = leanFactorByModule({
    weeklyPace, intent: inputs.intent, context: inputs.context,
  });
  const filteredBlocks = aggregateGoalCandidatesByModule(
    goals,
    shuffledFiltered,
    now,
    inputs.context,
    intentFactor,
    undefined,
    etEligibleByModule,
  );
  const repertoireSplit = await loadRepertoireSplitContext(inputs.context, now);
  const filteredWithRepColdStart = maybeInjectRepertoireColdStartBlock(
    filteredBlocks,
    goals,
    repertoireSplit,
    inputs.context,
  );
  const filteredWithNonKbColdStart = maybeInjectNonKeyboardColdStartBlocks(
    filteredWithRepColdStart,
    goals,
    inputs.context,
    etEligibleByModule,
  );
  const filteredWithColdStart = await maybeInjectShapesColdStartBlock(
    filteredWithNonKbColdStart,
    goals,
    spacingRows,
    inputs.context,
  );
  if (filteredWithColdStart.length > 0) {
    const filteredItemLabels = resolveShapesDrillLabels(filteredWithColdStart);
    const filteredShapesCtx = await loadShapesSplitContext(spacingRows, now);
    const cards = generateAndShape(
      filteredWithColdStart,
      availableSeconds,
      repertoireSplit,
      filteredItemLabels,
      filteredShapesCtx,
      undefined,
      undefined,
      inputs.context,
    );
    return applyPostProcesses(applyLeanWithinSPSubmodule(cards, {
      goals, spacingRows, intent: inputs.intent, now,
    }));
  }

  // Fallback — shuffle the full pool so we still introduce fresh
  // variety even though the path filter came up empty.
  const fallbackBlocks = aggregateGoalCandidatesByModule(
    goals,
    shuffleInPlace(spacingRows.slice()),
    now,
    inputs.context,
    intentFactor,
    undefined,
    etEligibleByModule,
  );
  const fallbackWithRepColdStart = maybeInjectRepertoireColdStartBlock(
    fallbackBlocks,
    goals,
    repertoireSplit,
    inputs.context,
  );
  const fallbackWithNonKbColdStart = maybeInjectNonKeyboardColdStartBlocks(
    fallbackWithRepColdStart,
    goals,
    inputs.context,
    etEligibleByModule,
  );
  const fallbackWithColdStart = await maybeInjectShapesColdStartBlock(
    fallbackWithNonKbColdStart,
    goals,
    spacingRows,
    inputs.context,
  );
  if (fallbackWithColdStart.length === 0) return [];
  const fallbackItemLabels = resolveShapesDrillLabels(fallbackWithColdStart);
  const fallbackShapesCtx = await loadShapesSplitContext(spacingRows, now);
  const fallbackCards = generateAndShape(
    fallbackWithColdStart,
    availableSeconds,
    repertoireSplit,
    fallbackItemLabels,
    fallbackShapesCtx,
    undefined,
    undefined,
    inputs.context,
  );
  return applyPostProcesses(applyLeanWithinSPSubmodule(fallbackCards, {
    goals, spacingRows, intent: inputs.intent, now,
  }));
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

// MAX_ITEMS_PER_BLOCK moved to ../../lib/sessionAlgorithm/sessionDesign;
// imported as part of the SESSION_DESIGN-consolidation import block.

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
export async function loadWeeklyPace(now: number = Date.now()): Promise<WeeklyPaceResult> {
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
    return { factorByModule: new Map(), bandByModule: new Map(), notices: [] };
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

// CONTEXT_RANK moved to ../../lib/sessionAlgorithm/sessionDesign;
// imported below.

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
  context: PracticeSessionContext = 'keys',
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
  /** ET per-module eligibility map — passed through to
   *  `resolveCandidates`. Each entry gates one ET submodule's
   *  itemRefs against its tier/stage progression. Submodules
   *  without an entry are ungated. Undefined preserves pre-tier-
   *  system behaviour, used by tests of the surrounding
   *  aggregation logic that don't care about ET tiering. */
  etEligibleByModule?: ReadonlyMap<string, ReadonlySet<string>>,
  /** Phase B Step 9b — itemRefs in the carryover backlog (uncovered
   *  from a previous month's monthly goal, not in this month's
   *  current scope). These items get an `isCarryoverBacklog` lift
   *  in the weighting layer, and surface in the candidate pool even
   *  when they have no active-goal contribution. Undefined / empty
   *  preserves pre-9b behaviour. */
  carryoverBacklogItemRefs?: ReadonlySet<string>,
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
  const contributingByItemModule = new Map<string, GoalContribution[]>();

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
    // Specific-coverage detection: only `coverage` specs that
    // carry an itemRefFilter are scope-targeting goals (e.g. S&P
    // "Major triads", HF "chord-function cards", Production
    // "Workflow Foundations"). Items contributed by such goals
    // ride a weight boost downstream so the user's active
    // sub-area dominates the proposal without crowding out
    // peripheral items entirely. See SCOPED_COVERAGE_BOOST_FACTOR
    // in weighting.ts.
    const viaScopedCoverage =
      spec.kind === 'coverage' && spec.itemRefFilter !== undefined;
    // Resolve against filtered rows so module-level drops cascade
    // automatically — a goal that targets only Shapes items will
    // produce zero candidates under non-keys.
    const itemRefs = resolveCandidates(spec, filteredRows, etEligibleByModule);

    for (const itemRef of itemRefs) {
      const row = rowByItemRef.get(itemRef);
      if (!row) continue;
      if (!candidateModuleRefs.includes(row.moduleRef)) continue;

      const key = `${itemRef}\x00${row.moduleRef}`;
      const contribution: GoalContribution = {
        scope: goal.scope,
        paceFactor,
        viaScopedCoverage,
      };
      const list = contributingByItemModule.get(key);
      if (list) {
        list.push(contribution);
      } else {
        contributingByItemModule.set(key, [contribution]);
      }
    }
  }

  // Phase B Step 9b — surface carryover-backlog items even when they
  // have no active-goal contribution. They land in the same per-item
  // map with an empty goals[]; the isCarryoverBacklog flag below
  // gives them the 1.15 pace lift in `weightForItem`. Items already
  // contributed by an active goal stay in their existing entry —
  // the flag adds a backlog-pace MAX comparison without erasing the
  // goal contribution.
  if (carryoverBacklogItemRefs && carryoverBacklogItemRefs.size > 0) {
    for (const itemRef of carryoverBacklogItemRefs) {
      const row = rowByItemRef.get(itemRef);
      if (!row) continue; // not in this session's filtered context
      const key = `${itemRef}\x00${row.moduleRef}`;
      if (!contributingByItemModule.has(key)) {
        contributingByItemModule.set(key, []);
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
    const isCarryoverBacklog = carryoverBacklogItemRefs?.has(itemRef) ?? false;

    const { weight } = weightForItem({
      row,
      goals: contributingGoals,
      priority: undefined, // Phase 3: no per-item priority UI yet.
      isCarryoverBacklog,
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
      isKeyboardRequired: isKeyboardRequiredModule(moduleRef),
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

// COLD_START_REPERTOIRE_WEIGHT moved to
// ../../lib/sessionAlgorithm/sessionDesign — imported below.

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
      isKeyboardRequired: isKeyboardRequiredModule(REPERTOIRE_MODULE_REF),
    },
  ];
}

/** True when a module's practice surface needs a physical keyboard.
 *  S&P drills and Repertoire matrix work are keyboard-required;
 *  cognitive modules (HF, ET, Production) are not. Used to populate
 *  AlgorithmBlock.isKeyboardRequired at block-creation time so the
 *  'full' context's keyboard-first sequencing rule has the bit
 *  available at sort time. */
function isKeyboardRequiredModule(moduleRef: string): boolean {
  return moduleRef === SHAPES_MODULE_REF
    || moduleRef === REPERTOIRE_MODULE_REF;
}

/** Non-keyboard modules eligible for the full-session cold-start
 *  injector. Repertoire has its own injector
 *  (maybeInjectRepertoireColdStartBlock) and S&P doesn't surface on
 *  non-keys arcs through this path. */
const NON_KEYBOARD_COLD_START_MODULES: ReadonlyArray<string> = [
  HF_MODULE_REF,
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
  PRODUCTION_MODULE_REF,
];

/** ET submodules — used to gate cold-start injection against the
 *  tier eligibility map. Non-ET modules (HF, Production) skip the
 *  gate (no tier system). */
const ET_COLD_START_GATED_MODULES: ReadonlySet<string> = new Set([
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
]);

/**
 * Full-session cold-start for non-keyboard modules.
 *
 * Mirror of `maybeInjectRepertoireColdStartBlock`. When a user has
 * goals targeting HF / ET / Production but those modules have no
 * spacing-state rows yet (first-time-in-module case), the goal-driven
 * aggregator produces zero candidates for them — so the proposal
 * surfaces only the keyboard arc. This injector seeds a synthetic
 * AlgorithmBlock per eligible module so the user gets a discoverable
 * entry point into each module on their first full session.
 *
 * Empty itemRefs by design — the block surfaces with a generic
 * activity description and the module's default route. The module's
 * own UI handles "what to practice first" with domain knowledge
 * that doesn't belong in the algorithm layer.
 *
 * Fires on any context where the target module passes the context
 * hard filter (`isModuleAllowedForContext`), checked per module:
 *   · full   → HF / ET / Production all pass.
 *   · laptop / phone → HF / ET / Production pass (only S&P is
 *     excluded there, and S&P isn't in this list — it has its own
 *     keyboard cold-start path).
 *   · keys   → none of these modules pass (keys is Shapes +
 *     Repertoire only), so this is a no-op on keys.
 * The earlier `context === 'full'` hard gate left a known hole on
 * laptop / phone, where these modules are allowed and foregrounded
 * but a first-time-in-module goal still produced nothing.
 *
 * ET submodules also honor the tier-eligibility gate: a goal for
 * 'chord-progressions' or 'scales-modes' that isn't yet unlocked
 * via the tier system produces zero eligible items in regular
 * candidate generation, so injecting a cold-start block would
 * render as "0 cards" — confusing rather than helpful. When
 * `etEligibleByModule` is supplied, only inject the cold-start for
 * an ET submodule if its eligible set is non-empty. Non-ET modules
 * (HF, Production) skip this gate — no tier system to respect.
 */
export function maybeInjectNonKeyboardColdStartBlocks(
  blocks: AlgorithmBlock[],
  goals: ReadonlyArray<Goal>,
  context: PracticeSessionContext,
  /** Same map the aggregator consumes. Omit only in tests that
   *  don't care about tier gating; production callers always pass it
   *  via `loadEtEligibleByModule`. */
  etEligibleByModule?: ReadonlyMap<string, ReadonlySet<string>>,
): AlgorithmBlock[] {
  // Build the set of moduleRefs any active goal touches via its
  // candidate spec. Umbrella / unsupported / song_proficiency /
  // production_count specs all yield no moduleRefs here — they're
  // handled elsewhere in the pipeline.
  const goalTouchedModules = new Set<string>();
  for (const goal of goals) {
    const spec = candidateSpecForGoal(goal);
    if (!('moduleRefs' in spec)) continue;
    for (const m of spec.moduleRefs) goalTouchedModules.add(m);
  }
  if (goalTouchedModules.size === 0) return blocks;

  const existingModules = new Set(blocks.map(b => b.moduleRef));
  const additions: AlgorithmBlock[] = [];
  for (const moduleRef of NON_KEYBOARD_COLD_START_MODULES) {
    if (existingModules.has(moduleRef)) continue;
    if (!goalTouchedModules.has(moduleRef)) continue;
    // Context hard filter — only seed a cold-start for a module the
    // current context actually allows (e.g. nothing on keys, where
    // these modules are out of scope; everything on full; HF/ET/
    // Production on laptop / phone).
    if (!isModuleAllowedForContext(moduleRef, context)) continue;
    // ET tier gate — skip submodules whose eligible set is empty
    // (locked tiers or stages with no introduced items). Modules
    // absent from the map are ungated.
    if (etEligibleByModule && ET_COLD_START_GATED_MODULES.has(moduleRef)) {
      const eligible = etEligibleByModule.get(moduleRef);
      if (eligible !== undefined && eligible.size === 0) continue;
    }
    additions.push({
      id: `block-${moduleRef}-cold-start`,
      moduleRef,
      memoryType: safeMemoryType(moduleRef),
      itemRefs: [],
      weight: COLD_START_REPERTOIRE_WEIGHT,
      hasAcquiringItems: false,
      isKeyboardRequired: false,
    });
  }
  if (additions.length === 0) return blocks;
  return [...blocks, ...additions];
}

/**
 * S&P cold-start — the keyboard-module counterpart to
 * `maybeInjectRepertoireColdStartBlock`.
 *
 * `aggregateGoalCandidatesByModule` builds an S&P block only from
 * existing spacingState rows: `resolveCandidates` is a pure row
 * filter, so chord-shape items with no row are never enumerated. A
 * coverage goal like "cover all 48 major-triad inversions" therefore
 * produces a weekly need but NO session block until the user has
 * manually drilled the items at least once — the first-time-in-module
 * deadlock that left only Mental Visualization showing for S&P.
 *
 * Unlike HF/ET/Production, S&P can't ride
 * `maybeInjectNonKeyboardColdStartBlocks`: it's keyboard-required and
 * excluded from that list, and — more fundamentally — its downstream
 * split (`shapeShapesBlock` → `buildShapesWalk`) walks the block's
 * itemRefs to build the chord-shape drill list, so an empty-itemRefs
 * synthetic block would render nothing. This injector instead
 * enumerates the goal's target chord-shape itemRefs from the catalog
 * (`enumerateChordShapeItemRefs`, scoped by the coverage spec's
 * itemRefFilter), drops any that already have a spacingState row
 * (covered / in-progress — those reach the aggregator normally) or
 * sit above the user's unlocked S&P tier, and seeds one SHAPES block.
 * `buildShapesWalk` builds the walk from those refs; the Scales
 * warm-up rides along on the same block (shared moduleRef).
 *
 * Conditions for injection (mirror the Repertoire injector):
 *   · context permits S&P (keys / full — not laptop / phone)
 *   · no S&P block was generated from spacing rows
 *   · at least one active S&P coverage goal with an un-started,
 *     in-tier target item.
 *
 * NOTE: when SOME target items already have rows, the aggregator
 * builds an S&P block from those and this injector no-ops — the
 * never-started items wait until the in-progress set is covered.
 * Same zero-rows-only contract as the Repertoire / non-keyboard
 * injectors.
 */
export async function maybeInjectShapesColdStartBlock(
  blocks: AlgorithmBlock[],
  goals: ReadonlyArray<Goal>,
  spacingRows: ReadonlyArray<SpacingState>,
  context: PracticeSessionContext,
  /** Unlocked S&P tier. Omit in production (fetched via
   *  getSPUnlockedTier); tests pass a literal to stay DB-free. */
  unlockedTier?: SPTier,
): Promise<AlgorithmBlock[]> {
  if (blocks.some(b => b.moduleRef === SHAPES_MODULE_REF)) return blocks;
  if (!isModuleAllowedForContext(SHAPES_MODULE_REF, context)) return blocks;

  // Items the user has already touched (any S&P spacing row). In the
  // no-S&P-block branch these are covered / otherwise non-eligible, so
  // skip them — cold-start only surfaces genuinely un-started work.
  const startedRefs = new Set<string>();
  for (const r of spacingRows) {
    if (r.moduleRef === SHAPES_MODULE_REF) startedRefs.add(r.itemRef);
  }

  const universe = enumerateChordShapeItemRefs();
  const tier = unlockedTier ?? await getSPUnlockedTier();

  const picked: string[] = [];
  const seen = new Set<string>();
  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    const spec = candidateSpecForGoal(goal);
    if (spec.kind !== 'coverage') continue;
    if (!spec.moduleRefs.includes(SHAPES_MODULE_REF)) continue;
    const filter = spec.itemRefFilter;
    for (const ref of universe) {
      if (seen.has(ref)) continue;
      if (filter && !filter(ref)) continue;
      if (startedRefs.has(ref)) continue;
      // parts[1] is the chord-quality id (chord-shape:${quality}:…).
      const quality = ref.split(':')[1];
      if (!isTrackedShape(quality)) continue;
      if (getTierForShape(quality) > tier) continue;
      seen.add(ref);
      picked.push(ref);
      if (picked.length >= MAX_ITEMS_PER_BLOCK) break;
    }
    if (picked.length >= MAX_ITEMS_PER_BLOCK) break;
  }

  if (picked.length === 0) return blocks;

  return [
    ...blocks,
    {
      id: 'block-shapes-cold-start',
      moduleRef: SHAPES_MODULE_REF,
      memoryType: safeMemoryType(SHAPES_MODULE_REF),
      itemRefs: picked,
      weight: COLD_START_REPERTOIRE_WEIGHT,
      hasAcquiringItems: false,
      isKeyboardRequired: isKeyboardRequiredModule(SHAPES_MODULE_REF),
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
  shapesContext: ShapesSplitContext | null = null,
): ProposalBlock[] {
  const meta = moduleMetaById(block.moduleRef);
  // ET scales-modes reads just "scales & modes" by default, which is
  // easy to confuse with the S&P scales warm-up ("Scales · C, F …").
  // Qualify it in the proposal so the ear-training (listening) block is
  // unmistakable vs the keyboard warm-up. (Proposal-only — the nav /
  // module registry label stays "scales & modes".)
  const moduleLabel =
    block.moduleRef === 'scales-modes'
      ? 'scales & modes (ear training)'
      : meta?.label ?? block.moduleRef;
  const moduleAccentHex = meta?.accentHex ?? '#4a9088';

  // S&P key-by-key reshape — when the caller has pre-loaded the
  // shapes context (spacingState rows + unlocked tier +
  // active-song keys), the algorithm's weight-sorted itemRef
  // order gets re-walked in circle-of-fourths key order with
  // tier+inversion ordering inside each key. Blocks ≥ 15 min
  // additionally surface a Scales warm-up segment FIRST (5–8 min,
  // four-scale ladder × 1–2 prioritised keys per
  // SCALES_SUBMODULE_DESIGN.md). Each segment becomes its own
  // ProposalBlock so the UI shows scales above the chord-shape
  // walk. Falls through to the generic path when no segments
  // come out. The Scales segment gets isWarmup=true so the
  // SessionStack chip renders the warm-up badge.
  if (block.moduleRef === SHAPES_MODULE_REF && shapesContext) {
    const segments = shapeShapesBlock(block, shapesContext);
    if (segments.length > 0) {
      return segments.map(seg => ({
        id: `${block.id}-${seg.kind}`,
        moduleRef: block.moduleRef,
        moduleLabel,
        moduleAccentHex,
        activityDescription: seg.label,
        plannedSeconds: seg.plannedSeconds,
        whySnippet: seg.why,
        itemRefs: seg.itemRefs,
        isWarmup: seg.kind === 'scales',
        // shapes-walk segments open DrillSessionModal in place — the
        // block's chord-shape itemRefs walk through one drill at a
        // time without dumping the user out of the session. Mirrors
        // the scale-prep `'scales'` pattern.
        ...(seg.kind === 'shapes-walk'
          ? { inSessionDrillKind: 'chord-shapes' as const }
          : {}),
        isKeyboardRequired: block.isKeyboardRequired,
      }));
    }
  }

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
        // scale-prep blocks carry concrete scale itemRefs (so the
        // Scales-drilling surface can route the user into the right
        // cells). Every other block falls back to the [songId]
        // routing target the song-detail / matrix / setup paths use.
        itemRefs: s.scaleItemRefs
          ? [...s.scaleItemRefs]
          : (s.songId ? [s.songId] : []),
        // Chord quiz + scale prep are the warm-up affordances —
        // both surface the badge above the song-practice block they
        // precede.
        isWarmup: s.kind === 'chord-quiz' || s.kind === 'scale-prep',
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
        // Chord-quiz warm-ups deep-link into the Chord Progression Quiz
        // drill, scoped to this song: session=1 auto-opens the drill and
        // songId filters its queue to this song's sections (SM-2 still
        // records per section). Level 3 nav — GO lands on the drill, not
        // the quiz module home.
        ...(s.kind === 'chord-quiz' && s.songId
          ? {
              quickLaunchRoute: `/ear-training/chord-progression-quiz?session=1&songId=${encodeURIComponent(s.songId)}`,
            }
          : {}),
        // Scale-prep blocks open ScalesDrillModal in place on the
        // session screen — no navigation away from the proposal. The
        // block's itemRefs drive which cells the modal walks through.
        // SessionBlock consumes this flag and renders the modal as an
        // overlay (see SessionBlock.tsx).
        ...(s.kind === 'scale-prep'
          ? { inSessionDrillKind: 'scales' as const }
          : {}),
        // Song practice blocks (spotlight / maintenance / whole-song-
        // run) get an inline metronome widget on the block surface
        // (see SessionBlock.tsx). Warm-up / chord-quiz / scale-prep
        // are excluded — those are short focused slots that don't
        // need the metronome scratchpad.
        ...(s.kind === 'spotlight' || s.kind === 'maintenance' || s.kind === 'whole-song-run'
          ? { isSongPractice: true }
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
        // Chord-quiz warm-ups are away-from-keyboard (the progression
        // recall quiz), so they get the non-keyboard count-in and no
        // time-signature / metronome prep controls. Every other
        // Repertoire split inherits the parent's keyboard requirement
        // (scale-prep, matrix practice, song practice are all played).
        isKeyboardRequired: s.kind === 'chord-quiz' ? false : block.isKeyboardRequired,
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
      isKeyboardRequired: block.isKeyboardRequired,
      // Level 3: Production lesson blocks deep-link straight to the
      // first lesson (LessonView via ?lesson=) so GO lands on lesson
      // content, not the module overview. itemRefs are spacing-ordered
      // lesson ids (top = most-due / in-progress). The Production vocab
      // block is built separately (buildProductionVocabBlock) and keeps
      // its own ?view=vocabulary route, so this only affects lessons.
      ...(block.moduleRef === PRODUCTION_MODULE_REF && block.itemRefs.length > 0
        ? { quickLaunchRoute: `/production?lesson=${encodeURIComponent(block.itemRefs[0])}` }
        : {}),
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
      // Name declarative blocks by their actual content rather than the
      // generic "flashcards · N cards":
      //   chord recognition → chord QUALITY types (Major, Minor, Dim…)
      //   intervals         → intervals
      //   harmonic fluency  → theory concepts (spans 13 categories)
      if (block.moduleRef === 'chord-recognition') {
        return plural(count, 'chord type', 'chord types');
      }
      if (block.moduleRef === 'intervals') {
        return plural(count, 'interval', 'intervals');
      }
      if (block.moduleRef === 'harmonic-fluency') {
        return plural(count, 'concept', 'concepts');
      }
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
// PRODUCTION_VOCAB_{MIN,MAX}_SECONDS + PRODUCTION_VOCAB_FRACTION +
// MIN_VIABLE_PRACTICE_SECONDS moved to
// ../../lib/sessionAlgorithm/sessionDesign — imported below and
// re-exported for back-compat with consumers that still target
// the old import path.
export {
  PRODUCTION_VOCAB_FRACTION,
  PRODUCTION_VOCAB_MAX_SECONDS,
  PRODUCTION_VOCAB_MIN_SECONDS,
  MIN_VIABLE_PRACTICE_SECONDS,
} from '../../lib/sessionAlgorithm/sessionDesign';

/**
 * Compute the Production Vocab block duration for a session of
 * `availableSeconds`. Pure helper exposed so tests + callers share
 * the same clamp math.
 *
 * Laptop sessions use the LAPTOP_TARGET_SHARES.PRODUCTION_VOCAB
 * share (7 % of total) without the global min/max clamp — the
 * laptop allocator owns its own share math end-to-end. Other
 * contexts keep the legacy PRODUCTION_VOCAB_FRACTION (15 %)
 * clamped to [PRODUCTION_VOCAB_MIN_SECONDS, …MAX…].
 */
export function computeProductionVocabSeconds(
  availableSeconds: number,
  context?: PracticeSessionContext,
): number {
  if (context === 'laptop') {
    return Math.round(availableSeconds * LAPTOP_TARGET_SHARES.PRODUCTION_VOCAB);
  }
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
    isKeyboardRequired: false,
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
  const vocabSeconds = computeProductionVocabSeconds(opts.availableSeconds, opts.context);
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

// ---------------------------------------------------------------------
// Mental visualization — parallel candidate stream (non-keyboard contexts)
// ---------------------------------------------------------------------

/**
 * Mental viz duration scaled by the per-context weight. Phone is
 * the primary surface (1.4 × the base 5 min); full's non-keyboard
 * arc is secondary (0.8 ×). Keys returns 0 — the block doesn't
 * surface there.
 *
 * Laptop is share-driven (LAPTOP_TARGET_SHARES.MENTAL_VIZ × the
 * original session length), so the caller passes that length in.
 */
function mentalVizSecondsFor(
  context: PracticeSessionContext,
  sessionSecondsTotal: number,
): number {
  switch (context) {
    case 'phone':  return Math.round(MENTAL_VIZ_PLANNED_SECONDS * MENTAL_VIZ_WEIGHT_PHONE);
    case 'laptop': return Math.round(sessionSecondsTotal * LAPTOP_TARGET_SHARES.MENTAL_VIZ);
    case 'full':   return Math.round(MENTAL_VIZ_PLANNED_SECONDS * MENTAL_VIZ_WEIGHT_FULL);
    case 'keys':   return 0;
  }
}

/** Construct the injected Mental Viz ProposalBlock. Rides under
 *  the shapes-and-patterns moduleRef so the existing module-color
 *  + label flow works; deep-links to the Mental Visualization
 *  tab so the user lands on the right surface immediately. */
export function buildMentalVizBlock(plannedSeconds: number): ProposalBlock {
  const meta = moduleMetaById(SHAPES_MODULE_REF);
  return {
    id: 'block-mental-viz',
    moduleRef: SHAPES_MODULE_REF,
    moduleLabel: 'Mental Visualization',
    moduleAccentHex: meta?.accentHex ?? '#4a9088',
    activityDescription: 'Visualize chord shapes away from the keyboard',
    plannedSeconds,
    whySnippet: 'Cognitive command of the shapes — no piano required',
    itemRefs: [],
    isWarmup: false,
    isKeyboardRequired: false,
    quickLaunchRoute: '/shapes-and-patterns?tab=mental-viz',
  };
}

/**
 * Async wrapper: returns the Mental Viz block when the user is on
 * laptop / phone / full (any non-keyboard arc). Drops the block when
 * the carve-out would leave less than MIN_VIABLE_PRACTICE_SECONDS
 * for the rest of the session. No goal check, no due-count check
 * — mental viz has no SpacingState; it's always offered when the
 * context permits and there's room for it.
 */
export async function maybeBuildMentalVizBlock(opts: {
  context: PracticeSessionContext;
  /** Remaining session budget AFTER the vocab carve-out — drives the
   *  min-viable-practice gate. */
  availableSeconds: number;
  /** Original full session length in seconds. The laptop allocator
   *  uses this for share-of-original math; phone/full ignore it. */
  sessionSecondsTotal: number;
}): Promise<ProposalBlock | null> {
  const planned = mentalVizSecondsFor(opts.context, opts.sessionSecondsTotal);
  if (planned <= 0) return null;
  if (opts.availableSeconds - planned < MIN_VIABLE_PRACTICE_SECONDS) {
    return null;
  }
  return buildMentalVizBlock(planned);
}

/** Same shape as prependVocabBlock — added separately for clarity
 *  even though the body is identical. Lets the prepend order be
 *  explicit at the call site (mental viz prepended FIRST, then
 *  vocab on top, so the rendered order is vocab → mental viz →
 *  allocator blocks). */
function prependMentalVizBlock(
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
