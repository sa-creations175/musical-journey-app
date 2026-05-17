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
  BALANCED_MAX_BLOCKS_FULL,
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
    isKeyboardRequired: moduleRef === 'shapes-and-patterns' || moduleRef === 'repertoire',
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

  it('full context widens the cap to BALANCED_MAX_BLOCKS_FULL so non-keyboard modules survive', () => {
    // 8 distinct modules — keys cap (5) would drop 3, full cap (8) keeps all.
    const blocks: AlgorithmBlock[] = [
      blk('sp',   'shapes-and-patterns', 'procedural', 3.0),
      blk('rep',  'repertoire',          'integration', 2.8),
      blk('hf',   'harmonic-fluency',    'declarative', 1.2),
      blk('iv',   'intervals',           'declarative', 1.0),
      blk('cr',   'chord-recognition',   'declarative', 1.0),
      blk('cp',   'chord-progressions',  'declarative', 1.6),
      blk('sm',   'scales-modes',        'declarative', 1.0),
      blk('prod', 'production',          'integration', 1.5),
    ];
    const keysCap = buildBalancedProposal(blocks, 90 * MIN)!;
    expect(keysCap.blocks).toHaveLength(BALANCED_MAX_BLOCKS); // 5

    const fullCap = buildBalancedProposal(blocks, 90 * MIN, undefined, undefined, 'full')!;
    expect(fullCap.blocks).toHaveLength(BALANCED_MAX_BLOCKS_FULL); // 8
    // Every distinct module surfaces on full — no NK modules dropped.
    expect(new Set(fullCap.blocks.map(b => b.moduleRef)).size).toBe(8);
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
  it('always returns a single balanced proposal — focused is retired in favor of the intent picker', () => {
    const blocks: AlgorithmBlock[] = [
      blk('a', 'shapes-and-patterns', 'procedural', 3.0),
      blk('b', 'intervals', 'declarative', 2.0),
      blk('c', 'harmonic-fluency', 'declarative', 1.5),
    ];
    const ps = generateProposals({ blocks, availableSeconds: 60 * MIN });
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('balanced');
  });

  it('single-candidate session also returns one proposal', () => {
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

describe('generateProposals — graduated S&P/Repertoire split', () => {
  // SESSION_DESIGN.md table: < 45 min → 25/75; 45–59 → 35/65; 60+ → 40/60.
  // The split is a session-wide hard constraint and runs on BOTH
  // balanced and focused proposals — the proposal-layer wrapper
  // delegates to applyGraduatedSPRepSplit when both blocks are
  // present and injects Rep when the focused proposal dropped it.

  function sp(id = 'sp', weight = 1): AlgorithmBlock {
    return blk(id, 'shapes-and-patterns', 'procedural', weight);
  }
  function rep(id = 'rep', weight = 1): AlgorithmBlock {
    return blk(id, 'repertoire', 'integration', weight);
  }

  it('balanced proposal: 60-min keys session lands at the 40/60 split', () => {
    const ps = generateProposals({
      blocks: [sp(), rep()],
      availableSeconds: 60 * MIN,
    });
    const balanced = ps.find(p => p.kind === 'balanced')!;
    const spBlk = balanced.blocks.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = balanced.blocks.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.40));
    expect(repBlk.plannedSeconds).toBe(combined - Math.round(combined * 0.40));
  });

  it('balanced proposal: 45-min lands at 35/65', () => {
    const ps = generateProposals({
      blocks: [sp(), rep()],
      availableSeconds: 45 * MIN,
    });
    const balanced = ps.find(p => p.kind === 'balanced')!;
    const spBlk = balanced.blocks.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = balanced.blocks.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.35));
  });

  it('balanced proposal: < 45 min lands at 25/75', () => {
    const ps = generateProposals({
      blocks: [sp(), rep()],
      availableSeconds: 30 * MIN,
    });
    const balanced = ps.find(p => p.kind === 'balanced')!;
    const spBlk = balanced.blocks.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = balanced.blocks.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.25));
  });

  // Focused-proposal split assertions retired alongside the focused
  // proposal itself — see the generateProposals doc-comment in
  // proposal.ts. The buildFocusedProposal helper still has unit
  // coverage above for callers that invoke it directly (tests only).

  it('single-block: S&P-only session with no Repertoire candidate gets full time on S&P', () => {
    const ps = generateProposals({
      blocks: [sp()],
      availableSeconds: 60 * MIN,
    });
    // No Rep in the pool — nothing to inject; S&P keeps full
    // allocation rather than getting silently capped at 40 %.
    expect(ps).toHaveLength(1);
    expect(ps[0].blocks).toHaveLength(1);
    expect(ps[0].blocks[0].plannedSeconds).toBe(60 * MIN);
  });

  it('leaves other modules (HF / ET) untouched when rebalancing S&P + Rep', () => {
    const ps = generateProposals({
      blocks: [
        sp(),
        rep(),
        blk('hf', 'harmonic-fluency', 'declarative', 1),
      ],
      availableSeconds: 60 * MIN,
    });
    const balanced = ps.find(p => p.kind === 'balanced')!;
    const spBlk = balanced.blocks.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = balanced.blocks.find(b => b.moduleRef === 'repertoire')!;
    const hfBlk = balanced.blocks.find(b => b.moduleRef === 'harmonic-fluency')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(hfBlk.plannedSeconds).toBeGreaterThan(0);
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.40));
  });

  it('Phase B goal-pace need does NOT override the graduated split', () => {
    const needs = new Map<string, number>([['sp', 600]]);
    const ps = generateProposals({
      blocks: [sp(), rep()],
      availableSeconds: 60 * MIN,
      blockTimeNeeds: needs,
    });
    const balanced = ps.find(p => p.kind === 'balanced')!;
    const spBlk = balanced.blocks.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = balanced.blocks.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.40));
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
