// @vitest-environment jsdom
/**
 * Pins the key-by-key reshape contract from Phase 1 Part 2:
 *   · starting key = least-recently-touched key with due cells
 *   · walk circle-of-fourths from there
 *   · within each key, tier ASC → quality declaration order →
 *     inversion order (root → inv1 → inv2 → inv3 → fluid)
 *   · truncate to plannedSeconds budget (≈90 s root/inv, 120 s fluid)
 *   · drop cells whose quality is above the unlocked tier
 *   · label = "Quality1, Quality2 · KeyA, KeyB"
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import type { AllocatedBlock } from '../../../lib/sessionAlgorithm/timeAllocation';
import {
  shapeShapesBlock,
  type ShapesSplitContext,
} from '../shapesSplit';

const NOW = 1_700_000_000_000;

function row(
  itemRef: string,
  partial: Partial<SpacingState> = {},
): SpacingState {
  return {
    id: `${itemRef}\x00shapes-and-patterns`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...partial,
  };
}

function ctx(
  rows: SpacingState[],
  unlockedTier: 1 | 2 | 3 | 4 = 4,
  now: number = NOW,
): ShapesSplitContext {
  return {
    rowsByItemRef: new Map(rows.map(r => [r.itemRef, r])),
    unlockedTier,
    now,
  };
}

function block(itemRefs: string[], plannedSeconds = 1800): AllocatedBlock {
  return {
    id: 'algo-block-sp',
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    itemRefs,
    weight: 1,
    hasAcquiringItems: false,
    plannedSeconds,
    phase: 'review',
  };
}

describe('shapeShapesBlock — key-by-key walk', () => {
  it('returns null when the block has no chord-shape items', () => {
    // Algorithm picked nothing-shaped (or non-chord-shape kinds).
    expect(shapeShapesBlock(block([]), ctx([]))).toBeNull();
    expect(
      shapeShapesBlock(block(['scale:major:C']), ctx([])),
    ).toBeNull();
  });

  it('drops cells whose quality is above the unlocked tier', () => {
    // T1 only unlocked → maj7 (T2) and dom7b9 (T4) drop. maj (T1) stays.
    const out = shapeShapesBlock(
      block(['chord-shape:maj:C:root', 'chord-shape:maj7:C:root', 'chord-shape:dom7b9:C:root']),
      ctx([], 1),
    );
    expect(out).not.toBeNull();
    expect(out!.itemRefs).toEqual(['chord-shape:maj:C:root']);
  });

  it('walks circle-of-fourths from the starting key', () => {
    // Three cells across C, F, Bb. Starting key = C (the one
    // touched earliest); walk continues F → Bb in canonical order.
    const rows = [
      row('chord-shape:maj:C:root', { lastEngagedAt: NOW - 10_000 }),
      row('chord-shape:maj:F:root', { lastEngagedAt: NOW - 5_000 }),
      row('chord-shape:maj:Bb:root', { lastEngagedAt: NOW - 1_000 }),
    ];
    const out = shapeShapesBlock(
      block([
        // Algorithm's order is irrelevant — shaper reorders by key walk.
        'chord-shape:maj:Bb:root',
        'chord-shape:maj:F:root',
        'chord-shape:maj:C:root',
      ]),
      ctx(rows, 1),
    );
    expect(out!.itemRefs).toEqual([
      'chord-shape:maj:C:root',
      'chord-shape:maj:F:root',
      'chord-shape:maj:Bb:root',
    ]);
  });

  it('within a key, sorts by tier ASC → quality rank ASC → inversion order', () => {
    // Single key (C) with mixed tier + inversions. Expected:
    //   maj root, maj inv1, maj inv2, maj fluid  (T1, qualityRank 0)
    //   min root                                   (T1, qualityRank 1)
    //   maj7 root, maj7 inv1                       (T2, qualityRank 0)
    //   dom7 root                                  (T2, qualityRank 2)
    const itemRefs = [
      'chord-shape:dom7:C:root',
      'chord-shape:min:C:root',
      'chord-shape:maj7:C:inv1',
      'chord-shape:maj:C:fluid',
      'chord-shape:maj:C:inv2',
      'chord-shape:maj:C:inv1',
      'chord-shape:maj7:C:root',
      'chord-shape:maj:C:root',
    ];
    const out = shapeShapesBlock(block(itemRefs), ctx([], 2));
    expect(out!.itemRefs).toEqual([
      'chord-shape:maj:C:root',
      'chord-shape:maj:C:inv1',
      'chord-shape:maj:C:inv2',
      'chord-shape:maj:C:fluid',
      'chord-shape:min:C:root',
      'chord-shape:maj7:C:root',
      'chord-shape:maj7:C:inv1',
      'chord-shape:dom7:C:root',
    ]);
  });

  it('prefers due-cell keys when picking the starting key', () => {
    // Bb has the oldest lastEngagedAt, but its cell isn't due
    // (nextDueAt is in the future). F has a due cell — pick F.
    const rows = [
      row('chord-shape:maj:C:root', {
        lastEngagedAt: NOW - 1_000,
        nextDueAt: NOW + 1_000, // not due
      }),
      row('chord-shape:maj:F:root', {
        lastEngagedAt: NOW - 5_000,
        nextDueAt: NOW - 100, // due
      }),
      row('chord-shape:maj:Bb:root', {
        lastEngagedAt: NOW - 10_000,
        nextDueAt: NOW + 1_000, // not due
      }),
    ];
    const out = shapeShapesBlock(
      block([
        'chord-shape:maj:C:root',
        'chord-shape:maj:F:root',
        'chord-shape:maj:Bb:root',
      ]),
      ctx(rows, 1),
    );
    // F first (only due), then walk forward in the circle: Bb → ... → C.
    expect(out!.itemRefs[0]).toBe('chord-shape:maj:F:root');
  });

  it('falls back to oldest lastEngagedAt when no key has due cells', () => {
    // None are due (all nextDueAt in the future). Bb has the
    // oldest lastEngagedAt → start there.
    const rows = [
      row('chord-shape:maj:C:root', {
        lastEngagedAt: NOW - 1_000,
        nextDueAt: NOW + 1_000,
      }),
      row('chord-shape:maj:Bb:root', {
        lastEngagedAt: NOW - 10_000,
        nextDueAt: NOW + 1_000,
      }),
    ];
    const out = shapeShapesBlock(
      block(['chord-shape:maj:C:root', 'chord-shape:maj:Bb:root']),
      ctx(rows, 1),
    );
    expect(out!.itemRefs[0]).toBe('chord-shape:maj:Bb:root');
  });

  it('truncates the walk to plannedSeconds (≈ 90 s root, 120 s fluid)', () => {
    // 6 cells × 90s = 540s exceeds a 300s budget. Truncates after
    // ~3 cells (270s — under 300; the 4th would push to 360, but
    // the loop stops AFTER the cell that crosses budget so we get
    // 3 keys at root only).
    const itemRefs = [
      'chord-shape:maj:C:root',
      'chord-shape:maj:F:root',
      'chord-shape:maj:Bb:root',
      'chord-shape:maj:Eb:root',
      'chord-shape:maj:Ab:root',
      'chord-shape:maj:Db:root',
    ];
    const out = shapeShapesBlock(block(itemRefs, 300), ctx([], 1));
    expect(out!.itemRefs.length).toBeLessThanOrEqual(4);
    expect(out!.itemRefs.length).toBeGreaterThanOrEqual(3);
    // Walk order preserved among kept cells.
    expect(out!.itemRefs[0]).toBe('chord-shape:maj:C:root');
    expect(out!.itemRefs[1]).toBe('chord-shape:maj:F:root');
  });

  it('always keeps at least one cell even if a single cell exceeds the budget', () => {
    // 50 s budget < 90 s cell. The defensive "kept.length > 0
    // before bail" guarantees the proposal has at least one item.
    const out = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 50),
      ctx([], 1),
    );
    expect(out!.itemRefs).toEqual(['chord-shape:maj:C:root']);
  });

  it('builds a human label naming the qualities and keys in walk order', () => {
    const rows = [
      row('chord-shape:maj:C:root', { lastEngagedAt: NOW - 5_000 }),
      row('chord-shape:maj:F:root', { lastEngagedAt: NOW - 1_000 }),
      row('chord-shape:min:C:root', { lastEngagedAt: NOW - 1_000 }),
    ];
    const out = shapeShapesBlock(
      block([
        'chord-shape:maj:C:root',
        'chord-shape:min:C:root',
        'chord-shape:maj:F:root',
      ]),
      ctx(rows, 1),
    );
    // Walk order: C (older) → F. Within C: maj (qualityRank 0) → min (1).
    // Unique qualities in encounter order: Major, then Minor.
    // Unique keys in encounter order: C, then F.
    expect(out!.label).toBe('Major, Minor · C, F');
  });

  it('trims long quality / key lists with "+N more"', () => {
    // 4 qualities → label keeps 3 + "+1 more". 5 keys → 4 + "+1 more".
    const itemRefs = [
      'chord-shape:maj:C:root',
      'chord-shape:min:F:root',
      'chord-shape:dim:Bb:root',
      'chord-shape:aug:Eb:root',
      'chord-shape:maj:Ab:root',
    ];
    const out = shapeShapesBlock(block(itemRefs), ctx([], 1));
    expect(out!.label).toMatch(/^Major, Minor, Diminished, \+1 more · /);
    expect(out!.label).toMatch(/, \+1 more$/);
  });

  it('returns a "drills across N keys — circle-of-fourths order" why snippet', () => {
    const out = shapeShapesBlock(
      block([
        'chord-shape:maj:C:root',
        'chord-shape:maj:F:root',
      ]),
      ctx([], 1),
    );
    expect(out!.why).toBe('2 drills across 2 keys — circle-of-fourths order');
  });
});
