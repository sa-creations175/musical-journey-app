/**
 * Phase 3 Step 7 — Session generator integration.
 *
 * Pipes the input questionnaire result through Step 2's pure
 * helpers to produce ProposalCardData[] that the proposal screen
 * renders.
 *
 * Phase 3 v0 ships a minimum-viable orchestration: walks active
 * goals, derives one block per module the user is engaged with,
 * allocates time proportionally, and runs generateProposals to
 * produce balanced + focused cards. Sophisticated weighting
 * (pace urgency, freshness, multi-goal compounding) lands in a
 * follow-up iteration once we've watched real sessions and seen
 * what actually needs tuning.
 *
 * The function is async because it reads spacingState + goals
 * from Dexie. Pure-logic Step 2 helpers compose underneath.
 */

import { db, type Goal, type SpacingState } from '../../lib/db';
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
import { goalAlignmentFactor } from '../../lib/sessionAlgorithm/weighting';
import { isAcquiring } from '../../lib/sessionAlgorithm/acquisitionStage';
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
 *   2. For each goal, derive its candidate items (spec + resolve).
 *      Module → set-of-itemRefs grouping; weight per module via
 *      MAX(goalAlignmentFactor).
 *   3. Build one AlgorithmBlock per module touched by goals.
 *      Block items = the goal's candidate set (capped per block).
 *      Block weight = max goalAlignment across the goals in scope.
 *   4. Run generateProposals(blocks, availableSeconds) → 1 or 2
 *      AllocatedBlock-bearing proposals.
 *   5. Map AllocatedBlocks → ProposalBlocks (display shape) using
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

interface ModuleAggregate {
  moduleRef: string;
  itemRefs: Set<string>;
  /** Max goalAlignmentFactor across the goals that contributed. */
  weight: number;
  hasAcquiringItems: boolean;
}

function aggregateGoalCandidatesByModule(
  goals: ReadonlyArray<Goal>,
  spacingRows: ReadonlyArray<SpacingState>,
): AlgorithmBlock[] {
  const byModule = new Map<string, ModuleAggregate>();

  // Index spacing rows by ref for hasAcquiringItems checks.
  const acquiringItemRefs = new Set<string>();
  for (const row of spacingRows) {
    if (isAcquiring(row)) acquiringItemRefs.add(row.itemRef);
  }

  for (const goal of goals) {
    const spec = candidateSpecForGoal(goal);
    if (spec.kind === 'umbrella' || spec.kind === 'unsupported') continue;

    // For coverage / accuracy / consistency the spec carries
    // moduleRefs. Collect itemRefs by walking spacing rows + the
    // spec's filter; consistency yields any rows in module.
    const itemRefs = resolveCandidates(spec, spacingRows);

    // Pick module — for multi-module specs (ET overall, practice_*
    // umbrella), each row's moduleRef governs grouping.
    const candidateModuleRefs =
      'moduleRefs' in spec ? spec.moduleRefs : [];

    for (const moduleRef of candidateModuleRefs) {
      const moduleItems = itemRefs.filter(ref =>
        spacingRows.some(r => r.itemRef === ref && r.moduleRef === moduleRef),
      );
      if (moduleItems.length === 0) continue;

      const factor = goalAlignmentFactor(goal.scope);
      const existing = byModule.get(moduleRef);
      if (existing) {
        for (const ref of moduleItems) existing.itemRefs.add(ref);
        existing.weight = Math.max(existing.weight, factor);
        existing.hasAcquiringItems =
          existing.hasAcquiringItems ||
          blockHasAcquiringItems(moduleItems, acquiringItemRefs);
      } else {
        byModule.set(moduleRef, {
          moduleRef,
          itemRefs: new Set(moduleItems),
          weight: factor,
          hasAcquiringItems: blockHasAcquiringItems(
            moduleItems,
            acquiringItemRefs,
          ),
        });
      }
    }
  }

  return Array.from(byModule.values()).map(
    (agg, idx): AlgorithmBlock => ({
      id: `block-${idx}-${agg.moduleRef}`,
      moduleRef: agg.moduleRef,
      memoryType: safeMemoryType(agg.moduleRef),
      itemRefs: Array.from(agg.itemRefs).slice(0, 20),
      weight: agg.weight,
      hasAcquiringItems: agg.hasAcquiringItems,
    }),
  );
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

function describeActivity(block: AllocatedBlock): string {
  const meta = moduleMetaById(block.moduleRef);
  const moduleLabel = meta?.label ?? block.moduleRef;
  const minutes = Math.max(1, Math.round(block.plannedSeconds / 60));
  // Phase 3 v0: a generic per-module description. Future
  // refinement: per-memory-type shapes from the design (Part 4)
  // — declarative "X cards · N attempts", procedural "X drills · N
  // min", integration "Mirror · Verse · C, G", etc. Requires a
  // resolver from itemRef → display name.
  return `${moduleLabel} · ${minutes} min`;
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
