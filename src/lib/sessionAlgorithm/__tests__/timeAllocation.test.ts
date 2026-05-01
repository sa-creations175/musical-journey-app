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
  it('plenty of time → each block gets typical-high', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative' }),
      block({ id: 'b', memoryType: 'procedural' }),
    ];
    const totalHigh =
      MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds +
      MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const out = allocateBlockTime(blocks, totalHigh + 600);
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
