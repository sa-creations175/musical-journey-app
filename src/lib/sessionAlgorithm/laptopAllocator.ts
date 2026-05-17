/**
 * Laptop session post-process — replaces multiplier-driven allocation
 * with declarative target shares from sessionDesign.ts.
 *
 * Runs AFTER the standard allocator has produced cards. The standard
 * pipeline already prepends the vocab + mental-viz carve-outs at
 * their target-share durations; this helper finishes the job for the
 * surviving practice blocks:
 *
 *   1. Pass through carve-outs (vocab, mental viz) and Repertoire
 *      warm-ups (chord-quiz, scale-prep — adjacency target for MV in
 *      sequenceBlocks).
 *   2. Rescale blocks whose moduleRef is in LAPTOP_PRACTICE_MODULE_SHARES
 *      (Production lessons, HF, intervals, chord-recognition) so their
 *      seconds reflect the normalized share table within their
 *      combined budget. Missing modules' shares redistribute to
 *      whatever IS present.
 *   3. Drop everything else (chord-progressions, scales-modes,
 *      Repertoire song-practice, S&P drills) — they're outside the
 *      laptop target list per SESSION_DESIGN.md.
 *
 * No-op on non-laptop contexts. When NO practice-eligible blocks
 * survive (rare — happens if every laptop-target module is empty),
 * returns the card unchanged so the user sees something rather than
 * an empty practice section. Honest fallback.
 */

import { LAPTOP_PRACTICE_MODULE_SHARES } from './sessionDesign';
import type { ProposalBlock, ProposalCardData } from '../../modules/practice/proposalTypes';
import type { PracticeSessionContext } from '../db';

/** Block-classification used internally. Drives the keep/rescale/drop
 *  decision per block. */
type LaptopBlockKind = 'carveout' | 'practice' | 'drop';

const VOCAB_BLOCK_ID = 'block-production-vocab';
const MENTAL_VIZ_BLOCK_ID = 'block-mental-viz';

function classifyForLaptop(block: ProposalBlock): LaptopBlockKind {
  if (block.id === VOCAB_BLOCK_ID) return 'carveout';
  if (block.id === MENTAL_VIZ_BLOCK_ID) return 'carveout';
  // Repertoire warm-ups (chord-quiz, scale-prep) — kept as adjacency
  // target for mental viz in sequenceBlocks. Treated as carve-out so
  // their seconds don't get pulled into the practice rebalance.
  if (block.moduleRef === 'repertoire' && block.isWarmup) return 'carveout';
  if (LAPTOP_PRACTICE_MODULE_SHARES.has(block.moduleRef)) return 'practice';
  return 'drop';
}

export function applyLaptopTargetShares(args: {
  cards: ProposalCardData[];
  context: PracticeSessionContext;
}): ProposalCardData[] {
  if (args.context !== 'laptop') return args.cards;

  return args.cards.map(card => {
    const carveouts: ProposalBlock[] = [];
    const practice: ProposalBlock[] = [];
    for (const block of card.blocks) {
      const kind = classifyForLaptop(block);
      if (kind === 'carveout') carveouts.push(block);
      else if (kind === 'practice') practice.push(block);
      // 'drop' falls through.
    }

    if (practice.length === 0) return card;

    const practiceBudget = practice.reduce((s, b) => s + b.plannedSeconds, 0);
    if (practiceBudget <= 0) return card;

    // Sum of active shares (modules actually present) — drives the
    // redistribute-to-present rule.
    const activeShareTotal = practice.reduce((s, b) =>
      s + (LAPTOP_PRACTICE_MODULE_SHARES.get(b.moduleRef) ?? 0), 0);
    if (activeShareTotal <= 0) return card;

    // Last element absorbs the rounding remainder so the sum exactly
    // matches practiceBudget — avoids silently dropping (or adding)
    // seconds via Math.round.
    const rescaled: ProposalBlock[] = [];
    let allocated = 0;
    practice.forEach((b, i) => {
      const share = LAPTOP_PRACTICE_MODULE_SHARES.get(b.moduleRef) ?? 0;
      const seconds = i === practice.length - 1
        ? Math.max(1, practiceBudget - allocated)
        : Math.max(1, Math.round(practiceBudget * (share / activeShareTotal)));
      rescaled.push({ ...b, plannedSeconds: seconds });
      allocated += seconds;
    });

    const blocks = [...carveouts, ...rescaled];
    const newTotal = blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    return { ...card, blocks, totalSeconds: newTotal };
  });
}

// ---------------------------------------------------------------------
// applyLaptopBlockOrdering — block sequencing for laptop + full
// ---------------------------------------------------------------------

/**
 * Two ordering rules per SESSION_DESIGN.md, applied to any context
 * that has both a device arc and (in full's case) a keyboard arc
 * where Mental Viz needs to slot next to the Repertoire chord-quiz:
 *
 *   1. Same-module blocks cluster. The Production Vocab carve-out
 *      (moduleRef = 'production') sits with Production lessons rather
 *      than being separated by HF / ET. The rule fires for every
 *      module that surfaces more than one block — production today,
 *      but also any future split-module surface.
 *
 *   2. Mental Viz (moduleRef = 'shapes-and-patterns', non-keyboard)
 *      sits immediately before the Repertoire chord-quiz warm-up
 *      when both are present. Both are away-from-keyboard mental
 *      recall — grouping them produces a coherent "mental prep" arc
 *      before the practice work begins.
 *
 * Fires on laptop AND full contexts. No-op on keys / phone (phone
 * uses NON_KEYBOARD_MODULE_ORDER in sequenceBlocks; keys has no
 * non-keyboard content). Pure; rebuilds the blocks list in the new
 * order and recomputes totalSeconds defensively (totalSeconds is the
 * sum of block plannedSeconds — order doesn't change it, but
 * recompute keeps the helper a single source of truth).
 */
export function applyLaptopBlockOrdering(args: {
  cards: ProposalCardData[];
  context: PracticeSessionContext;
}): ProposalCardData[] {
  if (args.context !== 'laptop' && args.context !== 'full') return args.cards;

  return args.cards.map(card => {
    let blocks = clusterSameModuleBlocks(card.blocks);
    blocks = placeMentalVizBeforeChordQuiz(blocks);
    const totalSeconds = blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    return { ...card, blocks, totalSeconds };
  });
}

/** Walk blocks in order; on first sighting of a moduleRef, append it
 *  + every subsequent block sharing that moduleRef. Preserves the
 *  per-module relative order within each cluster. */
function clusterSameModuleBlocks(
  blocks: ReadonlyArray<ProposalBlock>,
): ProposalBlock[] {
  const out: ProposalBlock[] = [];
  const placed = new Set<string>();
  for (const block of blocks) {
    if (placed.has(block.id)) continue;
    out.push(block);
    placed.add(block.id);
    // Pull forward every later block with the same moduleRef.
    for (const peer of blocks) {
      if (placed.has(peer.id)) continue;
      if (peer.moduleRef === block.moduleRef) {
        out.push(peer);
        placed.add(peer.id);
      }
    }
  }
  return out;
}

/** When both blocks are present, move Mental Viz to sit immediately
 *  before the chord-quiz warm-up. Heuristic for "the chord-quiz
 *  warm-up" — first Repertoire block that's a warm-up. Mental Viz
 *  detected via the block id stamped by buildMentalVizBlock. */
function placeMentalVizBeforeChordQuiz(
  blocks: ReadonlyArray<ProposalBlock>,
): ProposalBlock[] {
  const mvIdx = blocks.findIndex(b => b.id === 'block-mental-viz');
  const chordQuizIdx = blocks.findIndex(
    b => b.moduleRef === 'repertoire' && !!b.isWarmup,
  );
  if (mvIdx < 0 || chordQuizIdx < 0) return [...blocks];
  if (mvIdx === chordQuizIdx - 1) return [...blocks];

  const withoutMv = blocks.filter((_, i) => i !== mvIdx);
  const newChordQuizIdx = withoutMv.findIndex(
    b => b.moduleRef === 'repertoire' && !!b.isWarmup,
  );
  return [
    ...withoutMv.slice(0, newChordQuizIdx),
    blocks[mvIdx],
    ...withoutMv.slice(newChordQuizIdx),
  ];
}
