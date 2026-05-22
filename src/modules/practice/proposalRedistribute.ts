/**
 * Pure helpers for the proposal-screen block-delete flow (Step 1 of
 * the Flexible Session Proposal build).
 *
 * Two responsibilities:
 *
 *   · deletionUnit — given a target blockId, return the full set of
 *     block ids that must be removed together. Mirrors the pairing
 *     rules in SessionStack.groupBlocks (which is the source of
 *     truth for "what drags as one unit"):
 *
 *       - Deleting a Repertoire song-practice anchor that has one
 *         or more preceding chord-quiz / scale-prep warm-ups in the
 *         same drag-group → all those warm-ups go with it.
 *       - Deleting any other non-warm-up block → just the one block.
 *
 *     Warm-ups are not directly deletable (the UI gates the delete
 *     button on `!isWarmup`); this helper still defends against a
 *     warm-up id reaching it by returning just the one id rather
 *     than crashing.
 *
 *   · redistributeProportionally — given a freed-seconds pool and a
 *     list of recipient block ids, return a new blocks array with
 *     each recipient's plannedSeconds bumped proportionally to its
 *     current share. Rounding leftover (positive or negative) lands
 *     on the first recipient so the sum stays exact. Non-recipients
 *     (warm-ups, blocks in other modules) are returned unchanged.
 *
 * Both helpers are pure (no DB, no React) so the redistribution math
 * is tested in isolation. The component layer (ProposalCard) wires
 * them up to local state.
 */

import type { ProposalBlock } from './proposalTypes';
import { groupBlocks } from './blockGrouping';

/**
 * Return every block id that should be removed when the user deletes
 * `targetBlockId`. Always includes the target id itself.
 *
 * Rules (must mirror SessionStack.groupBlocks):
 *
 *   - If the target is a song-practice block (isSongPractice=true)
 *     in the Repertoire module, walk BACKWARDS from its index
 *     through any contiguous Repertoire warm-ups (isWarmup=true)
 *     and include them — they're locked to this anchor and would
 *     be orphaned otherwise.
 *   - Otherwise return just `[targetBlockId]`.
 *
 * Returns the target id alone when the target isn't found
 * (defensive, shouldn't happen in practice).
 */
export function deletionUnit(
  blocks: ReadonlyArray<ProposalBlock>,
  targetBlockId: string,
): string[] {
  // Find the drag/delete group the target belongs to (single source of
  // truth = blockGrouping.groupBlocks).
  const group = groupBlocks(blocks).find(g =>
    g.items.some(b => b.id === targetBlockId),
  );
  if (!group) return [targetBlockId];

  // Rep-warmup → song chain is the one ASYMMETRIC case: deleting the
  // song anchor pulls its warm-ups, but deleting a warm-up (or anything
  // else in the chain) only removes that block — the song survives a
  // warm-up being removed. Every other locked group (ET family, viz/memo
  // pair) deletes as a whole unit.
  const isRepChain = group.items.some(
    b => b.moduleRef === 'repertoire' && b.isSongPractice === true,
  );
  if (isRepChain) {
    const target = group.items.find(b => b.id === targetBlockId);
    if (target && target.isSongPractice === true) {
      return group.items.map(b => b.id);
    }
    return [targetBlockId];
  }

  return group.items.map(b => b.id);
}

/**
 * Distribute `freedSeconds` across `recipientIds` proportionally to
 * their current plannedSeconds. Returns a fresh blocks array;
 * non-recipient blocks are returned unchanged.
 *
 * Rounding contract: each recipient gets `round(freed × share)`
 * added to its plannedSeconds. The leftover (sum of rounded
 * additions vs freedSeconds, can be positive or negative by up to
 * ~recipientCount/2 due to rounding) lands on the FIRST recipient
 * so the total session seconds change by exactly `freedSeconds`.
 *
 * Edge cases:
 *   - `freedSeconds === 0` → blocks returned unchanged.
 *   - `recipientIds.length === 0` → blocks returned unchanged
 *     (caller is responsible for handling the "no recipients"
 *     case in the UI).
 *   - Recipient with `plannedSeconds === 0` → contributes 0 to the
 *     denominator and receives 0 of the bump. The first-recipient
 *     leftover rule prevents a divide-by-zero collapse: if EVERY
 *     recipient has plannedSeconds === 0, the entire freedSeconds
 *     lands on the first recipient.
 */
export function redistributeProportionally(
  blocks: ReadonlyArray<ProposalBlock>,
  freedSeconds: number,
  recipientIds: ReadonlyArray<string>,
): ProposalBlock[] {
  if (freedSeconds === 0 || recipientIds.length === 0) {
    return blocks.slice();
  }
  const recipientSet = new Set(recipientIds);
  const denom = blocks
    .filter(b => recipientSet.has(b.id))
    .reduce((sum, b) => sum + b.plannedSeconds, 0);

  // First-recipient fallback when every recipient is at 0 seconds
  // (degenerate; redistribution falls back to "all on first").
  let firstRecipientFallback = denom === 0;

  // Compute per-recipient bumps first so we can sum and assign the
  // leftover to the first recipient.
  const bumps = new Map<string, number>();
  for (const id of recipientIds) {
    const b = blocks.find(x => x.id === id);
    if (!b) {
      bumps.set(id, 0);
      continue;
    }
    if (firstRecipientFallback) {
      bumps.set(id, 0);
    } else {
      bumps.set(id, Math.round(freedSeconds * (b.plannedSeconds / denom)));
    }
  }

  const summed = Array.from(bumps.values()).reduce((s, v) => s + v, 0);
  const leftover = freedSeconds - summed;
  if (recipientIds.length > 0) {
    const firstId = recipientIds[0];
    bumps.set(firstId, (bumps.get(firstId) ?? 0) + leftover);
  }

  return blocks.map(b => {
    const bump = bumps.get(b.id);
    if (bump === undefined || bump === 0) return b;
    return { ...b, plannedSeconds: b.plannedSeconds + bump };
  });
}

/**
 * Convenience: filter a block list to ids eligible as redistribution
 * recipients — non-warm-up blocks, optionally scoped to a single
 * moduleRef. Used by the prompt UI to build the per-module buttons
 * and by the redistribute call site.
 */
export function recipientIdsForModule(
  blocks: ReadonlyArray<ProposalBlock>,
  moduleRef: string | null,
): string[] {
  return blocks
    .filter(b => !b.isWarmup)
    .filter(b => moduleRef === null || b.moduleRef === moduleRef)
    .map(b => b.id);
}

/**
 * Distinct moduleRefs in the blocks list that have at least one
 * non-warm-up block. Drives the per-module button list in the
 * redistribution prompt. Preserves first-occurrence order so the
 * buttons render in the same order the modules appear in the
 * session stack.
 */
export function modulesWithRecipients(
  blocks: ReadonlyArray<ProposalBlock>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    if (b.isWarmup) continue;
    if (seen.has(b.moduleRef)) continue;
    seen.add(b.moduleRef);
    out.push(b.moduleRef);
  }
  return out;
}
