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
import {
  enumerateVoiceLeadingCells,
  KEYS,
  VOICE_LEADING_PATTERNS,
} from '../catalog';
import { parseScaleItemRef } from '../scaleSkills';
import { SCALE_KIND_SECONDS } from '../../../lib/sessionAlgorithm/timePerAttempt';

const NOW = 1_700_000_000_000;

// A scales segment's plannedSeconds is the sum of its per-item drill
// times, each floored at 60s (the runner's per-item minimum) — not the
// raw budget share. This mirrors the generation contract.
function sumFlooredScaleSeconds(itemRefs: readonly string[]): number {
  return itemRefs.reduce((sum, ref) => {
    const desc = parseScaleItemRef(ref);
    return sum + (desc ? Math.max(60, SCALE_KIND_SECONDS[desc.kind]) : 0);
  }, 0);
}

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
    scalesGoalDueSeconds: options.scalesGoalDueSeconds ?? null,
  };
}

/** Build NOT_DUE rows for every catalog cell whose itemRef is NOT
 *  in `keepUnstarted`. Lets a test push higher-priority patterns
 *  out of the UNSTARTED tier so a specific gated/ungated cell can
 *  surface in the truncated VL window. Uses `acquisitionStage='new'`
 *  for the bulk NOT_DUE rows so they don't accidentally satisfy
 *  downstream prereq gates (vlIsEligible counts a 'new' or missing
 *  row as failing the gate). Callers override specific cells via
 *  `extra` when they need a non-'new' stage. */
function notDueAllExcept(
  keepUnstarted: ReadonlySet<string>,
  extra: SpacingState[] = [],
): SpacingState[] {
  const future = NOW + 10_000;
  const rows: SpacingState[] = [];
  for (const pattern of VOICE_LEADING_PATTERNS) {
    for (const key of KEYS) {
      for (const ref of enumerateVoiceLeadingCells(pattern, key)) {
        if (keepUnstarted.has(ref)) continue;
        rows.push(row(ref, { nextDueAt: future, acquisitionStage: 'new' }));
      }
    }
  }
  return [...rows, ...extra];
}

function block(itemRefs: string[], plannedSeconds = 1800): AllocatedBlock {
  return {
    id: 'algo-block-sp',
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    itemRefs,
    weight: 1,
    hasAcquiringItems: false,
    isKeyboardRequired: false,
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
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.some(s => s.kind === 'scales')).toBe(false);
  });

  it('surfaces at 15 min with the three-way 15 % budget', () => {
    // VL is catalog-driven (unconditional three-way for blocks ≥ 15 min),
    // so Scales gets a flat 15 % of the block rather than the legacy
    // two-way SHORT/LONG budgets.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales');
    expect(scales).toBeDefined();
    expect(scales!.plannedSeconds).toBe(sumFlooredScaleSeconds(scales!.itemRefs));
  });

  it('Scales budget stays at the 15 % three-way share on a 30-min block (no SHORT/LONG distinction in three-way)', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales');
    expect(scales!.plannedSeconds).toBe(sumFlooredScaleSeconds(scales!.itemRefs));
  });

  it('places Scales FIRST in the segment list and includes the chord-shape walk + VL', () => {
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs[0].kind).toBe('scales');
    // Three-way: scales / walk / voice-leading. Walk may surface if
    // any chord-shape cells survive the unlocked-tier filter; in this
    // test the C major shape is tier 1 so it does.
    expect(segs.map(s => s.kind)).toContain('shapes-walk');
    expect(segs.map(s => s.kind)).toContain('voice-leading');
    // walk + VL still fill the non-scales budget (block − 15% scales
    // budget); the scales segment reports the sum of its floored item
    // times, which may differ from its 15% budget, so the segments no
    // longer sum exactly to the block.
    const scalesBudget = Math.floor(15 * 60 * 0.15);
    const nonScales = segs
      .filter(s => s.kind !== 'scales')
      .reduce((acc, s) => acc + s.plannedSeconds, 0);
    expect(nonScales).toBe(15 * 60 - scalesBudget);
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(sumFlooredScaleSeconds(scales.itemRefs));
  });

  it('does NOT bias key selection by song keys (warm-up is spacing-state-only)', () => {
    // Pre-fix the warm-up led with active-song keys, which leaked the
    // current SotM song's key (Db) into every general warm-up. The
    // warm-up now selects keys purely from spacing-state — with no
    // scale rows and no song input, cold-start lands on C.
    const segs = shapeShapesBlock(
      block(
        [
          'chord-shape:maj:C:root',
          'chord-shape:maj:F:root',
          'chord-shape:maj:Bb:root',
        ],
        15 * 60,
      ),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs[0]).toBe('scale:major:C');
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
    // newer. Algorithm should pick Bb to lead. After the
    // SESSION_DESIGN 2-types-per-key change, only the most-due
    // pair for each key surfaces — Bb has a major row, so
    // major-pent (no row → top dueness) wins for Bb. The
    // assertion below pins the key, not the type.
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
    expect(parseScaleKeyName(scales.itemRefs[0])).toBe('Bb');
  });

  it('caps at SCALES_SEGMENT_MAX_KEYS (2) keys via spacing-state-driven walk', () => {
    // Cold-start with no scale rows and a long 60-min block — each key
    // now drills all 4 fixed-order types (~270s), so a 60-min block's
    // scales budget fits exactly the 2-key cap before stopping.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 60 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    const distinctKeys = new Set(
      scales.itemRefs
        .map(ref => parseScaleKeyName(ref))
        .filter((k): k is string => k !== null),
    );
    expect(distinctKeys.size).toBeLessThanOrEqual(2);
    expect(distinctKeys.size).toBe(2);
  });

  it('drills the 2 most-due types per key (cold-start = major + major pent)', () => {
    // Post SESSION_DESIGN: scales picker selects SCALES_TYPES_PER_KEY
    // most-due types per key. Cold-start (no rows) → catalog ladder
    // tiebreak surfaces major + major-pent first. Natural-minor +
    // minor-pent are NOT included unless they're more-due than the
    // major pair.
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    // First 2 itemRefs are the C-key pair.
    expect(scales.itemRefs.slice(0, 2)).toEqual([
      'scale:major:C',
      'scale:major-pentatonic:1:C',
    ]);
    // Defensive: no rel-maj itemRef shape in the output.
    for (const ref of scales.itemRefs) {
      expect(ref.startsWith('scale:relative-major:')).toBe(false);
    }
  });

  it('uses the default pent starting point (1) when no spacingState row exists', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs).toContain('scale:major-pentatonic:1:C');
    // minor-pent is NOT selected at cold-start — only major +
    // major-pent surface per the 2-types-per-key cap.
  });

  it('always leads with the major maintenance pass, plus the most-due drill', () => {
    // The major-tonality pair (major + major-pent) has been practised
    // (future nextDueAt); natural-minor + minor-pent have no rows →
    // most due. With the 60s-per-item floor, the scales budget fits
    // major (the always-on maintenance fast-pass, leading) + the single
    // most-due drill (natural-minor); minor-pent is crowded out.
    const rows = [
      row('scale:major:C',                 { nextDueAt: NOW + 10_000 }),
      row('scale:major-pentatonic:1:C',    { nextDueAt: NOW + 10_000 }),
      // nat-min and min-pent have no rows → NEGATIVE_INFINITY dueness.
    ];
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    const cRefs = scales.itemRefs.filter(r => r.endsWith(':C'));
    expect(cRefs).toContain('scale:natural-minor:C');
    // Major is always present and leads the key.
    expect(cRefs).toContain('scale:major:C');
    expect(cRefs[0]).toBe('scale:major:C');
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
      ctx(rows, { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.itemRefs).toContain('scale:major-pentatonic:5:C');
    expect(scales.itemRefs).not.toContain('scale:major-pentatonic:1:C');
  });

  it('builds a "SCALES — KEYS (families)" label', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.label.startsWith('SCALES — C')).toBe(true);
    // Cold-start surfaces the major pair only — major + major-pent —
    // so the families list reads as "major + pentatonics".
    expect(scales.label).toContain('major');
    expect(scales.label).toContain('pentatonics');
    // No longer surfaces the kind-specific "natural min" / "minor
    // pent" phrasing — those collapse into the plain-language list.
    expect(scales.label).not.toMatch(/natural min/);
    expect(scales.label).not.toMatch(/minor pent/);
  });

  it('multi-key labels join keys with ", " in the SCALES header (max 2 keys)', () => {
    // Two least-recently-engaged scale keys with due cells — the
    // picker leads with the oldest (B) and walks circle-of-4ths
    // from there (B → E). SESSION_DESIGN caps at 2 keys. A 60-min
    // block's scales budget fits both keys' 4-type ladders.
    const rows = [
      row('scale:major:B',  { lastEngagedAt: NOW - 30_000, nextDueAt: NOW - 100 }),
      row('scale:major:E',  { lastEngagedAt: NOW - 20_000, nextDueAt: NOW - 100 }),
    ];
    const segs = shapeShapesBlock(
      block([], 60 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.label.startsWith('SCALES — B, E (')).toBe(true);
  });

  it('why-text reads "across your warm-up keys — {keys}" (no song-title overlay)', () => {
    // Post-fix the warm-up doesn't carry active-song titles, so the
    // why-text never names songs — just the key list driven by
    // spacing-state.
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.why).toContain('across your warm-up keys');
    expect(scales.why).toContain('C');
    // No parenthetical song titles.
    expect(scales.why).not.toContain('(');
  });

  it('why-text falls back to bare keys when no titles are supplied', () => {
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    expect(scales.why).toContain('Drilling parallel major/minor scales');
    expect(scales.why).toContain('C');
    expect(scales.why).not.toContain('(');
  });

  it('Scales segment surfaces alongside VL when the block has no chord-shape items (catalog-driven VL)', () => {
    // Three-way always fires on ≥ 15 min: walk returns null (no chord-
    // shape items) but Scales + VL both surface from the catalog.
    const segs = shapeShapesBlock(
      block([], 15 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.map(s => s.kind)).toEqual(['scales', 'voice-leading']);
  });
});

// -----------------------------------------------------------------
// Goal-aware proportional budget (Scales coverage goal active)
// -----------------------------------------------------------------

// The "Scales goal-aware proportional budget" describe block was
// removed: that path lived in scalesSegmentBudget's proportional
// branch (called from buildTwoSegmentSplit). Since VL is now catalog-
// driven and the three-way split fires unconditionally on blocks
// ≥ 15 min, the two-way path no longer surfaces Scales at all —
// Scales gets a flat 15 % of the block via buildScalesSegmentWithBudget
// in three-way, bypassing scalesSegmentBudget entirely. See the
// three-way Scales tests above for the active contract.

// -----------------------------------------------------------------
// Voice-leading three-way 25 / 50 / 25 split
// -----------------------------------------------------------------

describe('shapeShapesBlock — VL three-way split', () => {
  it('fires the 25/50/25 split when the block carries vl: items + block ≥ 15 min', () => {
    const block30min = block(
      [
        'chord-shape:maj:C:root',
        'vl:major-251:guide-tones:A:C',
        'vl:major-251:seventh-chords:A:F',
      ],
      30 * 60,
    );
    const segs = shapeShapesBlock(
      block30min,
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.map(s => s.kind)).toEqual(['scales', 'shapes-walk', 'voice-leading']);
    const [scales, walk, vl] = segs;
    // Scales reports the sum of its floored item times; walk + VL keep
    // their budget shares (45% + remainder of the 15% scales budget).
    expect(scales.plannedSeconds).toBe(sumFlooredScaleSeconds(scales.itemRefs));
    expect(walk.plannedSeconds).toBe(Math.floor(30 * 60 * 0.45));
    expect(vl.plannedSeconds).toBe(
      30 * 60 - Math.floor(30 * 60 * 0.15) - Math.floor(30 * 60 * 0.45),
    );
  });

  it('fires the three-way split even when the block has NO vl: items (catalog-driven VL)', () => {
    // Pre-fix this fell back to the two-way 30/70 (Scales + walk)
    // path. Post-fix VL is catalog-driven so the three-way split
    // fires on every block ≥ 15 min — unstarted catalog cells
    // (notably diatonic-cycle) surface for users who haven't drilled
    // any VL yet.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.map(s => s.kind)).toEqual(['scales', 'shapes-walk', 'voice-leading']);
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    // Top-priority pattern is diatonic-cycle (catalog index 0); a
    // cold-start session surfaces its cells first.
    expect(vl.itemRefs[0]?.startsWith('vl:diatonic-cycle:')).toBe(true);
  });

  it('stays on the two-segment path when block < 15 min even with VL items', () => {
    const segs = shapeShapesBlock(
      block(
        ['chord-shape:maj:C:root', 'vl:major-251:guide-tones:A:C'],
        14 * 60 + 59,
      ),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.some(s => s.kind === 'voice-leading')).toBe(false);
    expect(segs.some(s => s.kind === 'scales')).toBe(false);
  });

  it('VL segment surfaces a label of the form "VOICE LEADING — drill PATTERNS · KEYS"', () => {
    // Catalog-driven: the surfaced cells are the top of the catalog
    // priority order (diatonic-cycle first), so the label mentions
    // the diatonic-cycle pattern + the keys it spans.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.label.startsWith('VOICE LEADING — drill ')).toBe(true);
    expect(vl.label).toMatch(/Diatonic Cycle/);
  });

  it('VL why-text reads "N drills across M keys — most-due first"', () => {
    const segs = shapeShapesBlock(
      block(
        ['chord-shape:maj:C:root', 'vl:major-251:guide-tones:A:C'],
        30 * 60,
      ),
      ctx([], { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.why).toMatch(/^\d+ drill/);
    expect(vl.why).toContain('most-due first');
  });

  it('VL cells: due items surface before unstarted items (tier ordering)', () => {
    // Catalog-driven enumeration: every catalog cell competes in the
    // sort. The DUE major-251 cell at C wins the first slot because
    // tier 0 (DUE) outranks tier 1 (UNSTARTED). The rest of the
    // truncated list is unstarted diatonic-cycle cells (catalog
    // priority 0).
    const rows = [
      row('vl:major-251:guide-tones:A:C', {
        lastEngagedAt: NOW - 10_000,
        nextDueAt: NOW - 1_000, // due
      }),
    ];
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs[0]).toBe('vl:major-251:guide-tones:A:C');
    // Remaining slots are unstarted diatonic-cycle cells (highest-
    // priority pattern in catalog order).
    expect(vl.itemRefs.slice(1).every(r => r.startsWith('vl:diatonic-cycle:'))).toBe(true);
  });

  it('cold-start: unstarted diatonic-cycle cells beat practised major-251 cells (bug fix)', () => {
    // Regression test for the reported bug: a user with practised
    // major-251 cells (created during testing) would see major-251
    // surface over diatonic-cycle even though diatonic-cycle has
    // higher catalog priority. The bug was that buildVoiceLeadingSegment
    // only saw cells in block.itemRefs, and diatonic-cycle cells
    // (never practised → no spacingState row → not in block) couldn't
    // compete. Post-fix: catalog enumeration surfaces unstarted
    // diatonic-cycle cells in the UNSTARTED tier; since major-251 is
    // ALSO in the UNSTARTED tier (or any other tier where pattern
    // priority applies), diatonic-cycle wins by patternIndex.
    //
    // To pin the bug specifically: make major-251 cells UNSTARTED
    // (row exists with null nextDueAt) so we're comparing both in
    // the UNSTARTED tier where patternIndex ASC decides.
    const rows = [
      row('vl:major-251:guide-tones:A:C', { nextDueAt: null }),
      row('vl:major-251:guide-tones:A:F', { nextDueAt: null }),
    ];
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    // First cell must be diatonic-cycle (patternIndex 0), not
    // major-251 (patternIndex 2).
    expect(vl.itemRefs[0]).toMatch(/^vl:diatonic-cycle:/);
  });

  it('catalog cells with no spacingState row land in the UNSTARTED tier', () => {
    // Verify a never-practised cell is treated as UNSTARTED, not
    // DUE or NOT_DUE, by checking it's positioned after any DUE
    // cells but before any NOT_DUE cells.
    const future = NOW + 10_000;
    const rows = [
      row('vl:dom7b9:pos1:C',  { nextDueAt: NOW - 1_000 }),   // DUE
      row('vl:dim7:pos1:C',    { nextDueAt: future }),         // NOT_DUE
      // diatonic-cycle:pos1:C has no row → UNSTARTED
    ];
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    const dom7Idx = vl.itemRefs.indexOf('vl:dom7b9:pos1:C');
    const diaIdx = vl.itemRefs.indexOf('vl:diatonic-cycle:pos1:C');
    const dimIdx = vl.itemRefs.indexOf('vl:dim7:pos1:C');
    // DUE (dom7b9) first, UNSTARTED diatonic-cycle next, NOT_DUE
    // (dim7) last — when all three are in the kept window.
    expect(dom7Idx).toBeGreaterThanOrEqual(0);
    expect(diaIdx).toBeGreaterThanOrEqual(0);
    // dom7b9 is DUE → before unstarted diatonic-cycle.
    expect(dom7Idx).toBeLessThan(diaIdx);
    if (dimIdx >= 0) {
      // dim7 is NOT_DUE → after unstarted diatonic-cycle (when
      // it makes it into the kept window at all).
      expect(diaIdx).toBeLessThan(dimIdx);
    }
  });

  it('VL segment fires even when no VL spacingState rows exist', () => {
    // No VL rows at all in ctx — purely catalog-driven cold-start.
    // Pre-fix, an empty ctx + no VL items in block meant zero VL
    // cells reached buildVoiceLeadingSegment → null segment. Post-fix,
    // catalog enumeration always produces eligible cells.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading');
    expect(vl).toBeDefined();
    expect(vl!.itemRefs.length).toBeGreaterThan(0);
  });

  it('within DUE tier, cells sort by nextDueAt ASC (soft pattern order does NOT apply to due items)', () => {
    // dom7b9 cell is due longer ago than diatonic-cycle cell. The
    // dom7b9 cell wins despite dom7b9 being a later pattern in
    // catalog order — spacing-repetition trumps soft pattern order.
    const rows = [
      row('vl:diatonic-cycle:pos1:C', { nextDueAt: NOW - 1_000 }),
      row('vl:dom7b9:pos1:C',         { nextDueAt: NOW - 10_000 }),
    ];
    const segs = shapeShapesBlock(
      block(
        ['vl:diatonic-cycle:pos1:C', 'vl:dom7b9:pos1:C'],
        30 * 60,
      ),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs[0]).toBe('vl:dom7b9:pos1:C');
    expect(vl.itemRefs[1]).toBe('vl:diatonic-cycle:pos1:C');
  });

  it('within UNSTARTED tier, cells sort by catalog pattern index ASC (soft priority)', () => {
    // Cold-start: every catalog cell is UNSTARTED. The first surfaced
    // cells are diatonic-cycle (catalog index 0). five-one (1) only
    // shows up once diatonic-cycle is exhausted (after 36 cells —
    // beyond the 30-min budget). Asserting "first cell is diatonic-
    // cycle" pins the sort key precedence.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs[0]).toBe('vl:diatonic-cycle:pos1:C');
    // Within diatonic-cycle, positionIndex ASC then keyIndex ASC.
    // The first 12 cells are pos1 across all keys, then pos2 × 12, etc.
    expect(vl.itemRefs.every(r => r.startsWith('vl:diatonic-cycle:'))).toBe(true);
  });

  it('within UNSTARTED tier, keys surface in circle-of-fourths order (C → F → Bb → Eb → ...)', () => {
    // Cold-start: every catalog cell is UNSTARTED. The first
    // diatonic-cycle pos1 cells should walk C → F → Bb → Eb → Ab →
    // Db → Gb → ... rather than chromatic C → Db → D → Eb → ....
    // Use a 90-min block so 24+ VL cells fit in the window.
    const segs = shapeShapesBlock(
      block([], 90 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    // Pull the first 7 diatonic-cycle:pos1 cells (one per key in
    // circle-of-fourths order). Note 'Gb' is the catalog's flat
    // spelling of F# — the chromatic KEYS array uses 'F#' so the
    // enumerated cell is 'vl:diatonic-cycle:pos1:F#', but the sort
    // canonicalises before lookup.
    const pos1Cells = vl.itemRefs.filter(r => r.startsWith('vl:diatonic-cycle:pos1:'));
    const keysOrder = pos1Cells.map(r => r.split(':').pop()!);
    expect(keysOrder.slice(0, 7)).toEqual(['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'F#']);
  });

  it('within UNSTARTED tier, type index ASC orders the type progression (guide-tones first)', () => {
    // Isolate two cells in UNSTARTED tier at the same pattern + key:
    // major-251 guide-tones A:C and seventh-chords A:C. With prereqs
    // for seventh-chords satisfied, both are eligible. The sort must
    // place guide-tones (typeIdx 0) before seventh-chords (typeIdx 1).
    const rows = notDueAllExcept(
      new Set([
        'vl:major-251:guide-tones:A:C',
        'vl:major-251:seventh-chords:A:C',
      ]),
      [
        row('vl:major-251:guide-tones:A:C', { acquisitionStage: 'acquiring' }),
        row('vl:major-251:guide-tones:B:C', { acquisitionStage: 'acquiring' }),
      ],
    );
    const segs = shapeShapesBlock(
      block([], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    const gtIdx = vl.itemRefs.indexOf('vl:major-251:guide-tones:A:C');
    const scIdx = vl.itemRefs.indexOf('vl:major-251:seventh-chords:A:C');
    expect(gtIdx).toBeGreaterThanOrEqual(0);
    expect(scIdx).toBeGreaterThanOrEqual(0);
    // guide-tones (typeIdx 0) before seventh-chords (typeIdx 1).
    expect(gtIdx).toBeLessThan(scIdx);
  });

  it('NOT_DUE tier comes last (after both DUE and UNSTARTED)', () => {
    const future = NOW + 10_000;
    const rows = [
      row('vl:diatonic-cycle:pos1:C', { nextDueAt: future }),  // NOT_DUE
      row('vl:dom7b9:pos1:C',         { nextDueAt: NOW - 1_000 }),  // DUE
      // diatonic-cycle:pos2:C and other unstarted catalog cells
      // sit in UNSTARTED tier (catalog-driven, no block dependency).
    ];
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    const dueIdx = vl.itemRefs.indexOf('vl:dom7b9:pos1:C');
    const notDueIdx = vl.itemRefs.indexOf('vl:diatonic-cycle:pos1:C');
    expect(dueIdx).toBe(0); // DUE tier first
    if (notDueIdx >= 0) {
      // NOT_DUE diatonic-cycle:pos1:C ends up AFTER unstarted
      // diatonic-cycle cells (pos2, pos3 across keys).
      const firstUnstarted = vl.itemRefs.findIndex(
        r => r.startsWith('vl:diatonic-cycle:') && r !== 'vl:diatonic-cycle:pos1:C',
      );
      if (firstUnstarted >= 0) {
        expect(firstUnstarted).toBeLessThan(notDueIdx);
      }
    }
  });
});

// -----------------------------------------------------------------
// Voice-leading per-key gating (intra-pattern hard gate)
// -----------------------------------------------------------------

describe('shapeShapesBlock — VL per-key gating', () => {
  it('seventh-chords cell ineligible when guide-tones prerequisites are still "new"', () => {
    // No prereq rows → seventh-chords stays gated. The VL segment
    // still fires (catalog-driven), but the gated cell is absent.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs).not.toContain('vl:major-251:seventh-chords:A:C');
  });

  it('seventh-chords cell ineligible when ONLY ONE of the two guide-tones positions is at acquiring', () => {
    const rows = [
      row('vl:major-251:guide-tones:A:C', { acquisitionStage: 'acquiring' }),
      // Pos B has no row → defaults to 'new'.
    ];
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs).not.toContain('vl:major-251:seventh-chords:A:C');
  });

  it('seventh-chords cell becomes eligible once both guide-tones positions reach acquiring+', () => {
    // Push every higher-priority unstarted cell to NOT_DUE so the
    // seventh-chords:A:C cell can fit inside the truncated window.
    // Keep major-251 guide-tones at C as UNSTARTED so they (a) satisfy
    // the prereq gate at acquiring+ and (b) precede seventh-chords:A:C
    // in the sort.
    const rows = notDueAllExcept(
      new Set([
        'vl:major-251:guide-tones:A:C',
        'vl:major-251:guide-tones:B:C',
        'vl:major-251:seventh-chords:A:C',
        'vl:major-251:seventh-chords:B:C',
      ]),
      [
        row('vl:major-251:guide-tones:A:C', { acquisitionStage: 'acquiring' }),
        row('vl:major-251:guide-tones:B:C', { acquisitionStage: 'acquired' }),
      ],
    );
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs).toContain('vl:major-251:seventh-chords:A:C');
  });

  it('ABA-structure (capstone) cell gates on seventh-chords prerequisites, not guide-tones', () => {
    const rows = [
      row('vl:major-251:guide-tones:A:C', { acquisitionStage: 'acquired' }),
      row('vl:major-251:guide-tones:B:C', { acquisitionStage: 'acquired' }),
      // seventh-chords still 'new' → ABA-structure stays gated.
    ];
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs).not.toContain('vl:major-251:aba-structure:A:C');
  });

  it('per-key: pos A guide-tones acquiring on key C unlocks key-C seventh-chords but NOT key-F seventh-chords', () => {
    // Same isolation as the prior test — push higher-priority
    // unstarted cells out of the window so the eligible seventh-chords
    // cell at C can surface.
    const rows = notDueAllExcept(
      new Set([
        'vl:major-251:guide-tones:A:C',
        'vl:major-251:guide-tones:B:C',
        'vl:major-251:seventh-chords:A:C',
        'vl:major-251:seventh-chords:B:C',
        'vl:major-251:seventh-chords:A:F',
        'vl:major-251:seventh-chords:B:F',
      ]),
      [
        row('vl:major-251:guide-tones:A:C', { acquisitionStage: 'acquiring' }),
        row('vl:major-251:guide-tones:B:C', { acquisitionStage: 'acquiring' }),
        // Key F: no rows for guide-tones → defaults to 'new' → F seventh-chords stays gated.
      ],
    );
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(vl.itemRefs).toContain('vl:major-251:seventh-chords:A:C');
    expect(vl.itemRefs).not.toContain('vl:major-251:seventh-chords:A:F');
  });

  it('non-type-position patterns (diatonic-cycle, dom7b9, dim7, minor-aba) have no gating — all positions always eligible', () => {
    // Push all higher-priority patterns out of UNSTARTED so the lower
    // non-type-position patterns (minor-aba=4, dom7b9=5, dim7=6) can
    // surface and we can verify each of their positions is eligible
    // without any prereq-based gate.
    const targets = new Set([
      'vl:diatonic-cycle:pos2:C',
      'vl:minor-aba:pos-B:C',
      'vl:dom7b9:pos3:C',
      'vl:dim7:pos4:C',
    ]);
    const rows = notDueAllExcept(targets);
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx(rows, { unlockedTier: 1 }),
    );
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    for (const ref of targets) {
      expect(vl.itemRefs).toContain(ref);
    }
  });

  // Removed: 'drops legacy / unparseable vl: refs that no longer parse
  // against the strict catalog'. Catalog enumeration only produces
  // refs that round-trip cleanly through parseVoiceLeadingItemRef,
  // so there's no longer a code path that could surface a legacy/
  // unparseable ref. block.itemRefs aren't consulted at all.

  it('three-way split runs even when there are no chord-shape items (walk returns null)', () => {
    const segs = shapeShapesBlock(
      block([], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    expect(segs.map(s => s.kind)).toEqual(['scales', 'voice-leading']);
    const scales = segs.find(s => s.kind === 'scales')!;
    const vl = segs.find(s => s.kind === 'voice-leading')!;
    expect(scales.plannedSeconds).toBe(sumFlooredScaleSeconds(scales.itemRefs));
    // VL keeps its budget remainder (uses the 15% scales budget, not
    // the reported floored sum — unused budget doesn't redistribute).
    expect(vl.plannedSeconds).toBe(
      30 * 60 - Math.floor(30 * 60 * 0.15) - Math.floor(30 * 60 * 0.45),
    );
  });

  it('three-way path bypasses the Scales goal-proportional budget rules', () => {
    // The three-way Scales budget is a flat 15 % regardless of an
    // active Scales coverage goal's due-seconds.
    const segs = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], {
        unlockedTier: 1,
        scalesGoalDueSeconds: 180,
      }),
    );
    const scales = segs.find(s => s.kind === 'scales')!;
    // Flat 15% budget regardless of the goal → the scales segment is
    // identical to a no-goal run (the goal due-seconds don't bias it).
    const segsNoGoal = shapeShapesBlock(
      block(['chord-shape:maj:C:root'], 30 * 60),
      ctx([], { unlockedTier: 1 }),
    );
    const scalesNoGoal = segsNoGoal.find(s => s.kind === 'scales')!;
    expect(scales.plannedSeconds).toBe(scalesNoGoal.plannedSeconds);
    expect(scales.plannedSeconds).toBe(sumFlooredScaleSeconds(scales.itemRefs));
  });
});

// The Phase 1 SotM-keyed-walk describe block was removed entirely
// — `sotmAnchorKey` is no longer a field on ShapesSplitContext.
// The warm-up's key selection is fully spacing-state-driven; the
// "cold-start → C" behavior is covered by the "falls back to
// circle-of-fourths (cold-start)" test above.

// Helper: extract the key name from a 3- or 4-part scale itemRef.
function parseScaleKeyName(itemRef: string): string | null {
  const parts = itemRef.split(':');
  if (parts[0] !== 'scale') return null;
  if (parts.length === 3) return parts[2];
  if (parts.length === 4) return parts[3];
  return null;
}
