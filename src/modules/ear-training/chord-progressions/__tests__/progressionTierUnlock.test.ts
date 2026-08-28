// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../../lib/db';
import {
  computeUnlockedStage,
  getEligibleProgressionItems,
  itemsForStage,
  STAGED_INTRODUCTION_BATCH_SIZE,
} from '../progressionTierUnlock';
import type { ProgressionStage } from '../progressionStages';

const MODULE_REF = 'chord-progressions';

function statsForEntireStage(stage: ProgressionStage, correct: number, total: number) {
  const map = new Map<string, { correct: number; total: number }>();
  for (const id of itemsForStage(stage)) map.set(id, { correct, total });
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
    hand: 'both',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
  };
}

// -----------------------------------------------------------------
// computeUnlockedStage
// -----------------------------------------------------------------

describe('computeUnlockedStage', () => {
  it('returns 1 when the user has zero attempts (Stage 1 is the floor)', () => {
    expect(computeUnlockedStage(new Map())).toBe(1);
  });

  it('returns 1 when Stage 1 items are below the attempt floor', () => {
    // Two of N Stage 1 items hit the bar — not enough.
    const stage1 = itemsForStage(1);
    expect(stage1.length).toBeGreaterThan(0);
    const partial = new Map<string, { correct: number; total: number }>();
    partial.set(stage1[0], { correct: 10, total: 12 });
    expect(computeUnlockedStage(partial)).toBe(1);
  });

  it('returns 1 when Stage 1 attempts exist but accuracy is below 75%', () => {
    // Every Stage 1 item has 10 attempts but only 5 correct (50%).
    expect(computeUnlockedStage(statsForEntireStage(1, 5, 10))).toBe(1);
  });

  it('advances to Stage 2 when every Stage 1 item clears (≥10 attempts + ≥75%)', () => {
    expect(computeUnlockedStage(statsForEntireStage(1, 8, 10))).toBe(2);
  });

  it('advances to Stage 3 when both Stage 1 and Stage 2 clear', () => {
    const stats = mergeStats(
      statsForEntireStage(1, 9, 10),
      statsForEntireStage(2, 8, 10),
    );
    expect(computeUnlockedStage(stats)).toBe(3);
  });

  it('advances to Stage 4 (cap) when Stages 1-3 all clear', () => {
    const stats = mergeStats(
      statsForEntireStage(1, 9, 10),
      statsForEntireStage(2, 9, 10),
      statsForEntireStage(3, 9, 10),
    );
    expect(computeUnlockedStage(stats)).toBe(4);
  });

  it('stops at MAX (4) even with stats for stage 4', () => {
    const stats = mergeStats(
      statsForEntireStage(1, 10, 10),
      statsForEntireStage(2, 10, 10),
      statsForEntireStage(3, 10, 10),
      statsForEntireStage(4, 10, 10),
    );
    expect(computeUnlockedStage(stats)).toBe(4);
  });
});

// -----------------------------------------------------------------
// getEligibleProgressionItems
// -----------------------------------------------------------------

describe('getEligibleProgressionItems', () => {
  it('Stage 1: introduces up to STAGED_INTRODUCTION_BATCH_SIZE fresh items when none are introduced', () => {
    const stage1 = itemsForStage(1);
    expect(stage1.length).toBeGreaterThan(STAGED_INTRODUCTION_BATCH_SIZE);
    const eligible = getEligibleProgressionItems(1, []);
    // Catalog order: first 3 fresh items surface.
    expect(eligible).toEqual(stage1.slice(0, STAGED_INTRODUCTION_BATCH_SIZE));
  });

  it('Stage 1: introduced items always surface; fresh batch fills behind them', () => {
    const stage1 = itemsForStage(1);
    const introduced = stage1.slice(0, 2); // two items already touched
    const rows = introduced.map(id => row(id));
    const eligible = getEligibleProgressionItems(1, rows);
    // First two are introduced (always eligible); rest are the
    // staged-introduction batch from the untouched portion of the
    // catalog (up to 3).
    expect(eligible.slice(0, 2)).toEqual(introduced);
    expect(eligible.length).toBeLessThanOrEqual(2 + STAGED_INTRODUCTION_BATCH_SIZE);
  });

  it('Stage 2: review pool drops Stage 1 items the user never touched', () => {
    const stage1 = itemsForStage(1);
    const touchedStage1 = stage1.slice(0, 2);
    const rows = touchedStage1.map(id => row(id));
    const eligible = getEligibleProgressionItems(2, rows);
    // The first two Stage 1 items appear (review); the untouched
    // Stage 1 items don't.
    for (const id of touchedStage1) expect(eligible).toContain(id);
    for (const id of stage1.slice(2)) expect(eligible).not.toContain(id);
  });

  it('rows from a different moduleRef are ignored entirely', () => {
    const stage1 = itemsForStage(1);
    // Same itemRef but moduleRef = chord-recognition — must be
    // ignored by the introduced check.
    const rows = [row(stage1[0], 'chord-recognition')];
    const eligible = getEligibleProgressionItems(1, rows);
    // Item should appear only via the fresh-batch path, not via the
    // introduced path — so it lands in the first STAGED slot like
    // any untouched Stage 1 item.
    expect(eligible[0]).toBe(stage1[0]);
  });

  it('caps fresh introductions at STAGED_INTRODUCTION_BATCH_SIZE per session', () => {
    const eligible = getEligibleProgressionItems(1, []);
    expect(eligible.length).toBeLessThanOrEqual(STAGED_INTRODUCTION_BATCH_SIZE);
  });
});
