// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  deletionUnit,
  modulesWithRecipients,
  recipientIdsForModule,
  redistributeProportionally,
} from '../proposalRedistribute';
import type { ProposalBlock } from '../proposalTypes';

function mkBlock(partial: Partial<ProposalBlock> & { id: string }): ProposalBlock {
  return {
    moduleRef: 'harmonic-fluency',
    moduleLabel: 'Harmonic Fluency',
    moduleAccentHex: '#888',
    activityDescription: 'block ' + partial.id,
    plannedSeconds: 600,
    whySnippet: '',
    itemRefs: [],
    isWarmup: false,
    ...partial,
  };
}

// ---------------------------------------------------------------------
// deletionUnit
// ---------------------------------------------------------------------

describe('deletionUnit', () => {
  it('returns just the target for a plain non-warm-up block', () => {
    const blocks = [
      mkBlock({ id: 'a' }),
      mkBlock({ id: 'b' }),
      mkBlock({ id: 'c' }),
    ];
    expect(deletionUnit(blocks, 'b')).toEqual(['b']);
  });

  it('returns just the target for a non-Repertoire song block (e.g. S&P scales warm-up adjacent)', () => {
    // S&P shapes-walk preceded by an S&P scales warm-up. Per the
    // existing groupBlocks model the warm-up is its own unit, so
    // deleting the walk should NOT pull the warm-up.
    const blocks = [
      mkBlock({ id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true }),
      mkBlock({ id: 'sp-walk',   moduleRef: 'shapes-and-patterns' }),
    ];
    expect(deletionUnit(blocks, 'sp-walk')).toEqual(['sp-walk']);
  });

  it('pulls preceding Repertoire warm-ups when deleting a song-practice anchor', () => {
    // chord-quiz + scale-prep + spotlight (the canonical Rep group).
    const blocks = [
      mkBlock({ id: 'rep-quiz',  moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-prep',  moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-song',  moduleRef: 'repertoire', isSongPractice: true }),
      mkBlock({ id: 'after',     moduleRef: 'ear-training' }),
    ];
    expect(deletionUnit(blocks, 'rep-song')).toEqual([
      'rep-quiz', 'rep-prep', 'rep-song',
    ]);
  });

  it('stops walking backward when it hits a non-Repertoire-warm-up', () => {
    const blocks = [
      mkBlock({ id: 'et',        moduleRef: 'ear-training' }),
      mkBlock({ id: 'rep-prep',  moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-song',  moduleRef: 'repertoire', isSongPractice: true }),
    ];
    expect(deletionUnit(blocks, 'rep-song')).toEqual(['rep-prep', 'rep-song']);
  });

  it('stops walking backward when it hits a Repertoire non-warm-up block', () => {
    // Maintenance song between a warm-up and another song-practice
    // anchor — the warm-up is paired with the maintenance, not the
    // later anchor we're deleting.
    const blocks = [
      mkBlock({ id: 'rep-prep',       moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-maintenance', moduleRef: 'repertoire', isSongPractice: true }),
      mkBlock({ id: 'rep-spotlight',  moduleRef: 'repertoire', isSongPractice: true }),
    ];
    expect(deletionUnit(blocks, 'rep-spotlight')).toEqual(['rep-spotlight']);
  });

  it('returns just the target id for an unknown id (defensive)', () => {
    const blocks = [mkBlock({ id: 'a' })];
    expect(deletionUnit(blocks, 'nope')).toEqual(['nope']);
  });

  it('returns just the warm-up id when a Rep warm-up is deleted solo', () => {
    // Warm-ups are now independently deletable. Deleting a warm-up
    // must NOT pull its anchor with it — that's the inverse direction
    // of the song-anchor → warm-ups rule, and the song should survive
    // its warm-up being removed.
    const blocks = [
      mkBlock({ id: 'rep-quiz', moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-prep', moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-song', moduleRef: 'repertoire', isSongPractice: true }),
    ];
    expect(deletionUnit(blocks, 'rep-quiz')).toEqual(['rep-quiz']);
    expect(deletionUnit(blocks, 'rep-prep')).toEqual(['rep-prep']);
  });

  it('returns just the warm-up id when an S&P scales warm-up is deleted', () => {
    const blocks = [
      mkBlock({ id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true }),
      mkBlock({ id: 'sp-walk',   moduleRef: 'shapes-and-patterns' }),
    ];
    expect(deletionUnit(blocks, 'sp-warmup')).toEqual(['sp-warmup']);
  });

  it('deletes the whole ET family when any ET block is deleted (locked unit)', () => {
    const blocks = [
      mkBlock({ id: 'intervals',          moduleRef: 'intervals' }),
      mkBlock({ id: 'hf' }),
      mkBlock({ id: 'chord-recognition',  moduleRef: 'chord-recognition' }),
    ];
    expect(deletionUnit(blocks, 'intervals')).toEqual(['intervals', 'chord-recognition']);
    expect(deletionUnit(blocks, 'chord-recognition')).toEqual(['intervals', 'chord-recognition']);
    expect(deletionUnit(blocks, 'hf')).toEqual(['hf']);
  });

  it('deletes the viz/memo pair as a unit (mental-viz pulls the orphaned chord-quiz)', () => {
    const blocks = [
      mkBlock({ id: 'cq', moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'mv', moduleRef: 'shapes-and-patterns', quickLaunchRoute: '/shapes-and-patterns?tab=mental-viz' }),
    ];
    expect(deletionUnit(blocks, 'mv')).toEqual(['cq', 'mv']);
  });
});

// ---------------------------------------------------------------------
// redistributeProportionally
// ---------------------------------------------------------------------

describe('redistributeProportionally', () => {
  it('returns blocks unchanged when freedSeconds is 0', () => {
    const blocks = [mkBlock({ id: 'a' }), mkBlock({ id: 'b' })];
    expect(redistributeProportionally(blocks, 0, ['a'])).toEqual(blocks);
  });

  it('returns blocks unchanged when recipientIds is empty', () => {
    const blocks = [mkBlock({ id: 'a' })];
    expect(redistributeProportionally(blocks, 300, [])).toEqual(blocks);
  });

  it('distributes proportionally to current plannedSeconds', () => {
    const blocks = [
      mkBlock({ id: 'a', plannedSeconds: 600 }),
      mkBlock({ id: 'b', plannedSeconds: 1200 }),
    ];
    // Free 600s across a+b (1:2 ratio) → a gets 200, b gets 400.
    const next = redistributeProportionally(blocks, 600, ['a', 'b']);
    expect(next.find(b => b.id === 'a')!.plannedSeconds).toBe(800);
    expect(next.find(b => b.id === 'b')!.plannedSeconds).toBe(1600);
  });

  it('preserves the total session seconds exactly (rounding leftover lands on first recipient)', () => {
    // Awkward division: 100s across 3 equal recipients → 33+33+33=99,
    // leftover 1 lands on the first.
    const blocks = [
      mkBlock({ id: 'a', plannedSeconds: 100 }),
      mkBlock({ id: 'b', plannedSeconds: 100 }),
      mkBlock({ id: 'c', plannedSeconds: 100 }),
    ];
    const totalBefore = blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    const next = redistributeProportionally(blocks, 100, ['a', 'b', 'c']);
    const totalAfter = next.reduce((s, b) => s + b.plannedSeconds, 0);
    expect(totalAfter).toBe(totalBefore + 100);
    expect(next.find(b => b.id === 'a')!.plannedSeconds).toBe(134);
    expect(next.find(b => b.id === 'b')!.plannedSeconds).toBe(133);
    expect(next.find(b => b.id === 'c')!.plannedSeconds).toBe(133);
  });

  it('skips non-recipient blocks unchanged', () => {
    const blocks = [
      mkBlock({ id: 'recipient', plannedSeconds: 600 }),
      mkBlock({ id: 'untouched', plannedSeconds: 900 }),
    ];
    const next = redistributeProportionally(blocks, 300, ['recipient']);
    expect(next.find(b => b.id === 'recipient')!.plannedSeconds).toBe(900);
    expect(next.find(b => b.id === 'untouched')!.plannedSeconds).toBe(900);
  });

  it('returns a fresh array (caller can replace state safely)', () => {
    const blocks = [mkBlock({ id: 'a', plannedSeconds: 600 })];
    const next = redistributeProportionally(blocks, 60, ['a']);
    expect(next).not.toBe(blocks);
    expect(next[0]).not.toBe(blocks[0]);
  });

  it('falls back to all-on-first when every recipient is at 0 seconds', () => {
    const blocks = [
      mkBlock({ id: 'a', plannedSeconds: 0 }),
      mkBlock({ id: 'b', plannedSeconds: 0 }),
    ];
    const next = redistributeProportionally(blocks, 300, ['a', 'b']);
    expect(next.find(b => b.id === 'a')!.plannedSeconds).toBe(300);
    expect(next.find(b => b.id === 'b')!.plannedSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------
// recipientIdsForModule + modulesWithRecipients
// ---------------------------------------------------------------------

describe('recipientIdsForModule', () => {
  it('returns non-warm-up ids in a given module', () => {
    const blocks = [
      mkBlock({ id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true }),
      mkBlock({ id: 'sp-walk',   moduleRef: 'shapes-and-patterns' }),
      mkBlock({ id: 'et',        moduleRef: 'ear-training' }),
    ];
    expect(recipientIdsForModule(blocks, 'shapes-and-patterns')).toEqual(['sp-walk']);
  });

  it('returns every non-warm-up id when moduleRef is null (split-evenly case)', () => {
    const blocks = [
      mkBlock({ id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true }),
      mkBlock({ id: 'sp-walk',   moduleRef: 'shapes-and-patterns' }),
      mkBlock({ id: 'et',        moduleRef: 'ear-training' }),
    ];
    expect(recipientIdsForModule(blocks, null)).toEqual(['sp-walk', 'et']);
  });
});

describe('modulesWithRecipients', () => {
  it('returns distinct module refs in first-occurrence order, skipping warm-ups', () => {
    const blocks = [
      mkBlock({ id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true }),
      mkBlock({ id: 'sp-walk',   moduleRef: 'shapes-and-patterns' }),
      mkBlock({ id: 'rep-prep',  moduleRef: 'repertoire', isWarmup: true }),
      mkBlock({ id: 'rep-song',  moduleRef: 'repertoire', isSongPractice: true }),
      mkBlock({ id: 'sp-vl',     moduleRef: 'shapes-and-patterns' }),
    ];
    expect(modulesWithRecipients(blocks)).toEqual([
      'shapes-and-patterns', 'repertoire',
    ]);
  });

  it('returns an empty array when every block is a warm-up', () => {
    const blocks = [
      mkBlock({ id: 'a', isWarmup: true }),
      mkBlock({ id: 'b', isWarmup: true }),
    ];
    expect(modulesWithRecipients(blocks)).toEqual([]);
  });
});
