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
 *     Chord recognition is 48 rather than 27 for the same reason once
 *     removed: the drill writes `attemptItemId(chordId, inversion)`, so
 *     an inversion is part of the row's identity. It is not 27 x 4 —
 *     most of those combinations are unreachable, and the number comes
 *     from `reachableChordRefs`, the same enumeration the dashboard
 *     denominator uses. THIS NOTE RECONCILES ALL THREE now; it used to
 *     account for intervals x direction and modes x tab and leave the
 *     third dimension unmentioned, which is how chord recognition kept
 *     a seed count while its siblings did not.
 *     The user-facing card count for Ear Training is 134; the coverage
 *     denominator was 142 and is now 163.
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
  sectionTargetCount, type OutOfScore,
} from '../modules/shapes-and-patterns/cellTargets';
import { intervalItemRefs } from '../modules/ear-training/intervals/seed';
import { CHORD_SEEDS } from '../modules/ear-training/chord-recognition/seed';
import { reachableChordRefs } from '../modules/ear-training/chord-recognition/inversionUtils';
import { PROGRESSIONS } from '../modules/ear-training/chord-progressions/catalog';
import { MODES } from '../modules/ear-training/scales-modes/catalog';
import { FLASHCARDS, type FlashcardCategory } from '../modules/harmonic-fluency/catalog';
import {
  HF_CATEGORIES_BY_GROUP, type HarmonicFluencyGroupId,
} from '../modules/harmonic-fluency/coverageGroups';
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
  /**
   * Chord x REACHABLE inversion — 48, not 27.
   *
   * A chord seed is not one spacingState row: the drill writes
   * `attemptItemId(chordId, inversion)`, so a maj7 answered in second
   * inversion and the same chord in root are separate rows. Counting
   * seeds made this the one sub-area whose denominator ignored the
   * dimension its own attempts carry.
   *
   * Coverage goals should count inversions — knowing C major in root
   * position is not knowing C major.
   */
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
  // 48, DERIVED — root positions plus the inversions that can actually
  // be asked. The same function the dashboard's denominator calls, so
  // widening or narrowing an inversion exclusion moves both or neither.
  const chordRecognition = reachableChordRefs(CHORD_SEEDS).length;
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

/**
 * Categories that make up each coverage group.
 *
 * ONE SOURCE, in `harmonic-fluency/coverageGroups.ts`. This used to be
 * a hand-maintained copy with a comment saying it mirrored the three
 * others; that file's header records what the four had actually
 * drifted into.
 */
const HF_GROUP_CATEGORIES = HF_CATEGORIES_BY_GROUP;

export type { HarmonicFluencyGroupId };

export interface HarmonicFluencyCounts {
  /** Per-coverage-group totals (sums of the categories below). */
  byGroup: Record<HarmonicFluencyGroupId, number>;
  /** Raw per-category counts. Useful for any surface that drills
   *  below the group level (e.g. accuracy-specific picker). */
  byCategory: Record<FlashcardCategory, number>;
  /** Sum across all categories = sum across all 3 groups. */
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

/**
 * =====================================================================
 * SHAPES COUNTS DRILLABLE THINGS NOW, AND IT COUNTS THEM ONCE.
 *
 * It used to multiply quality × key × inversion state and stop there.
 * Two things were wrong with that as a denominator.
 *
 * NO HAND AXIS. A spacingState row is `(itemRef, hand)` and the goal
 * NUMERATOR counts rows — so the two sides counted different things and
 * a chord-shape coverage goal could read over 100%. Drill every triad
 * in every key with all three hands and the numerator was 864 against a
 * denominator of 288.
 *
 * A SECOND ENUMERATION. The card and the grid counted cells off
 * `sectionCells`; this counted itemRefs off the catalog. One question,
 * two answers, and nothing to keep them together — which is the failure
 * this whole rebuild has been undoing.
 *
 * So this is a call into `sectionTargets`, the same enumeration the
 * card, the grid, every goal denominator and the session generator's
 * scope read. One function, one answer, and a denominator that MOVES
 * when a target is taken out of the score.
 *
 * Supplementary left the score on 31 Aug 2026 — see `catalog.ts` for
 * the ruling and `cellTargets.ts` for where it is enforced. It is why
 * the chord-shape figure is 2106 and not 2340.
 * =====================================================================
 */
export interface ShapesCounts {
  /** Chord-shape drills: triads (6 qualities × 13 cells × 4 inversion
   *  states × 3 hands = 936) + sevenths (6 × 13 × 5 × 3 = 1170) = 2106.
   *  Thirteen cells: the twelve keys and the Circle of 4ths (14 Sep 2026).
   *  Extensions and special/sixth contribute 0 — cut from the catalog
   *  on 20 Aug 2026. Supplementary is out of the score. */
  chordShapeDrills: number;
  /** Scale drills: 96 cells × 3 hands = 288. */
  scaleDrills: number;
  /** 828 — sum of per-pattern sub-cell fan-outs × 12 keys (69 × 12),
   *  one target each: voice leading is two-handed by nature and has no
   *  hand axis to multiply by. See VOICE_LEADING_SUBMODULE_DESIGN.md. */
  voiceLeading: number;
  /** Sum of the three sub-areas. **Excludes Mental Visualization**
   *  per the April 27 design call — mental-viz counts toward
   *  consistency only, not breadth/depth/mastery. */
  total: number;
}

/**
 * `movementIds` — THE MOVEMENTS THE CALLER HAS IN HAND (ruling 48).
 *
 * A movement is a drillable thing on Chord Movements & Passes, twelve
 * keys of one row, and the card has counted them since ruling 20. This
 * did not, so a coverage goal's denominator stopped at the catalog
 * while its numerator counted every spacing row — the shape that made
 * a chord-shape goal read over 100% before the hand axis was fixed,
 * waiting to happen again.
 *
 * AN ARGUMENT, NOT A READ, which is `cellTargets`'s own rule and its
 * reason: everything on this path is pure and synchronous — the goals
 * encoder, the session generator's scope and the maintenance resolver
 * all call it without awaiting anything — and a movement lives in
 * Dexie. `loadScopeMaintenanceViews` is the one async entry point on
 * that path and it supplies the list; a caller that has no list gets
 * exactly the catalog, which is what it got before.
 */
export function shapesCounts(
  outOfScore?: OutOfScore,
  movementIds: readonly string[] = [],
): ShapesCounts {
  const chordShapeDrills = sectionTargetCount('chord-shapes', outOfScore);
  const scaleDrills = sectionTargetCount('scales', outOfScore);
  const voiceLeading = sectionTargetCount('voice-leading', outOfScore, movementIds);
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
