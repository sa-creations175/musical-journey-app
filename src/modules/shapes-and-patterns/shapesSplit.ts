/**
 * Phase 1 Part 2 of the Shapes & Patterns Session Structure design.
 *
 * Reshapes the Shapes & Patterns AlgorithmBlock that
 * `aggregateGoalCandidatesByModule` produces into a structured
 * key-by-key walk: starting from the user's least-recently-touched
 * key with due cells, walking circle-of-fourths order, drilling
 * shapes per key in tier+quality order and inversions in
 * root → inv1 → inv2 → inv3 → fluid order. Replaces the prior
 * weight-sorted itemRef order, which interleaved keys.
 *
 * Single output ProposalBlock per AlgorithmBlock — the same shape
 * as before, just with reordered itemRefs and a label that names
 * the qualities + keys ("Major, Minor · C, F, Bb"). Time
 * allocation stays as the algorithm computed it; the shaper
 * respects `plannedSeconds` by truncating the walk once the
 * cumulative drill-time budget runs out.
 *
 * Mirrors repertoireSplit.ts in placement (called from
 * toProposalBlocks in sessionGenerator.ts) but doesn't split the
 * S&P block into multiple ProposalBlocks. Keeping the shape
 * 1:1 keeps the proposal stack readable; the user's intent is
 * "I see one S&P block but it drills these keys in this order,"
 * not "I see one block per key."
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
  type SPTier,
} from './spTiers';

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
}

export interface ShapesSplitOutput {
  /** itemRefs in key-by-key walk order, truncated to fit the
   *  block's plannedSeconds budget. */
  itemRefs: readonly string[];
  /** Human label: "Major, Minor · C, F, Bb". Names the qualities
   *  + keys present in the walk. */
  label: string;
  /** whySnippet — short context for the proposal-card body. */
  why: string;
}

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
    // Within a key, sort by tier ASC → qualityRank ASC → inversion ASC
    // so the walk visits maj → min → dim → ... → maj7 → min7 → ... and
    // each shape's inversions land in root → inv1 → inv2 → fluid order.
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

/**
 * Pick the starting key for the walk:
 *   1. Prefer keys with at least one due cell.
 *   2. Among those, prefer never-touched (lastEngagedAt = null)
 *      → otherwise oldest lastEngagedAt.
 *   3. On a tie (or no due-cell keys at all), fall through to
 *      the circle-of-fourths order (earlier = preferred).
 */
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

/** Circle-of-fourths starting from `start`. Falls back to the
 *  default order when `start` isn't on the wheel (defensive — keys
 *  that don't normalise to the canonical 12 still produce a walk). */
function rotateToStart(start: string): string[] {
  const idx = CIRCLE_OF_FOURTHS.indexOf(start);
  if (idx < 0) return [...CIRCLE_OF_FOURTHS];
  return [
    ...CIRCLE_OF_FOURTHS.slice(idx),
    ...CIRCLE_OF_FOURTHS.slice(0, idx),
  ];
}

function formatLabel(cells: ReadonlyArray<ShapeCell>): string {
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
 * Reshape an S&P AlgorithmBlock's itemRefs into a structured
 * key-by-key walk. Returns null when the block has no chord-shape
 * itemRefs in the unlocked tier — the caller falls back to the
 * generic ProposalBlock path.
 *
 * Pure — tests pass fixture rowsByItemRef + plannedSeconds + now
 * directly. No DB access; that lives at the caller (loaded once
 * per session).
 */
export function shapeShapesBlock(
  block: AllocatedBlock,
  ctx: ShapesSplitContext,
): ShapesSplitOutput | null {
  if (block.itemRefs.length === 0) return null;
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
  // Truncate to the block's plannedSeconds budget. Each cell
  // consumes ~90s (root/inv1/inv2/inv3) or 120s (fluid). The
  // truncation prefix preserves the walk shape — earlier keys get
  // full shape coverage; later keys may get partial coverage or
  // none. Defensive single-cell minimum so the block never
  // produces an empty proposal.
  let budget = block.plannedSeconds;
  const kept: ShapeCell[] = [];
  for (const c of ordered) {
    if (budget <= 0 && kept.length > 0) break;
    kept.push(c);
    budget -= cellSeconds(c.inversionState);
  }
  const uniqueKeyCount = new Set(kept.map(c => c.keyName)).size;
  return {
    itemRefs: kept.map(c => c.itemRef),
    label: formatLabel(kept),
    why: `${kept.length} drill${kept.length === 1 ? '' : 's'} across ${
      uniqueKeyCount
    } key${uniqueKeyCount === 1 ? '' : 's'} — circle-of-fourths order`,
  };
}
