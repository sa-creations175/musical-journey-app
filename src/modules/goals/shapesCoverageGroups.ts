import {
  CHORD_QUALITIES,
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  SCALES,
  VOICE_LEADING_PATTERNS,
  type QualityKind,
} from '../shapes-and-patterns/catalog';
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
  | 'chord_shape_sevenths'
  | 'chord_shape_extensions'
  | 'chord_shape_special'
  | 'scale_drills'
  | 'voice_leading';

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
export const SHAPES_COVERAGE_GROUP_DEFS: ReadonlyArray<ShapesCoverageGroupDef> = [
  {
    id: 'chord_shape_triads',
    label: 'triad inversions',
    activityArea: 'chord_shape_drills',
    denominator:
      CHORD_QUALITIES_BY_KIND.triad.length * KEY_COUNT * ACQUISITION_PATH_STATES_PER_KIND.triad,
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
    denominator: SCALES.length * KEY_COUNT,
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
    case 'chord_shape_triads':     return 'triad';
    case 'chord_shape_sevenths':   return 'seventh';
    case 'chord_shape_extensions': return 'extension';
    case 'chord_shape_special':    return 'special';
    default: return null;
  }
}
