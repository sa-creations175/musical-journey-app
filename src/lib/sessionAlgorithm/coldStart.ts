/**
 * Phase 3 Step 2i — Cold-start per-module item-selection ordering.
 *
 * Per Part 6 of the design doc, all selection is goal-driven first;
 * these rules are the tiebreaker when the goal-driven candidate pool
 * runs sparse and the algorithm needs to surface NEW items.
 *
 *   Ear Training      — submodule sequence: intervals →
 *                        chord-recognition → chord-progressions →
 *                        scales-modes. Within each submodule, the
 *                        algorithm uses the submodule's defined
 *                        catalog order (item enumeration is left to
 *                        integration time, since each ET submodule
 *                        owns its own catalog).
 *
 *   Shapes & Patterns — sub-area prefix sequence: chord-shape: →
 *                        scale: → vl:. Within each area: by quality
 *                        kind / scale, then by key. Concrete
 *                        enumeration is left to integration time.
 *
 *   Production        — concrete order via PRODUCTION_PATHS + each
 *                        path's lessons. Returned by
 *                        productionColdStartOrder().
 *
 *   Song Repertoire   — goal-driven only. Algorithm defers entirely
 *                        to the user's declared songs.
 *
 *   Harmonic Fluency  — concept-grouped: the four coverage groups
 *                        (foundational → chord-knowledge →
 *                        functional-applied → ear-recognition);
 *                        within each group, the constituent
 *                        categories in CATEGORY_ORDER; within each
 *                        category, FLASHCARDS in catalog order.
 *                        Returned by harmonicFluencyColdStartOrder().
 *
 * Pure functions; tests pass touched-sets directly. No DB access.
 */

import { HF_GROUP_CATEGORIES } from '../../modules/goals/progress';
import {
  CATEGORY_ORDER,
  FLASHCARDS,
  type FlashcardCategory,
} from '../../modules/harmonic-fluency/catalog';
import { PRODUCTION_PATHS } from '../../modules/production/content/paths';
import { lessonsByPath } from '../../modules/production/content/lessons';

// ---------------------------------------------------------------------
// Pure picker
// ---------------------------------------------------------------------

/**
 * Walk a pre-ordered list of itemRefs and return up to `max` that are
 * NOT in the `touched` set. Used by the algorithm's cold-start path
 * when goal-driven candidates run sparse — surface the next batch in
 * the module's pedagogical order.
 *
 * Pure. Stable: order in == order out (filtered).
 */
export function pickColdStartItems(
  orderedItems: ReadonlyArray<string>,
  touched: ReadonlySet<string>,
  max: number,
): readonly string[] {
  if (max <= 0) return [];
  const out: string[] = [];
  for (const ref of orderedItems) {
    if (touched.has(ref)) continue;
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------
// Module ordering rules — high-level descriptors
// ---------------------------------------------------------------------

/**
 * Ear Training submodule traversal order. Mirrors the pedagogical
 * progression "intervals → chords → progressions" plus
 * scales-modes (added in Phase 1.5). Algorithm walks submodules in
 * this sequence when the user has goals targeting Ear Training but
 * no specific sub-area.
 */
export const ET_SUBMODULE_ORDER: ReadonlyArray<string> = [
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
];

/**
 * Shapes & Patterns sub-area prefix order. Matches the itemRef
 * patterns spacingState writes (chord-shape:* / scale:* / vl:*).
 * Mental Visualization is excluded by design — Phase 2 step 1e
 * decision: counts toward consistency only, not breadth/depth/
 * mastery.
 */
export const SHAPES_AREA_PREFIX_ORDER: ReadonlyArray<string> = [
  'chord-shape:',
  'scale:',
  'vl:',
];

/**
 * Harmonic Fluency coverage-group order. Concept-focused
 * progression: foundational math → chord knowledge → functional
 * applied → ear recognition. Algorithm sticks with one group until
 * basic acquisition before broadening — that emergent behavior comes
 * from the picker skipping touched/acquired items, not from this
 * order alone.
 */
export const HF_GROUP_ORDER: ReadonlyArray<string> = [
  'foundational',
  'chord-knowledge',
  'functional-applied',
  'ear-recognition',
];

/**
 * High-level cold-start rule per module. Declarative; the algorithm
 * dispatches on these to choose between concrete enumeration (HF,
 * Production), submodule walking (ET, Shapes), goal-driven defer
 * (Songs), and consistency-only (Practice).
 */
export type ColdStartStrategy =
  | 'concrete-ordering'   // HF, Production: full ordered list available
  | 'submodule-sequence'  // ET, Shapes: walk sub-areas in order
  | 'goal-driven'         // Songs: defer to user's relatedItems
  | 'consistency-only';   // Practice: no specific items, lift module-wide

export const COLD_START_STRATEGY: Record<string, ColdStartStrategy> = {
  'ear-training':        'submodule-sequence',
  'harmonic-fluency':    'concrete-ordering',
  'shapes-and-patterns': 'submodule-sequence',
  'production':          'concrete-ordering',
  'repertoire':          'goal-driven',
  'practice-consistency': 'consistency-only',
};

// ---------------------------------------------------------------------
// Concrete enumerators
// ---------------------------------------------------------------------

/**
 * Harmonic Fluency cold-start order: walk the four coverage groups in
 * HF_GROUP_ORDER; within each group, the constituent categories in
 * CATEGORY_ORDER; within each category, FLASHCARDS in catalog order.
 *
 * The result is a complete, deterministic ordering of every flashcard
 * id in the module — feed it to pickColdStartItems alongside the
 * user's touched set to get the next batch.
 */
export function harmonicFluencyColdStartOrder(): readonly string[] {
  // Index FLASHCARDS by category for O(N) walk.
  const byCategory = new Map<FlashcardCategory, string[]>();
  for (const card of FLASHCARDS) {
    const arr = byCategory.get(card.category) ?? [];
    arr.push(card.id);
    byCategory.set(card.category, arr);
  }

  // Build the ordered-categories-per-group mapping using
  // HF_GROUP_CATEGORIES + the canonical CATEGORY_ORDER tiebreaker so
  // any new category added to a group inherits a stable position.
  const out: string[] = [];
  for (const groupId of HF_GROUP_ORDER) {
    const groupCategories = HF_GROUP_CATEGORIES[groupId] ?? [];
    // Sort the group's categories by their index in CATEGORY_ORDER.
    const ordered = [...groupCategories].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
    );
    for (const category of ordered) {
      const ids = byCategory.get(category as FlashcardCategory) ?? [];
      out.push(...ids);
    }
  }
  return out;
}

/**
 * Production cold-start order: walk PRODUCTION_PATHS in their canonical
 * order (workflow-foundations first); within each path, lessons in the
 * order returned by lessonsByPath() (which mirrors the catalog's
 * authored order).
 *
 * Paths flagged status !== 'live' are skipped — placeholder paths have
 * no real lessons to surface.
 */
export function productionColdStartOrder(): readonly string[] {
  const out: string[] = [];
  for (const path of PRODUCTION_PATHS) {
    if (path.status !== 'live') continue;
    for (const lesson of lessonsByPath(path.id)) {
      out.push(lesson.id);
    }
  }
  return out;
}
