import {
  db,
  type DrillSession,
  type DrillSkill,
  type DrillType,
  type InversionState,
} from '../../lib/db';
import {
  CHORD_QUALITY_BY_ID,
  defaultDrillForChordShape,
  defaultDrillTypesForMentalViz,
  defaultDrillTypesForScale,
  defaultDrillTypesForVoiceLeading,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  inversionStateLabel,
  MENTAL_VIZ_VARIANTS,
  SCALES,
  VOICE_LEADING_PATTERNS,
} from './catalog';
import { recordEngagement } from '../../lib/spacingState';

/** Minimum seconds a drill session must run to count as a rep. */
export const MIN_REP_SECONDS = 30;

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

// --- Skill lookup / materialisation --------------------------------

interface ChordShapeDescriptor {
  kind: 'chord-shape';
  keyName: string;
  quality: string;
  /** Optional inversion state. Required to disambiguate which skill
   *  row to return for triads / sevenths (where one cell maps to
   *  multiple rows). When omitted on a triad / seventh descriptor,
   *  findOrCreateSkill defaults to 'root' for back-compat with
   *  call sites that pre-date the inversion-tracking redesign;
   *  Step 3 routes the breakdown-panel UX through an explicit
   *  inversion state. Always `null` for extensions / special. */
  inversionState?: InversionState | null;
}
interface ScaleDescriptor {
  kind: 'scale';
  keyName: string;
  scale: string;
}
interface VoiceLeadingDescriptor {
  kind: 'voice-leading';
  keyName: string;
  patternId: string;
}
interface MentalVizDescriptor {
  kind: 'mental-viz';
  variant: string;
}
export type SkillDescriptor =
  | ChordShapeDescriptor
  | ScaleDescriptor
  | VoiceLeadingDescriptor
  | MentalVizDescriptor;

/**
 * Find the DrillSkill row for a given descriptor, creating it +
 * default drill types on first ask. Every caller that wants to
 * open a drill list goes through here, so the heat grid can stay
 * free of per-cell DB rows until the user actually touches a cell.
 *
 * Chord-shape semantics: the inversion-tracking redesign splits one
 * (quality × key) cell into multiple skill rows — one per
 * acquisition-path inversion state plus optionally a supplementary
 * row for two-handed drills (sevenths only). This function
 * materialises the FULL cell's rows on first touch (atomic
 * transaction) and returns the row matching the descriptor's
 * `inversionState` (defaulting to 'root' for triads / sevenths,
 * `null` for extensions / special).
 */
export async function findOrCreateSkill(desc: SkillDescriptor): Promise<DrillSkill> {
  if (desc.kind === 'chord-shape') {
    return findOrCreateChordShapeSkill(desc);
  }

  const existing = await findSkill(desc);
  if (existing) {
    // Self-heal: an existing skill row with zero drillTypes is a
    // stranded skill from an earlier app version where skill creation
    // and drill-type materialisation didn't share a transaction. The
    // DrillListModal renders "start drill" inside drillTypes.map(),
    // so an empty drill-types set leaves the user with no way to
    // begin practice. Surfaced for C major scale and C ABA-251
    // voice-leading. Re-materialise defaults so the cell becomes
    // usable again.
    const typeCount = await db.drillTypes.where('skillId').equals(existing.id).count();
    if (typeCount === 0) {
      const defaults = defaultDrillTypesForDescriptor(desc);
      const drillTypeRows: DrillType[] = defaults.map((d, i) => ({
        id: uid('dtype'),
        skillId: existing.id,
        name: d.name,
        suggestedSeconds: d.suggestedSeconds,
        order: i,
        repCount: 0,
        totalSeconds: 0,
        lastPracticedAt: null,
      }));
      await db.drillTypes.bulkAdd(drillTypeRows);
    }
    return existing;
  }
  const skill: DrillSkill = {
    id: uid('skill'),
    kind: desc.kind,
    keyName: 'keyName' in desc ? desc.keyName : undefined,
    scale: 'scale' in desc ? desc.scale : undefined,
    patternId: 'patternId' in desc ? desc.patternId : undefined,
    variant: 'variant' in desc ? desc.variant : undefined,
    label: labelFor(desc),
    createdAt: Date.now(),
  };

  const defaults = defaultDrillTypesForDescriptor(desc);
  const drillTypeRows: DrillType[] = defaults.map((d, i) => ({
    id: uid('dtype'),
    skillId: skill.id,
    name: d.name,
    suggestedSeconds: d.suggestedSeconds,
    order: i,
    repCount: 0,
    totalSeconds: 0,
    lastPracticedAt: null,
  }));

  await db.transaction('rw', [db.drillSkills, db.drillTypes], async () => {
    await db.drillSkills.add(skill);
    await db.drillTypes.bulkAdd(drillTypeRows);
  });
  return skill;
}

/**
 * Cell-level materialisation for chord-shape skills. Creates every
 * inversion-state row the cell needs (per
 * INVERSION_STATES_FOR_CHORD_SHAPE_KIND) in one transaction, then
 * returns the row matching the descriptor's `inversionState`.
 *
 * Idempotent — only creates rows that don't already exist. Self-heals
 * empty drill-types sets on existing rows.
 */
async function findOrCreateChordShapeSkill(desc: ChordShapeDescriptor): Promise<DrillSkill> {
  const qualityEntry = CHORD_QUALITY_BY_ID.get(desc.quality);
  const kind = qualityEntry?.kind ?? 'special';
  const states = INVERSION_STATES_FOR_CHORD_SHAPE_KIND[kind];
  const requestedState: InversionState | null =
    desc.inversionState ?? states[0] ?? null;

  const existing = await db.drillSkills
    .where('[kind+keyName+quality]').equals(['chord-shape', desc.keyName, desc.quality])
    .toArray();
  const existingByState = new Map<InversionState | null, DrillSkill>();
  for (const s of existing) existingByState.set(s.inversionState ?? null, s);

  const newSkills: DrillSkill[] = [];
  const newTypes: DrillType[] = [];
  for (const state of states) {
    if (existingByState.has(state)) continue;
    const skill: DrillSkill = {
      id: uid('skill'),
      kind: 'chord-shape',
      keyName: desc.keyName,
      quality: desc.quality,
      inversionState: state,
      label: labelFor({ ...desc, inversionState: state }),
      createdAt: Date.now(),
    };
    newSkills.push(skill);
    existingByState.set(state, skill);

    const seedDrills = defaultDrillForChordShape(kind, state);
    seedDrills.forEach((d, i) => {
      newTypes.push({
        id: uid('dtype'),
        skillId: skill.id,
        name: d.name,
        suggestedSeconds: d.suggestedSeconds,
        order: i,
        repCount: 0,
        totalSeconds: 0,
        lastPracticedAt: null,
      });
    });
  }

  // Self-heal: existing rows with no drillTypes get their seed
  // drills re-materialised. Same rationale as the legacy path.
  const healTypes: DrillType[] = [];
  for (const state of states) {
    const skill = existingByState.get(state);
    if (!skill) continue;
    // Skip newly-created rows — they already have their seed types in newTypes.
    if (newSkills.some(s => s.id === skill.id)) continue;
    const typeCount = await db.drillTypes.where('skillId').equals(skill.id).count();
    if (typeCount > 0) continue;
    const seedDrills = defaultDrillForChordShape(kind, state);
    seedDrills.forEach((d, i) => {
      healTypes.push({
        id: uid('dtype'),
        skillId: skill.id,
        name: d.name,
        suggestedSeconds: d.suggestedSeconds,
        order: i,
        repCount: 0,
        totalSeconds: 0,
        lastPracticedAt: null,
      });
    });
  }

  if (newSkills.length > 0 || newTypes.length > 0 || healTypes.length > 0) {
    await db.transaction('rw', [db.drillSkills, db.drillTypes], async () => {
      if (newSkills.length > 0) await db.drillSkills.bulkAdd(newSkills);
      if (newTypes.length > 0) await db.drillTypes.bulkAdd(newTypes);
      if (healTypes.length > 0) await db.drillTypes.bulkAdd(healTypes);
    });
  }

  const match = existingByState.get(requestedState);
  if (match) return match;
  // Shouldn't happen — `requestedState` is sourced from `states`.
  // Defensive fallback: return the first row available so the caller
  // doesn't crash on a "no skill" edge case.
  return existing[0] ?? newSkills[0];
}

/**
 * Enumerate every chord-shape skill row for a (quality × key) cell,
 * materialising them if absent. Used by the Step 3 inversion
 * breakdown panel to render one entry per inversion state.
 */
export async function findAllChordShapeSkillsForCell(
  keyName: string,
  quality: string,
): Promise<DrillSkill[]> {
  // Seed the cell. findOrCreateChordShapeSkill materialises ALL
  // states in one transaction; we discard its return value here.
  await findOrCreateChordShapeSkill({ kind: 'chord-shape', keyName, quality });
  return db.drillSkills
    .where('[kind+keyName+quality]').equals(['chord-shape', keyName, quality])
    .toArray();
}

export async function findSkill(desc: SkillDescriptor): Promise<DrillSkill | undefined> {
  switch (desc.kind) {
    case 'chord-shape': {
      // The [kind+keyName+quality] index returns all inversion-state
      // rows for the cell; filter by the descriptor's state (defaults
      // to 'root' when omitted, matching findOrCreateSkill).
      const candidates = await db.drillSkills
        .where('[kind+keyName+quality]').equals(['chord-shape', desc.keyName, desc.quality])
        .toArray();
      if (candidates.length === 0) return undefined;
      const qualityEntry = CHORD_QUALITY_BY_ID.get(desc.quality);
      const kind = qualityEntry?.kind ?? 'special';
      const fallbackState =
        INVERSION_STATES_FOR_CHORD_SHAPE_KIND[kind][0] ?? null;
      const target = desc.inversionState ?? fallbackState;
      return candidates.find(s => (s.inversionState ?? null) === target);
    }
    case 'scale':
      return db.drillSkills
        .where('[kind+keyName+scale]').equals(['scale', desc.keyName, desc.scale])
        .first();
    case 'voice-leading':
      return db.drillSkills
        .where('[kind+patternId+keyName]').equals(['voice-leading', desc.patternId, desc.keyName])
        .first();
    case 'mental-viz':
      return db.drillSkills
        .where('[kind+variant]').equals(['mental-viz', desc.variant])
        .first();
  }
}

function defaultDrillTypesForDescriptor(desc: SkillDescriptor) {
  switch (desc.kind) {
    case 'chord-shape': {
      const q = CHORD_QUALITY_BY_ID.get(desc.quality);
      return defaultDrillForChordShape(q?.kind ?? 'special', desc.inversionState);
    }
    case 'scale':         return defaultDrillTypesForScale();
    case 'voice-leading': return defaultDrillTypesForVoiceLeading();
    case 'mental-viz':    return defaultDrillTypesForMentalViz();
  }
}

/**
 * Standard chord notation: "C" for major, "Cm7" for minor seventh,
 * "Cmaj7" for major seventh, etc. The quality catalog's `suffix`
 * field already carries the canonical shorthand (empty for major
 * triad, "m" for minor, "maj7" for major 7, …) so skill labels read
 * as "Cmaj7 (major seventh)" — short and unambiguous, with the
 * long-form name in parens for clarity.
 */
/**
 * Inverse of `itemRefForSkill`: parse a spacingState itemRef
 * (e.g. "chord-shape:maj7:C:inv1", "scale:major:C", "vl:aba-251:Bb")
 * back into the descriptor that produced it. Returns null when
 * the string doesn't match a known shape — defensive against
 * legacy / hand-edited rows.
 *
 * Used by the proposal-screen activity-description path: the
 * spacingState itemRefs ARE the descriptor in serialized form, so
 * we can render the human label without touching db.drillSkills
 * (which keys by an unrelated random `skill-…` uid).
 */
export function parseShapesItemRef(itemRef: string): SkillDescriptor | null {
  const parts = itemRef.split(':');
  if (parts.length < 3) return null;
  const [kind, a, b, c] = parts;
  switch (kind) {
    case 'chord-shape': {
      // a=quality, b=keyName, c=inversionState (optional)
      if (!a || !b) return null;
      const inversionState = parseInversionState(c);
      return {
        kind: 'chord-shape',
        keyName: b,
        quality: a,
        inversionState,
      };
    }
    case 'scale': {
      // a=scale, b=keyName
      if (!a || !b) return null;
      return { kind: 'scale', keyName: b, scale: a };
    }
    case 'vl': {
      // a=patternId, b=keyName
      if (!a || !b) return null;
      return { kind: 'voice-leading', keyName: b, patternId: a };
    }
    default:
      return null;
  }
}

function parseInversionState(raw: string | undefined): InversionState | null {
  if (!raw) return null;
  if (
    raw === 'root' ||
    raw === 'inv1' ||
    raw === 'inv2' ||
    raw === 'inv3' ||
    raw === 'fluid' ||
    raw === 'supplementary'
  ) {
    return raw;
  }
  return null;
}

/**
 * Convenience composition of `parseShapesItemRef` + `labelFor`.
 * Returns null when the itemRef can't be parsed; callers fall back
 * to their own generic noun (e.g. "drills · N items"). */
export function labelForShapesItemRef(itemRef: string): string | null {
  const desc = parseShapesItemRef(itemRef);
  if (!desc) return null;
  return labelFor(desc);
}

export function labelFor(desc: SkillDescriptor): string {
  switch (desc.kind) {
    case 'chord-shape': {
      const q = CHORD_QUALITY_BY_ID.get(desc.quality);
      const short = `${desc.keyName}${q?.suffix ?? ''}`;
      const longName = q?.label ?? 'chord';
      // Don't duplicate when short-form already matches long-form
      // (e.g. bare "C" vs. "Major" — still worth the parenthetical
      // because row context isn't always visible from the modal).
      const base = `${short} (${longName.toLowerCase()})`;
      // Inversion-state suffix when present and non-default. Triads
      // and sevenths produce per-state rows; the label disambiguates
      // them in DrillListModal headers + the breakdown panel.
      const stateText = inversionStateLabel(desc.inversionState);
      return stateText ? `${base} — ${stateText}` : base;
    }
    case 'scale': {
      const s = SCALES.find(x => x.id === desc.scale);
      return `${desc.keyName} ${s?.label ?? 'Scale'}`;
    }
    case 'voice-leading': {
      const p = VOICE_LEADING_PATTERNS.find(x => x.id === desc.patternId);
      return `${p?.label ?? 'Pattern'} in ${desc.keyName}`;
    }
    case 'mental-viz': {
      const v = MENTAL_VIZ_VARIANTS.find(x => x.id === desc.variant);
      return v?.label ?? 'Mental drill';
    }
  }
}

// --- Session logging -----------------------------------------------

export interface LogSessionInput {
  skill: DrillSkill;
  drillType: DrillType;
  durationSeconds: number;
  feelRating: DrillSession['feelRating'];
  notes?: string;
}

/**
 * Map the existing 4-point feel scale onto the 3-categorical rating
 * vocabulary spacingState consumes. The cut-line is at "competent or
 * better" (≥ 3): the design's promotion rule is "last 3 ratings all
 * in {flying, cruising}", and "working on it" is honestly below the
 * acquired-level competency bar.
 *
 *   1 (struggled)      → crawling
 *   2 (working on it)  → crawling
 *   3 (clean)          → cruising
 *   4 (in flow)        → flying
 */
function feelToRating(feel: DrillSession['feelRating']): 'flying' | 'cruising' | 'crawling' {
  if (feel >= 4) return 'flying';
  if (feel >= 3) return 'cruising';
  return 'crawling';
}

/**
 * Build a spacingState itemRef from a skill descriptor. Returns null
 * for mental-viz — Mental Visualization is excluded from spacingState
 * rows by design (it's a different cognitive mode for internalising
 * existing shapes, not a separate catalog item; counts toward
 * consistency goals but not breadth/depth/mastery).
 *
 * Format mirrors the Phase 2 Decision-1 table, extended for the
 * Phase 4 inversion-tracking redesign:
 *   chord-shape (triad/seventh) → `chord-shape:${quality}:${keyName}:${inversionState}`
 *   chord-shape (extension/special) → `chord-shape:${quality}:${keyName}` (unchanged)
 *   chord-shape (supplementary, sevenths) → `chord-shape:${quality}:${keyName}:supplementary`
 *                                            — filtered out of acquisition queries
 *                                              by gatesAcquisition / matchers.
 *   scale         → `scale:${scale}:${keyName}`
 *   voice-leading → `vl:${patternId}:${keyName}`
 *   mental-viz    → null (skip)
 */
function itemRefForSkill(skill: DrillSkill): string | null {
  switch (skill.kind) {
    case 'chord-shape': {
      const base = `chord-shape:${skill.quality}:${skill.keyName}`;
      return skill.inversionState ? `${base}:${skill.inversionState}` : base;
    }
    case 'scale':         return `scale:${skill.scale}:${skill.keyName}`;
    case 'voice-leading': return `vl:${skill.patternId}:${skill.keyName}`;
    case 'mental-viz':    return null;
  }
}

/**
 * Log a completed drill session: write the session row AND update
 * the drill-type aggregates in the same transaction so the heat
 * grid can trust those counts without summing sessions on render.
 *
 * After the transaction commits, also record a spacingState
 * engagement (rating signal, not attempt — Shapes & Patterns is
 * procedural). The spacingState write is deliberately outside the
 * transaction: a failure there must not roll back the drill session,
 * and including spacingState in the write set would couple two
 * concerns. Mental-viz sessions still log here but do not produce
 * spacingState rows (see itemRefForSkill).
 */
export async function logSession(input: LogSessionInput): Promise<DrillSession> {
  const session: DrillSession = {
    id: uid('dses'),
    drillTypeId: input.drillType.id,
    skillId: input.skill.id,
    durationSeconds: Math.round(input.durationSeconds),
    feelRating: input.feelRating,
    notes: input.notes?.trim() || undefined,
    timestamp: Date.now(),
  };
  await db.transaction('rw', [db.drillSessions, db.drillTypes], async () => {
    await db.drillSessions.add(session);
    await db.drillTypes.update(input.drillType.id, {
      repCount: input.drillType.repCount + 1,
      totalSeconds: input.drillType.totalSeconds + session.durationSeconds,
      lastPracticedAt: session.timestamp,
    });
  });
  const itemRef = itemRefForSkill(input.skill);
  if (itemRef !== null) {
    await recordEngagement({
      itemRef,
      moduleRef: 'shapes-and-patterns',
      signal: { kind: 'rating', rating: feelToRating(input.feelRating) },
      timestamp: session.timestamp,
    });
  }
  return session;
}

// --- Aggregation helpers (used by heat grid + attention panel) -----

/** Aggregate stats across a set of drill types belonging to one skill
 *  cell. Used for per-cell heat-grid colour + completeness flag. */
export interface CellAggregate {
  totalSeconds: number;
  lastPracticedAt: number | null;
  /** Max totalSeconds across the cell's drill types. Used to flag
   *  imbalance within a cell. */
  topDrillSeconds: number;
  /** True when at least one drill type is underpractised vs the
   *  dominant one (<30% of top AND <600s total). Drives the corner
   *  "incomplete" indicator on the cell. */
  imbalanced: boolean;
  typeCount: number;
}

export function aggregateCell(types: DrillType[]): CellAggregate {
  if (types.length === 0) {
    return { totalSeconds: 0, lastPracticedAt: null, topDrillSeconds: 0, imbalanced: false, typeCount: 0 };
  }
  let total = 0;
  let last: number | null = null;
  let top = 0;
  for (const t of types) {
    total += t.totalSeconds;
    if (t.totalSeconds > top) top = t.totalSeconds;
    if (t.lastPracticedAt !== null && (last === null || t.lastPracticedAt > last)) {
      last = t.lastPracticedAt;
    }
  }
  const imbalanced = top > 0 && types.some(t => t.totalSeconds < top * 0.3 && t.totalSeconds < 600);
  return {
    totalSeconds: total,
    lastPracticedAt: last,
    topDrillSeconds: top,
    imbalanced,
    typeCount: types.length,
  };
}

// --- Freshness + heat-tier bucketing -------------------------------

export type HeatTier = 'empty' | 'light' | 'medium' | 'deep';
export type FreshnessTier = 'fresh' | 'recent' | 'aging' | 'stale';

const DAY_MS = 24 * 60 * 60 * 1000;

export function heatTierFor(totalSeconds: number): HeatTier {
  if (totalSeconds <= 0) return 'empty';
  if (totalSeconds < 5 * 60) return 'empty';
  if (totalSeconds < 15 * 60) return 'light';
  if (totalSeconds < 45 * 60) return 'medium';
  return 'deep';
}

export function freshnessTier(lastPracticedAt: number | null): FreshnessTier {
  if (lastPracticedAt === null) return 'stale';
  const days = (Date.now() - lastPracticedAt) / DAY_MS;
  if (days <= 3) return 'fresh';
  if (days <= 10) return 'recent';
  if (days <= 20) return 'aging';
  return 'stale';
}

/** Multiplier applied to the base cell colour based on freshness. */
export function freshnessAlpha(tier: FreshnessTier): number {
  switch (tier) {
    case 'fresh':  return 1.0;
    case 'recent': return 0.9;
    case 'aging':  return 0.7;
    case 'stale':  return 0.5;
  }
}

export function daysSince(timestamp: number | null): number | null {
  if (timestamp === null) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
}

export function humanAgo(ts: number | null): string {
  if (ts === null) return 'never';
  const d = daysSince(ts) ?? 0;
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

// --- Feel-rating labels --------------------------------------------

export const FEEL_LABEL: Record<DrillSession['feelRating'], string> = {
  1: 'Struggled',
  2: 'Working on it',
  3: 'Clean',
  4: 'In flow',
};
export const FEEL_EMOJI: Record<DrillSession['feelRating'], string> = {
  1: '😓', 2: '🧗', 3: '🙂', 4: '🎶',
};
