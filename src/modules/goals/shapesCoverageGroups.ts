import {
  CHORD_QUALITIES,
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  VOICE_LEADING_PATTERNS,
  type QualityKind,
} from '../shapes-and-patterns/catalog';
import {
  parseScaleItemRef,
  SCALE_CELLS,
  type ScaleKind,
  type MajorPentStartingPoint,
  type MinorPentStartingPoint,
} from '../shapes-and-patterns/scaleSkills';
import type { ShapesActivityArea } from '../../lib/weeklyAttempts';

/**
 * Count of acquisition-path inversion-state rows per cell, by
 * QualityKind. Triads have 4 (root/inv1/inv2/fluid), sevenths have 5
 * (root/inv1/inv2/inv3/fluid — `supplementary` excluded), extensions
 * and special/sixth have 1 (single voicing-based row, no inversion
 * state). Drives the per-kind denominator multiplier.
 */
const ACQUISITION_PATH_STATES_PER_KIND: Record<QualityKind, number> = {
  triad:     INVERSION_STATES_FOR_CHORD_SHAPE_KIND.triad.filter(s => s !== 'supplementary').length,
  seventh:   INVERSION_STATES_FOR_CHORD_SHAPE_KIND.seventh.filter(s => s !== 'supplementary').length,
  extension: 1,
  special:   1,
};

/**
 * Coverage-picker granularity for Shapes & Patterns goals.
 *
 * The proficiency picker uses the coarse `ShapesActivityArea`
 * (chord_shape_drills / scale_drills / voice_leading) because
 * proficiency narrows to one specific shape × key from the broad
 * activity area. Coverage goals are different — the user wants to
 * commit to "cover all triads" or "cover all sevenths" without
 * blending the four chord-shape kinds into a single 348-item
 * bucket. This file defines the finer-grained id space for that.
 *
 *   chord_shape_triads     — 6 triad qualities × 12 keys = 72
 *   chord_shape_sevenths   — 6 seventh qualities × 12 keys = 72
 *   chord_shape_extensions — 14 extension qualities × 12 keys = 168
 *   chord_shape_special    — 3 special/sixth qualities × 12 keys = 36
 *   scale_drills           — 4 scales × 12 keys = 48
 *   voice_leading          — 3 patterns × 12 keys = 36
 *
 * `chord_shape_drills` (the legacy single bucket) is intentionally
 * not in the union — saved goals from before the split still hit
 * the back-compat path in `coverageGroupIdToActivityArea` and
 * `itemRefMatcherForCoverageGroup` so existing data keeps reading
 * correctly until those goals are re-saved.
 */
export type ShapesCoverageGroupId =
  | 'chord_shape_triads'
  | 'chord_shape_triads_maj'
  | 'chord_shape_triads_min'
  | 'chord_shape_triads_dim'
  | 'chord_shape_triads_aug'
  | 'chord_shape_triads_sus2'
  | 'chord_shape_triads_sus4'
  | 'chord_shape_sevenths'
  | 'chord_shape_extensions'
  | 'chord_shape_special'
  // Legacy broad "all scales" bucket — kept for back-compat with
  // pre-Scales-submodule saved goals. Picker hides it in favour of
  // the four sub-area ids below.
  | 'scale_drills'
  // Scales submodule (Part 3) — four sub-area pills in the picker,
  // each with its own coverage matcher. Pent ids fan out to
  // per-starting-point variants for narrower scoping.
  | 'scale_major'
  | 'scale_natural_minor'
  | 'scale_major_pentatonic'
  | 'scale_major_pentatonic_1'
  | 'scale_major_pentatonic_5'
  | 'scale_major_pentatonic_6'
  | 'scale_minor_pentatonic'
  | 'scale_minor_pentatonic_1'
  | 'scale_minor_pentatonic_b3'
  | 'scale_minor_pentatonic_b7'
  | 'voice_leading';

/**
 * Per-triad-quality coverage groups (Layer 2). Each represents a
 * single chord quality across all 12 keys × 4 inversion states =
 * 48 items, allowing the user to scope a coverage goal to (e.g.)
 * just major + minor triads instead of all six triad qualities.
 *
 * Maps the coverage-group id to the underlying chord-quality id in
 * the catalog (the `parts[1]` segment of the itemRef). The legacy
 * `chord_shape_triads` id is the "all six qualities" shortcut and
 * doesn't appear here — it's handled by the broad-kind matcher.
 */
const TRIAD_QUALITY_FOR_GROUP_ID: Readonly<
  Partial<Record<ShapesCoverageGroupId, string>>
> = {
  chord_shape_triads_maj:  'maj',
  chord_shape_triads_min:  'min',
  chord_shape_triads_dim:  'dim',
  chord_shape_triads_aug:  'aug',
  chord_shape_triads_sus2: 'sus2',
  chord_shape_triads_sus4: 'sus4',
};

export interface ShapesCoverageGroupDef {
  id: ShapesCoverageGroupId;
  label: string;
  /** Activity area this group rolls up to. Drives time-per-rep
   *  dispatch (all four chord-shape sub-groups share the
   *  chord_shape_drills 2 min/rep constant). */
  activityArea: ShapesActivityArea;
  /** Count of distinct shape × key combinations in the group. */
  denominator: number;
}

/** Quality ids belonging to a given QualityKind, in catalog order. */
export const CHORD_QUALITIES_BY_KIND: Record<QualityKind, ReadonlyArray<string>> = {
  triad:     CHORD_QUALITIES.filter(q => q.kind === 'triad').map(q => q.id),
  seventh:   CHORD_QUALITIES.filter(q => q.kind === 'seventh').map(q => q.id),
  extension: CHORD_QUALITIES.filter(q => q.kind === 'extension').map(q => q.id),
  special:   CHORD_QUALITIES.filter(q => q.kind === 'special').map(q => q.id),
};

const KEY_COUNT = KEYS.length;

/** Canonical coverage-group definitions. Live denominators come
 *  from the catalog so adding a new chord quality / scale / voice-
 *  leading pattern flows into the picker automatically. Triads and
 *  sevenths multiply by their per-cell inversion-state count from
 *  ACQUISITION_PATH_STATES_PER_KIND — each inversion is its own
 *  trackable item (triads: ×4, sevenths: ×5; supplementary excluded).
 */
const TRIAD_INVERSION_MULTIPLIER =
  KEY_COUNT * ACQUISITION_PATH_STATES_PER_KIND.triad;

export const SHAPES_COVERAGE_GROUP_DEFS: ReadonlyArray<ShapesCoverageGroupDef> = [
  {
    id: 'chord_shape_triads',
    label: 'triad inversions',
    activityArea: 'chord_shape_drills',
    denominator:
      CHORD_QUALITIES_BY_KIND.triad.length * KEY_COUNT * ACQUISITION_PATH_STATES_PER_KIND.triad,
  },
  // Layer 2 — per-quality triad sub-groups. Each = 12 keys × 4
  // inversion states = 48 items. The legacy `chord_shape_triads`
  // above is the "all six qualities" shortcut id used by the
  // picker's select-all behaviour and by older saved goals.
  {
    id: 'chord_shape_triads_maj',
    label: 'major triads',
    activityArea: 'chord_shape_drills',
    denominator: TRIAD_INVERSION_MULTIPLIER,
  },
  {
    id: 'chord_shape_triads_min',
    label: 'minor triads',
    activityArea: 'chord_shape_drills',
    denominator: TRIAD_INVERSION_MULTIPLIER,
  },
  {
    id: 'chord_shape_triads_dim',
    label: 'diminished triads',
    activityArea: 'chord_shape_drills',
    denominator: TRIAD_INVERSION_MULTIPLIER,
  },
  {
    id: 'chord_shape_triads_aug',
    label: 'augmented triads',
    activityArea: 'chord_shape_drills',
    denominator: TRIAD_INVERSION_MULTIPLIER,
  },
  {
    id: 'chord_shape_triads_sus2',
    label: 'sus2 triads',
    activityArea: 'chord_shape_drills',
    denominator: TRIAD_INVERSION_MULTIPLIER,
  },
  {
    id: 'chord_shape_triads_sus4',
    label: 'sus4 triads',
    activityArea: 'chord_shape_drills',
    denominator: TRIAD_INVERSION_MULTIPLIER,
  },
  {
    id: 'chord_shape_sevenths',
    label: 'seventh-chord inversions',
    activityArea: 'chord_shape_drills',
    denominator:
      CHORD_QUALITIES_BY_KIND.seventh.length * KEY_COUNT * ACQUISITION_PATH_STATES_PER_KIND.seventh,
  },
  {
    id: 'chord_shape_extensions',
    label: 'extensions',
    activityArea: 'chord_shape_drills',
    denominator: CHORD_QUALITIES_BY_KIND.extension.length * KEY_COUNT,
  },
  {
    id: 'chord_shape_special',
    label: 'special / sixth',
    activityArea: 'chord_shape_drills',
    denominator: CHORD_QUALITIES_BY_KIND.special.length * KEY_COUNT,
  },
  {
    id: 'scale_drills',
    label: 'scale drills',
    activityArea: 'scale_drills',
    // Sourced from the SCALE_CELLS catalog — 96 after the pent fan-out
    // (3 starting points × 12 keys for major-pent and minor-pent,
    // plus 12 each for major and natural-minor).
    denominator: SCALE_CELLS.length,
  },
  // -- Scales submodule sub-areas (Part 3). Denominators are
  //    sourced from the SCALE_CELLS catalog so adding a key or
  //    starting point flows through automatically.
  {
    id: 'scale_major',
    label: 'major scales',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(c => c.kind === 'major').length,
  },
  {
    id: 'scale_natural_minor',
    label: 'natural minor',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(c => c.kind === 'natural-minor').length,
  },
  {
    id: 'scale_major_pentatonic',
    label: 'major pentatonic',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(c => c.kind === 'major-pentatonic').length,
  },
  {
    id: 'scale_major_pentatonic_1',
    label: 'major pent — from 1',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(
      c => c.kind === 'major-pentatonic' && c.startingPoint === '1',
    ).length,
  },
  {
    id: 'scale_major_pentatonic_5',
    label: 'major pent — from 5',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(
      c => c.kind === 'major-pentatonic' && c.startingPoint === '5',
    ).length,
  },
  {
    id: 'scale_major_pentatonic_6',
    label: 'major pent — from 6',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(
      c => c.kind === 'major-pentatonic' && c.startingPoint === '6',
    ).length,
  },
  {
    id: 'scale_minor_pentatonic',
    label: 'minor pentatonic',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(c => c.kind === 'minor-pentatonic').length,
  },
  {
    id: 'scale_minor_pentatonic_1',
    label: 'minor pent — from 1',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(
      c => c.kind === 'minor-pentatonic' && c.startingPoint === '1',
    ).length,
  },
  {
    id: 'scale_minor_pentatonic_b3',
    label: 'minor pent — from b3',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(
      c => c.kind === 'minor-pentatonic' && c.startingPoint === 'b3',
    ).length,
  },
  {
    id: 'scale_minor_pentatonic_b7',
    label: 'minor pent — from b7',
    activityArea: 'scale_drills',
    denominator: SCALE_CELLS.filter(
      c => c.kind === 'minor-pentatonic' && c.startingPoint === 'b7',
    ).length,
  },
  {
    id: 'voice_leading',
    label: 'voice-leading',
    activityArea: 'voice_leading',
    denominator: VOICE_LEADING_PATTERNS.length * KEY_COUNT,
  },
];

const COVERAGE_GROUP_BY_ID: ReadonlyMap<string, ShapesCoverageGroupDef> = new Map(
  SHAPES_COVERAGE_GROUP_DEFS.map(g => [g.id, g]),
);

export function getShapesCoverageGroup(
  id: string,
): ShapesCoverageGroupDef | undefined {
  return COVERAGE_GROUP_BY_ID.get(id);
}

/**
 * Resolve the activity area a coverage-group id rolls up to. Used
 * by time-per-rep dispatch (all four chord-shape sub-groups share
 * the chord_shape_drills 2 min/rep constant) and by the
 * weekly-plan time renderer.
 *
 * Includes back-compat for the legacy `chord_shape_drills` id —
 * saved goals from before the split still produce correct time
 * estimates without forcing a data migration.
 */
export function coverageGroupIdToActivityArea(
  groupId: string,
): ShapesActivityArea | null {
  const def = COVERAGE_GROUP_BY_ID.get(groupId);
  if (def) return def.activityArea;
  // Legacy: pre-split goal records that stored the old single
  // chord_shape_drills bucket id.
  if (groupId === 'chord_shape_drills') return 'chord_shape_drills';
  return null;
}

/**
 * Pull the activity-area discriminator out of a Shapes goal's
 * targetUnit string. The unit carries the area in three encodings:
 *
 *   coverage_specific:    one of the six ShapesCoverageGroupId
 *                         values (or the legacy chord_shape_drills
 *                         id) — splits on coverage groups.
 *   proficiency_overall:  '${activityArea}:${level}'              → split before ':'
 *   proficiency_specific: '${activityArea}:${shapeId}:${key}:${level}' → split before ':'
 *
 * Returns null for overall-coverage rows ('items') and for any
 * unit string that doesn't resolve — caller falls back to the
 * catalog-weighted-average constant.
 *
 * Shared between WeeklyPlan's per-row time math and the by-module
 * view's per-goal time helper.
 */
export function shapesAreaFromUnit(
  unit: string | null,
): ShapesActivityArea | null {
  if (!unit) return null;
  const head = unit.includes(':') ? unit.slice(0, unit.indexOf(':')) : unit;
  return coverageGroupIdToActivityArea(head);
}

/** Broad-sub-area coverage-group id → ScaleKind. Drives both the
 *  matcher in `itemRefMatcherForCoverageGroup` and any consumer
 *  that needs to know which kind a group covers. */
const SCALE_KIND_FOR_GROUP_ID: Readonly<Record<string, ScaleKind>> = {
  scale_major:            'major',
  scale_natural_minor:    'natural-minor',
  scale_major_pentatonic: 'major-pentatonic',
  scale_minor_pentatonic: 'minor-pentatonic',
};

/** Per-starting-point coverage-group id → (kind, startingPoint).
 *  Defines the narrow scoping option for the two pentatonic
 *  sub-areas — each pent kind has three exposed starting points
 *  (major: 1/5/6, minor: 1/b3/b7). */
const PENT_SP_FOR_GROUP_ID: Readonly<
  Record<
    string,
    | { kind: 'major-pentatonic'; startingPoint: MajorPentStartingPoint }
    | { kind: 'minor-pentatonic'; startingPoint: MinorPentStartingPoint }
  >
> = {
  scale_major_pentatonic_1:   { kind: 'major-pentatonic', startingPoint: '1' },
  scale_major_pentatonic_5:   { kind: 'major-pentatonic', startingPoint: '5' },
  scale_major_pentatonic_6:   { kind: 'major-pentatonic', startingPoint: '6' },
  scale_minor_pentatonic_1:   { kind: 'minor-pentatonic', startingPoint: '1' },
  scale_minor_pentatonic_b3:  { kind: 'minor-pentatonic', startingPoint: 'b3' },
  scale_minor_pentatonic_b7:  { kind: 'minor-pentatonic', startingPoint: 'b7' },
};

/**
 * itemRef predicate matching the coverage group's spacingState
 * rows. Mirrors the itemRef format from
 * shapes-and-patterns/drillModel.ts:
 *
 *   chord-shape:${quality}:${keyName}                       — extension/special
 *   chord-shape:${quality}:${keyName}:${inversionState}     — triad/seventh
 *   scale:${scale}:${keyName}                               — scale_drills
 *   vl:${patternId}:${keyName}                              — voice_leading
 *
 * For triads/sevenths, the matcher excludes the `supplementary`
 * state (two-handed seventh-chord drills) — those are practice
 * tools, not acquisition-gating items, so they don't count toward
 * coverage progress. Drives spacingState filtering for both
 * progress-counting (modules/goals/progress.ts) and
 * session-candidate selection (lib/sessionAlgorithm/candidates.ts).
 */
export function itemRefMatcherForCoverageGroup(
  groupId: string,
): ((itemRef: string) => boolean) | null {
  if (groupId === 'scale_drills') return ir => ir.startsWith('scale:');
  if (groupId === 'voice_leading') return ir => ir.startsWith('vl:');
  // Legacy single-bucket id — keeps pre-split goals matching every
  // chord-shape row, including supplementary. Used only by
  // back-compat consumers.
  if (groupId === 'chord_shape_drills') return ir => ir.startsWith('chord-shape:');

  // Scales sub-area matchers (Part 3). Broad sub-area ids match by
  // ScaleKind; per-starting-point ids match by (kind, startingPoint).
  // Both parse through scaleSkills' parseScaleItemRef so any future
  // catalog extension (new starting points, new scale kinds) flows
  // through without touching the matcher.
  const scaleKind = SCALE_KIND_FOR_GROUP_ID[groupId];
  if (scaleKind !== undefined) {
    return ir => {
      const desc = parseScaleItemRef(ir);
      return desc !== null && desc.kind === scaleKind;
    };
  }
  const pentSp = PENT_SP_FOR_GROUP_ID[groupId];
  if (pentSp !== undefined) {
    return ir => {
      const desc = parseScaleItemRef(ir);
      if (desc === null) return false;
      if (desc.kind !== pentSp.kind) return false;
      return desc.startingPoint === pentSp.startingPoint;
    };
  }

  // Layer 2 — per-triad-quality sub-groups. Match the specific
  // chord-quality id in parts[1] and exclude supplementary state.
  const quality = TRIAD_QUALITY_FOR_GROUP_ID[groupId as ShapesCoverageGroupId];
  if (quality !== undefined) {
    return ir => {
      if (!ir.startsWith('chord-shape:')) return false;
      const parts = ir.split(':');
      if (parts.length < 3) return false;
      if (parts[1] !== quality) return false;
      if (parts.length >= 4 && parts[3] === 'supplementary') return false;
      return true;
    };
  }

  const kind = chordShapeKindForGroupId(groupId);
  if (!kind) return null;
  return ir => {
    if (!ir.startsWith('chord-shape:')) return false;
    const parts = ir.split(':');
    if (parts.length < 3) return false;
    const q = CHORD_QUALITY_BY_ID.get(parts[1]);
    if (q?.kind !== kind) return false;
    // 4-part triad/seventh refs: filter out the supplementary state
    // so two-handed seventh drills don't inflate coverage counts.
    // 3-part extension/special refs pass without inspecting parts[3].
    if (parts.length >= 4 && parts[3] === 'supplementary') return false;
    return true;
  };
}

function chordShapeKindForGroupId(groupId: string): QualityKind | null {
  switch (groupId) {
    case 'chord_shape_triads':       return 'triad';
    case 'chord_shape_triads_maj':   return 'triad';
    case 'chord_shape_triads_min':   return 'triad';
    case 'chord_shape_triads_dim':   return 'triad';
    case 'chord_shape_triads_aug':   return 'triad';
    case 'chord_shape_triads_sus2':  return 'triad';
    case 'chord_shape_triads_sus4':  return 'triad';
    case 'chord_shape_sevenths':     return 'seventh';
    case 'chord_shape_extensions':   return 'extension';
    case 'chord_shape_special':      return 'special';
    default: return null;
  }
}
