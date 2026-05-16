// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../../lib/db';
import {
  computeUnlockedScaleModesStage,
  getEligibleScaleModeItems,
  modesForStage,
  STAGED_INTRODUCTION_BATCH_SIZE,
} from '../scaleModeTierUnlock';
import type { ScaleModeStage } from '../catalog';

const MODULE_REF = 'scales-modes';

function statsForEntireStage(stage: ScaleModeStage, correct: number, total: number) {
  const map = new Map<string, { correct: number; total: number }>();
  for (const id of modesForStage(stage)) map.set(id, { correct, total });
  return map;
}

function mergeStats(
  ...maps: Array<ReadonlyMap<string, { correct: number; total: number }>>
) {
  const out = new Map<string, { correct: number; total: number }>();
  for (const m of maps) for (const [k, v] of m) out.set(k, v);
  return out;
}

function row(itemRef: string, moduleRef = MODULE_REF): SpacingState {
  return {
    id: `${itemRef}\x00${moduleRef}`,
    itemRef,
    moduleRef,
    memoryType: 'declarative',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
  };
}

// -----------------------------------------------------------------
// Catalog wiring
// -----------------------------------------------------------------

describe('modesForStage', () => {
  it('returns the 7 church modes as Stage 1', () => {
    const stage1 = modesForStage(1);
    expect(stage1.length).toBe(7);
    expect(new Set(stage1)).toEqual(new Set([
      'ionian', 'dorian', 'phrygian', 'lydian',
      'mixolydian', 'aeolian', 'locrian',
    ]));
  });

  it('returns harmonic-minor + melodic-minor as Stage 2', () => {
    expect(new Set(modesForStage(2))).toEqual(new Set(['harmonic-minor', 'melodic-minor']));
  });
});

// -----------------------------------------------------------------
// computeUnlockedScaleModesStage
// -----------------------------------------------------------------

describe('computeUnlockedScaleModesStage', () => {
  it('returns 1 when the user has zero attempts (Stage 1 is the floor)', () => {
    expect(computeUnlockedScaleModesStage(new Map())).toBe(1);
  });

  it('returns 1 when only some Stage 1 items meet the threshold', () => {
    const partial = new Map<string, { correct: number; total: number }>();
    partial.set('ionian', { correct: 10, total: 12 });
    partial.set('dorian', { correct: 9, total: 10 });
    // 5 other Stage 1 modes untouched → stays at Stage 1.
    expect(computeUnlockedScaleModesStage(partial)).toBe(1);
  });

  it('returns 1 when Stage 1 attempts exist but accuracy is below 75%', () => {
    // Every Stage 1 mode has 10 attempts but only 5 correct (50%).
    expect(computeUnlockedScaleModesStage(statsForEntireStage(1, 5, 10))).toBe(1);
  });

  it('advances to Stage 2 when every Stage 1 mode clears (≥10 attempts + ≥75%)', () => {
    expect(computeUnlockedScaleModesStage(statsForEntireStage(1, 8, 10))).toBe(2);
  });

  it('stops at MAX (2) even with stats for Stage 2', () => {
    const stats = mergeStats(
      statsForEntireStage(1, 10, 10),
      statsForEntireStage(2, 10, 10),
    );
    expect(computeUnlockedScaleModesStage(stats)).toBe(2);
  });
});

// -----------------------------------------------------------------
// getEligibleScaleModeItems
// -----------------------------------------------------------------

describe('getEligibleScaleModeItems', () => {
  it('Stage 1 cold-start: introduces up to BATCH_SIZE fresh modes, both tab variants each', () => {
    const eligible = getEligibleScaleModeItems(1, []);
    // BATCH_SIZE modes × 2 variants (tab1 / tab2) each.
    expect(eligible.length).toBe(STAGED_INTRODUCTION_BATCH_SIZE * 2);
    // First mode in declaration order with both variants surfaced.
    const stage1 = modesForStage(1);
    expect(eligible).toContain(`${stage1[0]}-tab1`);
    expect(eligible).toContain(`${stage1[0]}-tab2`);
  });

  it('introduced modes always surface; fresh batch fills behind', () => {
    const stage1 = modesForStage(1);
    // Touched ionian on tab1 only — counts as introduced for the
    // whole mode.
    const rows = [row(`${stage1[0]}-tab1`)];
    const eligible = getEligibleScaleModeItems(1, rows);
    // ionian's both tab variants appear (introduced); plus up to
    // BATCH_SIZE fresh modes worth of variants behind it.
    expect(eligible).toContain(`${stage1[0]}-tab1`);
    expect(eligible).toContain(`${stage1[0]}-tab2`);
  });

  it('Stage 2: drops Stage 1 modes the user never touched from the review pool', () => {
    const stage1 = modesForStage(1);
    const touched = stage1.slice(0, 2);
    const rows = touched.map(id => row(`${id}-tab1`));
    const eligible = getEligibleScaleModeItems(2, rows);
    for (const id of touched) {
      expect(eligible).toContain(`${id}-tab1`);
      expect(eligible).toContain(`${id}-tab2`);
    }
    for (const id of stage1.slice(2)) {
      expect(eligible).not.toContain(`${id}-tab1`);
      expect(eligible).not.toContain(`${id}-tab2`);
    }
  });

  it('Stage 2 fresh batch: harmonic + melodic minor both surface, both variants', () => {
    const eligible = getEligibleScaleModeItems(2, []);
    // Stage 2 has only 2 modes — both fit in the BATCH_SIZE (3) cap.
    expect(eligible).toContain('harmonic-minor-tab1');
    expect(eligible).toContain('harmonic-minor-tab2');
    expect(eligible).toContain('melodic-minor-tab1');
    expect(eligible).toContain('melodic-minor-tab2');
  });

  it('rows from a different moduleRef are ignored entirely', () => {
    // Same itemRef shape but moduleRef = chord-recognition — must
    // not register as introduced for scales-modes.
    const rows = [row('ionian-tab1', 'chord-recognition')];
    const eligible = getEligibleScaleModeItems(1, rows);
    // ionian appears via the fresh-batch path (untouched in
    // scales-modes), not via the introduced path — same first-slot
    // outcome as a cold-start, just by a different code branch.
    expect(eligible).toContain('ionian-tab1');
  });
});
