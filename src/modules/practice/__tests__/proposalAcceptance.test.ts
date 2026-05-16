// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_START_FALLBACK_ROUTE,
  resolveProposalStart,
} from '../proposalAcceptance';
import type { ProposalBlock } from '../proposalTypes';

/**
 * Pins the contract: the proposal-acceptance resolver derives its
 * startRoute + armBlocks STRICTLY from the head + order of the
 * supplied block list. After the user drags blocks around in the
 * proposal UI, ProposalCard hands the reordered array to
 * `onAccept`, which forwards it to this resolver — the route used
 * must come from the FIRST element of that reordered list, not
 * from any original / pre-drag order the algorithm produced.
 *
 * Symptom this guards against: "session starts on the wrong block
 * after reorder" (the quick-launch navigates to the original first
 * block instead of the one the user moved to position 0).
 */

function mkBlock(partial: Partial<ProposalBlock> & { id: string }): ProposalBlock {
  return {
    moduleRef: 'harmonic-fluency',
    moduleLabel: 'Harmonic Fluency',
    moduleAccentHex: '#888888',
    activityDescription: 'Test activity',
    plannedSeconds: 10 * 60,
    whySnippet: 'why',
    itemRefs: ['item-1'],
    isWarmup: false,
    ...partial,
  };
}

describe('resolveProposalStart', () => {
  it('returns the first block as firstBlock when no reorder applied', () => {
    const blocks = [
      mkBlock({
        id: 'a',
        moduleRef: 'harmonic-fluency',
        quickLaunchRoute: '/harmonic-fluency?card=A',
      }),
      mkBlock({
        id: 'b',
        moduleRef: 'ear-training',
        quickLaunchRoute: '/ear-training?quiz=B',
      }),
    ];
    const out = resolveProposalStart(blocks);
    expect(out.firstBlock.id).toBe('a');
    expect(out.startRoute).toBe('/harmonic-fluency?card=A');
  });

  it('uses the FIRST block of the supplied list — even if it was moved there by reorder', () => {
    // Simulate the user dragging block "B" to position 0. ProposalCard
    // hands the reordered list to onAccept; the helper must pick "B"
    // as the start target.
    const reordered = [
      mkBlock({
        id: 'b',
        moduleRef: 'ear-training',
        quickLaunchRoute: '/ear-training?quiz=B',
      }),
      mkBlock({
        id: 'a',
        moduleRef: 'harmonic-fluency',
        quickLaunchRoute: '/harmonic-fluency?card=A',
      }),
    ];
    const out = resolveProposalStart(reordered);
    expect(out.firstBlock.id).toBe('b');
    expect(out.startRoute).toBe('/ear-training?quiz=B');
    // armBlocks iterate in the supplied order — the armed session's
    // currentBlockIndex = 0 will land on B.
    expect(out.armBlocks.map(b => b.moduleRef)).toEqual([
      'ear-training', 'harmonic-fluency',
    ]);
  });

  it('falls back to the moduleMeta route when the first block has no quickLaunchRoute', () => {
    const blocks = [
      // No explicit quickLaunchRoute — the helper must consult
      // moduleMetaById for the module's default route.
      mkBlock({ id: 'a', moduleRef: 'harmonic-fluency' }),
    ];
    const out = resolveProposalStart(blocks);
    // moduleMetaById('harmonic-fluency').route — the helper uses
    // whatever the registry returns. Asserting it's a string that
    // STARTS WITH '/' (i.e. a real route, not the fallback) keeps
    // the test resilient against route-rename refactors.
    expect(out.startRoute.startsWith('/')).toBe(true);
    expect(out.startRoute).not.toBe(PROPOSAL_START_FALLBACK_ROUTE);
  });

  it('falls back to the active-session sentinel when neither block route nor module route resolves', () => {
    const blocks = [
      mkBlock({ id: 'a', moduleRef: 'definitely-not-a-real-module' }),
    ];
    const out = resolveProposalStart(blocks);
    expect(out.startRoute).toBe(PROPOSAL_START_FALLBACK_ROUTE);
  });

  it('armBlocks mirror the supplied list 1:1, in order, with itemRefs cloned', () => {
    // Reordered list → armBlocks must preserve that order so the
    // reducer's `state.blocks` lands the user on the right
    // currentBlockIndex=0 block. itemRefs are cloned so a downstream
    // mutation can't reach back through this layer.
    const blocks = [
      mkBlock({
        id: 'c',
        moduleRef: 'repertoire',
        activityDescription: 'Song of the Month: Mirror',
        itemRefs: ['song-mirror'],
        plannedSeconds: 45 * 60,
      }),
      mkBlock({
        id: 'a',
        moduleRef: 'harmonic-fluency',
        activityDescription: 'HF cards',
        plannedSeconds: 10 * 60,
      }),
    ];
    const out = resolveProposalStart(blocks);
    expect(out.armBlocks).toEqual([
      {
        moduleRef: 'repertoire',
        itemRefs: ['song-mirror'],
        label: 'Song of the Month: Mirror',
        plannedSeconds: 45 * 60,
        quickLaunchRoute: undefined,
        isWarmup: false,
      },
      {
        moduleRef: 'harmonic-fluency',
        itemRefs: ['item-1'],
        label: 'HF cards',
        plannedSeconds: 10 * 60,
        quickLaunchRoute: undefined,
        isWarmup: false,
      },
    ]);
    // itemRefs is a fresh array, not the input reference.
    expect(out.armBlocks[0].itemRefs).not.toBe(blocks[0].itemRefs);
  });

  it('throws on empty input — handleProposalAccept gates on empty upstream', () => {
    expect(() => resolveProposalStart([])).toThrow(/empty block list/);
  });

  it('threads isWarmup from ProposalBlock onto each armBlock', () => {
    // ActiveSessionScreen consumes block.isWarmup to suppress the
    // per-block "skip this block" affordance — warm-ups (chord-quiz,
    // scale-prep, scales warm-up segment) are paired with a parent
    // practice slot and shouldn't be skipped independently. The
    // arming layer is the only place this signal can travel from
    // the proposal screen into the timer's SessionBlock, so pin
    // that the boolean isn't dropped en route.
    const blocks = [
      mkBlock({ id: 'warmup', isWarmup: true }),
      mkBlock({ id: 'song', isWarmup: false }),
    ];
    const out = resolveProposalStart(blocks);
    expect(out.armBlocks.map(b => b.isWarmup)).toEqual([true, false]);
  });

  it('block.quickLaunchRoute wins over the moduleMeta route', () => {
    // Production Vocab is the canonical example: moduleRef =
    // production (which has its own moduleMeta route), but the
    // block carries `/production?view=vocabulary` to deep-link
    // into the vocab tab. The deep-link must win.
    const blocks = [
      mkBlock({
        id: 'vocab',
        moduleRef: 'production',
        quickLaunchRoute: '/production?view=vocabulary',
      }),
    ];
    const out = resolveProposalStart(blocks);
    expect(out.startRoute).toBe('/production?view=vocabulary');
  });
});
