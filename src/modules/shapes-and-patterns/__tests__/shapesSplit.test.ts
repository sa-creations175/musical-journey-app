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
    /** Active-Scales-goal proportional budget. `null` (default) ⇒
     *  no goal, fixed 5/8-min fallback path. A number ⇒ goal-aware
     *  proportional path (clamped at min(20 % block, 20 min)). */
    scalesGoalDueSeconds?: number | null;
  } = {},
): ShapesSplitContext {
  return {
    rowsByItemRef: new Map(rows.map(r => [r.itemRef, r])),
    unlockedTier: options.unlockedTier ?? 4,
    now: options.now ?? NOW,
    activeSongKeys: options.activeSongKeys ?? [],
    scalesGoalDueSeconds: options.scalesGoalDueSeconds ?? null,
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

  it('builds a "CHORD SHAPES — drill QUALITIES · KEYS (inversion descriptor)" label', () => {
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
    expect(segs[0].label).toBe(
      'CHORD SHAPES — drill major, minor · C, F (root position, inversions + fluid)',
    );
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

  it('caps at 3 keys even when active songs supply more', () => {
    // Raised from 2 to 3 so users with 3+ active songs in distinct
    // keys see them all reflected in the warm-up.
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
    expect(distinctKeys.size).toBeLessThanOrEqual(3);
    // And actually reaches 3 when supply allows.
    expect(distinctKeys.size).toBe(3);
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

  it('builds a "SCALES — KEYS (families)" label', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.label.startsWith('SCALES — C')).toBe(true);
    expect(scales.label).toContain('major');
    expect(scales.label).toContain('minor');
    expect(scales.label).toContain('pentatonics');
    // No longer surfaces the kind-specific "natural min" / "minor
    // pent" phrasing — those collapse into the plain-language list.
    expect(scales.label).not.toMatch(/natural min/);
    expect(scales.label).not.toMatch(/minor pent/);
  });

  it('multi-key labels join keys with ", " in the SCALES header', () => {
    // 30-min block with 3 active song keys — the cap fills with the
    // active keys in order, no circle-of-4ths fallback needed.
    const segs = shapeShapesBlock(
      block([], 30 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['B', 'Gb', 'A'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.label.startsWith('SCALES — B, Gb, A (')).toBe(true);
  });

  it('why-text names active songs when titles are supplied', () => {
    const titlesByKey = new Map<string, ReadonlyArray<string>>([
      ['B', ['I Want You Around']],
      ['Gb', ['Mirror']],
    ]);
    const segs = shapeShapesBlock(
      block([], 30 * 60),
      {
        rowsByItemRef: new Map(),
        unlockedTier: 1,
        now: NOW,
        activeSongKeys: ['B', 'Gb'],
        activeSongTitlesByKey: titlesByKey,
        scalesGoalDueSeconds: null,
      },
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.why).toContain('active song keys');
    expect(scales.why).toContain('B (I Want You Around)');
    expect(scales.why).toContain('Gb (Mirror)');
    expect(scales.why).toContain(' and ');
  });

  it('why-text falls back to bare keys when no titles are supplied', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.why).toContain('Drilling parallel major/minor scales');
    expect(scales.why).toContain('C');
    expect(scales.why).not.toContain('(');
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

// -----------------------------------------------------------------
// Goal-aware proportional budget (Scales coverage goal active)
// -----------------------------------------------------------------

describe('shapeShapesBlock — Scales goal-aware proportional budget', () => {
  it('uses the goal due-seconds when smaller than the 20% block cap', () => {
    // 30 min block. Active Scales goal with 180 s of due cells.
    // 20 % cap = 360 s. Floor (proportional branch) is 0. Budget
    // should be 180 s (the goal value, since it's under the cap).
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: 180,
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(180);
  });

  it('clamps a large goal-due to 20% of the block', () => {
    // 60 min block. Goal due-seconds way over the cap.
    // 20 % cap = 720 s. 20-min absolute cap = 1200 s.
    // Lower (720) wins.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 60 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: 9999,
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(720);
  });

  it('clamps at the 20-min absolute ceiling on very large blocks', () => {
    // 3-hour block. 20 % = 36 min, but the 20-min absolute ceiling
    // wins → 1200 s.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 3 * 60 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: 9999,
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(20 * 60);
  });

  it('returns null Scales segment when goal due-seconds is 0', () => {
    // Active Scales goal but everything's been practised today.
    // No warm-up surfaces — honest signal "no scale work today".
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: 0,
      }),
    );
    expect(segs.some(s => s.kind === 'scales')).toBe(false);
  });

  it('falls back to the fixed 5-min budget when no Scales goal exists', () => {
    // scalesGoalDueSeconds = null (default) → fixed path.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(5 * 60);
  });

  it('still carves the goal-aware budget off the chord-shape walk', () => {
    // 30 min block. Goal due-seconds = 240 s. Cap = 360 s. Budget
    // = 240 s. Walk gets the remaining 1560 s.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: 240,
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    const walk = segs.find(s => s.kind === 'shapes-walk')!;
    expect(scales.plannedSeconds).toBe(240);
    expect(scales.plannedSeconds + walk.plannedSeconds).toBe(30 * 60);
  });
});

// -----------------------------------------------------------------
// Voice-leading three-way 25 / 50 / 25 split
// -----------------------------------------------------------------

describe('shapeShapesBlock — VL three-way split', () => {
  it('fires the 25/50/25 split when the block carries vl: items + block ≥ 15 min', () => {
    const block30min = block(
      [
        'chord-shape:maj:C:root',
        'vl:aba-251:level1:A:C',
        'vl:aba-251:level2:A:F',
      ],
      30 * 60,
    );
    const segs = shapeShapesBlock(
      block30min,
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs.map(s => s.kind)).toEqual(['scales', 'shapes-walk', 'voice-leading']);
    const total = segs.reduce((acc, s) => acc + s.plannedSeconds, 0);
    expect(total).toBe(30 * 60);
    const [scales, walk, vl] = segs;
    expect(scales.plannedSeconds).toBe(Math.floor(30 * 60 * 0.25));
    expect(walk.plannedSeconds).toBe(Math.floor(30 * 60 * 0.50));
    expect(vl.plannedSeconds).toBe(30 * 60 - scales.plannedSeconds - walk.plannedSeconds);
  });

  it('falls back to the 30/70 (Scales + walk) path when no VL items are in the block', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    // No VL segment.
    expect(segs.some(s => s.kind === 'voice-leading')).toBe(false);
    const scales = segs.find(s => s.kind === 'scales')!;
    // Existing fixed budget (8 min for 30-min block) — unchanged.
    expect(scales.plannedSeconds).toBe(8 * 60);
  });

  it('stays on the two-segment path when block < 15 min even with VL items', () => {
    const segs = shapeShapesBlock(
      block(
        ['chord-shape:maj:C:root', 'vl:aba-251:level1:A:C'],
        14 * 60 + 59,
      ),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.some(s => s.kind === 'voice-leading')).toBe(false);
    expect(segs.some(s => s.kind === 'scales')).toBe(false);
  });

  it('VL segment surfaces a label of the form "VOICE LEADING — drill PATTERNS · KEYS"', () => {
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'vl:aba-251:level1:A:C',
          'vl:dim7:up:min9:F',
        ],
        30 * 60,
      ),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.label.startsWith('VOICE LEADING — drill ')).toBe(true);
    // Both pattern labels in the line (catalog has the official copy).
    expect(vl.label).toMatch(/2-5-1/);
    expect(vl.label).toMatch(/dim7/);
    expect(vl.label).toContain('C');
    expect(vl.label).toContain('F');
  });

  it('VL why-text reads "N drills across M keys — most-due first"', () => {
    const segs = shapeShapesBlock(
      block(
        ['chord-shape:maj:C:root', 'vl:aba-251:level1:A:C'],
        30 * 60,
      ),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.why).toMatch(/^\d+ drill/);
    expect(vl.why).toContain('most-due first');
  });

  it('VL cells are ordered by least-recently-engaged first', () => {
    const rows = [
      row('vl:aba-251:level1:A:C', { lastEngagedAt: NOW - 1_000 }),   // newest
      row('vl:aba-251:level1:A:F', { lastEngagedAt: NOW - 10_000 }),  // oldest
      // 'vl:aba-251:level1:A:Bb' has no row → null lastEngagedAt → top priority
    ];
    const segs = shapeShapesBlock(
      block(
        [
          'vl:aba-251:level1:A:C',
          'vl:aba-251:level1:A:F',
          'vl:aba-251:level1:A:Bb',
        ],
        30 * 60,
      ),
      ctx(rows, { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs[0]).toBe('vl:aba-251:level1:A:Bb');
    expect(vl.itemRefs[1]).toBe('vl:aba-251:level1:A:F');
    expect(vl.itemRefs[2]).toBe('vl:aba-251:level1:A:C');
  });

  it('drops legacy 3-part vl: refs that no longer parse against the strict catalog', () => {
    // `vl:aba-251:C` is the pre-Phase-1 shape — parseVoiceLeadingItemRef
    // returns null, so the splitter should skip it without crashing.
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'vl:aba-251:C',                   // legacy — drop
          'vl:aba-251:level1:A:C',          // valid
        ],
        30 * 60,
      ),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs).toEqual(['vl:aba-251:level1:A:C']);
  });

  it('three-way split runs even when there are no chord-shape items (walk returns null)', () => {
    const segs = shapeShapesBlock(
      block(['vl:aba-251:level1:A:C'], 30 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    expect(segs.map(s => s.kind)).toEqual(['scales', 'voice-leading']);
    // Walk slot's planned seconds aren't redistributed — segments keep
    // their declared proportions even when one is empty.
    const scales = segs.find(s => s.kind === 'scales')!;
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(scales.plannedSeconds).toBe(Math.floor(30 * 60 * 0.25));
    expect(vl.plannedSeconds).toBe(30 * 60 - scales.plannedSeconds - Math.floor(30 * 60 * 0.50));
  });

  it('three-way path bypasses the Scales goal-proportional budget rules', () => {
    // Existing 2-segment path: goal-due 180 s would clamp scales to 180 s.
    // 3-segment path: scales is fixed at 25 % regardless of the goal value.
    const segs = shapeShapesBlock(
      block(
        ['chord-shape:maj:C:root', 'vl:aba-251:level1:A:C'],
        30 * 60,
      ),
      ctx([], {
        unlockedTier: 1,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: 180,
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(Math.floor(30 * 60 * 0.25)); // 450, not 180
  });
});

// -----------------------------------------------------------------
// SotM-keyed walk (Phase 1 of the key-ordering rule)
// -----------------------------------------------------------------

describe('shapeShapesBlock — Phase 1 SotM-keyed walk', () => {
  it('leads with the SotM anchor key regardless of activeSongKeys', () => {
    // SotM anchor = B. activeSongKeys lists C first, but the SotM
    // anchor wins in Phase 1.
    const segs = shapeShapesBlock(
      block([], 30 * 60),
      {
        rowsByItemRef: new Map(),
        unlockedTier: 1,
        now: NOW,
        activeSongKeys: ['C'],
        scalesGoalDueSeconds: null,
        sotmAnchorKey: 'B',
      },
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(parseScaleKeyName(scales.itemRefs[0])).toBe('B');
  });

  it('walks circle-of-4ths from the SotM anchor to fill the cap', () => {
    // Anchor B → walk circle-of-4ths: B → E → A.
    const segs = shapeShapesBlock(
      block([], 30 * 60),
      {
        rowsByItemRef: new Map(),
        unlockedTier: 1,
        now: NOW,
        activeSongKeys: [],
        scalesGoalDueSeconds: null,
        sotmAnchorKey: 'B',
      },
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    const keys = Array.from(new Set(
      scales.itemRefs
        .map(ref => parseScaleKeyName(ref))
        .filter((k): k is string => k !== null),
    ));
    expect(keys).toEqual(['B', 'E', 'A']);
  });

  it('Phase 2 (no SotM anchor) preserves the activeSongKeys-led path', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1, activeSongKeys: ['C'] }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(parseScaleKeyName(scales.itemRefs[0])).toBe('C');
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
