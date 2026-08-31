import { feelEmoji, feelLabel, type Feel } from '../../lib/fluencyScale';
import {
  db,
  type DrillHand,
  type DrillSession,
  type DrillSkill,
  type DrillStyle,
  type DrillType,
  type InversionState,
} from '../../lib/db';
import { addDrillSession } from '../../lib/practiceWrites';
import {
  CHORD_QUALITY_BY_ID,
  defaultDrillForChordShape,
  isCatalogQuality,
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
import { DRILL_FLOOR_SECONDS } from '../../lib/spacing/drillSettings';
import { feelColour } from '../../lib/spacing/statusColour';

/**
 * Minimum seconds a drill must run to count as a rep.
 *
 * RE-EXPORTED, NOT REDECLARED. The number is a setting rather than a
 * constant of this module — it belongs in the spacing settings tree
 * per skill and lives in `spacing/drillSettings` until it gets there.
 * This name is kept because a dozen call sites already read it.
 */
export const MIN_REP_SECONDS = DRILL_FLOOR_SECONDS;

/**
 * Brief two-tone cue played when a countdown drill timer hits zero.
 * Lives at module scope so every surface that ends a drill shares
 * the same end-of-drill audio
 * signature. Intentionally short + distinct so a finished drill
 * feels like a timed block. Audio import is dynamic so the module
 * stays tree-shake-friendly for non-modal callers.
 */
export async function playDrillEndCue(): Promise<void> {
  try {
    const { ensureRunning } = await import('../../lib/audio');
    const ctx = await ensureRunning();
    const t = ctx.currentTime + 0.02;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 780 + i * 260;
      gain.gain.setValueAtTime(0, t + i * 0.22);
      gain.gain.linearRampToValueAtTime(0.25, t + i * 0.22 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.22);
      osc.stop(t + i * 0.22 + 0.2);
    }
  } catch {
    // non-fatal
  }
}

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
  /** Pentatonic starting-point ("1" / "5" / "6" for major pent,
   *  "1" / "b3" / "b7" for minor pent). Undefined for major and
   *  natural-minor cells (their itemRef stays 3-part). The full
   *  Scales catalog lives in scaleSkills.ts; drillModel only needs
   *  enough of the shape to render labels + identify rows. */
  startingPoint?: string;
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
/**
 * True when a `shapes-and-patterns` spacingState itemRef points at
 * something the current catalog still counts toward coverage.
 *
 * WHY THIS EXISTS — the coverage numerator would otherwise exceed the
 * denominator:
 *
 *   Cut qualities. Practice data for the 17 qualities removed on
 *      20 Aug 2026 is deliberately KEPT, so adding one back restores
 *      its history intact. Those spacingState rows still carry
 *      moduleRef 'shapes-and-patterns' and still reach `acquired`, but
 *      the denominator no longer counts them.
 *   Supplementary rows. The left-hand root under a right-hand triad is
 *      not a shape to own: the triad is drilled on its own and the left
 *      hand is one note, so it is a combination of two things already
 *      counted. Out of the score again as of 31 Aug 2026 — see the note
 *      in `catalog.ts`, which carries both rulings and why the second
 *      one is not a reversion to the first's reasoning.
 *
 * THE ROWS ARE KEPT EITHER WAY, exactly as the cut qualities are. This
 * decides what the DENOMINATOR counts; the history stays on disk.
 *
 * BOTH SIDES OR NEITHER. If a rule leaves the denominator it has to
 * leave the numerator with it — this predicate is what every coverage
 * count filters through, so a rule applied on one side only is how a
 * percentage goes over 100.
 *
 * Scale and voice-leading itemRefs pass through untouched: they are
 * part of the same moduleRef and the same coverage total.
 */
export function countsTowardShapesCoverage(itemRef: string): boolean {
  const desc = parseShapesItemRef(itemRef);
  if (!desc) return false;
  if (desc.kind !== 'chord-shape') return true;
  if (desc.inversionState === 'supplementary') return false;
  return isCatalogQuality(desc.quality);
}

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
      // Two valid shapes:
      //   scale:{kind}:{key}            (3 parts) — major / nat-min
      //   scale:{kind}:{sp}:{key}       (4 parts) — major-pent / min-pent
      // The pent fan-out (3 starting points per key) ships as Part 1
      // of the Scales submodule (scaleSkills.ts) — we detect it here
      // so existing callers (proposal labels, spTiers's scale-skip)
      // don't mis-parse `parts[1]` as the key.
      if (!a) return null;
      if (parts.length === 4 && (a === 'major-pentatonic' || a === 'minor-pentatonic')) {
        if (!b || !c) return null;
        return { kind: 'scale', keyName: c, scale: a, startingPoint: b };
      }
      if (!b) return null;
      return { kind: 'scale', keyName: b, scale: a };
    }
    case 'vl': {
      // Two valid shapes:
      //   vl:{patternId}:{keyName}                       (3 parts — legacy / display-only)
      //   vl:{patternId}:{seg1}:{seg2}?:{keyName}        (4–5 parts — sub-cell)
      // For the SkillDescriptor model we only carry patternId + keyName
      // (keyName is always the LAST segment). Sub-cell dimensions
      // (level / position / target / direction) are not part of the
      // descriptor — callers needing them should use
      // `parseVoiceLeadingItemRef` from catalog.ts.
      if (!a) return null;
      const key = parts[parts.length - 1];
      if (!key) return null;
      return { kind: 'voice-leading', keyName: key, patternId: a };
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

/**
 * Resolve a chord-shape spacingState itemRef to the DrillSkill +
 * lowest-order DrillType needed to launch the session panel. Used by
 * SessionBlock's in-session chord-shape walk: each itemRef in the
 * block opens as its own drill modal in sequence.
 *
 * Materialises the cell's skill rows if they don't yet exist (via
 * findOrCreateSkill — idempotent). Returns null when the itemRef
 * doesn't parse as a chord-shape ref or the cell has no drill types
 * (extremely unusual — defaults are seeded alongside the skill).
 */
export async function drillContextForChordShapeItemRef(
  itemRef: string,
): Promise<{ skill: DrillSkill; drillType: DrillType } | null> {
  const desc = parseShapesItemRef(itemRef);
  if (!desc || desc.kind !== 'chord-shape') return null;
  const skill = await findOrCreateSkill(desc);
  const drillTypes = await db.drillTypes
    .where('skillId').equals(skill.id)
    .sortBy('order');
  const drillType = drillTypes[0];
  if (!drillType) return null;
  return { skill, drillType };
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
      const base = `${desc.keyName} ${s?.label ?? 'Scale'}`;
      // Pent cells carry a starting-point segment — surface it so
      // proposal labels distinguish "C Major Pentatonic — from 5"
      // from "C Major Pentatonic — from 6" in the same key.
      return desc.startingPoint ? `${base} — from ${desc.startingPoint}` : base;
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
  /** Which hand this drill was for. Chord shapes pass the active hand
   *  (left / right / both); the rating + spacing engagement are logged
   *  against it. */
  hand: DrillHand;
  /**
   * How the shape was played, for chord shapes that asked. Omitted by
   * every other kind and by any chord-shape surface that never put the
   * question — an absent style is honest where a default would not be.
   */
  style?: DrillStyle;
  durationSeconds: number;
  /** Countdown duration the user picked before starting the drill,
   *  in seconds. Persists separately from durationSeconds so a
   *  90 s drill the user ended at 47 s reads honestly as "47 of 90"
   *  rather than collapsing into one number. */
  targetSeconds?: number;
  /** Omitted when practice skipped the rating: the session row is
   *  still written, and no engagement is recorded for it. */
  feelRating?: DrillSession['feelRating'];
  notes?: string;
  /**
   * True when this rep was given inside a TEST, false inside practice.
   *
   * Rides through to the spacing row's performance entry, where the
   * band rule reads it: a test sets the band outright, practice is
   * capped at Developing, and an OMITTED flag is legacy and is never
   * capped. Omitted here too by callers that predate the two modes —
   * the in-session runner still opens the old drill modal, which knows
   * nothing about them.
   */
  fromTest?: boolean;
  /**
   * The tempo the run was played at, or omitted when nothing was
   * sounding. Captured where the run ended; never read back off the
   * metronome afterwards. See `DrillSession.bpm`.
   */
  bpm?: number;
  /** Which sitting this run belonged to — the id the panel already
   *  holds, and the same one the spacing rep carries. Omitted only by
   *  a caller that has no session. See `DrillSession.sessionId`. */
  sessionId?: string;
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
export function feelToRating(feel: Feel): 'flying' | 'cruising' | 'crawling' {
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
export function itemRefForSkill(skill: DrillSkill): string | null {
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
    hand: input.hand,
    ...(input.style !== undefined ? { style: input.style } : {}),
    durationSeconds: Math.round(input.durationSeconds),
    ...(input.targetSeconds !== undefined
      ? { targetSeconds: Math.round(input.targetSeconds) }
      : {}),
    feelRating: input.feelRating,
    // WHAT KIND OF RUN IT WAS. It arrived here already and was thrown
    // away; the row recorded the minutes and not the mode.
    ...(input.fromTest !== undefined ? { fromTest: input.fromTest } : {}),
    // WHAT TEMPO, AND WHICH SITTING. Both arrive from the panel that
    // ran the drill; absent stays absent rather than being recovered
    // from the metronome's current setting or matched by timestamp.
    ...(input.bpm !== undefined ? { bpm: Math.round(input.bpm) } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    notes: input.notes?.trim() || undefined,
    timestamp: Date.now(),
  };
  await db.transaction('rw', [db.drillSessions, db.drillTypes], async () => {
    await addDrillSession(session);
    await db.drillTypes.update(input.drillType.id, {
      repCount: input.drillType.repCount + 1,
      totalSeconds: input.drillType.totalSeconds + session.durationSeconds,
      lastPracticedAt: session.timestamp,
    });
  });
  const itemRef = itemRefForSkill(input.skill);
  // NO FEEL, NO ENGAGEMENT. The session above records that the run
  // happened; a spacing engagement is a claim about how it went, and
  // an unrated run makes none.
  if (itemRef !== null && input.feelRating !== undefined) {
    await recordEngagement({
      itemRef,
      moduleRef: 'shapes-and-patterns',
      hand: input.hand,
      // THE MANNER NO LONGER FORKS THE RATING. It is still written on
      // the DrillSession row above, for the practice log; it stopped
      // being part of a spacing row's identity when the arpeggiated
      // dimension was retired. One square, one rating.
      signal: {
        kind: 'rating',
        rating: feelToRating(input.feelRating),
        // Four levels preserved; the collapse to three is lossy.
        feel: input.feelRating,
        // PASSED ONLY WHEN THE CALLER KNOWS. Absent stays absent all
        // the way to the stored entry — see the field's own note.
        ...(input.fromTest !== undefined ? { fromTest: input.fromTest } : {}),
      },
      timestamp: session.timestamp,
    });
  }
  return session;
}

export interface LogScaleDrillSessionInput {
  /** Canonical scale itemRef from scaleSkills.ts — e.g.
   *  "scale:major:C" or "scale:major-pentatonic:5:Eb". */
  itemRef: string;
  /** Which hand this drill was for (left / right / both — separate
   *  skills). The modal records the rating + spacing engagement against
   *  it. */
  hand: DrillHand;
  /** Actual elapsed drill time in seconds. */
  durationSeconds: number;
  /** 4-point feel rating. OMITTED when practice skipped it — the
   *  session row is still written and no engagement is recorded. */
  feelRating?: DrillSession['feelRating'];
  /** Suggested per-cell drill seconds the user was working toward
   *  (SCALE_KIND_SECONDS). Optional — mirrors logSession's
   *  targetSeconds. */
  targetSeconds?: number;
  notes?: string;
  /** True when the run was part of a test rather than practice. The
   *  same flag the spacing rep carries, from the same source — see
   *  `DrillSession.fromTest`. Absent counts as practice. */
  fromTest?: boolean;
  /**
   * The tempo the run was played at, or omitted when nothing was
   * sounding. Captured where the run ended; never read back off the
   * metronome afterwards. See `DrillSession.bpm`.
   */
  bpm?: number;
  /** Which sitting this run belonged to — the id the panel already
   *  holds, and the same one the spacing rep carries. Omitted only by
   *  a caller that has no session. See `DrillSession.sessionId`. */
  sessionId?: string;
}

/**
 * Log a completed Scales-submodule drill as a DrillSession row.
 *
 * Scales diverges from the chord-shape / voice-leading drill model:
 * it runs off the static scaleSkills.ts catalog, not db.drillSkills /
 * db.drillTypes, so there's no DrillSkill row to attach. This helper
 * mirrors `logSession` (same DrillSession shape, same `dses-` id
 * prefix) but stands the scale `itemRef` in for both `skillId` and
 * `drillTypeId` — the row is still a well-formed DrillSession, which
 * is all getWeeklyAttempts() needs: it counts S&P attempts from
 * db.drillSessions by `timestamp` alone, with no skillId / drillTypeId
 * join (see weeklyAttempts.ts). Standing the itemRef in keeps scale
 * rows self-identifying — they're the drillSessions whose skillId
 * parses as a scale itemRef.
 *
 * Unlike `logSession` this does NOT update db.drillTypes (Scales has
 * none) and does NOT record a spacingState engagement — the Scales
 * drill modal records the rating against the precise cell itemRef
 * itself (pentatonic starting point included), and `logSession`'s
 * itemRef derivation would drop that starting point.
 */
export interface LogVoiceLeadingDrillSessionInput {
  /** Canonical sub-cell itemRef from `enumerateVoiceLeadingCells` —
   *  the new 5-part vl: form, e.g. `vl:aba-251:level1:A:C`. The
   *  modal resolves this from `pickMostDueVoiceLeadingSubCell`. */
  itemRef: string;
  /** Always 'both' — voice leading is two-handed by nature and is
   *  excluded from the hand dimension. Kept for DrillSession shape
   *  parity. */
  hand: DrillHand;
  /** Actual elapsed drill time in seconds. */
  durationSeconds: number;
  /** 4-point feel rating. OMITTED when practice skipped it — the
   *  session row is still written and no engagement is recorded. */
  feelRating?: DrillSession['feelRating'];
  /** Suggested per-cell drill seconds (`voiceLeadingCellSeconds`) the
   *  user was working toward. Optional — mirrors logSession's
   *  targetSeconds. */
  targetSeconds?: number;
  notes?: string;
  /** True when the run was part of a test rather than practice. The
   *  same flag the spacing rep carries, from the same source — see
   *  `DrillSession.fromTest`. Absent counts as practice. */
  fromTest?: boolean;
  /**
   * The tempo the run was played at, or omitted when nothing was
   * sounding. Captured where the run ended; never read back off the
   * metronome afterwards. See `DrillSession.bpm`.
   */
  bpm?: number;
  /** Which sitting this run belonged to — the id the panel already
   *  holds, and the same one the spacing rep carries. Omitted only by
   *  a caller that has no session. See `DrillSession.sessionId`. */
  sessionId?: string;
}

/**
 * Log a completed Voice-Leading sub-cell drill as a DrillSession row.
 *
 * Mirrors `logScaleDrillSession`: VL sub-cells run off the static
 * catalog in catalog.ts (no DrillSkill / DrillType rows), so the
 * itemRef stands in for both `skillId` and `drillTypeId`. That
 * keeps the row a well-formed DrillSession for getWeeklyAttempts
 * to count, and self-identifies as a VL row (its skillId parses
 * back into the sub-cell descriptor via parseVoiceLeadingItemRef).
 *
 * Does NOT update db.drillTypes (VL has none here) and does NOT
 * record a spacingState engagement — the VL drill modal records
 * the rating against the precise sub-cell itemRef itself.
 */
export async function logVoiceLeadingDrillSession(
  input: LogVoiceLeadingDrillSessionInput,
): Promise<DrillSession> {
  const session: DrillSession = {
    id: uid('dses'),
    drillTypeId: input.itemRef,
    skillId: input.itemRef,
    hand: input.hand,
    // NO STYLE. Voice leading has nothing to block and nothing to
    // break — the movement between voicings is the exercise.
    durationSeconds: Math.round(input.durationSeconds),
    ...(input.targetSeconds !== undefined
      ? { targetSeconds: Math.round(input.targetSeconds) }
      : {}),
    ...(input.feelRating !== undefined ? { feelRating: input.feelRating } : {}),
    ...(input.fromTest !== undefined ? { fromTest: input.fromTest } : {}),
    // WHAT TEMPO, AND WHICH SITTING. Both arrive from the panel that
    // ran the drill; absent stays absent rather than being recovered
    // from the metronome's current setting or matched by timestamp.
    ...(input.bpm !== undefined ? { bpm: Math.round(input.bpm) } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    notes: input.notes?.trim() || undefined,
    timestamp: Date.now(),
  };
  await addDrillSession(session);
  return session;
}

export async function logScaleDrillSession(
  input: LogScaleDrillSessionInput,
): Promise<DrillSession> {
  const session: DrillSession = {
    id: uid('dses'),
    drillTypeId: input.itemRef,
    skillId: input.itemRef,
    hand: input.hand,
    // NO STYLE. A scale is a single line; there is nothing to block.
    durationSeconds: Math.round(input.durationSeconds),
    ...(input.targetSeconds !== undefined
      ? { targetSeconds: Math.round(input.targetSeconds) }
      : {}),
    ...(input.feelRating !== undefined ? { feelRating: input.feelRating } : {}),
    ...(input.fromTest !== undefined ? { fromTest: input.fromTest } : {}),
    // WHAT TEMPO, AND WHICH SITTING. Both arrive from the panel that
    // ran the drill; absent stays absent rather than being recovered
    // from the metronome's current setting or matched by timestamp.
    ...(input.bpm !== undefined ? { bpm: Math.round(input.bpm) } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    notes: input.notes?.trim() || undefined,
    timestamp: Date.now(),
  };
  await addDrillSession(session);
  return session;
}

/**
 * A rated mental-visualisation card, as a session row.
 *
 * =====================================================================
 * IT USED TO RECORD ONLY AN ENGAGEMENT, so the one thing the module
 * measures everywhere else — time — did not exist for it at all. Its
 * card could show a coverage and a last-worked and nothing about how
 * long any of it took.
 *
 * MIRRORS `logScaleDrillSession`: the itemRef stands in for both
 * `skillId` and `drillTypeId`, because the mental-viz library is a
 * static catalog with no `DrillSkill` row behind it. That keeps the
 * row well-formed and self-identifying — an `mv:` skillId names its
 * own section.
 *
 * THE DURATION IS THE CARD'S OWN, prompt to rating, which is the only
 * span the drill actually observes. It writes NO spacingState
 * engagement: the drill already records one against the same itemRef,
 * and a second would double-count the rep.
 *
 * KNOCK-ON, STATED BECAUSE IT IS REAL: `drillSessions` is what
 * `getWeeklyAttempts` and `loadPracticeDays` read for this module, so
 * mental-viz reps now count toward consistency. That matches the
 * April 27 call — mental viz counts toward consistency, not toward
 * breadth, depth or mastery — and those three read `spacingState`
 * coverage, which is untouched.
 * =====================================================================
 */
export interface LogMentalVizSessionInput {
  /** Canonical mental-viz itemRef — `mv:…` from mentalVizLibrary. */
  itemRef: string;
  /** Seconds from the prompt appearing to the rating being given. */
  durationSeconds: number;
  /** The drill's own three-way rating, mapped onto the four-point
   *  scale `DrillSession` stores. */
  rating: 'flying' | 'cruising' | 'crawling';
  /** True when the run was part of a test rather than practice. The
   *  same flag the spacing rep carries, from the same source — see
   *  `DrillSession.fromTest`. Absent counts as practice. */
  fromTest?: boolean;
}

/**
 * The three-way rating on the four-point scale, chosen so it round
 * trips: `feelToRating` maps each of these back to the rating given.
 * Crawling takes 2 rather than 1 — the drill offers one "struggled"
 * answer, and reading it as the harsher of the two would say something
 * the reader did not.
 */
const MENTAL_VIZ_FEEL: Readonly<Record<
  LogMentalVizSessionInput['rating'], DrillSession['feelRating']
>> = { flying: 4, cruising: 3, crawling: 2 };

export async function logMentalVizSession(
  input: LogMentalVizSessionInput,
): Promise<DrillSession> {
  const session: DrillSession = {
    id: uid('dses'),
    drillTypeId: input.itemRef,
    skillId: input.itemRef,
    // Away from the keyboard entirely — no hand, no style. `both` is
    // the hand field's own default for a row with neither.
    hand: 'both',
    durationSeconds: Math.round(input.durationSeconds),
    feelRating: MENTAL_VIZ_FEEL[input.rating],
    timestamp: Date.now(),
  };
  await addDrillSession(session);
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

// THE WORDS COME FROM `fluencyScale`, which is the only definition.
// These two maps used to be a private copy; so did the labels inside
// FEEL_CARD_OPTIONS below.
export const FEEL_LABEL: Record<Feel, string> = {
  1: feelLabel(1), 2: feelLabel(2), 3: feelLabel(3), 4: feelLabel(4),
};
export const FEEL_EMOJI: Record<Feel, string> = {
  1: feelEmoji(1), 2: feelEmoji(2), 3: feelEmoji(3), 4: feelEmoji(4),
};

/**
 * Shared rating-card config. Full-width tall cards, ordered worst →
 * best to match the block wrap-up screen.
 *
 * COLOURS FROM `statusColour`, which is where the rating→status
 * alignment lives: Struggled is Needs Work, In flow is Mastered. This
 * file spelled the four out and so did two others, so In flow could
 * have stayed a second green while Mastered moved to blue.
 */
const FEEL_CARD_HINT: Record<Feel, string> = {
  1: 'breakdowns, not flowing',
  2: 'getting there, still effortful',
  3: 'steady, clean execution',
  4: 'effortless, automatic',
};

export const FEEL_CARD_OPTIONS: ReadonlyArray<{
  value: Feel;
  label: string;
  hint: string;
  activeClass: string;
  inactiveClass: string;
}> = ([1, 2, 3, 4] as const).map(value => ({
  value,
  label: feelLabel(value),
  hint: FEEL_CARD_HINT[value],
  activeClass: feelColour(value).fill,
  inactiveClass: feelColour(value).outline,
}));

/**
 * Per-item "more time" re-drill lengths shown on the assess screen of
 * every S&P drill modal. Absolute durations — tapping one restarts the
 * countdown in place at that length. Mirrors EXTEND_DRILL_OPTIONS in
 * ActiveSessionScreen (block-level extend); kept in sync.
 */
export const EXTEND_DRILL_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '+30s', seconds: 30 },
  { label: '+1 min', seconds: 60 },
  { label: '+2 min', seconds: 120 },
  { label: '+5 min', seconds: 300 },
];
