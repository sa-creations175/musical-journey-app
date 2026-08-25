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
 *     1b–1g). Intervals are 25 because `IntervalsQuiz` writes itemRefs
 *     as `${id}:${direction}` and twelve of the thirteen carry both
 *     directions — the unison has one case, since zero semitones up and
 *     zero down are the same two notes. Modes are 9 × 2 tabs = 18
 *     because Hear-Scale and Sit-Inside log separate spacingState rows.
 *     The user-facing card count for Ear Training is 134; the coverage
 *     denominator was 143 and is now 142.
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
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  voiceLeadingTotalCellCount,
  type QualityKind,
} from '../modules/shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../modules/shapes-and-patterns/scaleSkills';
import { intervalItemRefs } from '../modules/ear-training/intervals/seed';
import { CHORD_SEEDS } from '../modules/ear-training/chord-recognition/seed';
import { PROGRESSIONS } from '../modules/ear-training/chord-progressions/catalog';
import { MODES } from '../modules/ear-training/scales-modes/catalog';
import { FLASHCARDS, type FlashcardCategory } from '../modules/harmonic-fluency/catalog';
import { PRODUCTION_PATHS } from '../modules/production/content/paths';
import { lessonsByPath } from '../modules/production/content/lessons';
import { readingSkillForItemRef } from '../modules/reading/catalog';
import { READING_COVERAGE_GROUPS } from '../modules/reading/coverageGroups';
import { enumerateReading } from '../modules/goals/scopeEnumeration';

// =====================================================================
// Ear Training
// =====================================================================

export interface EarTrainingCounts {
  /**
   * One row per drillable `${id}:${direction}` — 25, not 26.
   *
   * Twelve intervals carry both directions; the unison carries one,
   * because zero semitones up and zero down are the same two notes.
   * DERIVED from `directionsFor` rather than multiplied by a constant:
   * the old `seeds × 2` was right about the code and wrong about the
   * music, and a constant cannot express an exception.
   */
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

const SCALE_MODE_TABS = 2;

export function earTrainingCounts(): EarTrainingCounts {
  const intervals = intervalItemRefs().length;
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
  foundational:        ['scale-degree-math', 'named-notes', 'key-signatures', 'pentatonic-scales', 'tritone-pairs', 'enharmonic-equivalents'],
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
  /** Sum across all categories = sum across all 4 groups. */
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
  /** Chord-shape items: triads (6 × 12 keys × 4 inversion states = 288)
   *  + sevenths (6 × 12 × 6 = 432) = 720. Extensions and special/sixth
   *  contribute 0 — they were cut from the catalog on 20 Aug 2026.
   *
   *  EVERY inversion state counts, the sevenths' `supplementary`
   *  two-handed row included. It was excluded until 20 Aug 2026, on the
   *  grounds that it was a practice tool; it is the LH-root + RH-triad
   *  voicing, which is how the chord actually gets played, so it is a
   *  shape to own like the other five. */
  chordShapeDrills: number;
  /** Sourced from scaleSkills' SCALE_CELLS catalog — 96 after the
   *  Scales-submodule pent fan-out (3 starting points × 12 keys for
   *  both major-pent and minor-pent, plus 12 each for major and
   *  natural-minor). */
  scaleDrills: number;
  /** 372 — sum of per-pattern sub-cell fan-outs × 12 keys (31 × 12).
   *  See VOICE_LEADING_SUBMODULE_DESIGN.md § Total Cell Count. */
  voiceLeading: number;
  /** Sum of the three sub-areas. **Excludes Mental Visualization**
   *  per the April 27 design call — mental-viz counts toward
   *  consistency only, not breadth/depth/mastery. */
  total: number;
}

export function shapesCounts(): ShapesCounts {
  /**
   * Per-quality-kind item counts, with the inversion-state multiplier
   * READ OFF THE CATALOG rather than written as a literal.
   *
   * It used to be a hardcoded `4` for triads and `5` for sevenths. The
   * 5 was 6 states minus the `supplementary` one, which was excluded
   * from acquisition — so when that exclusion was reversed on
   * 20 Aug 2026 this function would have gone on returning 648 with
   * nothing anywhere failing. A denominator that does not follow its
   * own catalog is how a percentage goes wrong quietly.
   */
  const perKind = (kind: QualityKind) =>
    CHORD_QUALITIES.filter(q => q.kind === kind).length
    * KEYS.length
    * INVERSION_STATES_FOR_CHORD_SHAPE_KIND[kind].length;
  const chordShapeDrills =
    perKind('triad') + perKind('seventh') + perKind('extension') + perKind('special');
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

// =====================================================================
// Reading
// =====================================================================

export interface ReadingCounts {
  /** 13 signatures x 2 modes x 3 question directions = 78. */
  keySignatures: number;
  /** 17 staff positions x 2 clefs = 34. */
  noteRecognition: number;
  /** Triads and sevenths in both clefs across their inversions, plus
   *  the bass-only open shapes. */
  chordIdentification: number;
  /** 3 triad positions + 4 seventh positions = 7. Clef-free and
   *  quality-free — the silhouette is the whole item. */
  notationShapes: number;
  /** Per-coverage-group totals, keyed by ReadingCoverageGroupId. */
  byGroup: Record<string, number>;
  /** Sum of the four skills. */
  total: number;
}

/**
 * Reading denominators, DERIVED — every number here is a length of a
 * catalog walk, not a literal. `scopeEnumeration.enumerateReading()`
 * is the single walk; the per-group figures re-filter the same list
 * through each group's own matcher, so a group total can never drift
 * from the module total or from what a goal would actually cover.
 *
 * This is why the key-signature count is not written down anywhere:
 * drop a signature from SIGNATURES or a direction from
 * SIGNATURE_DIRECTIONS and the number moves on its own.
 */
export function readingCounts(): ReadingCounts {
  const all = enumerateReading();
  const bySkill = (skill: string) =>
    all.filter(ref => readingSkillForItemRef(ref) === skill).length;

  const byGroup: Record<string, number> = {};
  for (const group of READING_COVERAGE_GROUPS) {
    byGroup[group.id] = all.filter(group.matches).length;
  }

  return {
    keySignatures:       bySkill('sig'),
    noteRecognition:     bySkill('note'),
    chordIdentification: bySkill('chord'),
    notationShapes:      bySkill('shape'),
    byGroup,
    total: all.length,
  };
}
