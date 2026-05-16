/**
 * Scales — S&P submodule skill definitions.
 *
 * Authoritative spec: src/docs/SCALES_SUBMODULE_DESIGN.md (May 13,
 * 2026). Defines all 96 scale cells across 4 scale kinds, the
 * itemRef shape that pins each cell to a spacingState row, and the
 * helpers other modules (session generator, goal flow, drill UI)
 * call to round-trip itemRef ↔ descriptor.
 *
 *   12 keys × 4 scale kinds, with starting-point fan-out for pent:
 *     · major          → 1 cell  per key      (12 cells)
 *     · major-pentatonic → 3 cells per key (1/5/6) (36 cells)
 *     · natural-minor  → 1 cell  per key      (12 cells)
 *     · minor-pentatonic → 3 cells per key (1/b3/b7) (36 cells)
 *
 * Cells write to db.spacingState with moduleRef: 'shapes-and-
 * patterns' — the same bucket as chord shapes. itemRef formats:
 *
 *   scale:major:{key}                    e.g. scale:major:C
 *   scale:natural-minor:{key}            e.g. scale:natural-minor:F
 *   scale:major-pentatonic:{sp}:{key}    e.g. scale:major-pentatonic:5:Eb
 *   scale:minor-pentatonic:{sp}:{key}    e.g. scale:minor-pentatonic:b3:Bb
 *
 * Tier classification follows the design doc's
 * maintenance-vs-drill split, NOT the four-tier ladder used by
 * chord shapes (see spTiers.ts). Major = `maintenance` (already
 * known; surfaces low-priority). Everything else = `drill` (active
 * coverage; surfaces frequently). The weighting layer reads this
 * via `getScaleTier` and routes through the existing
 * SCOPED_COVERAGE_BOOST_FACTOR plumbing — no new constants are
 * introduced here.
 */

import { CIRCLE_OF_FOURTHS } from '../repertoire/circleOfFourths';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type ScaleKind =
  | 'major'
  | 'major-pentatonic'
  | 'natural-minor'
  | 'minor-pentatonic';

/** Starting-point id for a pentatonic cell. The label uses the
 *  musical-position spelling ("1", "5", "6", "b3", "b7") so itemRefs
 *  read naturally and the design-doc note about UI display ("musical
 *  positions, not just numbers") composes with this id directly. */
export type MajorPentStartingPoint = '1' | '5' | '6';
export type MinorPentStartingPoint = '1' | 'b3' | 'b7';
export type PentStartingPoint = MajorPentStartingPoint | MinorPentStartingPoint;

/** Maintenance = major scale (already known; low session priority).
 *  Drill = nat-min + both pents (active coverage; high priority). */
export type ScaleTier = 'maintenance' | 'drill';

export interface ScaleCell {
  itemRef: string;
  kind: ScaleKind;
  keyName: string;
  /** Present only for pent kinds. Undefined for major + natural-minor. */
  startingPoint?: PentStartingPoint;
  tier: ScaleTier;
  /** Long-form display label, e.g. "C major scale" or
   *  "Eb minor pentatonic — from b3". */
  label: string;
}

export type ScaleDescriptor =
  | {
      kind: 'major' | 'natural-minor';
      keyName: string;
    }
  | {
      kind: 'major-pentatonic';
      keyName: string;
      startingPoint: MajorPentStartingPoint;
    }
  | {
      kind: 'minor-pentatonic';
      keyName: string;
      startingPoint: MinorPentStartingPoint;
    };

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

export const SCALE_KINDS: ReadonlyArray<ScaleKind> = [
  'major',
  'major-pentatonic',
  'natural-minor',
  'minor-pentatonic',
];

export const MAJOR_PENT_STARTING_POINTS: ReadonlyArray<MajorPentStartingPoint> = [
  '1', '5', '6',
];

export const MINOR_PENT_STARTING_POINTS: ReadonlyArray<MinorPentStartingPoint> = [
  '1', 'b3', 'b7',
];

const SCALE_KIND_LABEL: Readonly<Record<ScaleKind, string>> = {
  'major':            'major scale',
  'major-pentatonic': 'major pentatonic',
  'natural-minor':    'natural minor',
  'minor-pentatonic': 'minor pentatonic',
};

const SCALE_KIND_TIER: Readonly<Record<ScaleKind, ScaleTier>> = {
  'major':            'maintenance',
  'major-pentatonic': 'drill',
  'natural-minor':    'drill',
  'minor-pentatonic': 'drill',
};

// ---------------------------------------------------------------------
// Cell generation
// ---------------------------------------------------------------------

function buildScaleCells(): ScaleCell[] {
  const cells: ScaleCell[] = [];
  for (const keyName of CIRCLE_OF_FOURTHS) {
    // Major (1 cell)
    cells.push(makeCell({ kind: 'major', keyName }));
    // Major pentatonic (3 cells per key)
    for (const sp of MAJOR_PENT_STARTING_POINTS) {
      cells.push(makeCell({ kind: 'major-pentatonic', keyName, startingPoint: sp }));
    }
    // Natural minor (1 cell)
    cells.push(makeCell({ kind: 'natural-minor', keyName }));
    // Minor pentatonic (3 cells per key)
    for (const sp of MINOR_PENT_STARTING_POINTS) {
      cells.push(makeCell({ kind: 'minor-pentatonic', keyName, startingPoint: sp }));
    }
  }
  return cells;
}

function makeCell(desc: ScaleDescriptor): ScaleCell {
  const itemRef = itemRefForScale(desc);
  const startingPoint = 'startingPoint' in desc ? desc.startingPoint : undefined;
  return {
    itemRef,
    kind: desc.kind,
    keyName: desc.keyName,
    startingPoint,
    tier: SCALE_KIND_TIER[desc.kind],
    label: labelFor(desc),
  };
}

/** All 96 scale cells in canonical order:
 *    circle-of-fourths × [major, major-pent×3, nat-min, min-pent×3].
 *  Stable iteration order is part of the contract — UI grids and
 *  session walks both rely on this sequence. */
export const SCALE_CELLS: ReadonlyArray<ScaleCell> = Object.freeze(buildScaleCells());

const SCALE_CELL_BY_ITEMREF: ReadonlyMap<string, ScaleCell> = new Map(
  SCALE_CELLS.map(c => [c.itemRef, c]),
);

// ---------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------

/** True when an itemRef belongs to the scales submodule. Returns
 *  false for chord-shape, voice-leading, mental-viz, and anything
 *  that doesn't look like a scale itemRef. Cheap to call — no
 *  catalog lookup, just string-prefix + structural check. */
export function isScaleItem(itemRef: string): boolean {
  return parseScaleItemRef(itemRef) !== null;
}

/** Inverse of `itemRefForScale`. Returns null when the string isn't
 *  a recognised scale itemRef (defensive against legacy / hand-
 *  edited rows). Round-trips with `itemRefForScale`. */
export function parseScaleItemRef(itemRef: string): ScaleDescriptor | null {
  const parts = itemRef.split(':');
  if (parts[0] !== 'scale') return null;

  // Major / natural-minor: scale:{kind}:{key}  (3 parts)
  if (parts.length === 3) {
    const [, kind, keyName] = parts;
    if (!keyName) return null;
    if (kind === 'major' || kind === 'natural-minor') {
      return { kind, keyName };
    }
    return null;
  }

  // Pent: scale:{kind}:{startingPoint}:{key}  (4 parts)
  if (parts.length === 4) {
    const [, kind, sp, keyName] = parts;
    if (!keyName) return null;
    if (kind === 'major-pentatonic' && isMajorPentSp(sp)) {
      return { kind: 'major-pentatonic', keyName, startingPoint: sp };
    }
    if (kind === 'minor-pentatonic' && isMinorPentSp(sp)) {
      return { kind: 'minor-pentatonic', keyName, startingPoint: sp };
    }
    return null;
  }

  return null;
}

function isMajorPentSp(s: string | undefined): s is MajorPentStartingPoint {
  return s === '1' || s === '5' || s === '6';
}

function isMinorPentSp(s: string | undefined): s is MinorPentStartingPoint {
  return s === '1' || s === 'b3' || s === 'b7';
}

/** Build the canonical itemRef for a scale descriptor. */
export function itemRefForScale(desc: ScaleDescriptor): string {
  switch (desc.kind) {
    case 'major':
    case 'natural-minor':
      return `scale:${desc.kind}:${desc.keyName}`;
    case 'major-pentatonic':
    case 'minor-pentatonic':
      return `scale:${desc.kind}:${desc.startingPoint}:${desc.keyName}`;
  }
}

/** Look up the canonical `ScaleCell` for a scale itemRef. Returns
 *  null when the itemRef isn't a recognised cell — used by the
 *  session UI to convert a scale-prep block's itemRefs into the
 *  cells `ScalesDrillModal` consumes. */
export function scaleCellForItemRef(itemRef: string): ScaleCell | null {
  return SCALE_CELL_BY_ITEMREF.get(itemRef) ?? null;
}

/** Tier for the scale at this itemRef. Throws when the itemRef
 *  isn't a recognised scale — call `isScaleItem` first when the
 *  source is untrusted. */
export function getScaleTier(itemRef: string): ScaleTier {
  const cell = SCALE_CELL_BY_ITEMREF.get(itemRef);
  if (cell) return cell.tier;
  const desc = parseScaleItemRef(itemRef);
  if (!desc) {
    throw new Error(`scaleSkills: not a scale itemRef: "${itemRef}"`);
  }
  return SCALE_KIND_TIER[desc.kind];
}

/** Human label for a scale itemRef. Returns null when the itemRef
 *  isn't a recognised scale — composes with proposal-label fallback
 *  paths the same way `labelForShapesItemRef` does. */
export function labelForScaleItemRef(itemRef: string): string | null {
  const desc = parseScaleItemRef(itemRef);
  if (!desc) return null;
  return labelFor(desc);
}

function labelFor(desc: ScaleDescriptor): string {
  const base = `${desc.keyName} ${SCALE_KIND_LABEL[desc.kind]}`;
  switch (desc.kind) {
    case 'major':
    case 'natural-minor':
      return base;
    case 'major-pentatonic':
    case 'minor-pentatonic':
      return `${base} — from ${desc.startingPoint}`;
  }
}
