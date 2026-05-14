/**
 * Reshapes the Shapes & Patterns AlgorithmBlock into:
 *
 *   · A Scales segment — FIRST, warm-up position. Walks 1–2 prioritised
 *     keys, drilling the four-scale ladder per key in design order
 *     (major → major-pent → natural-min → minor-pent). Keys come from
 *     active-song keys first, then circle-of-fourths from the user's
 *     least-recently-touched scale key with due cells. Maintenance
 *     cells (major scale) get the fast 30 s pass; drill cells
 *     (natural minor) get the 90 s drill window — matches the
 *     SCALES_SUBMODULE_DESIGN.md weighting split.
 *
 *   · A chord-shape walk segment — circle-of-fourths key order,
 *     starting at the user's least-recently-touched key with due
 *     cells; within each key, tier ASC → quality declaration
 *     order → inversion order (root → inv1 → inv2 → inv3 → fluid).
 *
 * Output is an ordered list of segments; toProposalBlocks expands
 * them into separate ProposalBlocks so the UI shows scales as the
 * warm-up block sitting above the chord-shape walk. The two
 * segments share the algorithm's plannedSeconds — the scale
 * segment's time is subtracted from the chord-shape budget before
 * the walk truncates.
 *
 * Phase 1 Parts 1–4 of the Shapes & Patterns Session Structure
 * design (docs/SHAPES_AND_PATTERNS_SESSION_DESIGN.md) + Part 4 of
 * src/docs/SCALES_SUBMODULE_DESIGN.md.
 *
 * Mirrors repertoireSplit.ts in placement (called from
 * toProposalBlocks in sessionGenerator.ts).
 */

import type { SpacingState } from '../../lib/db';
import type { AllocatedBlock } from '../../lib/sessionAlgorithm/timeAllocation';
import { CHORD_QUALITY_BY_ID } from './catalog';
import { parseShapesItemRef } from './drillModel';
import {
  itemRefForScale,
  parseScaleItemRef,
  type ScaleKind,
} from './scaleSkills';
import {
  CIRCLE_OF_FOURTHS,
  SP_TIERS,
  getTierForShape,
  isTrackedShape,
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
// Scales segment constants
// ---------------------------------------------------------------------

/** Minimum S&P block length (seconds) at which the Scales warm-up
 *  segment surfaces. Sub-15-min blocks stay chord-shape-only.
 *  Calibrated for the "warm-up" position — too tight a block leaves
 *  no room for the chord-shape walk to also be meaningful. */
const SCALES_SEGMENT_MIN_BLOCK_SECONDS = 15 * 60;

/** Time allocated to the Scales segment inside a 15–30 min S&P
 *  block. ~5 min covers one full per-key ladder. */
const SCALES_SEGMENT_SHORT_SECONDS = 5 * 60;

/** Time allocated to the Scales segment inside a 30+ min S&P block.
 *  ~8 min leaves room for the second prioritised key. */
const SCALES_SEGMENT_LONG_SECONDS = 8 * 60;

/** Threshold (seconds) above which the longer Scales allocation
 *  kicks in. */
const SCALES_SEGMENT_LONG_BLOCK_SECONDS = 30 * 60;

/** Hard cap on how many keys the Scales segment covers — the
 *  warm-up shouldn't sprawl. Raised from 2 to 3 so users with
 *  three or four active songs in distinct keys see all of their
 *  song keys reflected in the warm-up rather than the first two
 *  encountered. */
const SCALES_SEGMENT_MAX_KEYS = 3;

/** Hard ceiling for the goal-aware proportional budget. When an
 *  active Scales goal pulls in a large pile of due cells, the
 *  warm-up still won't exceed 20 % of the S&P block AND won't
 *  exceed 20 min in absolute terms. Both clamps apply; the lower
 *  wins. The fixed-fallback path (no Scales goal) keeps the
 *  original 5/8-min budget unchanged. */
const SCALES_SEGMENT_PROPORTIONAL_BLOCK_FRACTION = 0.20;
const SCALES_SEGMENT_PROPORTIONAL_MAX_SECONDS = 20 * 60;

/** Per-cell drill seconds, sourced from SCALES_SUBMODULE_DESIGN.md
 *  Part 4: Time allocation. Maintenance scales (major) ride a fast
 *  30 s pass; drill scales (nat-min) get the 90 s drill window.
 *  Pent cells fan out to 3 starting points each — we surface ONE
 *  starting point per pent per key (the most-due, defaulting to
 *  the catalog's root position '1') to keep the warm-up tight. */
const SCALE_KIND_SECONDS: Readonly<Record<ScaleKind, number>> = {
  'major':            30,
  'major-pentatonic': 30,
  'natural-minor':    90,
  'minor-pentatonic': 30,
};

/** Default pentatonic starting points when no spacingState row
 *  exists for a key (cold-start). The catalog's "1" position
 *  matches both pent kinds. */
const DEFAULT_MAJOR_PENT_SP = '1';
const DEFAULT_MINOR_PENT_SP = '1';

/** Per-key scale ladder, in design-doc drill order. Major rides
 *  first (fast warm-up, hands' habit), then major-pent, then the
 *  drill cells (nat-min + min-pent). */
const SCALES_LADDER: ReadonlyArray<ScaleKind> = [
  'major',
  'major-pentatonic',
  'natural-minor',
  'minor-pentatonic',
];

// Per-kind display labels were inlined into the plain-language
// label builder (see describeKindsForKey) — pentatonic kinds now
// collapse into a single "pentatonics" word rather than calling out
// "major pent" / "minor pent" separately, so a per-kind table no
// longer carries its weight.

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
   *  ['C', 'F', 'Eb']). Keys are canonicalised at the loader so
   *  F#-spelled songs come through as 'Gb' — matching the
   *  scaleSkills catalog spelling. The Scales warm-up leads with
   *  these so the segment bridges into Repertoire practice in the
   *  same key set. Empty array → falls back to least-recently-
   *  touched scale key with due cells, then to circle-of-fourths
   *  from C on cold-start. */
  activeSongKeys: ReadonlyArray<string>;
  /** Song titles indexed by canonical key — used to render the
   *  plain-language why-text on the Scales warm-up segment ("B (I
   *  Want You Around) and Gb (Mirror)"). Keys match
   *  `activeSongKeys`; a key may map to multiple titles when two
   *  active songs share a home key. Optional — when omitted the
   *  why falls back to a generic "circle-of-fourths warm-up"
   *  phrasing for cold-start. */
  activeSongTitlesByKey?: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Goal-aware proportional Scales budget — total drill seconds
   *  across every due scale cell that matches at least one active
   *  Scales coverage goal, computed once at the loader. The
   *  splitter clamps this to min(20 % block, 20 min). When no
   *  active Scales goal exists, callers pass `null` and the
   *  splitter falls back to the fixed 5/8-min warm-up. */
  scalesGoalDueSeconds: number | null;
}

/** One segment of the reshaped S&P block. Each segment becomes one
 *  ProposalBlock at the toProposalBlocks layer. */
export interface ShapesSplitSegment {
  kind: 'shapes-walk' | 'scales';
  itemRefs: readonly string[];
  plannedSeconds: number;
  /** Human label: "Major, Minor · C, F, Bb" or
   *  "Scales · C, F (major / major pent / natural min / minor pent)". */
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

/**
 * Plain-language chord-shape walk label per the proposal-text spec:
 *
 *   "Drill major, minor, dim triads — C (root position, inversions + fluid run)"
 *
 * Three moving parts:
 *   1. Quality list — short-form lowercase ("dim", "m7b5", "maj7"),
 *      with a "+N more" tail past three. Reads as plain English
 *      next to the chord-family noun.
 *   2. Chord-family noun — derived from which catalog kinds are
 *      represented in the kept cells. "triads" when only T1; "7th
 *      chords" when only T2; "extensions" / "altered dominants"
 *      for T3 / T4; mixed runs fall back to "chord shapes".
 *   3. Inversion descriptor — names what's actually being drilled
 *      voicing-wise. "root position, inversions + fluid run" when
 *      acquisition-path inversion cells are in the walk; "voicings"
 *      for extension/special only; mixed becomes "inversions + voicings".
 */
function formatShapesLabel(cells: ReadonlyArray<ShapeCell>): string {
  const qualityShortNames: string[] = [];
  const seenQualities = new Set<string>();
  const familyKinds = new Set<string>();
  for (const c of cells) {
    if (!seenQualities.has(c.quality)) {
      seenQualities.add(c.quality);
      const entry = CHORD_QUALITY_BY_ID.get(c.quality);
      qualityShortNames.push(shortQualityName(c.quality, entry?.label));
      if (entry?.kind) familyKinds.add(entry.kind);
    }
  }
  const seenKeys = new Set<string>();
  const keys: string[] = [];
  for (const c of cells) {
    if (!seenKeys.has(c.keyName)) {
      seenKeys.add(c.keyName);
      keys.push(c.keyName);
    }
  }

  const qualityPart = qualityShortNames.length <= 3
    ? qualityShortNames.join(', ')
    : `${qualityShortNames.slice(0, 3).join(', ')}, +${qualityShortNames.length - 3} more`;
  const familyNoun = familyNounFor(familyKinds);
  const keyPart = keys.length <= 4
    ? keys.join(', ')
    : `${keys.slice(0, 4).join(', ')}, +${keys.length - 4} more`;
  const inversionDescriptor = describeInversionStates(cells);

  return `Drill ${qualityPart} ${familyNoun} — ${keyPart} (${inversionDescriptor})`;
}

/** Lowercase, abbreviation-friendly chord quality label. The
 *  catalog labels mostly read fine in lowercase ("Major" →
 *  "major"); a few get explicit short forms so the proposal line
 *  stays scannable ("Diminished" → "dim", "Half-diminished" →
 *  "m7b5"). Unknown qualities fall back to the catalog label
 *  lowercased, or the bare quality id when not in the catalog. */
function shortQualityName(qualityId: string, catalogLabel: string | undefined): string {
  switch (qualityId) {
    case 'dim':       return 'dim';
    case 'aug':       return 'aug';
    case 'm7b5':      return 'm7b5';
    case 'mmaj7':     return 'min-maj7';
    case 'maj6_9':    return 'maj 6/9';
    case 'dom7s9':    return 'dom7#9';
  }
  if (catalogLabel) return catalogLabel.toLowerCase();
  return qualityId;
}

/** Map the set of QualityKind values in the kept cells to the
 *  best-fit family noun. Single-kind walks get specific nouns;
 *  mixed walks fall back to the generic "chord shapes". */
function familyNounFor(familyKinds: ReadonlySet<string>): string {
  if (familyKinds.size === 1) {
    if (familyKinds.has('triad'))     return 'triads';
    if (familyKinds.has('seventh'))   return '7th chords';
    if (familyKinds.has('extension')) return 'extensions';
    if (familyKinds.has('special'))   return 'altered dominants';
  }
  return 'chord shapes';
}

/** "(root position, inversions + fluid run)" for triads / sevenths;
 *  "(voicings)" for extensions / special; "(inversions + voicings)"
 *  for mixed walks. Reads off the kept cells' inversionState
 *  field — cells with a non-null state are inversion-path, null
 *  ones are voicing-path. */
function describeInversionStates(cells: ReadonlyArray<ShapeCell>): string {
  let hasInversions = false;
  let hasVoicings = false;
  for (const c of cells) {
    if (c.inversionState === null) hasVoicings = true;
    else hasInversions = true;
    if (hasInversions && hasVoicings) break;
  }
  if (hasInversions && hasVoicings) return 'inversions + voicings';
  if (hasInversions) return 'root position, inversions + fluid run';
  return 'voicings';
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
// Scales segment (warm-up, first)
// ---------------------------------------------------------------------

/**
 * Pick the Scales warm-up budget.
 *
 *   1. Below the 15-min block floor: no warm-up.
 *   2. Active Scales goal: proportional — total drill seconds for
 *      every due cell that matches at least one active goal,
 *      clamped to min(20 % of block, 20 min). When zero cells are
 *      due (everything's been practised recently) the segment
 *      genuinely shouldn't appear; the caller treats a 0 budget
 *      the same as "below the block floor" and returns null.
 *   3. No active Scales goal: the fixed-budget warm-up — 5 min on
 *      15–30 min blocks, 8 min on 30+ min blocks.
 */
function scalesSegmentBudget(
  blockSeconds: number,
  scalesGoalDueSeconds: number | null,
): number {
  if (blockSeconds < SCALES_SEGMENT_MIN_BLOCK_SECONDS) return 0;
  if (scalesGoalDueSeconds === null) {
    return blockSeconds >= SCALES_SEGMENT_LONG_BLOCK_SECONDS
      ? SCALES_SEGMENT_LONG_SECONDS
      : SCALES_SEGMENT_SHORT_SECONDS;
  }
  if (scalesGoalDueSeconds <= 0) return 0;
  const proportionalCap = Math.min(
    blockSeconds * SCALES_SEGMENT_PROPORTIONAL_BLOCK_FRACTION,
    SCALES_SEGMENT_PROPORTIONAL_MAX_SECONDS,
  );
  return Math.min(scalesGoalDueSeconds, proportionalCap);
}

interface ScaleKeyEntry {
  keyName: string;
  /** Oldest lastEngagedAt across this key's scale rows; null when
   *  no row exists yet. */
  oldestEngagedAt: number | null;
  /** Count of scale cells in this key with a due (or never-touched)
   *  spacingState row. Drives the "least-recently-practiced key
   *  with due cells" priority from the design doc. */
  dueCellCount: number;
}

/**
 * Walk every scale itemRef in the spacingState rows for this
 * module, aggregate per-key engagement stats. The Scales segment
 * uses this to choose its key order:
 *
 *   1. Active-song keys (de-duped, in encounter order) — bridges
 *      into Repertoire practice in the same key set.
 *   2. Circle-of-fourths from the user's least-recently-touched
 *      scale key with due cells. Falls back to circle-of-fourths
 *      from C when no scale rows exist yet (cold-start).
 *
 * Result is capped at SCALES_SEGMENT_MAX_KEYS so the warm-up
 * doesn't sprawl.
 */
function pickScalesKeys(ctx: ShapesSplitContext): string[] {
  // Aggregate per-key engagement stats from the user's scale rows.
  const byKey = new Map<string, ScaleKeyEntry>();
  for (const row of ctx.rowsByItemRef.values()) {
    const desc = parseScaleItemRef(row.itemRef);
    if (!desc) continue;
    const entry = byKey.get(desc.keyName) ?? {
      keyName: desc.keyName,
      oldestEngagedAt: null,
      dueCellCount: 0,
    };
    if (
      row.lastEngagedAt !== null
      && (entry.oldestEngagedAt === null || row.lastEngagedAt < entry.oldestEngagedAt)
    ) {
      entry.oldestEngagedAt = row.lastEngagedAt;
    }
    if (row.nextDueAt === null || row.nextDueAt <= ctx.now) {
      entry.dueCellCount += 1;
    }
    byKey.set(desc.keyName, entry);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (key: string): boolean => {
    if (seen.has(key)) return out.length >= SCALES_SEGMENT_MAX_KEYS;
    seen.add(key);
    out.push(key);
    return out.length >= SCALES_SEGMENT_MAX_KEYS;
  };

  // Active-song keys lead — same priority rule as the chord-shape
  // walk's key picker, so the Scales warm-up bridges directly into
  // Repertoire practice in the same key.
  for (const k of ctx.activeSongKeys) if (add(k)) return out;

  // Least-recently-touched scale key WITH due cells. Falls back to
  // any-key-with-due-cells if no key has both, then to
  // oldest-engaged regardless of due status.
  const remaining = Array.from(byKey.values()).filter(e => !seen.has(e.keyName));
  const dueRemaining = remaining.filter(e => e.dueCellCount > 0);
  const pool = dueRemaining.length > 0 ? dueRemaining : remaining;
  pool.sort((a, b) => {
    if (a.oldestEngagedAt === null && b.oldestEngagedAt === null) {
      return CIRCLE_OF_FOURTHS.indexOf(a.keyName) - CIRCLE_OF_FOURTHS.indexOf(b.keyName);
    }
    if (a.oldestEngagedAt === null) return -1;
    if (b.oldestEngagedAt === null) return 1;
    return a.oldestEngagedAt - b.oldestEngagedAt;
  });

  // From the chosen lead-key, walk circle-of-fourths to fill the
  // remaining slots. When no spacingState rows exist (cold-start),
  // start at the first circle-of-fourths key (C) so the warm-up is
  // deterministic.
  const leadKey = pool[0]?.keyName ?? CIRCLE_OF_FOURTHS[0];
  if (!seen.has(leadKey)) {
    if (add(leadKey)) return out;
  }
  const startIdx = CIRCLE_OF_FOURTHS.indexOf(leadKey);
  if (startIdx < 0) return out;
  for (let i = 1; i < CIRCLE_OF_FOURTHS.length; i++) {
    const k = CIRCLE_OF_FOURTHS[(startIdx + i) % CIRCLE_OF_FOURTHS.length];
    if (add(k)) return out;
  }
  return out;
}

/** Pick a starting point for a pentatonic cell in a given key.
 *  Today: defaults to '1' (root position) when no spacingState row
 *  exists. When rows exist, prefers the most-due starting point
 *  (oldest engaged among the 3 sps). A future Part-5 hook can
 *  promote a goal-scoped sp here; deferred until the practice UI
 *  lands. */
function pickPentStartingPoint(
  kind: 'major-pentatonic' | 'minor-pentatonic',
  keyName: string,
  ctx: ShapesSplitContext,
): string {
  const defaultSp = kind === 'major-pentatonic'
    ? DEFAULT_MAJOR_PENT_SP
    : DEFAULT_MINOR_PENT_SP;
  const candidates: Array<{ sp: string; lastEngagedAt: number | null }> = [];
  for (const row of ctx.rowsByItemRef.values()) {
    const desc = parseScaleItemRef(row.itemRef);
    if (!desc) continue;
    if (desc.kind !== kind || desc.keyName !== keyName) continue;
    candidates.push({ sp: desc.startingPoint, lastEngagedAt: row.lastEngagedAt });
  }
  if (candidates.length === 0) return defaultSp;
  // Oldest engaged first; never-engaged ranks before any engaged.
  candidates.sort((a, b) => {
    if (a.lastEngagedAt === null && b.lastEngagedAt === null) return 0;
    if (a.lastEngagedAt === null) return -1;
    if (b.lastEngagedAt === null) return 1;
    return a.lastEngagedAt - b.lastEngagedAt;
  });
  return candidates[0].sp;
}

interface ScaleLadderStep {
  itemRef: string;
  seconds: number;
  keyName: string;
  kind: ScaleKind;
}

function buildScaleLadder(
  keys: ReadonlyArray<string>,
  budgetSeconds: number,
  ctx: ShapesSplitContext,
): ScaleLadderStep[] {
  const out: ScaleLadderStep[] = [];
  let budget = budgetSeconds;
  for (const keyName of keys) {
    for (const kind of SCALES_LADDER) {
      if (budget <= 0 && out.length > 0) return out;
      let itemRef: string;
      if (kind === 'major-pentatonic' || kind === 'minor-pentatonic') {
        const sp = pickPentStartingPoint(kind, keyName, ctx);
        // Narrowing: pickPentStartingPoint returns a runtime string;
        // cast through the typed constructor so any future sp value
        // outside the catalog short-circuits via parseScaleItemRef.
        itemRef = itemRefForScale(
          kind === 'major-pentatonic'
            ? { kind, keyName, startingPoint: sp as '1' | '5' | '6' }
            : { kind, keyName, startingPoint: sp as '1' | 'b3' | 'b7' },
        );
      } else {
        itemRef = itemRefForScale({ kind, keyName });
      }
      out.push({
        itemRef,
        seconds: SCALE_KIND_SECONDS[kind],
        keyName,
        kind,
      });
      budget -= SCALE_KIND_SECONDS[kind];
    }
  }
  return out;
}

/**
 * Plain-language Scales warm-up label per the proposal-text spec:
 *
 *   "Scales warm-up · B — major, minor + pentatonics · Gb — major, minor + pentatonics"
 *
 * Each key gets a descriptor naming exactly the scale families
 * that actually appear in that key's ladder (the segment may
 * truncate before the full ladder lands). The mapping is:
 *
 *     major-scale cell      → "major"
 *     natural-minor cell    → "minor"   (parallel minor of the root)
 *     either pent kind      → "pentatonics" (covers both flavours)
 *
 * Three families combine with " + " before the last item so the
 * line reads like English: "major, minor + pentatonics".
 */
function formatScalesLabel(steps: ReadonlyArray<ScaleLadderStep>): string {
  const orderedKeys: string[] = [];
  const seenKeys = new Set<string>();
  const kindsByKey = new Map<string, Set<ScaleKind>>();
  for (const s of steps) {
    if (!seenKeys.has(s.keyName)) {
      seenKeys.add(s.keyName);
      orderedKeys.push(s.keyName);
    }
    const set = kindsByKey.get(s.keyName) ?? new Set<ScaleKind>();
    set.add(s.kind);
    kindsByKey.set(s.keyName, set);
  }
  const perKey = orderedKeys.map(k => {
    const kinds = kindsByKey.get(k) ?? new Set<ScaleKind>();
    return `${k} — ${describeKindsForKey(kinds)}`;
  });
  return `Scales warm-up · ${perKey.join(' · ')}`;
}

/** Build the descriptor string for one key — "major, minor +
 *  pentatonics" or any subset depending on which families landed. */
function describeKindsForKey(kinds: ReadonlySet<ScaleKind>): string {
  const parts: string[] = [];
  if (kinds.has('major')) parts.push('major');
  if (kinds.has('natural-minor')) parts.push('minor');
  if (kinds.has('major-pentatonic') || kinds.has('minor-pentatonic')) {
    parts.push('pentatonics');
  }
  if (parts.length === 0) return 'scales';
  if (parts.length === 1) return parts[0];
  // Final separator switches to "+" so the line reads as a list
  // climbing to its capstone: "major, minor + pentatonics".
  const head = parts.slice(0, -1).join(', ');
  return `${head} + ${parts[parts.length - 1]}`;
}

/** Compose the why-text. Names the active songs that gave us each
 *  key when activeSongTitlesByKey supplies them, falling back to
 *  bare keys for the cold-start path. */
function formatScalesWhy(
  steps: ReadonlyArray<ScaleLadderStep>,
  titlesByKey: ReadonlyMap<string, ReadonlyArray<string>> | undefined,
): string {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    if (!seen.has(s.keyName)) {
      seen.add(s.keyName);
      orderedKeys.push(s.keyName);
    }
  }
  if (orderedKeys.length === 0) return 'Drilling parallel major/minor scales — warm-up';
  const rendered = orderedKeys.map(k => {
    const titles = titlesByKey?.get(k);
    if (titles && titles.length > 0) {
      return `${k} (${titles.join(', ')})`;
    }
    return k;
  });
  const anyTitled = orderedKeys.some(k => (titlesByKey?.get(k)?.length ?? 0) > 0);
  const tail = anyTitled
    ? 'in your active song keys'
    : 'across your warm-up keys';
  const joined = joinWithAnd(rendered);
  return `Drilling parallel major/minor scales ${tail} — ${joined}`;
}

/** Join 1-3+ items into "A", "A and B", "A, B, and C". Keeps the
 *  why-text grammatical at every key-count without a separate
 *  branch per cap. */
function joinWithAnd(items: ReadonlyArray<string>): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Build the Scales warm-up segment. Returns null when the block
 * is below the minimum threshold (15 min), or when no keys can be
 * resolved (extremely unusual — circle-of-fourths fallback covers
 * the cold-start case so this only fires on bad input).
 */
function buildScalesSegment(
  blockSeconds: number,
  ctx: ShapesSplitContext,
): ShapesSplitSegment | null {
  const budget = scalesSegmentBudget(blockSeconds, ctx.scalesGoalDueSeconds);
  if (budget <= 0) return null;
  const keys = pickScalesKeys(ctx);
  if (keys.length === 0) return null;
  const steps = buildScaleLadder(keys, budget, ctx);
  if (steps.length === 0) return null;
  return {
    kind: 'scales',
    itemRefs: steps.map(s => s.itemRef),
    plannedSeconds: budget,
    label: formatScalesLabel(steps),
    why: formatScalesWhy(steps, ctx.activeSongTitlesByKey),
  };
}

// ---------------------------------------------------------------------
// Public composition
// ---------------------------------------------------------------------

/**
 * Reshape an S&P AlgorithmBlock into 1–2 segments: the Scales
 * warm-up (when the block is long enough) followed by the
 * chord-shape key-by-key walk. Returns an empty array when nothing
 * surfaces — caller falls through to the generic ProposalBlock
 * path.
 *
 * Block ordering follows SCALES_SUBMODULE_DESIGN.md ("Scales first,
 * warm-up position"): the Scales segment leads, chord shapes
 * follow. The two segments share the algorithm's plannedSeconds —
 * the Scales budget is carved off the top before the walk
 * truncates.
 *
 * Pure — tests pass fixture rowsByItemRef + plannedSeconds + now
 * directly. No DB access; that lives at the caller (loaded once
 * per session via loadShapesSplitContext).
 */
export function shapeShapesBlock(
  block: AllocatedBlock,
  ctx: ShapesSplitContext,
): ShapesSplitSegment[] {
  const scalesBudget = scalesSegmentBudget(
    block.plannedSeconds,
    ctx.scalesGoalDueSeconds,
  );
  const walkBudget = block.plannedSeconds - scalesBudget;
  const scalesSegment = scalesBudget > 0
    ? buildScalesSegment(block.plannedSeconds, ctx)
    : null;
  const walkSegment = buildShapesWalk(block, ctx, walkBudget);
  const segments: ShapesSplitSegment[] = [];
  if (scalesSegment) segments.push(scalesSegment);
  if (walkSegment) segments.push(walkSegment);
  return segments;
}
