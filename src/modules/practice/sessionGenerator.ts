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

  const availableSeconds = inputs.timeMinutes * 60;
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
