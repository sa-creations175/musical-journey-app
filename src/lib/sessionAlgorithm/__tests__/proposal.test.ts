// @vitest-environment jsdom
/**
 * Phase 3 Step 2f — proposal generator contract tests.
 */
import { describe, expect, it } from 'vitest';
import type { MemoryType } from '../../db';
import {
  blockHasAcquiringItems,
  buildBalancedProposal,
  buildFocusedProposal,
  generateProposals,
  BALANCED_MAX_BLOCKS,
} from '../proposal';
import type { AlgorithmBlock } from '../timeAllocation';

const MIN = 60;

function blk(
  id: string,
  moduleRef: string,
  memoryType: MemoryType,
  weight: number,
  hasAcquiringItems = false,
): AlgorithmBlock {
  return {
    id,
    moduleRef,
    memoryType,
    itemRefs: [`item-${id}`],
    weight,
    hasAcquiringItems,
  };
}

describe('buildBalancedProposal', () => {
  it('takes up to 5 blocks from distinct modules in weight order', () => {
    const blocks: AlgorithmBlock[] = [
      blk('a', 'shapes-and-patterns', 'procedural', 3.0),
      blk('b', 'shapes-and-patterns', 'procedural', 2.5), // skipped — same module as a
      blk('c', 'intervals', 'declarative', 2.0),
      blk('d', 'harmonic-fluency', 'declarative', 1.5),
      blk('e', 'production', 'integration', 1.0),
      blk('f', 'repertoire', 'integration', 0.9),
      blk('g', 'just-play', 'expression', 0.5), // 6th distinct — outside cap
    ];
    const p = buildBalancedProposal(blocks, 90 * MIN)!;
    expect(p.kind).toBe('balanced');
    expect(p.blocks).toHaveLength(BALANCED_MAX_BLOCKS);
    expect(p.blocks.map(b => b.id).sort()).toEqual(['a', 'c', 'd', 'e', 'f']);
  });

  it('picks fewer than 5 when input has fewer distinct modules', () => {
    const blocks: AlgorithmBlock[] = [
      blk('a', 'intervals', 'declarative', 2.0),
      blk('b', 'intervals', 'declarative', 1.5),
      blk('c', 'shapes-and-patterns', 'procedural', 1.0),
    ];
    const p = buildBalancedProposal(blocks, 60 * MIN)!;
    expect(p.blocks.map(b => b.id).sort()).toEqual(['a', 'c']);
  });

  it('returns null when no blocks can fit', () => {
    const blocks: AlgorithmBlock[] = [blk('a', 'repertoire', 'integration', 1.0)];
    expect(buildBalancedProposal(blocks, 30)).toBeNull();
  });

  it('sequences blocks acquisition → review → expression', () => {
    const blocks: AlgorithmBlock[] = [
      blk('rev', 'shapes-and-patterns', 'procedural', 1.0, false),
      blk('exp', 'just-play', 'expression', 1.5, false),
      blk('acq', 'intervals', 'declarative', 0.8, true),
    ];
    const p = buildBalancedProposal(blocks, 60 * MIN)!;
    expect(p.blocks.map(b => b.id)).toEqual(['acq', 'rev', 'exp']);
  });
});

describe('buildFocusedProposal', () => {
  it('takes the top-weight block alone when no same-module pair exists', () => {
    const blocks: AlgorithmBlock[] = [
      blk('top', 'shapes-and-patterns', 'procedural', 3.0),
      blk('a', 'intervals', 'declarative', 2.0),
    ];
    const p = buildFocusedProposal(blocks, 60 * MIN)!;
    expect(p.kind).toBe('focused');
    expect(p.blocks.map(b => b.id)).toEqual(['top']);
    expect(p.blocks[0].plannedSeconds).toBe(60 * MIN);
  });

  it('pairs with the next same-module block for true depth', () => {
    const blocks: AlgorithmBlock[] = [
      blk('top', 'shapes-and-patterns', 'procedural', 3.0),
      blk('pair', 'shapes-and-patterns', 'procedural', 2.5),
      blk('off', 'intervals', 'declarative', 2.0),
    ];
    const p = buildFocusedProposal(blocks, 60 * MIN)!;
    expect(p.blocks.map(b => b.id).sort()).toEqual(['pair', 'top']);
    const total = p.blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    expect(total).toBeCloseTo(60 * MIN, -1);
  });

  it('extends past typical-high — depth is the point', () => {
    const blocks: AlgorithmBlock[] = [
      blk('top', 'shapes-and-patterns', 'procedural', 3.0),
    ];
    const p = buildFocusedProposal(blocks, 90 * MIN)!;
    // Procedural typical-high is 15 min — focused gives the block all 90.
    expect(p.blocks[0].plannedSeconds).toBe(90 * MIN);
  });

  it('uses the module display label in the title', () => {
    const blocks: AlgorithmBlock[] = [
      blk('top', 'shapes-and-patterns', 'procedural', 3.0),
    ];
    const p = buildFocusedProposal(blocks, 60 * MIN)!;
    expect(p.title.toLowerCase()).toContain('shapes');
  });

  it('returns null on zero or negative time', () => {
    expect(buildFocusedProposal([blk('a', 'intervals', 'declarative', 1)], 0)).toBeNull();
    expect(buildFocusedProposal([blk('a', 'intervals', 'declarative', 1)], -10)).toBeNull();
  });

  it('returns null when even the minimum does not fit', () => {
    const blocks: AlgorithmBlock[] = [blk('a', 'repertoire', 'integration', 1)];
    expect(buildFocusedProposal(blocks, 30)).toBeNull();
  });
});

describe('generateProposals', () => {
  it('returns both when there is genuine breadth-vs-depth tension', () => {
    const blocks: AlgorithmBlock[] = [
      blk('a', 'shapes-and-patterns', 'procedural', 3.0),
      blk('b', 'intervals', 'declarative', 2.0),
      blk('c', 'harmonic-fluency', 'declarative', 1.5),
    ];
    const ps = generateProposals({ blocks, availableSeconds: 60 * MIN });
    expect(ps).toHaveLength(2);
    expect(ps[0].kind).toBe('balanced');
    expect(ps[1].kind).toBe('focused');
  });

  it('collapses to one proposal when balanced and focused are identical', () => {
    const blocks: AlgorithmBlock[] = [
      blk('only', 'shapes-and-patterns', 'procedural', 3.0),
    ];
    const ps = generateProposals({ blocks, availableSeconds: 30 * MIN });
    expect(ps).toHaveLength(1);
  });

  it('returns an empty list when no block fits at all', () => {
    const blocks: AlgorithmBlock[] = [blk('a', 'repertoire', 'integration', 1)];
    const ps = generateProposals({ blocks, availableSeconds: 30 });
    expect(ps).toEqual([]);
  });
});

describe('blockHasAcquiringItems', () => {
  it('true when any item is in the acquiring set', () => {
    expect(blockHasAcquiringItems(['a', 'b', 'c'], new Set(['b']))).toBe(true);
  });
  it('false otherwise', () => {
    expect(blockHasAcquiringItems(['a', 'b'], new Set(['x']))).toBe(false);
    expect(blockHasAcquiringItems([], new Set(['a']))).toBe(false);
  });
});
