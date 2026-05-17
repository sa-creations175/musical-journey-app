/**
 * Full-session post-process — enforces keyboard arc primacy.
 *
 * 'full' sessions are designed as keyboard-first → non-keyboard-second.
 * The invariant: keyboard content gets at least FULL_KEYBOARD_MIN_SHARE
 * of session time (equivalently: non-keyboard caps at
 * FULL_NON_KEYBOARD_MAX_SHARE). Both express the same constraint from
 * opposite sides.
 *
 * Rescale rules:
 *   · Warm-up blocks (any isWarmup === true) are held at their
 *     original seconds. They count toward their bucket's total for
 *     the share check, but the rescale itself only moves seconds
 *     between non-warm-up blocks.
 *   · When keyboard share is already ≥ FULL_KEYBOARD_MIN_SHARE,
 *     no-op (the invariant is already satisfied).
 *   · Otherwise: shrink non-warm-up non-keyboard down, grow non-warm-up
 *     keyboard up, so keyboard hits exactly the floor.
 *   · Last block in each bucket absorbs the rounding remainder so the
 *     overall card total is preserved exactly.
 *
 * No-op on non-full contexts. No-op when either non-warm-up bucket is
 * empty (the rescale moves seconds between them, so an empty bucket
 * means no work to do or no recipient to grow into).
 *
 * Partitioning uses explicit boolean checks so an unset (undefined)
 * field doesn't silently flip a block into the wrong bucket. isWarmup
 * defaults to false (warm-up status is opt-in). isKeyboardRequired
 * defaults to TRUE (keyboard is the conservative pick — non-keyboard
 * requires explicit opt-in, e.g. mental viz / vocab both stamp false).
 */

import {
  FULL_KEYBOARD_MIN_SHARE,
} from './sessionDesign';
import type { ProposalBlock, ProposalCardData } from '../../modules/practice/proposalTypes';
import type { PracticeSessionContext } from '../db';

export function applyFullArcShares(args: {
  cards: ProposalCardData[];
  context: PracticeSessionContext;
}): ProposalCardData[] {
  if (args.context !== 'full') return args.cards;

  return args.cards.map(card => {
    const warmupsKb: ProposalBlock[] = [];
    const warmupsNk: ProposalBlock[] = [];
    const kbNonWarmup: ProposalBlock[] = [];
    const nkNonWarmup: ProposalBlock[] = [];
    for (const block of card.blocks) {
      const isWarmup = block.isWarmup === true;
      const isKeyboardRequired = block.isKeyboardRequired !== false;
      if (isWarmup && isKeyboardRequired) warmupsKb.push(block);
      else if (isWarmup) warmupsNk.push(block);
      else if (isKeyboardRequired) kbNonWarmup.push(block);
      else nkNonWarmup.push(block);
    }

    // No-op when either non-warm-up bucket is empty — the rescale
    // moves seconds between the two pools.
    if (kbNonWarmup.length === 0 || nkNonWarmup.length === 0) return card;

    const cardTotal = card.blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    if (cardTotal <= 0) return card;

    const sumSeconds = (s: number, b: ProposalBlock) => s + b.plannedSeconds;
    const warmupKbTotal = warmupsKb.reduce(sumSeconds, 0);
    const warmupNkTotal = warmupsNk.reduce(sumSeconds, 0);
    const kbCurrentTotal = warmupKbTotal + kbNonWarmup.reduce(sumSeconds, 0);

    // Keyboard share already meets the floor → no-op.
    if (kbCurrentTotal >= cardTotal * FULL_KEYBOARD_MIN_SHARE) return card;

    // Target: KB hits exactly the floor, NK takes the rest. Warm-ups
    // are locked, so solve for the non-warm-up buckets.
    const targetKbTotal = Math.round(cardTotal * FULL_KEYBOARD_MIN_SHARE);
    const targetNkTotal = cardTotal - targetKbTotal;
    const targetKbNonWarmup = targetKbTotal - warmupKbTotal;
    const targetNkNonWarmup = targetNkTotal - warmupNkTotal;

    // Defensive: if warm-ups already eat enough that either side
    // can't accommodate ≥ 1 sec per block, bail rather than ship a
    // card with 0-second blocks. (Each non-warm-up block in the
    // bucket needs at least 1 second.)
    if (targetKbNonWarmup < kbNonWarmup.length) return card;
    if (targetNkNonWarmup < nkNonWarmup.length) return card;

    const rescaledKb = rescaleBucket(kbNonWarmup, targetKbNonWarmup);
    const rescaledNk = rescaleBucket(nkNonWarmup, targetNkNonWarmup);

    // Reassemble blocks in original order — find each slot's original
    // identity and pull the rescaled version. Warm-ups pass through
    // unchanged (not in the replacement map).
    const replacementById = new Map<string, ProposalBlock>();
    for (const b of rescaledKb) replacementById.set(b.id, b);
    for (const b of rescaledNk) replacementById.set(b.id, b);
    const blocks = card.blocks.map(b => replacementById.get(b.id) ?? b);

    const newTotal = blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    return { ...card, blocks, totalSeconds: newTotal };
  });
}

/** Distribute `target` seconds proportionally to each block's current
 *  share within the bucket. Last block absorbs the rounding remainder
 *  so the bucket sums to exactly `target`. */
function rescaleBucket(
  blocks: ReadonlyArray<ProposalBlock>,
  target: number,
): ProposalBlock[] {
  const current = blocks.reduce((s, b) => s + b.plannedSeconds, 0);
  if (current <= 0) {
    // Equal-split fallback — shouldn't happen in practice (caller
    // filters empty buckets) but keeps the math safe.
    const each = Math.max(1, Math.floor(target / blocks.length));
    return blocks.map((b, i) => ({
      ...b,
      plannedSeconds: i === blocks.length - 1
        ? Math.max(1, target - each * (blocks.length - 1))
        : each,
    }));
  }
  const out: ProposalBlock[] = [];
  let allocated = 0;
  blocks.forEach((b, i) => {
    const seconds = i === blocks.length - 1
      ? Math.max(1, target - allocated)
      : Math.max(1, Math.round(target * (b.plannedSeconds / current)));
    out.push({ ...b, plannedSeconds: seconds });
    allocated += seconds;
  });
  return out;
}
