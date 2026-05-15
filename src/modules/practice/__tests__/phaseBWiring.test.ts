// @vitest-environment jsdom
/**
 * Phase B Step 6 — wiring helpers + allocator integration.
 *
 * Pure / fixture-driven. Pins the contract the session generator
 * actually relies on:
 *
 *   buildBlockBudgetsFromWeeklyNeeds — translates keystone needs
 *     into per-block time budgets + paceByBlock + the
 *     Phase-B-active module set.
 *   neutralizePhaseBPaceFactors      — drops weeklyPace boosts for
 *     modules Phase B is already budgeting time for.
 *   phaseBModulesFromNeeds           — set of modules with a live
 *     Phase B budget (any need with estimatedMinutesNeeded > 0).
 *
 * Plus two end-to-end allocator assertions threading those helpers
 * through `allocateBlockTime`: Phase B's per-module minutes replace
 * the memory-type tier, and Phase B's total proportionally scales
 * down when it exceeds available session time.
 */
import { describe, expect, it } from 'vitest';
import {
  buildBlockBudgetsFromWeeklyNeeds,
  neutralizePhaseBPaceFactors,
} from '../sessionGenerator';
import {
  phaseBModulesFromNeeds,
  type ModuleWeeklyNeed,
} from '../../../lib/sessionAlgorithm/moduleWeeklyNeed';
import {
  allocateBlockTime,
  MEMORY_TYPE_DURATIONS,
  type AlgorithmBlock,
} from '../../../lib/sessionAlgorithm/timeAllocation';

function block(
  id: string,
  moduleRef: string,
  partial: Partial<AlgorithmBlock> = {},
): AlgorithmBlock {
  return {
    id,
    moduleRef,
    memoryType: partial.memoryType ?? 'declarative',
    itemRefs: partial.itemRefs ?? ['x'],
    weight: partial.weight ?? 1,
    hasAcquiringItems: partial.hasAcquiringItems ?? false,
  };
}

function need(partial: Partial<ModuleWeeklyNeed> & {
  moduleId: ModuleWeeklyNeed['moduleId'];
}): ModuleWeeklyNeed {
  return {
    targetAttemptsThisWeek: 100,
    completedAttemptsThisWeek: 0,
    remainingAttempts: 100,
    estimatedMinutesNeeded: 30,
    pace: 'on-pace',
    ...partial,
  };
}

// =====================================================================
// buildBlockBudgetsFromWeeklyNeeds
// =====================================================================

describe('buildBlockBudgetsFromWeeklyNeeds', () => {
  it('maps a single-block module straight through (minutes → seconds)', () => {
    const blocks = [block('hf-1', 'harmonic-fluency')];
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 10, pace: 'on-pace' }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(10 * 60); // 600 s
    expect(out.paceByBlock.get('hf-1')).toBe('on-pace');
    expect(out.phaseBModules.has('harmonic-fluency')).toBe(true);
  });

  it('splits a module need evenly across its blocks (ET sub-modules)', () => {
    const blocks = [
      block('et-int', 'intervals'),
      block('et-cr',  'chord-recognition'),
      block('et-cp',  'chord-progressions'),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'ear-training', estimatedMinutesNeeded: 15 }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // 15 min = 900 s ÷ 3 blocks = 300 s each
    expect(out.blockTimeNeeds.get('et-int')).toBe(300);
    expect(out.blockTimeNeeds.get('et-cr')).toBe(300);
    expect(out.blockTimeNeeds.get('et-cp')).toBe(300);
    expect(out.phaseBModules.has('ear-training')).toBe(true);
  });

  it('module without an active goal is absent from all three maps', () => {
    const blocks = [
      block('hf-1', 'harmonic-fluency'),
      block('rep-1', 'repertoire'),
    ];
    const needs: ModuleWeeklyNeed[] = [
      // Only HF has a Phase B budget; Repertoire goalless.
      need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 10, pace: 'behind' }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    expect(out.blockTimeNeeds.has('hf-1')).toBe(true);
    expect(out.blockTimeNeeds.has('rep-1')).toBe(false);
    expect(out.paceByBlock.has('hf-1')).toBe(true);
    expect(out.paceByBlock.has('rep-1')).toBe(false);
    expect(out.phaseBModules.has('harmonic-fluency')).toBe(true);
    expect(out.phaseBModules.has('repertoire')).toBe(false);
  });

  it('over-completed module (estimatedMinutesNeeded === 0) is absent from all three maps', () => {
    const blocks = [block('hf-1', 'harmonic-fluency')];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    expect(out.blockTimeNeeds.size).toBe(0);
    expect(out.paceByBlock.size).toBe(0);
    expect(out.phaseBModules.size).toBe(0);
  });

  it('threads the module pace onto every block of that module', () => {
    const blocks = [
      block('et-int', 'intervals'),
      block('et-cr',  'chord-recognition'),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'ear-training', estimatedMinutesNeeded: 20, pace: 'behind' }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    expect(out.paceByBlock.get('et-int')).toBe('behind');
    expect(out.paceByBlock.get('et-cr')).toBe('behind');
  });
});

// =====================================================================
// phaseBModulesFromNeeds
// =====================================================================

describe('phaseBModulesFromNeeds', () => {
  it('returns modules with estimatedMinutesNeeded > 0', () => {
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 10 }),
      need({ moduleId: 'ear-training',     estimatedMinutesNeeded: 0  }),
      need({ moduleId: 'production',       estimatedMinutesNeeded: 5  }),
    ];
    const out = phaseBModulesFromNeeds(needs);
    expect(out).toEqual(new Set(['harmonic-fluency', 'production']));
  });

  it('empty input → empty set', () => {
    expect(phaseBModulesFromNeeds([])).toEqual(new Set());
  });
});

// =====================================================================
// neutralizePhaseBPaceFactors
// =====================================================================

describe('neutralizePhaseBPaceFactors', () => {
  it('drops Phase-B-active modules — absent keys default to 1.0 at the consumer', () => {
    const factors = new Map<string, number>([
      ['harmonic-fluency', 1.2],
      ['ear-training',     1.1],
      ['repertoire',       1.3],
    ]);
    const phaseB = new Set(['harmonic-fluency', 'ear-training'] as const);
    const out = neutralizePhaseBPaceFactors(factors, phaseB);
    expect(out.has('harmonic-fluency')).toBe(false);
    expect(out.has('ear-training')).toBe(false);
    expect(out.get('repertoire')).toBe(1.3);
  });

  it('empty Phase B set → factors pass through unchanged', () => {
    const factors = new Map<string, number>([['harmonic-fluency', 1.2]]);
    const out = neutralizePhaseBPaceFactors(factors, new Set());
    expect(out.get('harmonic-fluency')).toBe(1.2);
  });
});

// =====================================================================
// Allocator integration — Phase B budgets actually drive plannedSeconds
// =====================================================================

describe('allocator with Phase B budgets', () => {
  it('module with active goal uses Phase B time budget, not the memory-type tier', () => {
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 12, pace: 'on-pace' }),
    ];
    const { blockTimeNeeds, paceByBlock } = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // Exact-fit at the Phase B budget. Phase B pins the typical band
    // at 12 min = 720 s, well above the declarative typical-high
    // (10 min) — so a 720 s allocation here is only possible because
    // the tier was replaced by the goal-pace need.
    const out = allocateBlockTime(blocks, 12 * 60, blockTimeNeeds, paceByBlock)!;
    expect(out[0].plannedSeconds).toBe(12 * 60);
  });

  it('module without an active goal falls back to MEMORY_TYPE_DURATIONS', () => {
    const blocks = [
      block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' }),
      block('rep-1', 'repertoire',       { memoryType: 'integration' }),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 5, pace: 'on-pace' }),
    ];
    const { blockTimeNeeds, paceByBlock } = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // Pick a session-length that exactly equals each block's
    // typical-high so the no-Phase-B block lands on its tier band.
    const repTier = MEMORY_TYPE_DURATIONS.integration.typicalHighSeconds;
    const total = 5 * 60 + repTier;
    const out = allocateBlockTime(blocks, total, blockTimeNeeds, paceByBlock)!;
    expect(out[0].plannedSeconds).toBe(5 * 60);    // HF: Phase B budget
    expect(out[1].plannedSeconds).toBe(repTier);   // Repertoire: tier fallback
  });

  it('proportionally scales Phase B budgets down when total exceeds available time', () => {
    // Two Phase-B-active modules asking for 30 + 30 = 60 min, but
    // the session is only 20 min. The allocator scales each block
    // down from its Phase B target toward its memory-type minimum,
    // preserving relative ratios.
    const blocks = [
      block('hf-1',  'harmonic-fluency', { memoryType: 'declarative' }),
      block('rep-1', 'repertoire',       { memoryType: 'integration' }),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({ moduleId: 'harmonic-fluency', estimatedMinutesNeeded: 30 }),
      need({ moduleId: 'repertoire',       estimatedMinutesNeeded: 30 }),
    ];
    const { blockTimeNeeds, paceByBlock } = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    const out = allocateBlockTime(blocks, 20 * 60, blockTimeNeeds, paceByBlock)!;
    // Both blocks shrink; sum equals the requested time (within
    // rounding); neither falls below its memory-type minimum.
    const sum = out.reduce((s, b) => s + b.plannedSeconds, 0);
    expect(sum).toBeLessThanOrEqual(20 * 60);
    expect(sum).toBeGreaterThanOrEqual(20 * 60 - 1);
    expect(out[0].plannedSeconds).toBeGreaterThanOrEqual(MEMORY_TYPE_DURATIONS.declarative.minSeconds);
    expect(out[1].plannedSeconds).toBeGreaterThanOrEqual(MEMORY_TYPE_DURATIONS.integration.minSeconds);
    expect(out[0].plannedSeconds).toBeLessThan(30 * 60);
    expect(out[1].plannedSeconds).toBeLessThan(30 * 60);
  });
});
