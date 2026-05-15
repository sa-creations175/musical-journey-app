/**
 * Phase 2 step 3 — live denominators for coverage goals.
 *
 * Returns the canonical item count for each module's coverage scope,
 * derived directly from the source-of-truth catalogs. Replaces the
 * hand-maintained denominators that lived in
 * `GoalCreationFlow.tsx`'s four `*_COVERAGE_GROUPS` constants
 * (the four TODO 2/3 sites). Single source of truth: when a catalog
 * grows (new chord progression, new mode, new production lesson, new
 * voice-leading pattern), every coverage surface that reads from
 * here updates automatically.
 *
 * Design notes:
 *
 *   - **spacingState-row counts, not surface counts.** Counts mirror
 *     the itemRefs that `recordEngagement` actually writes (Step
 *     1b–1g). Intervals are 13 catalog × 2 directions = 26 because
 *     `IntervalsQuiz` writes itemRefs as `${id}:${direction}`. Modes
 *     are 9 × 2 tabs = 18 because Hear-Scale and Sit-Inside log
 *     separate spacingState rows. The user-facing card count for Ear
 *     Training is 134; the coverage denominator is 143.
 *   - **Mental Visualization is excluded** from `shapesCounts` per the
 *     April 27 design call: it counts toward consistency only, not
 *     toward breadth/depth/mastery. Step 1e wires this exclusion into
 *     `itemRefForSkill` (returns null for mental-viz).
 *   - **Pure & sync.** No Dexie, no React hooks, no I/O — each
 *     function is a sum over module-scope const arrays. Cheap,
 *     deterministic, friendly to tests. Catalog drift fails the unit
 *     test suite on purpose so growth is visible.
 *
 * If a future module joins the coverage framework (e.g. Production
 * Vocabulary flashcards), add its counts function here and a matching
 * entry in `coverageMetrics.ts`. Keep this module the only place that
 * knows the catalog → denominator mapping.
 */

import {
  CHORD_QUALITIES,
  KEYS,
  voiceLeadingTotalCellCount,
} from '../modules/shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../modules/shapes-and-patterns/scaleSkills';
import { INTERVAL_SEEDS } from '../modules/ear-training/intervals/seed';
import { CHORD_SEEDS } from '../modules/ear-training/chord-recognition/seed';
import { PROGRESSIONS } from '../modules/ear-training/chord-progressions/catalog';
import { MODES } from '../modules/ear-training/scales-modes/catalog';
import { FLASHCARDS, type FlashcardCategory } from '../modules/harmonic-fluency/catalog';
import { PRODUCTION_PATHS } from '../modules/production/content/paths';
import { lessonsByPath } from '../modules/production/content/lessons';

// =====================================================================
// Ear Training
// =====================================================================

export interface EarTrainingCounts {
  /** 13 catalog seeds × 2 directions (asc/desc) = 26. Matches
   *  IntervalsQuiz's itemRef format `${id}:${direction}`. */
  intervals: number;
  /** Each chord seed = one spacingState row. */
  chordRecognition: number;
  /** Each progression in the full catalog (includes Key Detection +
   *  Chord Motion catalog progressions, but NOT KeyDetectionTab /
   *  ChordMotionTab — those are intentionally not wired in 1c). */
  chordProgressions: number;
  /** 9 modes × 2 tabs (HearScale + SitInside log separate rows) = 18. */
  scalesModes: number;
  /** Sum of the four sub-areas. */
  total: number;
}

const INTERVAL_DIRECTIONS = 2;
const SCALE_MODE_TABS = 2;

export function earTrainingCounts(): EarTrainingCounts {
  const intervals = INTERVAL_SEEDS.length * INTERVAL_DIRECTIONS;
  const chordRecognition = CHORD_SEEDS.length;
  const chordProgressions = PROGRESSIONS.length;
  const scalesModes = MODES.length * SCALE_MODE_TABS;
  return {
    intervals,
    chordRecognition,
    chordProgressions,
    scalesModes,
    total: intervals + chordRecognition + chordProgressions + scalesModes,
  };
}

// =====================================================================
// Harmonic Fluency
// =====================================================================

/** Categories that make up each coverage group. Mirrors
 *  HARMONIC_FLUENCY_GROUPS in GoalCreationFlow.tsx — kept here so the
 *  helper owns the group → category mapping that the denominators
 *  depend on. If a category is added, both lists update; if a category
 *  moves groups, both lists update. */
const HF_GROUP_CATEGORIES: Record<HarmonicFluencyGroupId, ReadonlyArray<FlashcardCategory>> = {
  foundational:        ['scale-degree-math', 'named-notes', 'key-signatures', 'pentatonic-scales'],
  chordKnowledge:      ['diatonic-qualities', 'chord-construction', 'slash-chords'],
  functionalApplied:   ['functional-harmony', 'reverse-key-pivots', 'progressions'],
  earRecognition:      ['modes', 'intervals', 'ear-theory'],
};

export type HarmonicFluencyGroupId =
  | 'foundational'
  | 'chordKnowledge'
  | 'functionalApplied'
  | 'earRecognition';

export interface HarmonicFluencyCounts {
  /** Per-coverage-group totals (sums of the categories below). */
  byGroup: Record<HarmonicFluencyGroupId, number>;
  /** Raw per-category counts. Useful for any surface that drills
   *  below the group level (e.g. accuracy-specific picker). */
  byCategory: Record<FlashcardCategory, number>;
  /** Sum across all 12 categories = sum across all 4 groups. */
  total: number;
}

export function harmonicFluencyCounts(): HarmonicFluencyCounts {
  const byCategory = {} as Record<FlashcardCategory, number>;
  for (const card of FLASHCARDS) {
    byCategory[card.category] = (byCategory[card.category] ?? 0) + 1;
  }
  const byGroup = {} as Record<HarmonicFluencyGroupId, number>;
  for (const groupId of Object.keys(HF_GROUP_CATEGORIES) as HarmonicFluencyGroupId[]) {
    byGroup[groupId] = HF_GROUP_CATEGORIES[groupId].reduce(
      (sum, cat) => sum + (byCategory[cat] ?? 0),
      0,
    );
  }
  const total = FLASHCARDS.length;
  return { byGroup, byCategory, total };
}

// =====================================================================
// Shapes & Patterns
// =====================================================================

export interface ShapesCounts {
  /** Acquisition-path chord-shape items: triads (6×12×4 inversions =
   *  288) + sevenths (6×12×5 inversions = 360) + extensions (14×12 =
   *  168) + special/sixth (3×12 = 36) = 852. Excludes the
   *  `supplementary` two-handed seventh rows — those are practice
   *  tools, not acquisition-gating items. */
  chordShapeDrills: number;
  /** Sourced from scaleSkills' SCALE_CELLS catalog — 96 after the
   *  Scales-submodule pent fan-out (3 starting points × 12 keys for
   *  both major-pent and minor-pent, plus 12 each for major and
   *  natural-minor). */
  scaleDrills: number;
  /** 324 — sum of per-pattern sub-cell fan-outs × 12 keys (27 × 12).
   *  See VOICE_LEADING_SUBMODULE_DESIGN.md § Total Cell Count. */
  voiceLeading: number;
  /** Sum of the three sub-areas. **Excludes Mental Visualization**
   *  per the April 27 design call — mental-viz counts toward
   *  consistency only, not breadth/depth/mastery. */
  total: number;
}

export function shapesCounts(): ShapesCounts {
  // Per-quality-kind item counts. Triads + sevenths multiply by their
  // acquisition-path inversion-state count (4 / 5); extensions +
  // special/sixth keep their voicing-based one-row-per-cell shape.
  const triadCount     = CHORD_QUALITIES.filter(q => q.kind === 'triad').length     * KEYS.length * 4;
  const seventhCount   = CHORD_QUALITIES.filter(q => q.kind === 'seventh').length   * KEYS.length * 5;
  const extensionCount = CHORD_QUALITIES.filter(q => q.kind === 'extension').length * KEYS.length;
  const specialCount   = CHORD_QUALITIES.filter(q => q.kind === 'special').length   * KEYS.length;
  const chordShapeDrills = triadCount + seventhCount + extensionCount + specialCount;
  const scaleDrills = SCALE_CELLS.length;
  const voiceLeading = voiceLeadingTotalCellCount();
  return {
    chordShapeDrills,
    scaleDrills,
    voiceLeading,
    total: chordShapeDrills + scaleDrills + voiceLeading,
  };
}

// =====================================================================
// Production
// =====================================================================

export interface ProductionCounts {
  /** Path id → lesson count. Keys are stable kebab-case ids from
   *  PRODUCTION_PATHS (workflow-foundations / language-of-production /
   *  vocal-production / genre-productions / arrangement / business). */
  byPath: Record<string, number>;
  /** Sum of all `byPath` entries. */
  total: number;
}

export function productionCounts(): ProductionCounts {
  const byPath: Record<string, number> = {};
  let total = 0;
  for (const path of PRODUCTION_PATHS) {
    const n = lessonsByPath(path.id).length;
    byPath[path.id] = n;
    total += n;
  }
  return { byPath, total };
}
