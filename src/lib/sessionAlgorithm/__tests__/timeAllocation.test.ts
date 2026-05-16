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
  durationTierFor,
  phaseForBlock,
  sequenceBlocks,
  tierForBlock,
} from '../timeAllocation';
import type { WeeklyPace } from '../moduleWeeklyNeed';

function block(
  partial: Partial<AlgorithmBlock> & { id: string; memoryType: MemoryType },
): AlgorithmBlock {
  return {
    moduleRef: partial.moduleRef ?? 'shapes-and-patterns',
    itemRefs: partial.itemRefs ?? ['x'],
    weight: partial.weight ?? 1.0,
    hasAcquiringItems: partial.hasAcquiringItems ?? false,
    isKeyboardRequired: partial.isKeyboardRequired ?? false,
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

  it('no pace data → overflow splits equally regardless of memory type (Phase B Step 6 rule)', () => {
    // Pre-Phase-B this favored integration via OVERFLOW_MEMORY_BIAS
    // (1.5×). The Phase B rule replaces that with: behind-pace
    // modules first; on-pace modules equal split. With no paceByBlock
    // supplied, every block reads as on-pace → equal split, with the
    // last block absorbing the rounding remainder.
    const blocks = [
      block({ id: 'shapes', memoryType: 'procedural', weight: 4 }),
      block({ id: 'repertoire', memoryType: 'integration', weight: 4 }),
    ];
    const out = allocateBlockTime(blocks, 60 * 60)!;
    const shapesExtra = out[0].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const repExtra = out[1].plannedSeconds - MEMORY_TYPE_DURATIONS.integration.typicalHighSeconds;
    // Equal split within the rounding remainder.
    expect(Math.abs(shapesExtra - repExtra)).toBeLessThanOrEqual(1);
  });

  it('behind-pace block claims overflow first (proportional to weight); on-pace block stays at typical-high', () => {
    // Two equal-weight blocks; one is behind pace. Overflow goes
    // entirely to the behind-pace block.
    const blocks = [
      block({ id: 'shapes', memoryType: 'procedural', weight: 4 }),
      block({ id: 'repertoire', memoryType: 'integration', weight: 4 }),
    ];
    const paceByBlock = new Map<string, WeeklyPace>([
      ['shapes', 'on-pace'],
      ['repertoire', 'behind'],
    ]);
    const out = allocateBlockTime(blocks, 60 * 60, undefined, paceByBlock)!;
    const shapesExtra = out[0].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const repExtra = out[1].plannedSeconds - MEMORY_TYPE_DURATIONS.integration.typicalHighSeconds;
    expect(shapesExtra).toBe(0);
    expect(repExtra).toBeGreaterThan(0);
    // Total still equals the requested time.
    expect(out.reduce((s, b) => s + b.plannedSeconds, 0)).toBe(60 * 60);
  });

  it('multiple behind-pace blocks share overflow proportional to block.weight', () => {
    const blocks = [
      block({ id: 'low',  memoryType: 'procedural', weight: 1 }),
      block({ id: 'high', memoryType: 'procedural', weight: 3 }),
      block({ id: 'okay', memoryType: 'integration', weight: 5 }),
    ];
    const paceByBlock = new Map<string, WeeklyPace>([
      ['low',  'behind'],
      ['high', 'behind'],
      ['okay', 'on-pace'],
    ]);
    const out = allocateBlockTime(blocks, 90 * 60, undefined, paceByBlock)!;
    const lowExtra  = out[0].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const highExtra = out[1].plannedSeconds - MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const okayExtra = out[2].plannedSeconds - MEMORY_TYPE_DURATIONS.integration.typicalHighSeconds;
    expect(okayExtra).toBe(0);
    // high (weight 3) gets ~3× what low (weight 1) gets, within
    // rounding + last-recipient remainder absorption.
    expect(highExtra).toBeGreaterThan(lowExtra * 2.5);
    expect(out.reduce((s, b) => s + b.plannedSeconds, 0)).toBe(90 * 60);
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
      { id: 'rev', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes-and-patterns', itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: true, plannedSeconds: 600, phase: 'review' as const },
      { id: 'exp', memoryType: 'expression' as MemoryType, moduleRef: 'just-play', itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: true, plannedSeconds: 600, phase: 'expression' as const },
      { id: 'acq', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals', itemRefs: [], weight: 1, hasAcquiringItems: true, isKeyboardRequired: false, plannedSeconds: 600, phase: 'acquisition' as const },
    ];
    const seq = sequenceBlocks(blocks);
    expect(seq.map(b => b.id)).toEqual(['acq', 'rev', 'exp']);
  });

  it('within phase, higher weight comes first', () => {
    const blocks = [
      { id: 'a', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes', itemRefs: [], weight: 1.0, hasAcquiringItems: false, isKeyboardRequired: true, plannedSeconds: 600, phase: 'review' as const },
      { id: 'b', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals', itemRefs: [], weight: 1.5, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const },
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
    isKeyboardRequired: false,
      plannedSeconds: 600,
      phase: 'review' as const,
    });
    const seq = sequenceBlocks([same('a'), same('b'), same('c')]);
    expect(seq.map(b => b.id)).toEqual(['a', 'b', 'c']);
  });

  it("'full' context: keyboard-required blocks sort before non-keyboard within phase", () => {
    // Same phase, different keyboard requirement. In a 'full' session
    // the keys-side blocks go first, then everything else. Without
    // the context arg (or with any non-'full' context) the existing
    // weight/phase sort applies and the order is unchanged.
    const kbHigh = { id: 'kb-hi', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes-and-patterns', itemRefs: [], weight: 1.0, hasAcquiringItems: false, isKeyboardRequired: true, plannedSeconds: 600, phase: 'review' as const };
    const kbLow  = { id: 'kb-lo', memoryType: 'procedural' as MemoryType, moduleRef: 'repertoire',          itemRefs: [], weight: 0.5, hasAcquiringItems: false, isKeyboardRequired: true, plannedSeconds: 600, phase: 'review' as const };
    const cogHigh = { id: 'cg-hi', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals',         itemRefs: [], weight: 2.0, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const cogLow  = { id: 'cg-lo', memoryType: 'declarative' as MemoryType, moduleRef: 'harmonic-fluency',  itemRefs: [], weight: 0.3, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };

    const fullSeq = sequenceBlocks([cogHigh, kbLow, cogLow, kbHigh], 'full');
    // Keyboard bucket first (sorted by weight inside): kb-hi, kb-lo.
    // Then non-keyboard bucket (sorted by weight inside): cg-hi, cg-lo.
    expect(fullSeq.map(b => b.id)).toEqual(['kb-hi', 'kb-lo', 'cg-hi', 'cg-lo']);

    // Other contexts: pure weight order — cognitive 2.0 wins.
    const keysSeq = sequenceBlocks([cogHigh, kbLow, cogLow, kbHigh], 'keys');
    expect(keysSeq.map(b => b.id)).toEqual(['cg-hi', 'kb-hi', 'kb-lo', 'cg-lo']);

    // No context supplied — same as non-'full' contexts.
    const defaultSeq = sequenceBlocks([cogHigh, kbLow, cogLow, kbHigh]);
    expect(defaultSeq.map(b => b.id)).toEqual(['cg-hi', 'kb-hi', 'kb-lo', 'cg-lo']);
  });

  it("'full' context: keyboard-first preserves phase order within each bucket", () => {
    // Phase wins over keyboard-bucket placement? No — keyboard-bucket
    // wins at the OUTER sort, phase wins within each bucket. So an
    // acquisition non-keyboard block STILL surfaces after a review
    // keyboard block under 'full'.
    const kbReview = { id: 'kb-rev', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes-and-patterns', itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: true,  plannedSeconds: 600, phase: 'review' as const };
    const cogAcq  = { id: 'cg-acq', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals',          itemRefs: [], weight: 1, hasAcquiringItems: true,  isKeyboardRequired: false, plannedSeconds: 600, phase: 'acquisition' as const };
    const seq = sequenceBlocks([cogAcq, kbReview], 'full');
    expect(seq.map(b => b.id)).toEqual(['kb-rev', 'cg-acq']);
  });

  it('non-keyboard contexts enforce NON_KEYBOARD_MODULE_ORDER: mental viz → ET → HF → Production', () => {
    // Mental viz (moduleRef='shapes-and-patterns', isKeyboardRequired=false)
    // surfaces FIRST under the non-keyboard sequencing rule. Then
    // ET in its catalog order (intervals → chord-recognition →
    // chord-progressions ∥ scales-modes). HF and Production tail.
    const mv = { id: 'mv', memoryType: 'procedural' as MemoryType, moduleRef: 'shapes-and-patterns', itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 300, phase: 'review' as const };
    const iv = { id: 'iv', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals',          itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const cr = { id: 'cr', memoryType: 'declarative' as MemoryType, moduleRef: 'chord-recognition', itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const hf = { id: 'hf', memoryType: 'declarative' as MemoryType, moduleRef: 'harmonic-fluency',  itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const pr = { id: 'pr', memoryType: 'integration' as MemoryType, moduleRef: 'production',        itemRefs: [], weight: 1, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    // Insertion order intentionally scrambled.
    const seq = sequenceBlocks([pr, hf, cr, iv, mv], 'laptop');
    expect(seq.map(b => b.id)).toEqual(['mv', 'iv', 'cr', 'hf', 'pr']);
  });

  it('chord-progressions ∥ scales-modes share an index — relative order falls to weight (parallel tracks)', () => {
    // Both at NON_KEYBOARD_MODULE_ORDER index 3 → primary sort ties
    // → falls through to weight DESC. Higher-weight scales-modes
    // surfaces ahead of chord-progressions even though
    // chord-progressions comes first in the spec text.
    const cp = { id: 'cp', memoryType: 'declarative' as MemoryType, moduleRef: 'chord-progressions', itemRefs: [], weight: 1.0, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const sm = { id: 'sm', memoryType: 'declarative' as MemoryType, moduleRef: 'scales-modes',       itemRefs: [], weight: 2.0, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const seq = sequenceBlocks([cp, sm], 'phone');
    expect(seq.map(b => b.id)).toEqual(['sm', 'cp']);
    // Reverse weight: cp wins.
    const cpHigh = { ...cp, weight: 3.0 };
    const seq2 = sequenceBlocks([sm, cpHigh], 'phone');
    expect(seq2.map(b => b.id)).toEqual(['cp', 'sm']);
  });

  it('non-keyboard sequencing does NOT apply in keys-context (existing behavior preserved)', () => {
    // Keys context: NON_KEYBOARD_MODULE_ORDER is irrelevant — only
    // S&P + Repertoire surface there and the phase/weight sort
    // handles them. Verify by passing a (theoretically-impossible)
    // mixed bag and confirming the order matches pure weight DESC.
    const a = { id: 'a', memoryType: 'declarative' as MemoryType, moduleRef: 'intervals',          itemRefs: [], weight: 1.0, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const b = { id: 'b', memoryType: 'declarative' as MemoryType, moduleRef: 'harmonic-fluency',  itemRefs: [], weight: 2.0, hasAcquiringItems: false, isKeyboardRequired: false, plannedSeconds: 600, phase: 'review' as const };
    const seq = sequenceBlocks([a, b], 'keys');
    expect(seq.map(b => b.id)).toEqual(['b', 'a']);
  });
});

describe('phase order constant', () => {
  it('matches the documented sequencing intent', () => {
    expect(PHASE_ORDER.acquisition).toBeLessThan(PHASE_ORDER.review);
    expect(PHASE_ORDER.review).toBeLessThan(PHASE_ORDER.expression);
  });
});

// ---------------------------------------------------------------------
// Phase B — tierForBlock + allocateBlockTime with goal-pace needs
// ---------------------------------------------------------------------

describe('tierForBlock — Phase B goal-pace override', () => {
  it('no Phase B map → falls through to durationTierFor unchanged', () => {
    const b = block({ id: 'a', memoryType: 'declarative' });
    expect(tierForBlock(b)).toEqual(durationTierFor('declarative', b.moduleRef));
    expect(tierForBlock(b, new Map())).toEqual(
      durationTierFor('declarative', b.moduleRef),
    );
  });

  it('block absent from the map → memory-type tier unchanged', () => {
    const b = block({ id: 'a', memoryType: 'procedural' });
    const needs = new Map<string, number>([['some-other-block', 600]]);
    expect(tierForBlock(b, needs)).toEqual(durationTierFor('procedural', b.moduleRef));
  });

  it('Phase B need above the memory-type min → typical band pins to the need', () => {
    // declarative min is 3 min (180 s); a 600 s need sits above it.
    const b = block({ id: 'a', memoryType: 'declarative' });
    const tier = tierForBlock(b, new Map([['a', 600]]));
    expect(tier).toEqual({
      minSeconds: MEMORY_TYPE_DURATIONS.declarative.minSeconds,
      typicalLowSeconds: 600,
      typicalHighSeconds: 600,
    });
  });

  it('Phase B need below the memory-type min → min drops to the need (no inverted tier)', () => {
    // declarative min is 180 s; a 90 s need would otherwise produce
    // min > typical. The min collapses to the need instead.
    const b = block({ id: 'a', memoryType: 'declarative' });
    const tier = tierForBlock(b, new Map([['a', 90]]));
    expect(tier).toEqual({
      minSeconds: 90,
      typicalLowSeconds: 90,
      typicalHighSeconds: 90,
    });
    expect(tier.minSeconds).toBeLessThanOrEqual(tier.typicalLowSeconds);
  });

  it('zero / negative need is ignored → memory-type tier unchanged', () => {
    const b = block({ id: 'a', memoryType: 'procedural' });
    expect(tierForBlock(b, new Map([['a', 0]]))).toEqual(
      durationTierFor('procedural', b.moduleRef),
    );
    expect(tierForBlock(b, new Map([['a', -5]]))).toEqual(
      durationTierFor('procedural', b.moduleRef),
    );
  });
});

describe('allocateBlockTime — Phase B blockTimeNeeds', () => {
  it('a Phase B block lands at its goal-pace need; a non-Phase-B block keeps its tier', () => {
    const phaseB = block({ id: 'hf', memoryType: 'declarative' });
    const legacy = block({ id: 'sp', memoryType: 'procedural' });
    // Phase B need 600 s for hf. Total available = 600 + procedural
    // typical-high so the legacy block lands exactly at its own
    // typical-high and the math is unambiguous.
    const available = 600 + MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const out = allocateBlockTime(
      [phaseB, legacy],
      available,
      new Map([['hf', 600]]),
    );
    expect(out).not.toBeNull();
    const byId = new Map(out!.map(b => [b.id, b.plannedSeconds]));
    expect(byId.get('hf')).toBe(600);
    expect(byId.get('sp')).toBe(MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds);
  });

  it('omitting blockTimeNeeds preserves the legacy allocation exactly', () => {
    const blocks = [
      block({ id: 'a', memoryType: 'declarative' }),
      block({ id: 'b', memoryType: 'procedural' }),
    ];
    const available =
      MEMORY_TYPE_DURATIONS.declarative.typicalHighSeconds +
      MEMORY_TYPE_DURATIONS.procedural.typicalHighSeconds;
    const withoutMap = allocateBlockTime(blocks, available);
    const withEmptyMap = allocateBlockTime(blocks, available, new Map());
    expect(withEmptyMap).toEqual(withoutMap);
  });
});

describe('allocateBlockTime — graduated S&P/Repertoire split', () => {
  // Per SESSION_DESIGN.md table: < 45 min → 25/75; 45–59 → 35/65;
  // 60+ → 40/60. The rebalance applies to the COMBINED S&P +
  // Repertoire allocation; other modules (or single-module sessions)
  // pass through unchanged.

  function sp(): AlgorithmBlock {
    return block({
      id: 'sp',
      memoryType: 'procedural',
      moduleRef: 'shapes-and-patterns',
      weight: 1,
      isKeyboardRequired: true,
    });
  }
  function rep(): AlgorithmBlock {
    return block({
      id: 'rep',
      memoryType: 'integration',
      moduleRef: 'repertoire',
      weight: 1,
      isKeyboardRequired: true,
    });
  }

  it('29-min session: 25 / 75 split', () => {
    const out = allocateBlockTime([sp(), rep()], 29 * 60)!;
    const spBlk = out.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = out.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.25));
    expect(repBlk.plannedSeconds).toBe(combined - Math.round(combined * 0.25));
  });

  it('45-min session: 35 / 65 split', () => {
    const out = allocateBlockTime([sp(), rep()], 45 * 60)!;
    const spBlk = out.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = out.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.35));
    expect(repBlk.plannedSeconds).toBe(combined - Math.round(combined * 0.35));
  });

  it('90-min session: 40 / 60 split', () => {
    const out = allocateBlockTime([sp(), rep()], 90 * 60)!;
    const spBlk = out.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = out.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.40));
    expect(repBlk.plannedSeconds).toBe(combined - Math.round(combined * 0.40));
  });

  it('does not rebalance when only one of S&P / Repertoire is present', () => {
    const out = allocateBlockTime([sp()], 60 * 60)!;
    // Single block — gets the full allocation, no S&P/Rep split
    // logic applies.
    expect(out).toHaveLength(1);
    expect(out[0].plannedSeconds).toBeGreaterThan(0);
  });

  it('leaves other modules (HF / ET) untouched when rebalancing S&P + Rep', () => {
    const hf = block({
      id: 'hf',
      memoryType: 'declarative',
      moduleRef: 'harmonic-fluency',
      weight: 1,
      isKeyboardRequired: false,
    });
    const out = allocateBlockTime([sp(), rep(), hf], 60 * 60)!;
    const hfBlk = out.find(b => b.moduleRef === 'harmonic-fluency')!;
    const spBlk = out.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = out.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    // HF allocation comes from the standard allocator — defer to
    // whatever it picked; just assert it's positive and the S&P+Rep
    // pair honored the 40/60 split of THEIR combined seconds.
    expect(hfBlk.plannedSeconds).toBeGreaterThan(0);
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.40));
  });

  it('Phase B goal-pace need does NOT override the graduated split', () => {
    // The graduated split is a hard structural constraint per
    // SESSION_DESIGN.md — S&P backlog catches up across multiple
    // sessions, not by overriding within-session structure. Phase B
    // can shape the allocator's initial distribution, but the
    // rebalance still re-divides the COMBINED S&P+Rep seconds at
    // the 40/60 (60-min) ratio.
    const needs = new Map<string, number>([['sp', 600]]);
    const out = allocateBlockTime([sp(), rep()], 60 * 60, needs)!;
    const spBlk = out.find(b => b.moduleRef === 'shapes-and-patterns')!;
    const repBlk = out.find(b => b.moduleRef === 'repertoire')!;
    const combined = spBlk.plannedSeconds + repBlk.plannedSeconds;
    expect(spBlk.plannedSeconds).toBe(Math.round(combined * 0.40));
    expect(repBlk.plannedSeconds).toBe(combined - Math.round(combined * 0.40));
  });
});
