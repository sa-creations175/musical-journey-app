/**
 * Phase B Step 9c — Per-module progression source-of-truth.
 *
 * Encodes the ordered "what comes next" for each coverage-bearing
 * module. Drives Step 9c yearly-anchor suggestions: when the user is
 * creating or reviewing a monthly goal, the suggestion engine walks
 * the module's stages in order, finds the first stage not yet fully in
 * scope, and surfaces it as the actionable next step (or as the
 * half-done UX when the stage is partially covered).
 *
 * See docs/PHASE_B_SESSION_PLANNING_DESIGN.md — "Module-by-module
 * progression source-of-truth (for 9c suggestions)" for the design.
 *
 * Pure / fixture-friendly — no Dexie, no React, no clock. Each
 * stage's itemRefs are pre-computed from the same catalogs
 * scopeEnumeration.ts walks, so catalog growth (a new mode, a new
 * production lesson) flows through automatically.
 *
 * **Catalog reality vs. design doc**
 * The doc lists some Layer-3 Chord Shape stages whose qualities don't
 * yet exist in CHORD_QUALITIES (slash chords, augmaj7) and refers to
 * an "T3a / T3b split" of Chord Recognition tiers that the catalog
 * still has as a single Tier 3 (inversion items). Tier 3 inversion
 * items also aren't part of the chord-recognition COVERAGE scope —
 * coverage tracks bare chord IDs, not per-inversion variants. The
 * encoding here matches the live catalogs (the source of truth for
 * what a user can actually have in scope today) and documents each
 * deviation inline so a later catalog change is the only place to
 * touch when the doc and the data finally align.
 *
 * **Repertoire (Songs) — special case**
 * The doc points at `Song.learningOrder` as the progression source.
 * Songs aren't included here because their progression is dynamic
 * (depends on the user's library), and song goals use the
 * `song_whole_at_level` metric — not a static-scope coverage metric.
 * A separate live-query handler in the suggestion layer covers songs
 * when it's wired in.
 *
 * **Practice consistency**
 * Has no item scope — empty stages array, no progression suggestion
 * ever. Kept for type completeness.
 */

import type { GoalFlowModuleId } from './goalVocabulary';
import {
  CHORD_QUALITIES,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
} from '../shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../shapes-and-patterns/scaleSkills';
import { CHORD_SEEDS } from '../ear-training/chord-recognition/seed';
import {
  CHORD_RECOGNITION_TIERS,
  type ChordRecognitionTier,
} from '../ear-training/chord-recognition/chordRecognitionTiers';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { PROGRESSIONS } from '../ear-training/chord-progressions/catalog';
import { FLASHCARDS } from '../harmonic-fluency/catalog';
import { PRODUCTION_PATHS } from '../production/content/paths';
import { lessonsByPath } from '../production/content/lessons';
import { HF_GROUP_CATEGORIES } from './progress';

// =====================================================================
// Types
// =====================================================================

export interface ProgressionStage {
  /** Stable identifier for the stage. Kebab-case, scoped within the
   *  parent module's stages (e.g., "triad-maj", "tier-1",
   *  "foundational"). */
  id: string;
  /** Human-facing label shown in the suggestion UI. */
  name: string;
  /** Optional one-liner clarifying what the stage covers. */
  description?: string;
  /** Every itemRef that belongs to this stage. Used as the candidate
   *  pool for the "what's not yet in scope" diff. Empty list →
   *  stage is documented but the catalog doesn't carry the items
   *  yet (Layer-3 TBD entries, the VL stub). The suggestion engine
   *  skips empty stages — they never count as the "next thing." */
  itemRefs: ReadonlyArray<string>;
}

export interface ModuleProgression {
  moduleId: GoalFlowModuleId;
  stages: ReadonlyArray<ProgressionStage>;
  /** Sub-progression labels for modules whose stages naturally group
   *  into layers (Chord Shapes: Triads / Sevenths / Depth). When
   *  present, the UI can render a section header between layers;
   *  pure logic ignores it. Length must equal `stages.length`. */
  layerBy?: ReadonlyArray<string>;
}

// =====================================================================
// S&P Chord Shapes — Layer 1 (Triads), Layer 2 (Sevenths), Layer 3 (Depth)
// =====================================================================

/** Enumerate every chord-shape itemRef belonging to a given quality.
 *  Mirrors scopeEnumeration's `enumerateAllChordShapes` walk, sliced
 *  to one quality — skips the 'supplementary' state for sevenths
 *  (acquisition-excluded; see catalog.ts gatesAcquisition). */
function chordShapesForQuality(qualityId: string): string[] {
  const q = CHORD_QUALITIES.find(c => c.id === qualityId);
  if (!q) return [];
  const states = INVERSION_STATES_FOR_CHORD_SHAPE_KIND[q.kind];
  const out: string[] = [];
  for (const key of KEYS) {
    for (const state of states) {
      if (state === 'supplementary') continue;
      out.push(state ? `chord-shape:${q.id}:${key}:${state}` : `chord-shape:${q.id}:${key}`);
    }
  }
  return out;
}

// A `chordShapesForKind` helper isn't needed yet — every consumer
// slices per-quality via `chordShapesForQuality`. Add here if a
// future "all triads in scope" sub-area needs the kind-level roll-up.

function triadStage(qualityId: string, displayName: string): ProgressionStage {
  return {
    id: `triad-${qualityId}`,
    name: `${displayName} triad`,
    description: `${displayName} triad in all 12 keys (root + inv1 + inv2 + fluid)`,
    itemRefs: chordShapesForQuality(qualityId),
  };
}

function seventhStage(qualityId: string, displayName: string): ProgressionStage {
  return {
    id: `seventh-${qualityId}`,
    name: displayName,
    description: `${displayName} in all 12 keys (root + inv1–3 + fluid)`,
    itemRefs: chordShapesForQuality(qualityId),
  };
}

/** Layer-3 stages group multiple extension/special qualities. Each
 *  stage's `qualityIds` are the catalog qualities that belong; empty
 *  qualityIds → empty itemRefs → stage is informational only. */
function depthStage(
  id: string,
  name: string,
  description: string,
  qualityIds: ReadonlyArray<string>,
): ProgressionStage {
  return {
    id: `depth-${id}`,
    name,
    description,
    itemRefs: qualityIds.flatMap(chordShapesForQuality),
  };
}

const CHORD_SHAPES_STAGES: ReadonlyArray<ProgressionStage> = [
  // Layer 1 — Triads (12 keys × 4 acquisition inversion states = 48 items per stage)
  triadStage('maj',  'Major'),
  triadStage('min',  'Minor'),
  triadStage('dim',  'Diminished'),
  triadStage('aug',  'Augmented'),
  triadStage('sus2', 'Sus2'),
  triadStage('sus4', 'Sus4'),
  // Layer 2 — Sevenths (12 keys × 5 acquisition states = 60 items per stage —
  //          the design doc's "48 items per stage" predates the inversion
  //          redesign that gave sevenths an `inv3` acquisition state).
  seventhStage('maj7',  'Major 7'),
  seventhStage('min7',  'Minor 7'),
  seventhStage('dom7',  'Dominant 7'),
  seventhStage('m7b5',  'Half-diminished 7'),
  seventhStage('dim7',  'Diminished 7'),
  // mmaj7 was listed as a Layer-3 entry in the doc but lives in the
  // catalog as `kind: 'seventh'`, so it follows the seventh state set
  // (5 items × 12 keys) — placed at the end of Layer 2 so the
  // progression order matches the natural seventh sequence.
  seventhStage('mmaj7', 'Minor-major 7'),
  // Layer 3 — Depth by quality. Each extension/special quality has a
  //   single (null-state) row, so per-stage item counts are 12 ×
  //   number-of-qualities. Stages that reference qualities the
  //   catalog doesn't yet expose (slash chords, augmaj7) appear with
  //   empty itemRefs and are skipped by the suggestion engine.
  depthStage(
    'major-extensions', 'Major extensions',
    'Major 9 / Maj 11 / Maj 13 / Maj 7♯11 in all 12 keys',
    ['maj9', 'maj11', 'maj13', 'maj7s11'],
  ),
  depthStage(
    'minor-extensions', 'Minor extensions',
    'Minor 9 / Minor 11 / Minor 13 in all 12 keys',
    ['min9', 'min11', 'min13'],
  ),
  depthStage(
    'dominant-extensions', 'Dominant extensions',
    'Dom 9 / 11 / 13 plus altered dominants (♭9, ♯9, ♭13)',
    ['dom9', 'dom11', 'dom13', 'dom7b9', 'dom7s9', 'dom7b13'],
  ),
  depthStage(
    'altered', 'Altered chords / bright + dark tensions',
    'Altered-dominant voicings cross-referenced from the VL design doc',
    [],
  ),
  depthStage(
    'slash', 'Slash chords',
    'Slash chord voicings — catalog support pending',
    [],
  ),
  depthStage(
    'add', 'Add9 / Add11',
    'Add9 in all 12 keys (add11 catalog support pending)',
    ['add9'],
  ),
  depthStage(
    'augmaj7', 'Augmaj7',
    'Augmented-major 7 — catalog support pending',
    [],
  ),
];

// =====================================================================
// S&P Scales — Major / Maj-Pent / Nat-Min / Min-Pent
// =====================================================================

/** Scale items for one scale kind. Pentatonic kinds bundle their per-
 *  key starting points, so each "key" actually contributes 3 cells —
 *  per the doc's "Pentatonic starting points bundled per key." For
 *  9c suggestion purposes the bundle stays flat: each itemRef is a
 *  scope unit the user can carry in `relatedItems`. */
function scaleItemsForKind(kind: string): string[] {
  return SCALE_CELLS.filter(c => c.kind === kind).map(c => c.itemRef);
}

const SCALES_STAGES: ReadonlyArray<ProgressionStage> = [
  {
    id: 'scale-major',
    name: 'Major scale',
    description: 'Major scale in all 12 keys',
    itemRefs: scaleItemsForKind('major'),
  },
  {
    id: 'scale-major-pent',
    name: 'Major pentatonic',
    description: 'Major pentatonic in all 12 keys (1 / 5 / 6 starting points)',
    itemRefs: scaleItemsForKind('major-pentatonic'),
  },
  {
    id: 'scale-natural-minor',
    name: 'Natural minor',
    description: 'Natural minor in all 12 keys',
    itemRefs: scaleItemsForKind('natural-minor'),
  },
  {
    id: 'scale-minor-pent',
    name: 'Minor pentatonic',
    description: 'Minor pentatonic in all 12 keys (1 / ♭3 / ♭7 starting points)',
    itemRefs: scaleItemsForKind('minor-pentatonic'),
  },
];

// =====================================================================
// S&P Voice Leading — TBD, stub
// =====================================================================

const VOICE_LEADING_STAGES: ReadonlyArray<ProgressionStage> = [
  // The VL design doc isn't finalized yet (5 patterns identified;
  // foundational-to-complex order pending). The suggestion engine
  // treats this empty list as "no actionable progression" — the
  // monthly goal still shows the yearly-pace context, just without
  // a "next thing" suggestion. Slot per pattern lands when VL is
  // built; the file shape (one ProgressionStage per pattern with
  // `vl:${patternId}:*` itemRefs) is already prefigured by
  // `enumerateAllVoiceLeading` in scopeEnumeration.ts.
];

// =====================================================================
// ET — Intervals / Chord Recognition / Chord Progressions / Scales-Modes
// =====================================================================

const INTERVAL_STAGES: ReadonlyArray<ProgressionStage> = [
  {
    id: 'intervals-all',
    name: 'All intervals',
    description: 'Every interval in both ascending and descending directions',
    // 13 seeds × 2 directions = 26 items. Bundled into a single
    // stage because the user already has competency here — the
    // progression has nowhere to subdivide.
    itemRefs: INTERVAL_SEEDS.flatMap(s => [`${s.id}:asc`, `${s.id}:desc`]),
  },
];

/** Items for chord-recognition tiers. Coverage scope is per-chord
 *  (CHORD_SEEDS.map(s => s.id)) — tier 3 in the catalog holds
 *  per-inversion variants which AREN'T coverage scope items, so the
 *  stage list skips it. The doc's "T3a slash chords / T3b inversions"
 *  split is a planned redesign the catalog doesn't yet reflect; when
 *  it lands, add it here. */
function chordRecognitionTierItems(tier: ChordRecognitionTier): string[] {
  // Filter to chord ids the coverage system actually tracks
  // (CHORD_SEEDS) — tier 3 inversion items like 'maj:1' fall out.
  const scopeIds = new Set(CHORD_SEEDS.map(s => s.id));
  return CHORD_RECOGNITION_TIERS[tier]
    .filter(item => scopeIds.has(item));
}

const CHORD_RECOGNITION_STAGES: ReadonlyArray<ProgressionStage> = [
  {
    id: 'cr-t1',
    name: 'T1 — Core triads',
    description: 'Major / Minor / Diminished / Augmented / Sus2 / Sus4',
    itemRefs: chordRecognitionTierItems(1),
  },
  {
    id: 'cr-t2',
    name: 'T2 — Essential 7ths',
    description: 'Maj7 / Min7 / Dom7 / Dim7 / m7♭5 / Min(maj7)',
    itemRefs: chordRecognitionTierItems(2),
  },
  // Tier 3 (inversion variants) is intentionally skipped — see
  // chordRecognitionTierItems above. The chord-recognition coverage
  // metric tracks the bare chord, not its per-inversion form.
  {
    id: 'cr-t4',
    name: 'T4 — Extended maj / min color',
    description: 'Maj9 / Min9 / 6th-family extensions',
    itemRefs: chordRecognitionTierItems(4),
  },
  {
    id: 'cr-t5',
    name: 'T5 — Altered dominants + complex',
    description: 'Dom7♭9 / Dom7♯9 / Dom13 / Dom7sus4 …',
    itemRefs: chordRecognitionTierItems(5),
  },
];

/** Chord-progression stages mirror the catalog tier ordering. The
 *  doc's "Key Detection / Chord Motion / Full Progression" axis is
 *  an activity-mode split rather than a progression-scope split —
 *  every progression catalog row carries all three activity modes,
 *  so it doesn't help the suggestion engine narrow scope. The 8
 *  catalog tiers (Foundational → Hip-Hop & Sampled Loops) DO carry
 *  difficulty ordering, which is what 9c wants. */
function progressionsForTier(tier: number): string[] {
  return PROGRESSIONS.filter(p => p.tier === tier).map(p => p.id);
}

const CHORD_PROGRESSION_STAGES: ReadonlyArray<ProgressionStage> = (() => {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  const out: ProgressionStage[] = [];
  for (const t of tiers) {
    const items = progressionsForTier(t);
    if (items.length === 0) continue;
    out.push({
      id: `prog-tier-${t}`,
      name: `Tier ${t}`,
      itemRefs: items,
    });
  }
  return out;
})();

/** Mode itemRefs as scopeEnumeration generates them — `${mode.id}-tab1`
 *  (HearScale) + `${mode.id}-tab2` (SitInside). */
function scaleModeItemsFor(modeIds: ReadonlyArray<string>): string[] {
  return modeIds.flatMap(id => [`${id}-tab1`, `${id}-tab2`]);
}

const SCALES_MODES_STAGES: ReadonlyArray<ProgressionStage> = [
  {
    id: 'modes-brightness',
    name: '7 modes (brightness → darkness)',
    description: 'Lydian → Ionian → Mixolydian → Dorian → Aeolian → Phrygian → Locrian',
    itemRefs: scaleModeItemsFor([
      'lydian', 'ionian', 'mixolydian', 'dorian',
      'aeolian', 'phrygian', 'locrian',
    ]),
  },
  {
    id: 'minor-variants',
    name: 'Minor variants',
    description: 'Harmonic minor (raised 7), Melodic minor (raised 6 + 7 ascending)',
    itemRefs: scaleModeItemsFor(['harmonic-minor', 'melodic-minor']),
  },
];

// =====================================================================
// HF — 4 stages by category group
// =====================================================================

/** All HF flashcard ids whose category falls in the given group's
 *  category list (HF_GROUP_CATEGORIES). Mirrors
 *  enumerateHFByCategorySubArea in scopeEnumeration.ts. */
function hfStageItems(groupId: string): string[] {
  const cats = HF_GROUP_CATEGORIES[groupId];
  if (!cats) return [];
  const set = new Set(cats);
  return FLASHCARDS.filter(c => set.has(c.category)).map(c => c.id);
}

const HF_STAGES: ReadonlyArray<ProgressionStage> = [
  {
    id: 'hf-foundational',
    name: 'Foundational / Math',
    description: 'Scale-degree math · Named notes across keys · Key signatures',
    itemRefs: hfStageItems('foundational'),
  },
  {
    id: 'hf-chord-knowledge',
    name: 'Chord knowledge',
    description: 'Diatonic chord qualities · Chord construction · Slash chords & inversions',
    itemRefs: hfStageItems('chord-knowledge'),
  },
  {
    id: 'hf-functional',
    name: 'Functional / Applied',
    description: 'Functional harmony · Reverse key pivots · Progression vocabulary',
    itemRefs: hfStageItems('functional-applied'),
  },
  {
    id: 'hf-ear',
    name: 'Ear & Recognition',
    description: 'Mode identification · Interval identification · Ear-theory crossover',
    itemRefs: hfStageItems('ear-recognition'),
  },
];

// =====================================================================
// Production — 6 lesson paths
// =====================================================================

const PRODUCTION_STAGES: ReadonlyArray<ProgressionStage> = PRODUCTION_PATHS.map(p => ({
  id: `prod-${p.id}`,
  name: p.title,
  itemRefs: lessonsByPath(p.id).map(l => l.id),
}));

// =====================================================================
// Public — module → progression
// =====================================================================

/**
 * Composite Chord-Shapes / Scales / VL S&P progression — the natural
 * pedagogical order layered Shapes → Scales → VL. The S&P module
 * picks the right SUB-progression to walk based on the goal's
 * `targetUnit` (chord_shape_drills / scale_drills / voice_leading);
 * a goal with no sub-area uses the composite.
 */
const SHAPES_STAGES: ReadonlyArray<ProgressionStage> = [
  ...CHORD_SHAPES_STAGES,
  ...SCALES_STAGES,
  ...VOICE_LEADING_STAGES,
];

const SHAPES_LAYERS: ReadonlyArray<string> = [
  ...CHORD_SHAPES_STAGES.map((_, i) =>
    i < 6 ? 'Triads' : i < 12 ? 'Sevenths' : 'Depth',
  ),
  ...SCALES_STAGES.map(() => 'Scales'),
  ...VOICE_LEADING_STAGES.map(() => 'Voice leading'),
];

const ET_STAGES: ReadonlyArray<ProgressionStage> = [
  ...INTERVAL_STAGES,
  ...CHORD_RECOGNITION_STAGES,
  ...CHORD_PROGRESSION_STAGES,
  ...SCALES_MODES_STAGES,
];

const ET_LAYERS: ReadonlyArray<string> = [
  ...INTERVAL_STAGES.map(() => 'Intervals'),
  ...CHORD_RECOGNITION_STAGES.map(() => 'Chord recognition'),
  ...CHORD_PROGRESSION_STAGES.map(() => 'Chord progressions'),
  ...SCALES_MODES_STAGES.map(() => 'Scales & modes'),
];

/**
 * Sub-area-specific progressions for modules whose monthly goals can
 * scope to a single sub-progression (e.g., a `chord_shape_triads_aug`
 * monthly goal walks just the chord-shape triad layer). Keys mirror
 * the `targetUnit` strings the GoalCreationFlow encoder writes.
 *
 * The suggestion engine prefers the sub-area progression when the
 * goal carries a sub-area `targetUnit` — falls back to the module-
 * level progression when none is set or the sub-area isn't keyed
 * here.
 */
export const SUB_AREA_PROGRESSIONS: Readonly<
  Record<string, ReadonlyArray<ProgressionStage>>
> = {
  // S&P Chord Shapes — split by quality kind so a "triads only" goal
  // doesn't get told to add sevenths next, and vice versa.
  chord_shape_drills:        CHORD_SHAPES_STAGES,
  chord_shape_triads_maj:    [triadStage('maj', 'Major')],
  chord_shape_triads_min:    [triadStage('min', 'Minor')],
  chord_shape_triads_dim:    [triadStage('dim', 'Diminished')],
  chord_shape_triads_aug:    [triadStage('aug', 'Augmented')],
  chord_shape_triads_sus2:   [triadStage('sus2', 'Sus2')],
  chord_shape_triads_sus4:   [triadStage('sus4', 'Sus4')],
  chord_shape_sevenths:      CHORD_SHAPES_STAGES.slice(6, 12),
  chord_shape_extensions:    CHORD_SHAPES_STAGES.slice(12),
  chord_shape_special:       depthStageQualities(['maj6', 'min6', 'maj6_9']),
  // S&P Scales / VL
  scale_drills:              SCALES_STAGES,
  voice_leading:             VOICE_LEADING_STAGES,
  // ET sub-areas — each matches the corresponding moduleRef.
  'intervals':               INTERVAL_STAGES,
  'chord-recognition':       CHORD_RECOGNITION_STAGES,
  'chord-progressions':      CHORD_PROGRESSION_STAGES,
  'scales-modes':            SCALES_MODES_STAGES,
  // HF group IDs.
  foundational:              [HF_STAGES[0]],
  'chord-knowledge':         [HF_STAGES[1]],
  'functional-applied':      [HF_STAGES[2]],
  'ear-recognition':         [HF_STAGES[3]],
  // Production paths.
  ...Object.fromEntries(
    PRODUCTION_PATHS.map(p => [p.id, [PRODUCTION_STAGES.find(s => s.id === `prod-${p.id}`)!]]),
  ),
};

/** Tiny one-shot helper used by the special-cases above. */
function depthStageQualities(qualityIds: ReadonlyArray<string>): ProgressionStage[] {
  return [{
    id: 'special-sixths',
    name: 'Special / sixth chords',
    itemRefs: qualityIds.flatMap(chordShapesForQuality),
  }];
}

/**
 * Module → ordered progression. Covers every coverage-bearing module
 * plus Repertoire (empty — songs are handled by a separate live
 * helper) and practice-consistency (no scope).
 */
export const MODULE_PROGRESSIONS: Readonly<
  Record<GoalFlowModuleId, ModuleProgression>
> = {
  'shapes-and-patterns': {
    moduleId: 'shapes-and-patterns',
    stages: SHAPES_STAGES,
    layerBy: SHAPES_LAYERS,
  },
  'ear-training': {
    moduleId: 'ear-training',
    stages: ET_STAGES,
    layerBy: ET_LAYERS,
  },
  'harmonic-fluency': {
    moduleId: 'harmonic-fluency',
    stages: HF_STAGES,
  },
  production: {
    moduleId: 'production',
    stages: PRODUCTION_STAGES,
  },
  repertoire: {
    // Songs use Song.learningOrder + dynamic library state, not a
    // static stage list. Handled by a separate suggestion path in
    // the UI layer.
    moduleId: 'repertoire',
    stages: [],
  },
  'practice-consistency': {
    moduleId: 'practice-consistency',
    stages: [],
  },
};

/**
 * Pick the progression that best matches the goal — sub-area when
 * `targetUnit` is keyed in SUB_AREA_PROGRESSIONS, otherwise the
 * module-level walk. Returns an empty array when neither has stages
 * (VL, repertoire, practice-consistency — every "no actionable
 * progression" path lands here uniformly).
 */
export function progressionForGoal(
  moduleId: GoalFlowModuleId,
  targetUnit: string | null | undefined,
): ReadonlyArray<ProgressionStage> {
  if (targetUnit) {
    const sub = SUB_AREA_PROGRESSIONS[targetUnit];
    if (sub) return sub;
  }
  return MODULE_PROGRESSIONS[moduleId].stages;
}
