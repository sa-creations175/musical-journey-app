/**
 * Full-session post-process — enforces a non-keyboard arc floor.
 *
 * 'full' sessions are designed as keyboard-first → non-keyboard-second.
 * The goal-driven allocator picks blocks per module weight, which can
 * leave the non-keyboard arc starved when keyboard candidates (S&P +
 * Repertoire) dominate. This helper guarantees a minimum share of card
 * total seconds goes to non-keyboard content (HF / ET / Production /
 * Mental Viz / Production Vocab when present).
 *
 * Rescale rules:
 *   · Warm-up blocks (any isWarmup === true) are held at their
 *     original seconds. They participate in neither bucket's pool —
 *     the rescale operates only on non-warm-up blocks.
 *   · Non-warm-up keyboard blocks shrink proportionally.
 *   · Non-warm-up non-keyboard blocks grow proportionally.
 *   · Last block in each bucket absorbs the rounding remainder so the
 *     overall card total is preserved exactly.
 *
 * No-op on non-full contexts. Honest fallback when there's nothing
 * to rescale into (no non-warm-up non-keyboard blocks present).
 */

import { FULL_NON_KEYBOARD_MIN_SHARE } from './sessionDesign';
import type { ProposalBlock, ProposalCardData } from '../../modules/practice/proposalTypes';
import type { PracticeSessionContext } from '../db';

export function applyFullArcShares(args: {
  cards: ProposalCardData[];
  context: PracticeSessionContext;
}): ProposalCardData[] {
  if (args.context !== 'full') return args.cards;

  return args.cards.map(card => {
    const warmups: ProposalBlock[] = [];
    const kbNonWarmup: ProposalBlock[] = [];
    const nonKbNonWarmup: ProposalBlock[] = [];
    for (const block of card.blocks) {
      // Explicit boolean checks so an unset (undefined) field doesn't
      // silently flip a block into the wrong bucket. isWarmup defaults
      // to false (warm-up status is opt-in). isKeyboardRequired
      // defaults to TRUE (keyboard is the conservative pick — we'd
      // rather under-fund the non-keyboard arc than accidentally
      // drop keyboard content from a card whose blocks don't carry
      // the flag for any reason).
      const isWarmup = block.isWarmup === true;
      const isKeyboardRequired = block.isKeyboardRequired !== false;
      if (isWarmup) warmups.push(block);
      else if (isKeyboardRequired) kbNonWarmup.push(block);
      else nonKbNonWarmup.push(block);
    }

    // Nothing to grow into — leave the card alone rather than zeroing
    // out keyboard time with no non-keyboard recipient.
    if (nonKbNonWarmup.length === 0) return card;
    // Nothing to shrink — non-keyboard already has the whole non-warm-up
    // pool. The floor is trivially met; no rescale needed.
    if (kbNonWarmup.length === 0) return card;

    const cardTotal = card.blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    if (cardTotal <= 0) return card;

    const warmupTotal = warmups.reduce((s, b) => s + b.plannedSeconds, 0);
    const nonKbCurrent = nonKbNonWarmup.reduce((s, b) => s + b.plannedSeconds, 0);
    const currentShare = nonKbCurrent / cardTotal;
    if (currentShare >= FULL_NON_KEYBOARD_MIN_SHARE) return card;

    // Target seconds: non-warm-up pool stays at (cardTotal - warmupTotal);
    // non-keyboard inside that pool hits exactly the floor.
    const targetNonKb = Math.round(cardTotal * FULL_NON_KEYBOARD_MIN_SHARE);
    const targetKb = cardTotal - warmupTotal - targetNonKb;
    // Defensive: floor everything at 1 second; if the math underflows
    // keyboard (e.g. warm-ups already eat > 70%), bail rather than
    // ship a card with 0-second keyboard blocks.
    if (targetKb < kbNonWarmup.length) return card;

    const rescaledKb = rescaleBucket(kbNonWarmup, targetKb);
    const rescaledNonKb = rescaleBucket(nonKbNonWarmup, targetNonKb);

    // Reassemble blocks in original order — find each slot's original
    // identity and pull the rescaled version. Preserves the input
    // sequence (sequenceBlocks + applyLaptopBlockOrdering — neither
    // runs for full, so the algorithm's keyboard-first sort stays).
    const replacementById = new Map<string, ProposalBlock>();
    for (const b of rescaledKb) replacementById.set(b.id, b);
    for (const b of rescaledNonKb) replacementById.set(b.id, b);
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
