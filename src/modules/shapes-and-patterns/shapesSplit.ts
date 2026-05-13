/**
 * Phase 1 Parts 2 + 3 of the Shapes & Patterns Session Structure
 * design (docs/SHAPES_AND_PATTERNS_SESSION_DESIGN.md).
 *
 * Reshapes the Shapes & Patterns AlgorithmBlock into:
 *
 *   · A chord-shape walk segment — circle-of-fourths key order,
 *     starting at the user's least-recently-touched key with due
 *     cells; within each key, tier ASC → quality declaration
 *     order → inversion order (root → inv1 → inv2 → inv3 → fluid).
 *     Replaces the prior weight-sorted itemRef order which
 *     interleaved keys.
 *
 *   · An optional scale warm-down segment — last 5–8 min of the
 *     S&P block when the block is ≥ 15 min. Drills the parallel +
 *     relative-major scale set (major / major-pent / natural-min /
 *     min-pent / relative-major) in 1–2 priority keys (active-song
 *     keys first, then circle-of-fourths order).
 *
 * Output is an ordered list of segments; toProposalBlocks expands
 * them into separate ProposalBlocks so the UI shows the scale
 * warm-down as a distinct piece of work below the chord-shape walk.
 * The two segments share the algorithm's plannedSeconds — the
 * scale segment's time is subtracted from the chord-shape budget
 * before the walk truncates.
 *
 * Mirrors repertoireSplit.ts in placement (called from
 * toProposalBlocks in sessionGenerator.ts).
 */

import type { SpacingState } from '../../lib/db';
import type { AllocatedBlock } from '../../lib/sessionAlgorithm/timeAllocation';
import { CHORD_QUALITY_BY_ID } from './catalog';
import { parseShapesItemRef } from './drillModel';
import {
  CIRCLE_OF_FOURTHS,
  SP_TIERS,
  getTierForShape,
  isTrackedShape,
  relativeMajorOf,
  type SPTier,
} from './spTiers';

// ---------------------------------------------------------------------
// Chord-shape walk constants
// ---------------------------------------------------------------------

/** Per-cell drill time when an inversion state is null or one of
 *  root / inv1 / inv2 / inv3. */
const CELL_SECONDS_DEFAULT = 90;
/** Per-cell drill time for the fluid inversion state — slightly
 *  longer because the all-inversion run is a synthesis exercise. */
const CELL_SECONDS_FLUID = 120;

/** Order inversion states are drilled within each shape × key. */
const INVERSION_ORDER: ReadonlyArray<string | null> = [
  null, 'root', 'inv1', 'inv2', 'inv3', 'fluid',
];

// ---------------------------------------------------------------------
// Scale warm-down constants
// ---------------------------------------------------------------------

/** Minimum S&P block length (seconds) at which the scale warm-down
 *  segment surfaces. Sub-15-min blocks stay chord-shape-only. */
const SCALE_SEGMENT_MIN_BLOCK_SECONDS = 15 * 60;

/** Time allocated to the scale warm-down inside a typical 15–30 min
 *  S&P block. */
const SCALE_SEGMENT_SHORT_SECONDS = 5 * 60;

/** Time allocated to the scale warm-down inside a 30+ min S&P
 *  block — slightly more room for the 2nd key. */
const SCALE_SEGMENT_LONG_SECONDS = 8 * 60;

/** Threshold (seconds) above which the longer scale allocation
 *  kicks in. */
const SCALE_SEGMENT_LONG_BLOCK_SECONDS = 30 * 60;

/** Hard cap on how many keys the scale warm-down covers. */
const SCALE_SEGMENT_MAX_KEYS = 2;

interface ScaleStep {
  /** itemRef kind appended after the `scale:` prefix. */
  kind: 'major' | 'major-pentatonic' | 'natural-minor' | 'minor-pentatonic' | 'relative-major';
  /** Drill time target in seconds. */
  seconds: number;
  /** Human display label for the segment label. */
  label: string;
}

/** Per-key scale ladder, in drill order. Major / major-pent / rel-maj
 *  ride a 30 s maintenance pass; nat-min + min-pent get the 90 s
 *  drill window — matches the design doc's "comfortable vs needs-
 *  work" split for this user. */
const SCALE_STEPS: ReadonlyArray<ScaleStep> = [
  { kind: 'major',             seconds: 30, label: 'major' },
  { kind: 'major-pentatonic',  seconds: 30, label: 'major pent' },
  { kind: 'natural-minor',     seconds: 90, label: 'natural min' },
  { kind: 'minor-pentatonic',  seconds: 90, label: 'minor pent' },
  { kind: 'relative-major',    seconds: 30, label: 'rel maj' },
];

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface ShapesSplitContext {
  /** spacingState rows keyed by itemRef — supplies lastEngagedAt
   *  for the starting-key pick and nextDueAt for the "due cells"
   *  check. Rows for itemRefs outside the block are ignored. */
  rowsByItemRef: ReadonlyMap<string, SpacingState>;
  /** Highest tier the user has unlocked. Cells whose quality lives
   *  in a higher tier are dropped from the walk. */
  unlockedTier: SPTier;
  /** Reference time. Cells with nextDueAt ≤ now (or null) are due. */
  now: number;
  /** Distinct major-key names from the user's active songs (e.g.
   *  ['C', 'F', 'Eb']). The scale warm-down prefers these so the
   *  segment bridges into Repertoire practice in the same key set.
   *  Empty array → fall back to chord-shape walk keys. */
  activeSongKeys: ReadonlyArray<string>;
}

/** One segment of the reshaped S&P block. Each segment becomes one
 *  ProposalBlock at the toProposalBlocks layer. */
export interface ShapesSplitSegment {
  kind: 'shapes-walk' | 'scale-warm-down';
  itemRefs: readonly string[];
  plannedSeconds: number;
  /** Human label: "Major, Minor · C, F, Bb" or
   *  "Scale warm-down · C, F (major / nat min / min pent / rel maj)". */
  label: string;
  /** whySnippet — short context for the proposal-card body. */
  why: string;
}

// ---------------------------------------------------------------------
// Chord-shape walk
// ---------------------------------------------------------------------

interface ShapeCell {
  itemRef: string;
  quality: string;
  keyName: string;
  inversionState: string | null;
  tier: SPTier;
  qualityRank: number;
  lastEngagedAt: number | null;
  nextDueAt: number | null;
}

interface KeyGroup {
  keyName: string;
  cells: ShapeCell[];
  /** Oldest lastEngagedAt across the group's cells, or null when
   *  every cell is never-touched. Drives starting-key pick. */
  minLastEngagedAt: number | null;
  /** Cells in this key that are due now. Pre-filter for the
   *  starting-key pick. */
  dueCellCount: number;
}

function cellSeconds(inversionState: string | null): number {
  return inversionState === 'fluid' ? CELL_SECONDS_FLUID : CELL_SECONDS_DEFAULT;
}

function inversionRank(s: string | null): number {
  const idx = INVERSION_ORDER.indexOf(s);
  return idx < 0 ? INVERSION_ORDER.length : idx;
}

function buildCells(
  itemRefs: ReadonlyArray<string>,
  ctx: ShapesSplitContext,
): ShapeCell[] {
  const cells: ShapeCell[] = [];
  for (const itemRef of itemRefs) {
    const desc = parseShapesItemRef(itemRef);
    if (!desc || desc.kind !== 'chord-shape') continue;
    if (!isTrackedShape(desc.quality)) continue;
    const tier = getTierForShape(desc.quality);
    if (tier > ctx.unlockedTier) continue;
    const qualityRank = SP_TIERS[tier].indexOf(desc.quality);
    const row = ctx.rowsByItemRef.get(itemRef);
    cells.push({
      itemRef,
      quality: desc.quality,
      keyName: desc.keyName,
      inversionState: desc.inversionState ?? null,
      tier,
      qualityRank,
      lastEngagedAt: row?.lastEngagedAt ?? null,
      nextDueAt: row?.nextDueAt ?? null,
    });
  }
  return cells;
}

function groupByKey(cells: ReadonlyArray<ShapeCell>, now: number): KeyGroup[] {
  const map = new Map<string, ShapeCell[]>();
  for (const c of cells) {
    const arr = map.get(c.keyName) ?? [];
    arr.push(c);
    map.set(c.keyName, arr);
  }
  const out: KeyGroup[] = [];
  for (const [keyName, groupCells] of map) {
    groupCells.sort((a, b) =>
      a.tier - b.tier
      || a.qualityRank - b.qualityRank
      || inversionRank(a.inversionState) - inversionRank(b.inversionState),
    );
    let minLast: number | null = null;
    let dueCount = 0;
    for (const c of groupCells) {
      if (
        c.lastEngagedAt !== null
        && (minLast === null || c.lastEngagedAt < minLast)
      ) {
        minLast = c.lastEngagedAt;
      }
      if (c.nextDueAt === null || c.nextDueAt <= now) dueCount += 1;
    }
    out.push({
      keyName,
      cells: groupCells,
      minLastEngagedAt: minLast,
      dueCellCount: dueCount,
    });
  }
  return out;
}

function pickStartingKey(groups: ReadonlyArray<KeyGroup>): string {
  if (groups.length === 0) return CIRCLE_OF_FOURTHS[0];
  const dueKeys = groups.filter(g => g.dueCellCount > 0);
  const pool = dueKeys.length > 0 ? dueKeys : groups;
  const sorted = [...pool].sort((a, b) => {
    if (a.minLastEngagedAt === null && b.minLastEngagedAt === null) {
      return CIRCLE_OF_FOURTHS.indexOf(a.keyName)
        - CIRCLE_OF_FOURTHS.indexOf(b.keyName);
    }
    if (a.minLastEngagedAt === null) return -1;
    if (b.minLastEngagedAt === null) return 1;
    return a.minLastEngagedAt - b.minLastEngagedAt;
  });
  return sorted[0].keyName;
}

function rotateToStart(start: string): string[] {
  const idx = CIRCLE_OF_FOURTHS.indexOf(start);
  if (idx < 0) return [...CIRCLE_OF_FOURTHS];
  return [
    ...CIRCLE_OF_FOURTHS.slice(idx),
    ...CIRCLE_OF_FOURTHS.slice(0, idx),
  ];
}

function formatShapesLabel(cells: ReadonlyArray<ShapeCell>): string {
  const seenQualities = new Set<string>();
  const qualityLabels: string[] = [];
  for (const c of cells) {
    if (seenQualities.has(c.quality)) continue;
    seenQualities.add(c.quality);
    const entry = CHORD_QUALITY_BY_ID.get(c.quality);
    qualityLabels.push(entry?.label ?? c.quality);
  }
  const seenKeys = new Set<string>();
  const keys: string[] = [];
  for (const c of cells) {
    if (seenKeys.has(c.keyName)) continue;
    seenKeys.add(c.keyName);
    keys.push(c.keyName);
  }
  const qualityPart = qualityLabels.length <= 3
    ? qualityLabels.join(', ')
    : `${qualityLabels.slice(0, 3).join(', ')}, +${qualityLabels.length - 3} more`;
  const keyPart = keys.length <= 4
    ? keys.join(', ')
    : `${keys.slice(0, 4).join(', ')}, +${keys.length - 4} more`;
  return `${qualityPart} · ${keyPart}`;
}

/**
 * Build the chord-shape walk segment. Returns null when the block
 * contains no chord-shape itemRefs in the unlocked tier (caller
 * falls through to scale-only / generic path).
 */
function buildShapesWalk(
  block: AllocatedBlock,
  ctx: ShapesSplitContext,
  plannedSeconds: number,
): ShapesSplitSegment | null {
  if (block.itemRefs.length === 0) return null;
  if (plannedSeconds <= 0) return null;
  const cells = buildCells(block.itemRefs, ctx);
  if (cells.length === 0) return null;
  const groups = groupByKey(cells, ctx.now);
  const startKey = pickStartingKey(groups);
  const walkOrder = rotateToStart(startKey);
  const ordered: ShapeCell[] = [];
  for (const keyName of walkOrder) {
    const g = groups.find(group => group.keyName === keyName);
    if (!g) continue;
    for (const c of g.cells) ordered.push(c);
  }
  let budget = plannedSeconds;
  const kept: ShapeCell[] = [];
  for (const c of ordered) {
    if (budget <= 0 && kept.length > 0) break;
    kept.push(c);
    budget -= cellSeconds(c.inversionState);
  }
  const uniqueKeyCount = new Set(kept.map(c => c.keyName)).size;
  return {
    kind: 'shapes-walk',
    itemRefs: kept.map(c => c.itemRef),
    plannedSeconds,
    label: formatShapesLabel(kept),
    why: `${kept.length} drill${kept.length === 1 ? '' : 's'} across ${
      uniqueKeyCount
    } key${uniqueKeyCount === 1 ? '' : 's'} — circle-of-fourths order`,
  };
}

// ---------------------------------------------------------------------
// Scale warm-down
// ---------------------------------------------------------------------

function scaleSegmentBudget(blockSeconds: number): number {
  if (blockSeconds < SCALE_SEGMENT_MIN_BLOCK_SECONDS) return 0;
  return blockSeconds >= SCALE_SEGMENT_LONG_BLOCK_SECONDS
    ? SCALE_SEGMENT_LONG_SECONDS
    : SCALE_SEGMENT_SHORT_SECONDS;
}

/** Build the prioritised list of scale-warm-down keys.
 *  1. Active-song keys (de-duped, in encounter order).
 *  2. Chord-shape walk keys (also in walk order) — fallback when
 *     no songs / fewer than the cap.
 *  Caps at SCALE_SEGMENT_MAX_KEYS. */
function pickScaleKeys(
  ctx: ShapesSplitContext,
  walkKeys: ReadonlyArray<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (key: string): boolean => {
    if (seen.has(key)) return out.length >= SCALE_SEGMENT_MAX_KEYS;
    seen.add(key);
    out.push(key);
    return out.length >= SCALE_SEGMENT_MAX_KEYS;
  };
  for (const k of ctx.activeSongKeys) if (add(k)) return out;
  for (const k of walkKeys) if (add(k)) return out;
  return out;
}

function buildScaleItemRefs(
  keys: ReadonlyArray<string>,
  budgetSeconds: number,
): Array<{ itemRef: string; seconds: number; keyName: string; step: ScaleStep }> {
  // Walk the scale ladder per key, in key order. Truncate when
  // the time budget runs out so a tight scale window still surfaces
  // SOMETHING (typically just the major / major-pent quick passes
  // before time's up).
  const out: Array<{ itemRef: string; seconds: number; keyName: string; step: ScaleStep }> = [];
  let budget = budgetSeconds;
  for (const keyName of keys) {
    for (const step of SCALE_STEPS) {
      if (budget <= 0 && out.length > 0) return out;
      out.push({
        itemRef: `scale:${step.kind}:${keyName}`,
        seconds: step.seconds,
        keyName,
        step,
      });
      budget -= step.seconds;
    }
  }
  return out;
}

function formatScaleLabel(
  steps: ReadonlyArray<{ keyName: string; step: ScaleStep }>,
): string {
  const seenKeys = new Set<string>();
  const keys: string[] = [];
  for (const s of steps) {
    if (seenKeys.has(s.keyName)) continue;
    seenKeys.add(s.keyName);
    keys.push(s.keyName);
  }
  const seenSteps = new Set<string>();
  const stepLabels: string[] = [];
  for (const s of steps) {
    if (seenSteps.has(s.step.label)) continue;
    seenSteps.add(s.step.label);
    stepLabels.push(s.step.label);
  }
  const keyPart = keys.join(', ');
  const stepPart = stepLabels.join(' / ');
  return `Scale warm-down · ${keyPart} (${stepPart})`;
}

/**
 * Build the scale warm-down segment. Returns null when the block
 * is below the minimum threshold (15 min), or when no keys can be
 * resolved (no active songs + no chord-shape walk keys).
 *
 * Annotates the relative-major itemRef in the WHY so the user
 * knows the parallel/relative mapping at a glance (e.g. "Eb is
 * the relative major of C minor").
 */
function buildScaleSegment(
  blockSeconds: number,
  ctx: ShapesSplitContext,
  walkKeys: ReadonlyArray<string>,
): ShapesSplitSegment | null {
  const budget = scaleSegmentBudget(blockSeconds);
  if (budget <= 0) return null;
  const keys = pickScaleKeys(ctx, walkKeys);
  if (keys.length === 0) return null;
  const steps = buildScaleItemRefs(keys, budget);
  if (steps.length === 0) return null;
  // why-text: name the relative-major mapping for the first key so
  // the parallel/relative relationship is visible without opening
  // the block.
  const relMaj = relativeMajorOf(keys[0]);
  return {
    kind: 'scale-warm-down',
    itemRefs: steps.map(s => s.itemRef),
    plannedSeconds: budget,
    label: formatScaleLabel(steps),
    why: keys.length === 1
      ? `Bridge to song practice — relative major of ${keys[0]} is ${relMaj}`
      : `Bridge to song practice across ${keys.length} keys`,
  };
}

// ---------------------------------------------------------------------
// Public composition
// ---------------------------------------------------------------------

/**
 * Reshape an S&P AlgorithmBlock into 1–2 segments: the chord-shape
 * key-by-key walk, optionally followed by the scale warm-down when
 * the block is long enough. Returns an empty array when nothing
 * surfaces — caller falls through to the generic ProposalBlock
 * path.
 *
 * Pure — tests pass fixture rowsByItemRef + plannedSeconds + now
 * directly. No DB access; that lives at the caller (loaded once
 * per session via loadShapesSplitContext).
 */
export function shapeShapesBlock(
  block: AllocatedBlock,
  ctx: ShapesSplitContext,
): ShapesSplitSegment[] {
  const scaleBudget = scaleSegmentBudget(block.plannedSeconds);
  const walkBudget = block.plannedSeconds - scaleBudget;
  const walkSegment = buildShapesWalk(block, ctx, walkBudget);
  // Walk-segment keys feed the scale segment's fallback when the
  // user has no active songs. parseShapesItemRef returns a union
  // (chord-shape / scale / voice-leading) — only chord-shape has
  // `keyName` at this point in the pipeline, and that's what the
  // walk yields, but we narrow defensively for the type-checker.
  const walkKeys = walkSegment
    ? Array.from(new Set(
        walkSegment.itemRefs
          .map(ref => {
            const desc = parseShapesItemRef(ref);
            if (!desc) return null;
            if (desc.kind === 'chord-shape') return desc.keyName;
            return null;
          })
          .filter((k): k is string => typeof k === 'string'),
      ))
    : [];
  const scaleSegment = scaleBudget > 0
    ? buildScaleSegment(block.plannedSeconds, ctx, walkKeys)
    : null;
  const segments: ShapesSplitSegment[] = [];
  if (walkSegment) segments.push(walkSegment);
  if (scaleSegment) segments.push(scaleSegment);
  return segments;
}
