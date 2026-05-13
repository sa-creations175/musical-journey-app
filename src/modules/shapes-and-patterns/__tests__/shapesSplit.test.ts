// @vitest-environment jsdom
/**
 * Pins the key-by-key reshape contract from Phase 1 Parts 2 + 3:
 *
 *   Chord-shape walk segment:
 *     · starting key = least-recently-touched key with due cells
 *     · walk circle-of-fourths from there
 *     · within each key, tier ASC → quality declaration order →
 *       inversion order (root → inv1 → inv2 → inv3 → fluid)
 *     · truncate to plannedSeconds budget (≈90 s root/inv, 120 s fluid)
 *     · drop cells whose quality is above the unlocked tier
 *     · label = "Quality1, Quality2 · KeyA, KeyB"
 *
 *   Scale warm-down segment (block ≥ 15 min):
 *     · 5 min budget for 15–30 min blocks, 8 min for 30+ min blocks
 *     · drills major / major-pent / nat-min / min-pent / rel-maj
 *       per key, capped at 2 keys
 *     · priority keys = active-song keys, fallback to walk keys
 *     · scale time is subtracted from the chord-shape walk budget
 *     · itemRef format: `scale:{kind}:{keyName}`
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
  options: {
    unlockedTier?: 1 | 2 | 3 | 4;
    now?: number;
    activeSongKeys?: ReadonlyArray<string>;
  } = {},
): ShapesSplitContext {
  return {
    rowsByItemRef: new Map(rows.map(r => [r.itemRef, r])),
    unlockedTier: options.unlockedTier ?? 4,
    now: options.now ?? NOW,
    activeSongKeys: options.activeSongKeys ?? [],
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

// -----------------------------------------------------------------
// Chord-shape walk
// -----------------------------------------------------------------

describe('shapeShapesBlock — chord-shape walk segment', () => {
  it('returns an empty array when the block has no chord-shape items', () => {
    // Algorithm picked nothing-shaped (or non-chord-shape kinds),
    // AND the block is under the scale-warm-down threshold so the
    // warm-down doesn't fire either.
    expect(shapeShapesBlock(block([], 600), ctx([]))).toEqual([]);
    expect(
      shapeShapesBlock(block(['scale:major:C'], 600), ctx([])),
    ).toEqual([]);
  });

  it('drops cells whose quality is above the unlocked tier', () => {
    // T1 only unlocked → maj7 (T2) and dom7b9 (T4) drop. maj (T1) stays.
    // 600 s block is below the 15-min scale threshold so no
    // scale segment.
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'chord-shape:maj7:C:root',
          'chord-shape:dom7b9:C:root',
        ],
        600,
      ),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('shapes-walk');
    expect(segs[0].itemRefs).toEqual(['chord-shape:maj:C:root']);
  });

  it('walks circle-of-fourths from the starting key', () => {
    const rows = [
      row('chord-shape:maj:C:root', { lastEngagedAt: NOW - 10_000 }),
      row('chord-shape:maj:F:root', { lastEngagedAt: NOW - 5_000 }),
      row('chord-shape:maj:Bb:root', { lastEngagedAt: NOW - 1_000 }),
    ];
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:Bb:root',
          'chord-shape:maj:F:root',
          'chord-shape:maj:C:root',
        ],
        600,
      ),
      ctx(rows, { unlockedTier: 1 }),
    );
    expect(segs[0].itemRefs).toEqual([
      'chord-shape:maj:C:root',
      'chord-shape:maj:F:root',
      'chord-shape:maj:Bb:root',
    ]);
  });

  it('within a key, sorts by tier ASC → quality rank ASC → inversion order', () => {
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
    // 8 cells × ~90 s + 1 fluid at 120 s = 750 s — give a 14:59
    // block (just below the scale threshold) so the whole walk
    // fits without the scale segment kicking in.
    const segs = shapeShapesBlock(block(itemRefs, 14 * 60 + 59), ctx([], { unlockedTier: 2 }));
    expect(segs[0].itemRefs).toEqual([
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
    const rows = [
      row('chord-shape:maj:C:root', {
        lastEngagedAt: NOW - 1_000,
        nextDueAt: NOW + 1_000,
      }),
      row('chord-shape:maj:F:root', {
        lastEngagedAt: NOW - 5_000,
        nextDueAt: NOW - 100, // due
      }),
      row('chord-shape:maj:Bb:root', {
        lastEngagedAt: NOW - 10_000,
        nextDueAt: NOW + 1_000,
      }),
    ];
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'chord-shape:maj:F:root',
          'chord-shape:maj:Bb:root',
        ],
        600,
      ),
      ctx(rows, { unlockedTier: 1 }),
    );
    expect(segs[0].itemRefs[0]).toBe('chord-shape:maj:F:root');
  });

  it('falls back to oldest lastEngagedAt when no key has due cells', () => {
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
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root', 'chord-shape:maj:Bb:root'], 600),
      ctx(rows, { unlockedTier: 1 }),
    );
    expect(segs[0].itemRefs[0]).toBe('chord-shape:maj:Bb:root');
  });

  it('truncates the walk to plannedSeconds (≈ 90 s root, 120 s fluid)', () => {
    const itemRefs = [
      'chord-shape:maj:C:root',
      'chord-shape:maj:F:root',
      'chord-shape:maj:Bb:root',
      'chord-shape:maj:Eb:root',
      'chord-shape:maj:Ab:root',
      'chord-shape:maj:Db:root',
    ];
    const segs = shapeShapesBlock(block(itemRefs, 300), ctx([], { unlockedTier: 1 }));
    expect(segs[0].itemRefs.length).toBeLessThanOrEqual(4);
    expect(segs[0].itemRefs.length).toBeGreaterThanOrEqual(3);
    expect(segs[0].itemRefs[0]).toBe('chord-shape:maj:C:root');
    expect(segs[0].itemRefs[1]).toBe('chord-shape:maj:F:root');
  });

  it('always keeps at least one cell even if a single cell exceeds the budget', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 50),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs[0].itemRefs).toEqual(['chord-shape:maj:C:root']);
  });

  it('builds a human label naming the qualities and keys in walk order', () => {
    const rows = [
      row('chord-shape:maj:C:root', { lastEngagedAt: NOW - 5_000 }),
      row('chord-shape:maj:F:root', { lastEngagedAt: NOW - 1_000 }),
      row('chord-shape:min:C:root', { lastEngagedAt: NOW - 1_000 }),
    ];
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'chord-shape:min:C:root',
          'chord-shape:maj:F:root',
        ],
        600,
      ),
      ctx(rows, { unlockedTier: 1 }),
    );
    expect(segs[0].label).toBe('Major, Minor · C, F');
  });

  it('returns a "drills across N keys — circle-of-fourths order" why snippet', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root', 'chord-shape:maj:F:root'], 600),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs[0].why).toBe(
      '2 drills across 2 keys — circle-of-fourths order',
    );
  });
});

// -----------------------------------------------------------------
// Scale warm-down
// -----------------------------------------------------------------

describe('shapeShapesBlock — scale warm-down segment', () => {
  it('does NOT surface below 15 min', () => {
    // 14:59 block → no scale segment.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 14 * 60 + 59),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs.some(s => s.kind === 'scale-warm-down')).toBe(false);
  });

  it('surfaces at 15 min with the 5-min short budget', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down');
    expect(scale).toBeDefined();
    expect(scale!.plannedSeconds).toBe(5 * 60);
  });

  it('jumps to the 8-min long budget at 30+ min', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down');
    expect(scale!.plannedSeconds).toBe(8 * 60);
  });

  it('subtracts the scale budget from the chord-shape walk budget', () => {
    // 15-min block = 900 s. Scale takes 300 s → walk gets 600 s.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const walk = segs.find(s => s.kind === 'shapes-walk');
    const scale = segs.find(s => s.kind === 'scale-warm-down');
    expect(walk!.plannedSeconds + scale!.plannedSeconds).toBe(15 * 60);
    expect(walk!.plannedSeconds).toBe(10 * 60);
  });

  it('prioritises active-song keys for the scale segment', () => {
    // Block has C / F / Bb chord shapes; active song key is Eb
    // (not in the walk). Scale segment should drill Eb first.
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'chord-shape:maj:F:root',
          'chord-shape:maj:Bb:root',
        ],
        15 * 60,
      ),
      ctx([], { unlockedTier: 1, activeSongKeys: ['Eb'] }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down')!;
    expect(scale.itemRefs[0]).toBe('scale:major:Eb');
  });

  it('falls back to walk keys when no active songs exist', () => {
    // No songs → uses the first chord-shape walk key (C in this
    // setup).
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root', 'chord-shape:maj:F:root'], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down')!;
    // C is the starting walk key (circle-of-fourths index 0) →
    // first scale itemRef is `scale:major:C`.
    expect(scale.itemRefs[0]).toBe('scale:major:C');
  });

  it('caps at 2 keys', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C', 'F', 'Bb', 'Eb'],
      }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down')!;
    const distinctKeys = new Set(
      scale.itemRefs.map(ref => ref.split(':')[2]),
    );
    expect(distinctKeys.size).toBeLessThanOrEqual(2);
  });

  it('drills the parallel set per key in the design-doc order', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down')!;
    // 5-min budget covers all 5 scales for one key
    // (30+30+90+90+30 = 270 s ≤ 300 s).
    expect(scale.itemRefs).toEqual([
      'scale:major:C',
      'scale:major-pentatonic:C',
      'scale:natural-minor:C',
      'scale:minor-pentatonic:C',
      'scale:relative-major:C',
    ]);
  });

  it('builds a label naming the keys + scale steps', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down')!;
    expect(scale.label).toMatch(/Scale warm-down · C/);
    // Step labels are joined with ' / '.
    expect(scale.label).toMatch(/major/);
    expect(scale.label).toMatch(/rel maj/);
  });

  it('annotates the relative-major mapping in the why-text for single-key segments', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scale = segs.find(s => s.kind === 'scale-warm-down')!;
    // Cm relative major = Eb.
    expect(scale.why).toContain('Eb');
    expect(scale.why).toContain('relative major of C');
  });

  it('block ≥ 15 min with no chord-shape items still surfaces the scale segment alone', () => {
    // Caller's algorithm produced an S&P block with only scale
    // itemRefs (or nothing). The reshape returns the scale
    // segment alone when there are no chord-shape items to walk.
    // Active song keys → scale picks those.
    const segs = shapeShapesBlock(
      block(['scale:major:C'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('scale-warm-down');
  });
});
