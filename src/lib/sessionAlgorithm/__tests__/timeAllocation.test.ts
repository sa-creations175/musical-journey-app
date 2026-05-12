// @vitest-environment jsdom
/**
 * Phase 3 Step 2e — time allocation + block sequencing tests.
 */
import { describe, expect, it } from 'vitest';
import type { MemoryType } from '../../db';
import {
  MEMORY_TYPE_DURATIONS,
  PHASE_ORDER,
  type AlgorithmBlock,
  allocateBlockTime,
  phaseForBlock,
  sequenceBlocks,
} from '../timeAllocation';

function block(
  partial: Partial<AlgorithmBlock> & { id: string; memoryType: MemoryType },
): AlgorithmBlock {
  return {
    moduleRef: partial.moduleRef ?? 'shapes-and-patterns',
    itemRefs: partial.itemRefs ?? ['x'],
    weight: partial.weight ?? 1.0,
    hasAcquiringItems: partial.hasAcquiringItems ?? false,
    ...partial,
  };
}

describe('phaseForBlock', () => {
  it('expression always maps to expression', () => {
    expect(phaseForBlock(block({ id: '1', memoryType: 'expression', hasAcquiringItems: true })))
      .toBe('expression');
  });

  it('acquiring items override review', () => {
    expect(phaseForBlock(block({ id: '1', memoryType: 'procedural', hasAcquiringItems: true })))
      .toBe('acquisition');
    expect(phaseForBlock(block({ id: '2', memoryType: 'procedural', hasAcquiringItems: false })))
      .toBe('review');
  });

  it('declarative review', () => {
    expect(phaseForBlock(block({ id: '1', memoryType: 'declarative', hasAcquiringItems: false })))
      .toBe('review');
  });
});

describe('allocateBlockTime — happy paths', () => {
  it('exact typical-high total → each block gets typical-high', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative' }),
      block({ id: 'b', memoryType: 'procedural' }),
    ];
    const totalHigh =
      MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds +
      MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const out = allocateBlockTime(blocks, totalHigh);
    expect(out).toHaveLength(2);
    expect(out![0].plannedSeconds).toBe(MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds);
    expect(out![1].plannedSeconds).toBe(MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds);
  });

  it('exact typical-low total → each block at typical-low', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative' }),
      block({ id: 'b', memoryType: 'integration' }),
    ];
    const total =
      MEMORY_TYPE_DURATIONS.declarative.typicalLowSeconds +
      MEMORY_TYPE_DURATIONS.integration.typicalLowSeconds;
    const out = allocateBlockTime(blocks, total)!;
    expect(out[0].plannedSeconds).toBe(MEMORY_TYPE_DURATIONS.declarative.typicalLowSeconds);
    expect(out[1].plannedSeconds).toBe(MEMORY_TYPE_DURATIONS.integration.typicalLowSeconds);
  });

  it('between typical-low and typical-high → interpolated', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative' }),
      block({ id: 'b', memoryType: 'procedural' }),
    ];
    const lowTotal =
      MEMORY_TYPE_DURATIONS.declarative.typicalLowSeconds +
      MEMORY_TYPE_DURATIONS.procedural.typicalLowSeconds;
    const highTotal =
      MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds +
      MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const target = (lowTotal + highTotal) / 2;
    const out = allocateBlockTime(blocks, target)!;
    // Each block falls roughly halfway between its low and high.
    const declMid = (MEMORY_TYPE_DURATIONS.declarative.typicalLowSeconds + MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds) / 2;
    const procMid = (MEMORY_TYPE_DURATIONS.procedural.typicalLowSeconds + MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds) / 2;
    expect(out[0].plannedSeconds).toBe(Math.round(declMid));
    expect(out[1].plannedSeconds).toBe(Math.round(procMid));
  });
});

describe('allocateBlockTime — overflow (available > typicalHighTotal)', () => {
  it('60-min Keys session (Shapes + Repertoire) fills the full requested time', () => {
    // The original "No Weapon" report: Keys hard filter restricts to
    // Shapes + Repertoire (procedural 15 high + integration 20 high =
    // 35 min typical-high total). User asks for 60. Before the fix
    // this returned 35 and silently dropped 25; now it returns 60.
    const blocks = [
      block({ id: 'shapes', memoryType: 'procedural', weight: 5 }),
      block({ id: 'repertoire', memoryType: 'integration', weight: 5 }),
    ];
    const out = allocateBlockTime(blocks, 60 * 60)!;
    const sum = out.reduce((s, b) => s + b.plannedSeconds, 0);
    expect(sum).toBe(60 * 60);
    // Each block stays at or above its typical-high.
    expect(out[0].plannedSeconds).toBeGreaterThanOrEqual(
      MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds,
    );
    expect(out[1].plannedSeconds).toBeGreaterThanOrEqual(
      MEMORY_TYPE_DURATIONS.integration.typicalHighSeconds,
    );
  });

  it('integration memory type gets a larger overflow share at equal block weight', () => {
    // Two equal-weight blocks: procedural (Shapes) vs integration
    // (Repertoire). With integration's 1.5x bias vs procedural's
    // 1.0x, the overflow split should be 60/40 in favor of
    // Repertoire — matches the design rationale that long Keys
    // sessions want more song playthroughs, not more drill reps.
    const blocks = [
      block({ id: 'shapes', memoryType: 'procedural', weight: 4 }),
      block({ id: 'repertoire', memoryType: 'integration', weight: 4 }),
    ];
    const out = allocateBlockTime(blocks, 60 * 60)!;
    const shapesExtra = out[0].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const repExtra = out[1].plannedSeconds - MEMORY_TYPE_DURATIONS.integration.typicalHighSeconds;
    expect(repExtra).toBeGreaterThan(shapesExtra);
    // Ratio of extras matches the bias ratio (approximate due to
    // rounding + last-block remainder absorption).
    expect(repExtra / shapesExtra).toBeGreaterThan(1.3);
    expect(repExtra / shapesExtra).toBeLessThan(1.7);
  });

  it('block.weight dominates when both blocks share the same memory type', () => {
    // Same memory type cancels the bias multiplier — block.weight
    // alone drives the split.
    const blocks = [
      block({ id: 'low', memoryType: 'procedural', weight: 1 }),
      block({ id: 'high', memoryType: 'procedural', weight: 3 }),
    ];
    const out = allocateBlockTime(blocks, 60 * 60)!;
    const lowExtra = out[0].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const highExtra = out[1].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    expect(highExtra).toBeGreaterThan(lowExtra * 2.5);
  });

  it('sum equals available exactly even with rounding (last block absorbs remainder)', () => {
    // Pick a session length that doesn't divide evenly to make the
    // last-block-remainder branch fire.
    const blocks = [
      block({ id: 'a', memoryType: 'declarative', weight: 7 }),
      block({ id: 'b', memoryType: 'procedural', weight: 11 }),
      block({ id: 'c', memoryType: 'integration', weight: 13 }),
    ];
    for (const target of [3601, 3617, 4711, 5023]) {
      const out = allocateBlockTime(blocks, target)!;
      const sum = out.reduce((s, b) => s + b.plannedSeconds, 0);
      expect(sum).toBe(target);
    }
  });

  it('falls back to even split when every block has zero weight', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative', weight: 0 }),
      block({ id: 'b', memoryType: 'procedural', weight: 0 }),
    ];
    const typicalHighTotal =
      MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds +
      MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const overflow = 1200;
    const out = allocateBlockTime(blocks, typicalHighTotal + overflow)!;
    const sum = out.reduce((s, b) => s + b.plannedSeconds, 0);
    expect(sum).toBe(typicalHighTotal + overflow);
    // Even split — within rounding of half each.
    const a = out[0].plannedSeconds - MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds;
    const b = out[1].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });
});

describe('allocateBlockTime — squeeze + drop', () => {
  it('squeezes between min and typical-low when time is tight', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative' }),
      block({ id: 'b', memoryType: 'procedural' }),
    ];
    const minTotal =
      MEMORY_TYPE_DURATIONS.declarative.minSeconds +
      MEMORY_TYPE_DURATIONS.procedural.minSeconds;
    const out = allocateBlockTime(blocks, minTotal + 60)!;
    expect(out[0].plannedSeconds).toBeGreaterThanOrEqual(MEMORY_TYPE_DURATIONS.declarative.minSeconds);
    expect(out[1].plannedSeconds).toBeGreaterThanOrEqual(MEMORY_TYPE_DURATIONS.procedural.minSeconds);
  });

  it('drops the lowest-weight block when even minimums do not fit', () => {
    const blocks = [
      block({ id: 'big', memoryType: 'integration', weight: 2.0 }),
      block({ id: 'small', memoryType: 'declarative', weight: 0.5 }),
    ];
    // Available = exactly integration's min (10 min). Declarative
    // (3 min) won't fit alongside; small block gets dropped.
    const out = allocateBlockTime(blocks, MEMORY_TYPE_DURATIONS.integration.minSeconds)!;
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('big');
  });

  it('returns null when no block fits even at min', () => {
    const blocks = [block({ id: 'a', memoryType: 'integration' })];
    const out = allocateBlockTime(blocks, 60); // 60 seconds, integration min is 600.
    expect(out).toBeNull();
  });

  it('returns null on zero / negative time', () => {
    expect(allocateBlockTime([block({ id: 'a', memoryType: 'declarative' })], 0)).toBeNull();
    expect(allocateBlockTime([block({ id: 'a', memoryType: 'declarative' })], -10)).toBeNull();
  });
});

describe('sequenceBlocks', () => {
  it('orders acquisition → review → expression', () => {
    const blocks = [
      { id: 'rev', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes-and-patterns', itemRefs: [], weight: 1, hasAcquiringItems: false, plannedSeconds: 600, phase: 'review' as const },
      { id: 'exp', memoryType: 'expression' as MemoryType, moduleRef: 'just-play', itemRefs: [], weight: 1, hasAcquiringItems: false, plannedSeconds: 600, phase: 'expression' as const },
      { id: 'acq', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals', itemRefs: [], weight: 1, hasAcquiringItems: true, plannedSeconds: 600, phase: 'acquisition' as const },
    ];
    const seq = sequenceBlocks(blocks);
    expect(seq.map(b => b.id)).toEqual(['acq', 'rev', 'exp']);
  });

  it('within phase, higher weight comes first', () => {
    const blocks = [
      { id: 'a', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes', itemRefs: [], weight: 1.0, hasAcquiringItems: false, plannedSeconds: 600, phase: 'review' as const },
      { id: 'b', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals', itemRefs: [], weight: 1.5, hasAcquiringItems: false, plannedSeconds: 600, phase: 'review' as const },
    ];
    const seq = sequenceBlocks(blocks);
    expect(seq.map(b => b.id)).toEqual(['b', 'a']);
  });

  it('stable within identical phase + weight', () => {
    const same = (id: string) => ({
      id,
      memoryType: 'procedural' as MemoryType,
      moduleRef: 'shapes',
      itemRefs: [],
      weight: 1.0,
      hasAcquiringItems: false,
      plannedSeconds: 600,
      phase: 'review' as const,
    });
    const seq = sequenceBlocks([same('a'), same('b'), same('c')]);
    expect(seq.map(b => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('phase order constant', () => {
  it('matches the documented sequencing intent', () => {
    expect(PHASE_ORDER.acquisition).toBeLessThan(PHASE_ORDER.review);
    expect(PHASE_ORDER.review).toBeLessThan(PHASE_ORDER.expression);
  });
});
