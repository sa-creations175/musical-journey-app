import {
  CHORD_QUALITIES,
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  KEYS_CIRCLE_OF_FOURTHS,
  parseVoiceLeadingItemRef,
  voiceLeadingCellsPerKey,
  voiceLeadingTotalCellCount,
  VOICE_LEADING_PATTERN_BY_ID,
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
 *   voice_leading          — 31 sub-cells × 12 keys = 372
 *                            (7 patterns; see voiceLeadingTotalCellCount)
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
  // Per-quality seventh-chord sub-groups (Layer 2). Each = 12 keys ×
  // 5 acquisition-path inversion states = 60 items. Mirrors the
  // per-quality triad sub-groups (`chord_shape_triads_*`).
  | 'chord_shape_sevenths_maj7'
  | 'chord_shape_sevenths_min7'
  | 'chord_shape_sevenths_dom7'
  | 'chord_shape_sevenths_m7b5'
  | 'chord_shape_sevenths_dim7'
  | 'chord_shape_sevenths_mmaj7'
  | 'chord_shape_extensions'
  // Extension family sub-groups (Layer 2). Cells per family derive
  // from `EXTENSION_FAMILY_FOR_QUALITY_ID` × 12 keys; `diminished`
  // and `augmented` are forward-compat placeholders — catalog has
  // no items in these families today, so denominators are 0 and
  // matchers return false.
  | 'chord_shape_extensions_major'
  | 'chord_shape_extensions_minor'
  | 'chord_shape_extensions_dominant'
  | 'chord_shape_extensions_altered_dominant'
  | 'chord_shape_extensions_diminished'
  | 'chord_shape_extensions_augmented'
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
  | 'voice_leading'
  // Voice-leading submodule per-pattern sub-groups. Each = 12 keys ×
  // pattern fan-out cells. Picker exposes them as Layer 2 reveals
  // beneath the "all voice-leading" shortcut, mirroring how the six
  // triad-quality sub-pills sit beneath "triad inversions".
  | 'voice_leading_diatonic_cycle'
  | 'voice_leading_five_one'
  | 'voice_leading_major_251'
  | 'voice_leading_minor_251'
  | 'voice_leading_minor_aba'
  | 'voice_leading_dom7b9'
  | 'voice_leading_dim7';

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

/** Per-quality seventh sub-groups (Layer 2). Same shape as
 *  TRIAD_QUALITY_FOR_GROUP_ID — each maps to the catalog `quality.id`
 *  in `parts[1]` of a chord-shape itemRef. */
const SEVENTH_QUALITY_FOR_GROUP_ID: Readonly<
  Partial<Record<ShapesCoverageGroupId, string>>
> = {
  chord_shape_sevenths_maj7:  'maj7',
  chord_shape_sevenths_min7:  'min7',
  chord_shape_sevenths_dom7:  'dom7',
  chord_shape_sevenths_m7b5:  'm7b5',
  chord_shape_sevenths_dim7:  'dim7',
  chord_shape_sevenths_mmaj7: 'mmaj7',
};

/** Extension-family classification per chord-quality id. Drives the
 *  extension sub-group matchers + denominators (count × 12 keys).
 *  `add9` rolls into the major family — typically voiced over a
 *  major triad. Altered dominants live in their own bucket so the
 *  user can target tension-loaded voicings separately from the
 *  natural dominant extensions. Diminished + augmented families
 *  have no catalog entries today; the sub-groups exist as
 *  forward-compat placeholders. */
type ExtensionFamily =
  | 'major'
  | 'minor'
  | 'dominant'
  | 'altered_dominant'
  | 'diminished'
  | 'augmented';

const EXTENSION_FAMILY_FOR_QUALITY_ID: Readonly<Record<string, ExtensionFamily>> = {
  // Major family — natural extensions of the major triad, plus add9
  // which is typically voiced over major.
  maj9:    'major',
  maj11:   'major',
  maj13:   'major',
  maj7s11: 'major',
  add9:    'major',
  // Minor family
  min9:  'minor',
  min11: 'minor',
  min13: 'minor',
  // Dominant family — natural extensions of the dom7.
  dom9:  'dominant',
  dom11: 'dominant',
  dom13: 'dominant',
  // Altered dominants — tension-loaded voicings on the V chord.
  dom7b9:  'altered_dominant',
  dom7s9:  'altered_dominant',
  dom7b13: 'altered_dominant',
};

const EXTENSION_FAMILY_FOR_GROUP_ID: Readonly<
  Partial<Record<ShapesCoverageGroupId, ExtensionFamily>>
> = {
  chord_shape_extensions_major:            'major',
  chord_shape_extensions_minor:            'minor',
  chord_shape_extensions_dominant:         'dominant',
  chord_shape_extensions_altered_dominant: 'altered_dominant',
  chord_shape_extensions_diminished:       'diminished',
  chord_shape_extensions_augmented:        'augmented',
};

/** Count of catalog extension qualities in a given family. Used for
 *  the per-family denominator (multiplied by KEY_COUNT). Returns 0
 *  for `diminished` / `augmented` until the catalog grows. */
function countExtensionsInFamily(family: ExtensionFamily): number {
  let count = 0;
  for (const q of CHORD_QUALITIES) {
    if (q.kind !== 'extension') continue;
    if (EXTENSION_FAMILY_FOR_QUALITY_ID[q.id] === family) count += 1;
  }
  return count;
}

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
  // Layer 2 — per-quality seventh sub-groups. Each = 12 keys × 5
  // inversion states (acquisition path) = 60 items. Same shape as
  // the per-quality triad sub-groups.
  ...sevenths7QualityDef('chord_shape_sevenths_maj7',  'maj7',  'major 7'),
  ...sevenths7QualityDef('chord_shape_sevenths_min7',  'min7',  'minor 7'),
  ...sevenths7QualityDef('chord_shape_sevenths_dom7',  'dom7',  'dominant 7'),
  ...sevenths7QualityDef('chord_shape_sevenths_m7b5',  'm7b5',  'half-diminished'),
  ...sevenths7QualityDef('chord_shape_sevenths_dim7',  'dim7',  'diminished 7'),
  ...sevenths7QualityDef('chord_shape_sevenths_mmaj7', 'mmaj7', 'minor-major 7'),
  {
    id: 'chord_shape_extensions',
    label: 'extensions',
    activityArea: 'chord_shape_drills',
    denominator: CHORD_QUALITIES_BY_KIND.extension.length * KEY_COUNT,
  },
  // Layer 2 — extension family sub-groups. Denominators sourced from
  // the catalog via EXTENSION_FAMILY_FOR_QUALITY_ID. `diminished`
  // and `augmented` are forward-compat placeholders (0 cells today;
  // the picker hides any group with a 0 denominator).
  extensionsFamilyDef('chord_shape_extensions_major',            'major',            'major extensions'),
  extensionsFamilyDef('chord_shape_extensions_minor',            'minor',            'minor extensions'),
  extensionsFamilyDef('chord_shape_extensions_dominant',         'dominant',         'dominant extensions'),
  extensionsFamilyDef('chord_shape_extensions_altered_dominant', 'altered_dominant', 'altered dominants'),
  extensionsFamilyDef('chord_shape_extensions_diminished',       'diminished',       'diminished extensions'),
  extensionsFamilyDef('chord_shape_extensions_augmented',        'augmented',        'augmented extensions'),
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
    denominator: voiceLeadingTotalCellCount(),
  },
  // Voice-leading submodule sub-groups. Denominators sourced from
  // `voiceLeadingCellsPerKey × 12` so any future fan-out change in
  // the catalog flows through without touching this file. Inlined
  // (rather than built via a helper that reads a later-declared
  // map) to avoid a temporal-dead-zone ReferenceError at module
  // init — SHAPES_COVERAGE_GROUP_DEFS is consumed eagerly by other
  // module-level constants in this file.
  ...vlPatternGroupDef('voice_leading_diatonic_cycle', 'diatonic-cycle', 'diatonic cycle'),
  ...vlPatternGroupDef('voice_leading_five_one',       'five-one',       '5→1 movement'),
  ...vlPatternGroupDef('voice_leading_major_251',      'major-251',      'major 2-5-1'),
  ...vlPatternGroupDef('voice_leading_minor_251',      'minor-251',      'minor 2-5-1'),
  ...vlPatternGroupDef('voice_leading_minor_aba',      'minor-aba',      'minor ABA'),
  ...vlPatternGroupDef('voice_leading_dom7b9',         'dom7b9',         'dom7b9 → minor'),
  ...vlPatternGroupDef('voice_leading_dim7',           'dim7',           'dim7 → minor'),
];

/** Per-pattern VL coverage-group id → catalog patternId. Drives the
 *  matcher in `itemRefMatcherForCoverageGroup`. Declared AFTER the
 *  DEFS array because the array is built via inline calls to
 *  `vlPatternGroupDef` rather than reading this map — keeps the
 *  array readable while the map stays the single source of truth
 *  for the matcher lookup. */
const VL_PATTERN_ID_FOR_GROUP_ID: Readonly<
  Partial<Record<ShapesCoverageGroupId, string>>
> = {
  voice_leading_diatonic_cycle: 'diatonic-cycle',
  voice_leading_five_one:       'five-one',
  voice_leading_major_251:      'major-251',
  voice_leading_minor_251:      'minor-251',
  voice_leading_minor_aba:      'minor-aba',
  voice_leading_dom7b9:         'dom7b9',
  voice_leading_dim7:           'dim7',
};

/** Build the single per-pattern VL coverage-group def. Returns an
 *  empty array when the catalog has no matching pattern — defensive
 *  against catalog drift; the picker silently drops the missing
 *  group rather than crashing module init. Function declaration
 *  (not const) so it's hoisted above the DEFS array literal. */
function vlPatternGroupDef(
  groupId: ShapesCoverageGroupId,
  patternId: string,
  label: string,
): ReadonlyArray<ShapesCoverageGroupDef> {
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);
  if (!pattern) return [];
  return [{
    id: groupId,
    label,
    activityArea: 'voice_leading',
    denominator: voiceLeadingCellsPerKey(pattern) * KEY_COUNT,
  }];
}

/** Build a per-quality seventh sub-group def. Same shape as the
 *  inlined triad-quality entries, but produced via a helper to keep
 *  the DEFS array readable. Returns empty when the catalog has no
 *  matching quality (defensive against catalog drift). Hoisted via
 *  function declaration. */
function sevenths7QualityDef(
  groupId: ShapesCoverageGroupId,
  qualityId: string,
  label: string,
): ReadonlyArray<ShapesCoverageGroupDef> {
  const quality = CHORD_QUALITY_BY_ID.get(qualityId);
  if (!quality || quality.kind !== 'seventh') return [];
  return [{
    id: groupId,
    label,
    activityArea: 'chord_shape_drills',
    denominator: KEY_COUNT * ACQUISITION_PATH_STATES_PER_KIND.seventh,
  }];
}

/** Build an extension-family sub-group def. Denominator = count of
 *  catalog qualities in the family × 12 keys. Diminished + augmented
 *  return denominator 0 today (no catalog entries); the picker UI
 *  filters out 0-cell groups so empty placeholders don't render. */
function extensionsFamilyDef(
  groupId: ShapesCoverageGroupId,
  family: ExtensionFamily,
  label: string,
): ShapesCoverageGroupDef {
  return {
    id: groupId,
    label,
    activityArea: 'chord_shape_drills',
    denominator: countExtensionsInFamily(family) * KEY_COUNT,
  };
}

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

  // Per-pattern VL sub-groups. Parse-based so any future VL schema
  // evolution (new patterns, new dimension axes) flows through
  // parseVoiceLeadingItemRef without touching the matcher.
  const vlPatternId =
    VL_PATTERN_ID_FOR_GROUP_ID[groupId as ShapesCoverageGroupId];
  if (vlPatternId !== undefined) {
    return ir => {
      const desc = parseVoiceLeadingItemRef(ir);
      return desc !== null && desc.patternId === vlPatternId;
    };
  }
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

  // Layer 2 — per-quality seventh sub-groups. Same matcher shape as
  // triads: exact parts[1] match + supplementary exclusion.
  const seventhQuality =
    SEVENTH_QUALITY_FOR_GROUP_ID[groupId as ShapesCoverageGroupId];
  if (seventhQuality !== undefined) {
    return ir => {
      if (!ir.startsWith('chord-shape:')) return false;
      const parts = ir.split(':');
      if (parts.length < 3) return false;
      if (parts[1] !== seventhQuality) return false;
      if (parts.length >= 4 && parts[3] === 'supplementary') return false;
      return true;
    };
  }

  // Layer 2 — extension family sub-groups. Match by family
  // classification of parts[1] against EXTENSION_FAMILY_FOR_QUALITY_ID.
  // Diminished + augmented families have no entries today → matcher
  // returns false for every input (intentional, placeholder groups).
  const extensionFamily =
    EXTENSION_FAMILY_FOR_GROUP_ID[groupId as ShapesCoverageGroupId];
  if (extensionFamily !== undefined) {
    return ir => {
      if (!ir.startsWith('chord-shape:')) return false;
      const parts = ir.split(':');
      if (parts.length < 3) return false;
      return EXTENSION_FAMILY_FOR_QUALITY_ID[parts[1]] === extensionFamily;
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

/**
 * Enumerate the full chord-shape itemRef universe — every
 * quality × key × acquisition-path inversion state — excluding the
 * sevenths' `supplementary` state (a practice tool, not an
 * acquisition item). Keys cycle in circle-of-fourths order
 * (C → F → Bb → … → G, matching the voice-leading section) and
 * iteration is key-major, so callers that cap the result (e.g. the
 * session generator's cold-start injector) get a spread across
 * qualities within the first few circle-of-fourths keys.
 *
 * The ref format mirrors `itemRefForSkill` exactly, so the enumerated
 * refs line up 1:1 with the spacingState rows the drill surfaces
 * create. Pure catalog enumeration — no DB. Filter the result through
 * `itemRefMatcherForCoverageGroup` (or a coverage spec's
 * `itemRefFilter`) to scope it to a specific coverage group.
 *
 * Used by the S&P cold-start path to surface a coverage goal's target
 * items before any of them have a spacingState row (first-time-in-
 * module), which `resolveCandidates` — a pure row filter — can't do.
 */
export function enumerateChordShapeItemRefs(): readonly string[] {
  const out: string[] = [];
  for (const keyName of KEYS_CIRCLE_OF_FOURTHS) {
    for (const q of CHORD_QUALITIES) {
      const states = INVERSION_STATES_FOR_CHORD_SHAPE_KIND[q.kind];
      for (const state of states) {
        if (state === 'supplementary') continue;
        out.push(
          state === null
            ? `chord-shape:${q.id}:${keyName}`
            : `chord-shape:${q.id}:${keyName}:${state}`,
        );
      }
    }
  }
  return out;
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
