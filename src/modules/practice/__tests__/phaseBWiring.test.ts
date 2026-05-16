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
import type { SpacingState } from '../../../lib/db';

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
    isKeyboardRequired: partial.isKeyboardRequired ?? false,
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
    overPractice: 'none',
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

// =====================================================================
// Phase B Step 9a — over-practice slice in buildBlockBudgetsFromWeeklyNeeds
// =====================================================================

describe('buildBlockBudgetsFromWeeklyNeeds — over-practice slice', () => {
  it("weekly over-practice → 50% of tier typical-high (declarative HF)", () => {
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // declarative typical-high = 10 min = 600 s; 50% = 300 s.
    expect(out.blockTimeNeeds.get('hf-1')).toBe(300);
    expect(out.paceByBlock.get('hf-1')).toBe('ahead');
    expect(out.phaseBModules.has('harmonic-fluency')).toBe(true);
  });

  it("monthly over-practice → 25% of tier typical-high (procedural S&P)", () => {
    const blocks = [block('sp-1', 'shapes-and-patterns', { memoryType: 'procedural' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'shapes-and-patterns',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'monthly',
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // procedural typical-high = 15 min = 900 s; 25% = 225 s.
    expect(out.blockTimeNeeds.get('sp-1')).toBe(225);
    expect(out.phaseBModules.has('shapes-and-patterns')).toBe(true);
  });

  it("over-practice respects MODULE_DURATION_OVERRIDES (Repertoire 60-min typical-high)", () => {
    const blocks = [block('rep-1', 'repertoire', { memoryType: 'integration' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'repertoire',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // Repertoire override pushes typicalHigh to 60 min = 3600 s; 50% = 1800 s.
    expect(out.blockTimeNeeds.get('rep-1')).toBe(1800);
  });

  it("over-practice slice never exceeds the tier cap (defensive)", () => {
    // The fraction (≤ 1) × typical-high cannot exceed typical-high,
    // and the spacing floor stays bounded by `cap` in Part B.
    // Pinning the invariant.
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'monthly', // smallest slice — 25%
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    const slice = out.blockTimeNeeds.get('hf-1')!;
    expect(slice).toBeLessThanOrEqual(10 * 60); // ≤ declarative cap
  });

  it('ET fan-out distributes the module-level slice across sub-module blocks', () => {
    // ET module total = 50% × declarative typical-high (10 min) = 5 min.
    // Three ET blocks → 5 min / 3 ≈ 100 s per block.
    const blocks = [
      block('et-int', 'intervals',         { memoryType: 'declarative' }),
      block('et-cr',  'chord-recognition', { memoryType: 'declarative' }),
      block('et-cp',  'chord-progressions',{ memoryType: 'declarative' }),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'ear-training',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    // 300 s total slice ÷ 3 blocks = 100 s each.
    expect(out.blockTimeNeeds.get('et-int')).toBeCloseTo(100, 5);
    expect(out.blockTimeNeeds.get('et-cr')).toBeCloseTo(100, 5);
    expect(out.blockTimeNeeds.get('et-cp')).toBeCloseTo(100, 5);
  });

  it("'none' over-practice keeps the keystone's estimatedMinutesNeeded path unchanged", () => {
    // Regression guard for Step 6 wiring: over-practice 'none' must
    // still use estimatedMinutesNeeded × 60, not the tier fraction.
    const blocks = [block('hf-1', 'harmonic-fluency')];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        estimatedMinutesNeeded: 8,
        overPractice: 'none',
      }),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(8 * 60); // 480 s
  });
});

// =====================================================================
// Phase B Step 9a — allocator routes saved over-practice time to
// behind-pace modules via Step 6's overflow path
// =====================================================================

describe('allocator end-to-end — saved over-practice time flows to behind-pace', () => {
  it('over-practice block stays at 50% tier; behind-pace block claims the saved time', () => {
    // HF is over-practiced (50% × 10 min = 5 min). Repertoire is
    // behind pace. Session is 30 min — well past the typical-high
    // total of 5 + 20 = 25 min, so the overflow branch fires.
    // Step 6's pace-aware overflow routes all overflow to the
    // behind-pace block, leaving HF at its over-practice slice.
    const blocks = [
      block('hf-1',  'harmonic-fluency', { memoryType: 'declarative' }),
      block('rep-1', 'repertoire',       { memoryType: 'integration' }),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly', // → 5 min slice
      }),
      need({
        moduleId: 'repertoire',
        estimatedMinutesNeeded: 20,
        pace: 'behind',
        overPractice: 'none',
      }),
    ];
    const { blockTimeNeeds, paceByBlock } =
      buildBlockBudgetsFromWeeklyNeeds(blocks, needs);
    const out = allocateBlockTime(blocks, 30 * 60, blockTimeNeeds, paceByBlock)!;
    // HF stays at its 5-min over-practice slice (pace = ahead, doesn't
    // claim overflow). Repertoire (behind) gets the rest of the 30 min.
    expect(out[0].plannedSeconds).toBe(5 * 60);
    expect(out[1].plannedSeconds).toBe(30 * 60 - 5 * 60); // 25 min
    expect(out.reduce((s, b) => s + b.plannedSeconds, 0)).toBe(30 * 60);
  });
});

// =====================================================================
// Phase B Step 9a Part B — spacing floor expansion
//
// The over-practice slice expands to clear the SR algorithm's actual
// due-today demand when that exceeds the 50% / 25% target — capped at
// the tier so the slice never grows larger than a normal session.
//
//   slice = min(max(target, spacing_demand), tier_cap)
// =====================================================================

describe('buildBlockBudgetsFromWeeklyNeeds — Step 9a Part B spacing floor', () => {
  const NOW = 1_700_000_000_000;
  const PAST = NOW - 1000;

  function spacingRow(
    itemRef: string,
    moduleRef: string,
    nextDueAt: number | null,
  ): SpacingState {
    return {
      id: `row-${itemRef}-${moduleRef}`,
      itemRef,
      moduleRef,
      memoryType: 'declarative',
      acquisitionStage: 'acquiring',
      currentIntervalDays: 0,
      lastEngagedAt: nextDueAt,
      nextDueAt,
      performanceHistory: [],
    };
  }

  it('HF weekly over-practice — demand < target → target wins (7.5 min)', () => {
    // declarative typical-high = 10 min = 600 s; 50% = 300 s = 5 min.
    // Hmm — the design-doc example uses 15-min typical-high (different
    // tier shape); our declarative tier is 10 min. Same math:
    //   target  = 50% × 600 s   = 300 s
    //   demand  = 5 items × 30s = 150 s
    //   slice   = max(300, 150) = 300 s (target wins)
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const spacingRows = Array.from({ length: 5 }, (_, i) =>
      spacingRow(`card-${i}`, 'harmonic-fluency', PAST),
    );
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(300);
  });

  it('HF weekly over-practice — demand > target & < cap → demand wins (slice expands)', () => {
    // target  = 50% × 600 s     = 300 s   (5 min)
    // demand  = 15 items × 30 s = 450 s   (7.5 min)
    // cap     = 600 s
    // slice   = min(max(300, 450), 600) = 450 s
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const spacingRows = Array.from({ length: 15 }, (_, i) =>
      spacingRow(`card-${i}`, 'harmonic-fluency', PAST),
    );
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(450);
  });

  it('HF weekly over-practice — demand > cap → cap wins (slice clamped at tier)', () => {
    // target  = 300 s
    // demand  = 40 items × 30 s = 1200 s (20 min)
    // cap     = 600 s
    // slice   = min(max(300, 1200), 600) = 600 s
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const spacingRows = Array.from({ length: 40 }, (_, i) =>
      spacingRow(`card-${i}`, 'harmonic-fluency', PAST),
    );
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(600); // tier cap
  });

  it('monthly over-practice — high spacing demand still expands above the 25% target', () => {
    // declarative typical-high = 600 s
    // target  = 25% × 600 = 150 s (2.5 min)
    // demand  = 12 items × 30 s = 360 s (6 min)
    // slice   = max(150, 360) = 360 s
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'monthly',
      }),
    ];
    const spacingRows = Array.from({ length: 12 }, (_, i) =>
      spacingRow(`card-${i}`, 'harmonic-fluency', PAST),
    );
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(360);
  });

  it('Repertoire — spacing demand returns 0, slice falls through to Part A target (regression)', () => {
    // Repertoire has no spacing-state due-today concept. Even with
    // spacing rows present under moduleRef='repertoire', the demand
    // helper returns 0 → slice stays at the 50% / 25% Part A target.
    const blocks = [block('rep-1', 'repertoire', { memoryType: 'integration' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'repertoire',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const spacingRows = [
      spacingRow('song:bag-lady:chorus', 'repertoire', PAST),
      spacingRow('song:bag-lady:verse',  'repertoire', PAST),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    // Repertoire override → 60 min typical-high; 50% = 1800 s.
    expect(out.blockTimeNeeds.get('rep-1')).toBe(1800);
  });

  it('Production — spacing demand returns 0, slice falls through to target (regression)', () => {
    const blocks = [block('prod-1', 'production', { memoryType: 'procedural' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'production',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
    ];
    const spacingRows = [
      spacingRow('wf-01',   'production', PAST),
      spacingRow('lang-01', 'production', PAST),
    ];
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    // procedural typical-high = 15 min = 900 s; 50% = 450 s.
    expect(out.blockTimeNeeds.get('prod-1')).toBe(450);
  });

  it("'none' over-practice ignores the spacing floor entirely (regression)", () => {
    // The Step 5/6 path (estimatedMinutesNeeded × 60) is untouched by
    // Part B — the spacing floor only applies to over-practice slices.
    const blocks = [block('hf-1', 'harmonic-fluency', { memoryType: 'declarative' })];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        estimatedMinutesNeeded: 8,
        overPractice: 'none',
      }),
    ];
    // 100 due items would be a 50-min spacing demand — ignored entirely.
    const spacingRows = Array.from({ length: 100 }, (_, i) =>
      spacingRow(`card-${i}`, 'harmonic-fluency', PAST),
    );
    const out = buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    expect(out.blockTimeNeeds.get('hf-1')).toBe(8 * 60); // 480 s, unchanged
  });

  it('saved time still routes to behind-pace modules when spacing demand stays below the target', () => {
    // Part A → Part B integration regression: with demand < target,
    // the over-practice slice stays at the target and the overflow
    // path keeps routing saved time to behind-pace modules.
    const blocks = [
      block('hf-1',  'harmonic-fluency', { memoryType: 'declarative' }),
      block('rep-1', 'repertoire',       { memoryType: 'integration' }),
    ];
    const needs: ModuleWeeklyNeed[] = [
      need({
        moduleId: 'harmonic-fluency',
        remainingAttempts: 0,
        estimatedMinutesNeeded: 0,
        pace: 'ahead',
        overPractice: 'weekly',
      }),
      need({
        moduleId: 'repertoire',
        estimatedMinutesNeeded: 20,
        pace: 'behind',
        overPractice: 'none',
      }),
    ];
    // 3 due HF items × 30 s = 90 s — well under the 300-s target.
    const spacingRows = Array.from({ length: 3 }, (_, i) =>
      spacingRow(`card-${i}`, 'harmonic-fluency', PAST),
    );
    const { blockTimeNeeds, paceByBlock } =
      buildBlockBudgetsFromWeeklyNeeds(blocks, needs, spacingRows, NOW);
    expect(blockTimeNeeds.get('hf-1')).toBe(300); // target wins
    const out = allocateBlockTime(blocks, 30 * 60, blockTimeNeeds, paceByBlock)!;
    expect(out[0].plannedSeconds).toBe(300);
    expect(out[1].plannedSeconds).toBe(30 * 60 - 300);
  });
});
