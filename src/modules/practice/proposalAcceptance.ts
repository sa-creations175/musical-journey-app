/**
 * Pure resolver for the proposal-acceptance flow. Takes the (already
 * reordered) blocks the user is committing to and returns:
 *
 *   · startRoute — where to navigate the user so the armed session
 *     can fire (matches the FIRST block's module). Uses the block's
 *     explicit `quickLaunchRoute` when present, otherwise the
 *     module's default route from moduleMeta, otherwise the active-
 *     session fallback.
 *   · armBlocks — the shape `armSession()` expects, mapped 1:1 from
 *     the reordered blocks list IN ORDER. The reducer turns this
 *     into `state.blocks` and `currentBlockIndex = 0` lands on
 *     index 0 — which must be the user's reordered first block.
 *
 * Extracted from PracticeSessions.handleProposalAccept so the
 * contract is testable in isolation: the helper accepts a plain
 * `ProposalBlock[]` parameter, so a test can reorder the list and
 * assert the returned startRoute / armBlocks come from the new
 * head of the array. The previous inline implementation also
 * sourced the route from the first block, but the lack of an
 * isolated test left the contract ambiguous under refactor.
 */
import { moduleMetaById } from '../../lib/moduleMeta';
import type { ProposalBlock } from './proposalTypes';

/** Fallback when neither the block's own `quickLaunchRoute` nor the
 *  module's default route resolves — lands the user on the active-
 *  session screen, which can pick the next viable block or end. */
export const PROPOSAL_START_FALLBACK_ROUTE = '/practice-sessions/active';

export interface ProposalStartArmedBlock {
  moduleRef: string;
  itemRefs: string[];
  label: string;
  plannedSeconds: number;
  quickLaunchRoute: string | undefined;
}

export interface ProposalStartResolution {
  firstBlock: ProposalBlock;
  startRoute: string;
  armBlocks: ProposalStartArmedBlock[];
}

/**
 * Resolve the navigation + arm payload for the given block list.
 * Caller is expected to pass the user's FINAL ordering (after any
 * drag-to-reorder); the helper does not reorder, only translates.
 *
 * Throws on empty input — handleProposalAccept gates on
 * `card.blocks.length === 0` upstream, so an empty list reaching
 * here is a programming error worth surfacing.
 */
export function resolveProposalStart(
  blocks: ReadonlyArray<ProposalBlock>,
): ProposalStartResolution {
  if (blocks.length === 0) {
    throw new Error('resolveProposalStart: cannot resolve from an empty block list');
  }
  const firstBlock = blocks[0];
  const firstMeta = moduleMetaById(firstBlock.moduleRef);
  const startRoute =
    firstBlock.quickLaunchRoute ?? firstMeta?.route ?? PROPOSAL_START_FALLBACK_ROUTE;
  const armBlocks: ProposalStartArmedBlock[] = blocks.map(b => ({
    moduleRef: b.moduleRef,
    itemRefs: [...b.itemRefs],
    label: b.activityDescription,
    plannedSeconds: b.plannedSeconds,
    quickLaunchRoute: b.quickLaunchRoute,
  }));
  return { firstBlock, startRoute, armBlocks };
}
