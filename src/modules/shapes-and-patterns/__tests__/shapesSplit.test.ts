// @vitest-environment jsdom
/**
 * Pins the key-by-key reshape contract:
 *
 *   Scales warm-up segment (block ≥ 15 min) — FIRST:
 *     · 5 min budget for 15–30 min blocks, 8 min for 30+ min blocks
 *     · per-key ladder: major (30s) → major-pent (30s) → nat-min
 *       (90s) → min-pent (30s); rel-maj is NOT a separate cell
 *     · key priority: active-song keys first, then circle-of-4ths
 *       from least-recently-touched scale key with due cells
 *     · capped at 2 keys
 *     · pent cells fan out to one starting point per key (default '1')
 *     · scale time is carved off the top before the walk truncates
 *
 *   Chord-shape walk segment:
 *     · starting key = least-recently-touched key with due cells
 *     · walk circle-of-fourths from there
 *     · within each key, tier ASC → quality declaration order →
 *       inversion order (root → inv1 → inv2 → inv3 → fluid)
 *     · truncate to plannedSeconds budget (≈90 s root/inv, 120 s fluid)
 *     · drop cells whose quality is above the unlocked tier
 *     · label = "Quality1, Quality2 · KeyA, KeyB"
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
// Scales warm-up segment
// -----------------------------------------------------------------

describe('shapeShapesBlock — Scales warm-up segment', () => {
  it('does NOT surface below 15 min', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 14 * 60 + 59),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs.some(s => s.kind === 'scales')).toBe(false);
  });

  it('surfaces at 15 min with the 5-min short budget', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales');
    expect(scales).toBeDefined();
    expect(scales!.plannedSeconds).toBe(5 * 60);
  });

  it('jumps to the 8-min long budget at 30+ min', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales');
    expect(scales!.plannedSeconds).toBe(8 * 60);
  });

  it('places Scales FIRST and carves the budget off the chord-shape walk', () => {
    // 15-min block = 900 s. Scales takes 300 s → walk gets 600 s.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs[0].kind).toBe('scales');
    expect(segs[1].kind).toBe('shapes-walk');
    expect(segs[0].plannedSeconds + segs[1].plannedSeconds).toBe(15 * 60);
    expect(segs[1].plannedSeconds).toBe(10 * 60);
  });

  it('prioritises active-song keys', () => {
    // Active song key is Eb (no chord shapes in Eb in this setup).
    // Scales should still lead with Eb.
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
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs[0]).toBe('scale:major:Eb');
  });

  it('falls back to circle-of-fourths (cold-start) when no active songs + no rows exist', () => {
    // No songs, no spacingState scale rows → starts at C (the
    // circle-of-fourths root).
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs[0]).toBe('scale:major:C');
  });

  it('leads with the least-recently-touched scale key with due cells', () => {
    // Three scale rows: Bb is oldest with a due cell; C + F are
    // newer. Algorithm should pick Bb to lead.
    const rows = [
      row('scale:major:C', { lastEngagedAt: NOW - 1_000, nextDueAt: NOW - 100 }),
      row('scale:major:F', { lastEngagedAt: NOW - 5_000, nextDueAt: NOW + 1_000 }),
      row('scale:major:Bb', { lastEngagedAt: NOW - 10_000, nextDueAt: NOW - 100 }),
    ];
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs[0]).toBe('scale:major:Bb');
  });

  it('caps at 2 keys even when active songs supply more', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C', 'F', 'Bb', 'Eb'],
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    const distinctKeys = new Set(
      scales.itemRefs
        .map(ref => parseScaleKeyName(ref))
        .filter((k): k is string => k !== null),
    );
    expect(distinctKeys.size).toBeLessThanOrEqual(2);
  });

  it('drills the four-scale ladder per key in design order; rel-maj is NOT a separate cell', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    // 5-min budget = 300 s. Single-key ladder = 30+30+90+30 = 180 s
    // for one key, leaving 120 s for the next key — fits another
    // ladder partially before the next key is added.
    expect(scales.itemRefs.slice(0, 4)).toEqual([
      'scale:major:C',
      'scale:major-pentatonic:1:C',
      'scale:natural-minor:C',
      'scale:minor-pentatonic:1:C',
    ]);
    // Defensive: no rel-maj itemRef shape in the output.
    for (const ref of scales.itemRefs) {
      expect(ref.startsWith('scale:relative-major:')).toBe(false);
    }
  });

  it('uses the default pent starting point (1) when no spacingState row exists', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs).toContain('scale:major-pentatonic:1:C');
    expect(scales.itemRefs).toContain('scale:minor-pentatonic:1:C');
  });

  it('prefers the most-due pent starting point when rows exist', () => {
    // Two major-pent sps in C: '1' was practiced more recently
    // than '5'. The segment should drill '5' (the older one).
    const rows = [
      row('scale:major-pentatonic:1:C', { lastEngagedAt: NOW - 1_000 }),
      row('scale:major-pentatonic:5:C', { lastEngagedAt: NOW - 10_000 }),
    ];
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx(rows, { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs).toContain('scale:major-pentatonic:5:C');
    expect(scales.itemRefs).not.toContain('scale:major-pentatonic:1:C');
  });

  it('builds a "Scales · KEYS (ladder)" label', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.label).toMatch(/^Scales · C/);
    expect(scales.label).toMatch(/major/);
    expect(scales.label).toMatch(/natural min/);
    expect(scales.label).toMatch(/minor pent/);
  });

  it('why-text counts reps and keys in the warm-up framing', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.why).toContain('warm-up');
    expect(scales.why).toMatch(/\d+ scale reps?/);
  });

  it('Scales segment surfaces alone when the block has no chord-shape items', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('scales');
  });
});

// Helper: extract the key name from a 3- or 4-part scale itemRef.
function parseScaleKeyName(itemRef: string): string | null {
  const parts = itemRef.split(':');
  if (parts[0] !== 'scale') return null;
  if (parts.length === 3) return parts[2];
  if (parts.length === 4) return parts[3];
  return null;
}
