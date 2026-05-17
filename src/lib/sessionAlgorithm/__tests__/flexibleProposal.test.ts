// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER,
  LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER,
  LEAN_TO_GOALS_ON_TRACK_MULTIPLIER,
  leanFactorByModule,
  leanFactorPerSPSubmodule,
  leanMultiplierForBand,
  redistributePlannedSecondsBySubmodule,
} from '../flexibleProposal';
import type { Goal, SpacingState } from '../../db';
import type { ProposalBlock } from '../../../modules/practice/proposalTypes';
import type { IntentChoice } from '../../../modules/practice/inputs';
import type { WeeklyPaceResult } from '../weeklyPace';

const NOW = 1_700_000_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function mkBlock(p: Partial<ProposalBlock> & { id: string }): ProposalBlock {
  return {
    moduleRef: 'shapes-and-patterns',
    moduleLabel: 'S&P',
    moduleAccentHex: '#d4885a',
    activityDescription: 'block ' + p.id,
    plannedSeconds: 600,
    whySnippet: '',
    itemRefs: [],
    isWarmup: false,
    ...p,
  };
}

function mkRow(p: Partial<SpacingState> & { itemRef: string; moduleRef: string }): SpacingState {
  return {
    id: 'row-' + p.itemRef,
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 1,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...p,
  };
}

function mkGoal(p: Partial<Goal> & { id: string }): Goal {
  return {
    scope: 'monthly',
    description: '',
    contextTag: null,
    relatedModules: ['shapes-and-patterns'],
    startDate: NOW - 30 * ONE_DAY_MS,
    targetDate: NOW + 30 * ONE_DAY_MS,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    targetMetric: 'shapes_coverage_at_acquired_specific',
    targetValue: null,
    targetUnit: null,
    relatedItems: [],
    lastEngagedAt: null,
    currentValue: 0,
    ...p,
  } as Goal;
}

const LEAN: IntentChoice = { kind: 'lean_to_goals' };
const BAL: IntentChoice = { kind: 'balanced' };

// ---------------------------------------------------------------------
// leanMultiplierForBand
// ---------------------------------------------------------------------

describe('leanMultiplierForBand', () => {
  it('maps the 5 bands to the 3-tier lean multipliers', () => {
    expect(leanMultiplierForBand('well-ahead')).toBe(LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER);
    expect(leanMultiplierForBand('ahead')).toBe(LEAN_TO_GOALS_ON_TRACK_MULTIPLIER);
    expect(leanMultiplierForBand('at-risk')).toBe(LEAN_TO_GOALS_ON_TRACK_MULTIPLIER);
    expect(leanMultiplierForBand('behind')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
    expect(leanMultiplierForBand('significantly-behind')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
  });

  it('uses the three constants verbatim', () => {
    expect(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER).toBe(1.5);
    expect(LEAN_TO_GOALS_ON_TRACK_MULTIPLIER).toBe(1.0);
    expect(LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER).toBe(0.6);
  });
});

// ---------------------------------------------------------------------
// leanFactorByModule
// ---------------------------------------------------------------------

describe('leanFactorByModule', () => {
  const weeklyPace: WeeklyPaceResult = {
    factorByModule: new Map([
      ['harmonic-fluency', 2.0],
      ['ear-training', 1.0],
      ['shapes-and-patterns', 1.6],
    ]),
    bandByModule: new Map([
      ['harmonic-fluency', 'significantly-behind'],
      ['ear-training', 'well-ahead'],
      ['shapes-and-patterns', 'behind'],
    ]),
    notices: [],
  };

  it('returns the existing factorByModule unchanged for non-lean intents', () => {
    const out = leanFactorByModule({ weeklyPace, intent: BAL, context: 'laptop' });
    expect(out).toBe(weeklyPace.factorByModule);
  });

  it('returns the existing factorByModule unchanged on KEYS context (graduated split is hard)', () => {
    const out = leanFactorByModule({ weeklyPace, intent: LEAN, context: 'keys' });
    expect(out).toBe(weeklyPace.factorByModule);
  });

  it('maps each module band → lean multiplier on non-keys contexts under lean intent', () => {
    const out = leanFactorByModule({ weeklyPace, intent: LEAN, context: 'laptop' });
    expect(out.get('harmonic-fluency')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
    expect(out.get('ear-training')).toBe(LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER);
    expect(out.get('shapes-and-patterns')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
  });

  it('omits modules with no band entry — caller defaults missing entries to 1.0×', () => {
    const sparse: WeeklyPaceResult = {
      factorByModule: new Map([['ear-training', 1.6]]),
      bandByModule: new Map([['ear-training', 'behind']]),
      notices: [],
    };
    const out = leanFactorByModule({ weeklyPace: sparse, intent: LEAN, context: 'phone' });
    expect(out.has('harmonic-fluency')).toBe(false);
    expect(out.get('ear-training')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
  });
});

// ---------------------------------------------------------------------
// leanFactorPerSPSubmodule
// ---------------------------------------------------------------------

describe('leanFactorPerSPSubmodule', () => {
  it('returns empty map for non-lean intents', () => {
    const out = leanFactorPerSPSubmodule({
      goals: [], spacingRows: [], intent: BAL, now: NOW,
    });
    expect(out.size).toBe(0);
  });

  it('routes a VL-specific coverage goal that is behind → vl submodule lifted', () => {
    // VL goal targeting 100 items; 10 covered with full period elapsed
    // → ratio ≈ 0.1, band 'significantly-behind' → 1.5×.
    const goal = mkGoal({
      id: 'g-vl', targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'voice_leading', targetValue: 100,
      // Full period elapsed for a clean ratio computation:
      startDate: NOW - 60 * ONE_DAY_MS, targetDate: NOW,
    });
    const rows: SpacingState[] = Array.from({ length: 10 }, (_, i) =>
      mkRow({
        itemRef: `vl:diatonic-cycle:pos${i}:C`,
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquired',
      }),
    );
    const out = leanFactorPerSPSubmodule({
      goals: [goal], spacingRows: rows, intent: LEAN, now: NOW,
    });
    expect(out.get('shapes-and-patterns:vl')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
    // Other submodules absent — they'd default to 1.0× at the caller.
    expect(out.has('shapes-and-patterns:chord-shape')).toBe(false);
    expect(out.has('shapes-and-patterns:scale')).toBe(false);
  });

  it('routes a chord-shape specific coverage goal that is well-ahead → pull-down', () => {
    // 100 items targeted, 80 covered at 25% period elapsed →
    // ratio = 80 / (0.25 × 100) = 3.2, well-ahead → 0.6×.
    const goal = mkGoal({
      id: 'g-cs', targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_triads', targetValue: 100,
      startDate: NOW - 30 * ONE_DAY_MS, targetDate: NOW + 90 * ONE_DAY_MS,
    });
    const rows: SpacingState[] = Array.from({ length: 80 }, (_, i) =>
      mkRow({
        itemRef: `chord-shape:maj:K${i}`,
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquired',
      }),
    );
    const out = leanFactorPerSPSubmodule({
      goals: [goal], spacingRows: rows, intent: LEAN, now: NOW,
    });
    expect(out.get('shapes-and-patterns:chord-shape'))
      .toBe(LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER);
  });

  it('overall coverage goal applies to all three S&P submodules', () => {
    const goal = mkGoal({
      id: 'g-all', targetMetric: 'shapes_coverage_at_acquired',
      targetUnit: 'items', targetValue: 100,
      startDate: NOW - 60 * ONE_DAY_MS, targetDate: NOW,
    });
    // 10 covered out of 100 with full period elapsed → behind.
    const rows: SpacingState[] = Array.from({ length: 10 }, (_, i) =>
      mkRow({
        itemRef: `chord-shape:maj:K${i}`,
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquired',
      }),
    );
    const out = leanFactorPerSPSubmodule({
      goals: [goal], spacingRows: rows, intent: LEAN, now: NOW,
    });
    expect(out.get('shapes-and-patterns:chord-shape'))
      .toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
    expect(out.get('shapes-and-patterns:scale'))
      .toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
    expect(out.get('shapes-and-patterns:vl'))
      .toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
  });

  it('multiple goals targeting the same submodule — WORST ratio wins (most-behind goal)', () => {
    const behindGoal = mkGoal({
      id: 'g-behind', targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'voice_leading', targetValue: 100,
      startDate: NOW - 60 * ONE_DAY_MS, targetDate: NOW,
    });
    const aheadGoal = mkGoal({
      id: 'g-ahead', targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'voice_leading', targetValue: 10,
      startDate: NOW - 30 * ONE_DAY_MS, targetDate: NOW + 90 * ONE_DAY_MS,
    });
    // behindGoal: 5 of 100 covered, full period → ratio 0.05 (behind)
    // aheadGoal: 8 of 10 covered, 25% elapsed → ratio 3.2 (well-ahead)
    // VL submodule's lean multiplier should reflect the BEHIND goal.
    const rows: SpacingState[] = Array.from({ length: 8 }, (_, i) =>
      mkRow({
        itemRef: `vl:diatonic-cycle:pos${i}:C`,
        moduleRef: 'shapes-and-patterns',
        acquisitionStage: 'acquired',
      }),
    );
    const out = leanFactorPerSPSubmodule({
      goals: [aheadGoal, behindGoal], spacingRows: rows, intent: LEAN, now: NOW,
    });
    expect(out.get('shapes-and-patterns:vl')).toBe(LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER);
  });

  it('skips non-S&P goals + non-active goals + zero-target goals', () => {
    const out = leanFactorPerSPSubmodule({
      goals: [
        mkGoal({ id: 'g-hf', relatedModules: ['harmonic-fluency'],
                  targetMetric: 'harmonic_fluency_coverage_at_acquired' }),
        mkGoal({ id: 'g-inactive', status: 'paused', targetValue: 100, targetUnit: 'voice_leading' }),
        mkGoal({ id: 'g-zero', targetValue: 0, targetUnit: 'voice_leading' }),
      ],
      spacingRows: [], intent: LEAN, now: NOW,
    });
    expect(out.size).toBe(0);
  });
});

// ---------------------------------------------------------------------
// redistributePlannedSecondsBySubmodule
// ---------------------------------------------------------------------

describe('redistributePlannedSecondsBySubmodule', () => {
  it('no-op when lean factor map is empty', () => {
    const blocks = [
      mkBlock({ id: 'a', itemRefs: ['chord-shape:maj:C:root'], plannedSeconds: 600 }),
      mkBlock({ id: 'b', itemRefs: ['vl:diatonic-cycle:pos1:C'], plannedSeconds: 600 }),
    ];
    expect(redistributePlannedSecondsBySubmodule(blocks, new Map())).toEqual(blocks);
  });

  it('no-op when only one S&P segment is present', () => {
    const blocks = [
      mkBlock({ id: 'a', itemRefs: ['chord-shape:maj:C:root'], plannedSeconds: 900 }),
      mkBlock({ id: 'b', moduleRef: 'harmonic-fluency', itemRefs: ['hf-1'], plannedSeconds: 300 }),
    ];
    const lean = new Map([['shapes-and-patterns:vl', 1.5]]);
    expect(redistributePlannedSecondsBySubmodule(blocks, lean)).toEqual(blocks);
  });

  it('redistributes proportionally and preserves total S&P bucket seconds', () => {
    // 25/50/25 baseline on a 1200s bucket → scales(warmup)=300,
    // shapes=600, vl=300. VL behind, others on-track.
    // Warm-up scales is EXCLUDED from redistribution (its 300s stays
    // locked). Redistribution operates on shapes(600) + vl(300) =
    // 900s total.
    //   weighted: shapes 600×1.0=600, vl 300×1.5=450 → sumWeighted 1050
    //   newShapes = round(600 × 900/1050) = round(514.28) = 514
    //   newVl    = round(450 × 900/1050) = round(385.71) = 386
    //   sum = 900 ✓ (leftover 0)
    const blocks = [
      mkBlock({ id: 'sc-warmup', itemRefs: ['scale:major:C'], plannedSeconds: 300, isWarmup: true }),
      mkBlock({ id: 'shapes', itemRefs: ['chord-shape:maj:C:root'], plannedSeconds: 600 }),
      mkBlock({ id: 'vl', itemRefs: ['vl:diatonic-cycle:pos1:C'], plannedSeconds: 300 }),
    ];
    const lean = new Map([
      ['shapes-and-patterns:chord-shape', 1.0],
      ['shapes-and-patterns:vl', 1.5],
    ]);
    const out = redistributePlannedSecondsBySubmodule(blocks, lean);

    // Warm-up locked
    expect(out.find(b => b.id === 'sc-warmup')!.plannedSeconds).toBe(300);
    const shapes = out.find(b => b.id === 'shapes')!.plannedSeconds;
    const vl = out.find(b => b.id === 'vl')!.plannedSeconds;
    expect(shapes + vl).toBe(900); // bucket preserved
    expect(shapes).toBe(514);
    expect(vl).toBe(386);
  });

  it('rounding leftover lands on the first redistributed segment', () => {
    // Three equal segments at 100s, all different multipliers that
    // produce a non-exact division. Total stays 300.
    const blocks = [
      mkBlock({ id: 'cs', itemRefs: ['chord-shape:maj:C:root'], plannedSeconds: 100 }),
      mkBlock({ id: 'sc', itemRefs: ['scale:major:C'], plannedSeconds: 100 }),
      mkBlock({ id: 'vl', itemRefs: ['vl:diatonic-cycle:pos1:C'], plannedSeconds: 100 }),
    ];
    const lean = new Map([
      ['shapes-and-patterns:chord-shape', 0.6],
      ['shapes-and-patterns:scale', 1.0],
      ['shapes-and-patterns:vl', 1.5],
    ]);
    const out = redistributePlannedSecondsBySubmodule(blocks, lean);
    const sum = out
      .filter(b => b.moduleRef === 'shapes-and-patterns')
      .reduce((s, b) => s + b.plannedSeconds, 0);
    expect(sum).toBe(300);
  });

  it('leaves non-S&P blocks unchanged', () => {
    const blocks = [
      mkBlock({ id: 'cs', itemRefs: ['chord-shape:maj:C:root'], plannedSeconds: 600 }),
      mkBlock({ id: 'vl', itemRefs: ['vl:diatonic-cycle:pos1:C'], plannedSeconds: 600 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency', itemRefs: ['x'], plannedSeconds: 900 }),
    ];
    const lean = new Map([['shapes-and-patterns:vl', 1.5]]);
    const out = redistributePlannedSecondsBySubmodule(blocks, lean);
    expect(out.find(b => b.id === 'hf')!.plannedSeconds).toBe(900);
    expect(out.find(b => b.id === 'hf')!).toBe(blocks[2]); // untouched reference
  });

  it('no-op when every redistributable segment has the same multiplier', () => {
    const blocks = [
      mkBlock({ id: 'cs', itemRefs: ['chord-shape:maj:C:root'], plannedSeconds: 600 }),
      mkBlock({ id: 'vl', itemRefs: ['vl:diatonic-cycle:pos1:C'], plannedSeconds: 300 }),
    ];
    const lean = new Map([
      ['shapes-and-patterns:chord-shape', 1.5],
      ['shapes-and-patterns:vl', 1.5],
    ]);
    expect(redistributePlannedSecondsBySubmodule(blocks, lean)).toEqual(blocks);
  });
});
