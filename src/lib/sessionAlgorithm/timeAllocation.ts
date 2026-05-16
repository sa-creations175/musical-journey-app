/**
 * Phase 3 Step 2e — Time allocation + block sequencing.
 *
 * Two pure transformations on the candidate-block list the algorithm
 * builds upstream:
 *
 *   allocateBlockTime(blocks, availableSeconds)
 *     Distributes the session's total time across blocks honoring per-
 *     memory-type minimums and typicals (algorithm Step 7). Strategy:
 *     start each block at its typical-low duration; scale all blocks
 *     proportionally up or down to match available time; if scaling
 *     would push any block below its minimum, drop the lowest-weight
 *     blocks and retry. Never returns a block below its minimum.
 *
 *   sequenceBlocks(blocks)
 *     Orders blocks per algorithm Step 8: acquisition / hard cognitive
 *     work first (fresh attention), review / maintenance in the middle,
 *     creative / expression last. Within phase, higher-weight blocks
 *     come first. The result's first block carries the warm-up badge
 *     in the UI; this layer doesn't tag it explicitly.
 *
 * Within-day spacing (algorithm Step 6) is intentionally out of scope
 * for Phase 3 — blocks here are independent of any other-time-of-day
 * touches.
 */

import type { MemoryType } from '../db';
import type { WeeklyPace } from './moduleWeeklyNeed';

const SECONDS_PER_MINUTE = 60;

// ---------------------------------------------------------------------
// Per-memory-type duration table
// ---------------------------------------------------------------------

export interface DurationTier {
  /** Minimum block duration in seconds — never go below this. */
  minSeconds: number;
  /** Typical low end (default block size). */
  typicalLowSeconds: number;
  /** Typical high end. */
  typicalHighSeconds: number;
}

export const MEMORY_TYPE_DURATIONS: Record<MemoryType, DurationTier> = {
  declarative: {
    minSeconds:         3 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  5 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 10 * SECONDS_PER_MINUTE,
  },
  procedural: {
    minSeconds:         5 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  10 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 15 * SECONDS_PER_MINUTE,
  },
  integration: {
    minSeconds:         10 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  15 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 20 * SECONDS_PER_MINUTE,
  },
  expression: {
    minSeconds:         5 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  10 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 20 * SECONDS_PER_MINUTE,
  },
};

/**
 * Per-module overrides that take precedence over MEMORY_TYPE_DURATIONS
 * when the module needs a different default block shape than the rest
 * of its memory type. Merged shallow on top of the base tier — keys
 * not present in the override fall through.
 *
 * Repertoire (integration) needs ~60 min at typical-high so the
 * spotlight + maintenance split has room to deliver the design
 * intent (~45 min spotlight + ~15 min maintenance per session).
 * Production stays at the integration default — its sessions are
 * shorter and bursty.
 */
export const MODULE_DURATION_OVERRIDES: Readonly<Record<string, Partial<DurationTier>>> = {
  repertoire: {
    typicalHighSeconds: 60 * SECONDS_PER_MINUTE,
  },
};

/**
 * Resolve the duration tier for a block. `moduleRef` is the
 * spacingState moduleRef (e.g. `'repertoire'`, `'production'`,
 * `'chord-recognition'`). When omitted, falls back to the memory-
 * type defaults so callers that don't have a moduleRef handy
 * (mostly tests of the surrounding allocation math) still resolve
 * cleanly.
 */
export function durationTierFor(memoryType: MemoryType, moduleRef?: string): DurationTier {
  const base = MEMORY_TYPE_DURATIONS[memoryType];
  if (!moduleRef) return base;
  const override = MODULE_DURATION_OVERRIDES[moduleRef];
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Phase B — resolve the effective duration tier for a block,
 * honoring a goal-pace time need when one is supplied.
 *
 * `blockTimeNeeds` maps `block.id` → the seconds the module's
 * active coverage goal needs from today's session (computed by
 * `computeSessionNeedByModule`). When a block carries a Phase B
 * need, its goal-pace target REPLACES the memory-type typical band
 * — the block wants exactly that many seconds. The memory-type
 * minimum is preserved so the block can still compress when the
 * session is short, except when the target is itself below that
 * minimum (a 2-min goal shouldn't be force-inflated to a 3-min
 * floor) — in that case the target wins.
 *
 * Blocks with no Phase B entry fall through to `durationTierFor`
 * unchanged — that's the no-active-goal path the design specifies.
 */
export function tierForBlock(
  block: AlgorithmBlock,
  blockTimeNeeds?: ReadonlyMap<string, number>,
): DurationTier {
  const base = durationTierFor(block.memoryType, block.moduleRef);
  const need = blockTimeNeeds?.get(block.id);
  if (need === undefined || need <= 0) return base;
  return {
    minSeconds: Math.min(base.minSeconds, need),
    typicalLowSeconds: need,
    typicalHighSeconds: need,
  };
}

// ---------------------------------------------------------------------
// Block phase (sequencing)
// ---------------------------------------------------------------------

export type BlockPhase = 'acquisition' | 'review' | 'expression';

export const PHASE_ORDER: Record<BlockPhase, number> = {
  acquisition: 0,
  review:      1,
  expression:  2,
};

// ---------------------------------------------------------------------
// Algorithm block shape
// ---------------------------------------------------------------------

export interface AlgorithmBlock {
  /** Stable id for ordering / mapping. Generated by the caller. */
  id: string;
  moduleRef: string;
  memoryType: MemoryType;
  itemRefs: readonly string[];
  /** Composite weight from Step 2d. Drives proportional scaling and
   *  drop priority. */
  weight: number;
  /** True when at least one of the block's items is in the acquiring
   *  stage. Drives phase classification. */
  hasAcquiringItems: boolean;
  /** True when this block's module needs a physical keyboard to
   *  practise (S&P, Repertoire). False for cognitive / DAW modules
   *  that work on a laptop or phone (HF, ET, Production, etc.).
   *  Used by the 'full' context's keyboard-first block ordering. */
  isKeyboardRequired: boolean;
}

export interface AllocatedBlock extends AlgorithmBlock {
  /** Allocated duration in seconds. Always ≥ min for the memory type. */
  plannedSeconds: number;
  /** Phase classification used by sequenceBlocks. */
  phase: BlockPhase;
}

// ---------------------------------------------------------------------
// Phase classification
// ---------------------------------------------------------------------

export function phaseForBlock(block: AlgorithmBlock): BlockPhase {
  if (block.memoryType === 'expression') return 'expression';
  if (block.hasAcquiringItems)            return 'acquisition';
  return 'review';
}

// ---------------------------------------------------------------------
// Time allocation
// ---------------------------------------------------------------------

/**
 * Distribute `availableSeconds` across blocks. Returns null when no
 * blocks can fit — the caller should fall back to the abundance
 * surface or cold-start path. Otherwise returns the full block list
 * with per-block plannedSeconds, possibly with the lowest-weight
 * blocks dropped to make space.
 *
 * Algorithm:
 *   1. Compute each block's typical-low duration (default ask).
 *   2. If sum ≤ available: scale up proportionally toward typical-high,
 *      capping at typical-high.
 *   3. If sum > available: scale down proportionally; if any block
 *      would fall below its min, drop the lowest-weight block and
 *      retry from step 1 with the remaining set.
 *
 * Returned blocks preserve input order — sequencing happens separately.
 */
export function allocateBlockTime(
  blocks: ReadonlyArray<AlgorithmBlock>,
  availableSeconds: number,
  /** Phase B — `block.id` → goal-pace time need in seconds. Blocks
   *  with an entry have their typical band pinned to the need (see
   *  `tierForBlock`); blocks without one keep the memory-type tier.
   *  Omit entirely for the legacy no-Phase-B behaviour. */
  blockTimeNeeds?: ReadonlyMap<string, number>,
  /** Phase B Step 6 — `block.id` → weekly pace ('ahead' | 'on-pace'
   *  | 'behind'). When the session runs in overflow (available >
   *  typical-high total) the extra seconds go to behind-pace blocks
   *  first, then equal-split across on-pace blocks. Omitted entirely
   *  → all blocks treated as on-pace (equal split). Replaces the
   *  pre-Phase-B OVERFLOW_MEMORY_BIAS heuristic, which double-counted
   *  urgency against Phase B's time-allocation signal. */
  paceByBlock?: ReadonlyMap<string, WeeklyPace>,
): AllocatedBlock[] | null {
  if (availableSeconds <= 0) return null;

  let working = blocks.slice();

  while (working.length > 0) {
    const tiers = working.map(b => tierForBlock(b, blockTimeNeeds));
    const minTotal = tiers.reduce((s, t) => s + t.minSeconds, 0);
    const typicalLowTotal = tiers.reduce((s, t) => s + t.typicalLowSeconds, 0);
    const typicalHighTotal = tiers.reduce((s, t) => s + t.typicalHighSeconds, 0);

    if (minTotal > availableSeconds) {
      // Even at minimums, can't fit. Drop lowest-weight block.
      const dropIdx = lowestWeightIndex(working);
      working = working.filter((_, i) => i !== dropIdx);
      continue;
    }

    // We can fit. Pick a target distribution.
    const allocated = distribute(
      working, tiers, availableSeconds,
      typicalLowTotal, typicalHighTotal,
      paceByBlock,
    );
    return allocated.map(({ block, seconds }) => ({
      ...block,
      plannedSeconds: seconds,
      phase: phaseForBlock(block),
    }));
  }

  return null;
}

function distribute(
  blocks: ReadonlyArray<AlgorithmBlock>,
  tiers: ReadonlyArray<DurationTier>,
  available: number,
  typicalLowTotal: number,
  typicalHighTotal: number,
  paceByBlock: ReadonlyMap<string, WeeklyPace> | undefined,
): Array<{ block: AlgorithmBlock; seconds: number }> {
  const out: Array<{ block: AlgorithmBlock; seconds: number }> = [];

  if (available > typicalHighTotal) {
    // Overflow — the user asked for more than the typical-high
    // total. Start every block at its typical-high (the default
    // sweet spot) and distribute the leftover per the Phase B rule:
    // behind-pace blocks first (proportional to block.weight); if
    // no block is behind, equal split across all blocks. Without
    // this branch the remaining time would silently drop on the
    // floor, which on Keys/Mixed (where the context hard filter
    // limits to Shapes + Repertoire) means any session > 35 min
    // loses everything past the cap.
    return distributeOverflow(blocks, tiers, available, typicalHighTotal, paceByBlock);
  }

  if (available === typicalHighTotal) {
    // Exact fit — give each block its typical-high. (Pulled out of
    // the >= branch so the overflow case can use strict > above.)
    blocks.forEach((b, i) => {
      out.push({ block: b, seconds: tiers[i].typicalHighSeconds });
    });
    return out;
  }

  if (available >= typicalLowTotal) {
    // Between typical-low and typical-high — interpolate proportionally.
    const span = typicalHighTotal - typicalLowTotal;
    const t = span === 0 ? 0 : (available - typicalLowTotal) / span;
    blocks.forEach((b, i) => {
      const tier = tiers[i];
      const seconds = Math.round(
        tier.typicalLowSeconds + t * (tier.typicalHighSeconds - tier.typicalLowSeconds),
      );
      out.push({ block: b, seconds });
    });
    return out;
  }

  // Less than the typical-low total — scale down from typical-low,
  // clamping at min. (We already verified minTotal ≤ available
  // upstream, so the clamp won't push us over.)
  const scaleSpan = typicalLowTotal - blocks.reduce((s, _b, i) => s + tiers[i].minSeconds, 0);
  const targetSpan = available - blocks.reduce((s, _b, i) => s + tiers[i].minSeconds, 0);
  const t = scaleSpan === 0 ? 0 : Math.max(0, Math.min(1, targetSpan / scaleSpan));
  blocks.forEach((b, i) => {
    const tier = tiers[i];
    const seconds = Math.round(
      tier.minSeconds + t * (tier.typicalLowSeconds - tier.minSeconds),
    );
    out.push({ block: b, seconds });
  });
  return out;
}

/**
 * Stack overflow seconds on top of each block's typical-high — the
 * Phase B rule (design doc §"Legacy Systems to Deprecate/Replace"):
 *
 *   · Any block behind pace?  → Overflow goes to those blocks only,
 *                                proportional to block.weight (the
 *                                "behind-pace modules first" share).
 *                                On-pace blocks stay at typical-high.
 *   · No block behind pace?   → Overflow splits equally across every
 *                                block (the "equal split for on-track
 *                                modules" branch).
 *
 * Replaces the pre-Phase-B OVERFLOW_MEMORY_BIAS heuristic (integration
 * +1.5×) which biased Repertoire on Keys sessions; that turned out to
 * double-count urgency against Phase B's time-allocation signal.
 *
 * When `paceByBlock` is omitted (legacy callers, focused-proposal
 * path) every block is treated as on-pace → equal split. Defensive
 * floor at 0-weight: equal split among the relevant set. The LAST
 * recipient absorbs the rounding remainder so the sum exactly equals
 * `available` — no time silently dropped.
 */
function distributeOverflow(
  blocks: ReadonlyArray<AlgorithmBlock>,
  tiers: ReadonlyArray<DurationTier>,
  available: number,
  typicalHighTotal: number,
  paceByBlock: ReadonlyMap<string, WeeklyPace> | undefined,
): Array<{ block: AlgorithmBlock; seconds: number }> {
  const overflow = available - typicalHighTotal;

  // Recipients: behind-pace blocks if any are behind, else all
  // blocks. Pace is read off paceByBlock (absent → on-pace).
  const behindIndices: number[] = [];
  if (paceByBlock) {
    blocks.forEach((b, i) => {
      if (paceByBlock.get(b.id) === 'behind') behindIndices.push(i);
    });
  }
  const useBehindOnly = behindIndices.length > 0;
  const recipientIndices = useBehindOnly
    ? behindIndices
    : blocks.map((_, i) => i);

  // Shares: behind branch uses block.weight (proportional); on-pace
  // equal-split uses 1 per block. Defensive zero-share fallback
  // mirrors the pre-Phase-B behaviour.
  const shares = recipientIndices.map(i =>
    useBehindOnly ? blocks[i].weight : 1,
  );
  const totalShare = shares.reduce((s, v) => s + v, 0);

  const extras = new Array<number>(blocks.length).fill(0);
  let allocatedOverflow = 0;
  recipientIndices.forEach((blockIdx, j) => {
    let extra: number;
    if (j === recipientIndices.length - 1) {
      // Last recipient absorbs the rounding remainder so the sum
      // exactly equals `available`.
      extra = overflow - allocatedOverflow;
    } else if (totalShare === 0) {
      // Defensive — every share is zero (e.g. all weights 0 in the
      // behind branch). Split evenly across the recipients.
      extra = Math.round(overflow / recipientIndices.length);
    } else {
      extra = Math.round(overflow * (shares[j] / totalShare));
    }
    extras[blockIdx] = extra;
    allocatedOverflow += extra;
  });

  return blocks.map((b, i) => ({
    block: b,
    seconds: tiers[i].typicalHighSeconds + extras[i],
  }));
}

function lowestWeightIndex(blocks: ReadonlyArray<AlgorithmBlock>): number {
  let idx = 0;
  let minW = blocks[0].weight;
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].weight < minW) {
      minW = blocks[i].weight;
      idx = i;
    }
  }
  return idx;
}

// ---------------------------------------------------------------------
// Sequencing
// ---------------------------------------------------------------------

/**
 * Order allocated blocks per algorithm Step 8:
 *   acquisition (fresh attention) → review → expression (consolidation)
 *
 * Within a phase, higher-weight blocks come first so the most
 * important work lands when attention is at its best for that phase.
 *
 * Sort is stable: blocks with the same phase + weight retain their
 * input order. Pure; doesn't mutate input.
 */
export function sequenceBlocks(
  blocks: ReadonlyArray<AllocatedBlock>,
  /** Optional practice context. When 'full', keyboard-required
   *  blocks sort before non-keyboard blocks within the existing
   *  phase → weight → input-order chain ("keys first, then
   *  everything"). Other contexts leave sort order unchanged. */
  context?: import('../db').PracticeSessionContext,
): AllocatedBlock[] {
  const keyboardFirst = context === 'full';
  const indexed = blocks.map((b, i) => ({ b, i }));
  indexed.sort((a, b) => {
    // 'full' context outer sort: keyboard-required blocks first so
    // the user lands at the piano before anything else in the
    // session. Inner phase/weight ordering still applies within
    // each keyboard / non-keyboard bucket.
    if (keyboardFirst && a.b.isKeyboardRequired !== b.b.isKeyboardRequired) {
      return a.b.isKeyboardRequired ? -1 : 1;
    }
    const phaseDiff = PHASE_ORDER[a.b.phase] - PHASE_ORDER[b.b.phase];
    if (phaseDiff !== 0) return phaseDiff;
    if (a.b.weight !== b.b.weight) return b.b.weight - a.b.weight;
    return a.i - b.i;
  });
  return indexed.map(x => x.b);
}
