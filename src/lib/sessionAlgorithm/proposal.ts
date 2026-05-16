/**
 * Phase 3 Step 2f — Proposal generator (1 or 2 cards).
 *
 * Per Part 4 of the design doc, the two-card proposal is the
 * algorithm's primary tension surface: balanced (4–5 blocks, broad
 * module coverage) vs focused (1–2 blocks, depth on the highest-
 * priority item).
 *
 * Generator strategy:
 *
 *   buildBalancedProposal — walk blocks in weight order, take up to 5
 *   from distinct modules so the user gets breadth across their
 *   practice. Allocates time via allocateBlockTime, sequences via
 *   sequenceBlocks (acquisition → review → expression).
 *
 *   buildFocusedProposal — take the top-weight block, optionally
 *   pair with the next block from the same module (depth on one
 *   area). Allocates time uncapped — the focused block can extend
 *   past typical-high since the user is choosing depth. With two
 *   blocks, time splits by weight share.
 *
 *   generateProposals — returns both. Collapses to a single proposal
 *   when balanced and focused contain the same block set (one
 *   candidate, very short session, etc.).
 *
 * Pure functions. The algorithm pipeline upstream supplies weighted
 * candidate blocks (Step 2d) and the user's available time. Module
 * display labels come from moduleMeta — also pure.
 */

import type { MemoryType } from '../db';
import { moduleMetaById } from '../moduleMeta';
import {
  allocateBlockTime,
  durationTierFor,
  phaseForBlock,
  sequenceBlocks,
  type AlgorithmBlock,
  type AllocatedBlock,
} from './timeAllocation';
import type { WeeklyPace } from './moduleWeeklyNeed';

/** Phase B — `block.id` → goal-pace time need in seconds. Threaded
 *  from `loadModuleWeeklyNeeds` through the proposal builders into
 *  both allocators. Omit for the legacy no-Phase-B path. */
export type BlockTimeNeeds = ReadonlyMap<string, number>;

/** Phase B Step 6 — `block.id` → weekly pace ('ahead' | 'on-pace' |
 *  'behind'). Drives the pace-aware overflow distribution in
 *  `allocateBlockTime` (overflow → behind-pace blocks first). Omit
 *  → all blocks read as on-pace (equal-split overflow). */
export type PaceByBlock = ReadonlyMap<string, WeeklyPace>;

export const BALANCED_MAX_BLOCKS = 5;
export const FOCUSED_MAX_BLOCKS = 2;

export interface Proposal {
  kind: 'balanced' | 'focused';
  title: string;
  blocks: AllocatedBlock[];
  totalSeconds: number;
}

export interface GenerateProposalsInput {
  /** Candidate blocks pre-weighted by Step 2d. Order doesn't matter
   *  — generator sorts internally. */
  blocks: ReadonlyArray<AlgorithmBlock>;
  /** Total session time the user declared (Q1 of the questionnaire). */
  availableSeconds: number;
  /** Phase B — optional per-block goal-pace time needs. When a
   *  block has an entry, its allocation targets that need instead
   *  of the memory-type typical band. Absent blocks fall back to
   *  MEMORY_TYPE_DURATIONS unchanged. */
  blockTimeNeeds?: BlockTimeNeeds;
  /** Phase B Step 6 — optional per-block weekly pace. Drives the
   *  pace-aware overflow distribution; ignored when the session
   *  fits inside the typical-high band. */
  paceByBlock?: PaceByBlock;
  /** Practice context — threaded into sequenceBlocks so the 'full'
   *  context's keyboard-first ordering can fire. Other contexts
   *  leave the existing sort unchanged. Optional for back-compat. */
  context?: import('../db').PracticeSessionContext;
}

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

/**
 * Returns one or two proposals. Two when there's genuine tension
 * between breadth and depth; one when the proposals would carry the
 * same block set (single candidate, very short session).
 */
export function generateProposals(input: GenerateProposalsInput): Proposal[] {
  const balanced = buildBalancedProposal(
    input.blocks,
    input.availableSeconds,
    input.blockTimeNeeds,
    input.paceByBlock,
    input.context,
  );
  const focused = buildFocusedProposal(
    input.blocks,
    input.availableSeconds,
    input.blockTimeNeeds,
    input.paceByBlock,
    input.context,
  );

  if (!balanced && !focused) return [];
  if (!balanced) return [focused!];
  if (!focused) return [balanced];

  // Collapse when both end up with the same single block.
  if (
    balanced.blocks.length === focused.blocks.length &&
    balanced.blocks.every((b, i) => b.id === focused.blocks[i].id)
  ) {
    return [balanced];
  }

  return [balanced, focused];
}

// ---------------------------------------------------------------------
// Balanced — broad module coverage
// ---------------------------------------------------------------------

export function buildBalancedProposal(
  blocks: ReadonlyArray<AlgorithmBlock>,
  availableSeconds: number,
  blockTimeNeeds?: BlockTimeNeeds,
  paceByBlock?: PaceByBlock,
  context?: import('../db').PracticeSessionContext,
): Proposal | null {
  const sorted = [...blocks].sort((a, b) => b.weight - a.weight);

  // Walk in weight order, take blocks from distinct modules until
  // we hit BALANCED_MAX_BLOCKS or run out.
  const seen = new Set<string>();
  const picked: AlgorithmBlock[] = [];
  for (const b of sorted) {
    if (seen.has(b.moduleRef)) continue;
    seen.add(b.moduleRef);
    picked.push(b);
    if (picked.length >= BALANCED_MAX_BLOCKS) break;
  }

  if (picked.length === 0) return null;

  const allocated = allocateBlockTime(picked, availableSeconds, blockTimeNeeds, paceByBlock);
  if (!allocated || allocated.length === 0) return null;

  const sequenced = sequenceBlocks(allocated, context);
  const total = sequenced.reduce((s, b) => s + b.plannedSeconds, 0);

  return {
    kind: 'balanced',
    title: 'Stay on track overall',
    blocks: sequenced,
    totalSeconds: total,
  };
}

// ---------------------------------------------------------------------
// Focused — depth on highest-priority module
// ---------------------------------------------------------------------

export function buildFocusedProposal(
  blocks: ReadonlyArray<AlgorithmBlock>,
  availableSeconds: number,
  blockTimeNeeds?: BlockTimeNeeds,
  // Reserved for future symmetry with the balanced path; the focused
  // allocator routes through allocateFocused (not allocateBlockTime),
  // which doesn't carry a typical-high overflow branch, so pace-aware
  // overflow doesn't apply here today. Accepted at the surface so
  // generateProposals can pass it uniformly.
  _paceByBlock?: PaceByBlock,
  context?: import('../db').PracticeSessionContext,
): Proposal | null {
  if (availableSeconds <= 0 || blocks.length === 0) return null;
  const sorted = [...blocks].sort((a, b) => b.weight - a.weight);
  const top = sorted[0];

  // Try to pair with another block from the same module for true
  // depth. If none, fall back to a single-block focused proposal.
  const sameModuleNext = sorted.slice(1).find(b => b.moduleRef === top.moduleRef);
  const picked = sameModuleNext ? [top, sameModuleNext] : [top];

  // Don't bother if this devolves into 'just the top block' AND that
  // block is already covered by the balanced proposal — caller's
  // generateProposals will collapse it anyway. Build it; collapse later.
  const allocated = allocateFocused(picked, availableSeconds, blockTimeNeeds);
  if (!allocated) return null;

  const sequenced = sequenceBlocks(allocated, context);
  const total = sequenced.reduce((s, b) => s + b.plannedSeconds, 0);
  const moduleLabel = moduleMetaById(top.moduleRef)?.label ?? top.moduleRef;

  return {
    kind: 'focused',
    title: `Go deep on ${moduleLabel}`,
    blocks: sequenced,
    totalSeconds: total,
  };
}

/**
 * Focused-mode allocator. Unlike allocateBlockTime, this lets blocks
 * extend past their typical-high since the user is intentionally
 * choosing depth. Constraints:
 *
 *   - Each block ≥ its effective minimum.
 *   - Sum equals availableSeconds (within rounding).
 *
 * One block: gets all availableSeconds (clamped to its min). The
 *   single-block case stays uncapped on purpose — focused mode's
 *   whole identity is "go deep" — so a Phase B need acts only as a
 *   floor, never a ceiling, here.
 * Two blocks: split by weight share, each ≥ its min. If splitting
 *   would push a block under its min, give it the min and the rest
 *   to the other.
 *
 * Phase B: when a block carries a goal-pace time need, that need
 * raises its effective minimum so a focused split can't starve a
 * goal-driven block below the time its weekly target requires.
 *
 * Returns null when even the minimum doesn't fit.
 */
function allocateFocused(
  blocks: ReadonlyArray<AlgorithmBlock>,
  availableSeconds: number,
  blockTimeNeeds?: BlockTimeNeeds,
): AllocatedBlock[] | null {
  if (blocks.length === 0) return null;

  // Effective min = max(memory-type min, Phase B goal-pace need).
  // The need is a floor here, not a target — focused mode stays
  // uncapped above it.
  const tiers = blocks.map(b => {
    const base = durationTierFor(b.memoryType);
    const need = blockTimeNeeds?.get(b.id) ?? 0;
    return need > base.minSeconds
      ? { ...base, minSeconds: need }
      : base;
  });
  const minTotal = tiers.reduce((s, t) => s + t.minSeconds, 0);
  if (minTotal > availableSeconds) {
    // Drop the lowest-weight block and retry; if none left, null.
    if (blocks.length === 1) return null;
    const dropIdx = blocks[0].weight < blocks[1].weight ? 0 : 1;
    return allocateFocused(
      blocks.filter((_, i) => i !== dropIdx),
      availableSeconds,
      blockTimeNeeds,
    );
  }

  if (blocks.length === 1) {
    return [
      {
        ...blocks[0],
        plannedSeconds: availableSeconds,
        phase: phaseForBlock(blocks[0]),
      },
    ];
  }

  // Two blocks — split by weight share, clamp to mins.
  const totalWeight = blocks.reduce((s, b) => s + b.weight, 0);
  const seconds = blocks.map((b, i) => {
    const share = totalWeight === 0 ? 0.5 : b.weight / totalWeight;
    return Math.max(tiers[i].minSeconds, Math.round(share * availableSeconds));
  });

  // If clamping pushed sum over available, take the excess from the
  // higher-weight block (it had the larger share to spare).
  let total = seconds.reduce((s, x) => s + x, 0);
  if (total > availableSeconds) {
    const excess = total - availableSeconds;
    // Take from the block that's furthest above its min.
    const slack = seconds.map((s, i) => s - tiers[i].minSeconds);
    const idx = slack[0] >= slack[1] ? 0 : 1;
    const take = Math.min(excess, slack[idx]);
    seconds[idx] -= take;
    total -= take;
  }

  return blocks.map((b, i) => ({
    ...b,
    plannedSeconds: seconds[i],
    phase: phaseForBlock(b),
  }));
}

// ---------------------------------------------------------------------
// Convenience: derive hasAcquiringItems quickly
// ---------------------------------------------------------------------

/**
 * Helper for callers building AlgorithmBlock instances from a list of
 * spacingState rows: returns true when any of the supplied items is
 * in `acquiring` stage. Pure; tests pass row fixtures directly.
 *
 * Lives here rather than in acquisitionStage.ts because the call site
 * is block construction (a proposal-generator concern), not stage
 * predicate composition.
 */
export function blockHasAcquiringItems(
  itemRefs: ReadonlyArray<string>,
  acquiringSet: ReadonlySet<string>,
): boolean {
  for (const ref of itemRefs) {
    if (acquiringSet.has(ref)) return true;
  }
  return false;
}

// Avoid unused-export warning when MemoryType isn't directly referenced.
export type { MemoryType };
