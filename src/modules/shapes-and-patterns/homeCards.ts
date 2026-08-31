/**
 * Shapes & patterns' adapter: four sections → four cards.
 *
 * =====================================================================
 * NO ACCURACY, AND THAT IS THE WHOLE ASYMMETRY.
 *
 * The other adapters describe things that are answered right or wrong.
 * This module records a DURATION and a three-way self-rating — flying,
 * cruising, crawling — so there is no rolling window, no tier and
 * nothing for a progress bar to draw. Every card here passes
 * `accuracy: null`, and the card component omits both.
 *
 * What IS real: how many of the module's cells have been touched, out
 * of how many exist, and when the section was last worked. Both come
 * from `spacingState`, which is where every S&P surface already reads
 * its coverage.
 * =====================================================================
 *
 * =====================================================================
 * THE CARD COUNTS DRILLABLE THINGS, AND SO DOES EVERYONE ELSE.
 *
 * It counted CELLS, and the goals counted itemRefs with no hand axis,
 * and the two were different numbers for the same question. Neither was
 * a thing you sit down and drill: a scale cell is three drills, one per
 * hand, and a triad cell is twelve.
 *
 * Both halves now come from `sectionTargets` — the same enumeration the
 * grid rolls its squares up from, `shapesCounts` counts, every goal
 * denominator is scoped out of and the session generator reads. One
 * function, one answer, and a total that MOVES when a target is taken
 * out of the score.
 *
 * THE NUMERATOR MOVED WITH IT. Fluent+ TARGETS, not Fluent+ cells: a
 * numerator and a denominator counting different things is the shape of
 * the bug, not a detail of it.
 *
 * =====================================================================
 * THE PER-HAND BARS ARE GONE.
 *
 * They were coverage per hand drawn in the accuracy bar's shape, and
 * they read `acquisitionIndex` — the retired three-bucket rule — long
 * after the grids stopped speaking it. See `CategoryCard`, where the
 * markup was, for what they said that nothing else does: nothing.
 *
 * WHAT REPLACES THEM IS NOT ANOTHER PICTURE. Two labelled lines: how
 * long has gone in, split into practice and testing, and when the
 * section was last touched. `4d ago · 7m` on one line reads as though
 * all seven minutes happened four days ago.
 * =====================================================================
 */
import type { SpacingState } from '../../lib/db';
import type { CategoryCardModel } from '../../components/moduleHome/model';
import { countsTowardShapesCoverage } from './drillModel';
import {
  countFluentPlusTargets, rowsByRefHand, sectionTargets,
  type OutOfScore, type SectionId,
} from './cellTargets';
import { totalSeconds, type TimeSplit } from './timeInvested';

import { MENTAL_VIZ_MODULE_REF } from './mentalVizLibrary';
import { daysBetween, localDayKey } from '../../lib/dailyGoal';

export const SHAPES_MODULE_ID = 'shapes-and-patterns';

/** The spacingState `moduleRef` the three keyed sections write under. */
export const SHAPES_MODULE_REF = 'shapes-and-patterns';

/** One definition, shared with the cell enumeration that keys off it. */
export type ShapesSectionId = SectionId;

export interface ShapesSection {
  id: ShapesSectionId;
  label: string;
  /** The `parseShapesItemRef` kind prefix, or null for mental viz —
   *  which lives under its own moduleRef entirely. */
  itemRefPrefix: string | null;
}

/**
 * Order and labels are the tab strip's, unchanged — scales first as the
 * parent structure chords derive from, mental viz last as the
 * away-from-keyboard capstone. Taken from the list that already
 * existed rather than re-typed here.
 */
export const SHAPES_SECTIONS: ReadonlyArray<ShapesSection> = [
  { id: 'scales',        label: 'scales',               itemRefPrefix: 'scale:' },
  { id: 'chord-shapes',  label: 'chord shapes',         itemRefPrefix: 'chord-shape:' },
  { id: 'voice-leading', label: 'voice-leading',        itemRefPrefix: 'vl:' },
  { id: 'mental-viz',    label: 'mental visualisation', itemRefPrefix: null },
];

export function isShapesSectionId(key: string): key is ShapesSectionId {
  return SHAPES_SECTIONS.some(s => s.id === key);
}

export function shapesCards(
  /** Rows under `SHAPES_MODULE_REF`. */
  shapesRows: readonly SpacingState[],
  /** Rows under `MENTAL_VIZ_MODULE_REF` — a separate ref, so a
   *  separate read; merging them would let two itemRefs collide. */
  mentalVizRows: readonly SpacingState[],
  now: number,
  /** Practice and testing seconds per section, from
   *  `shapesTimeInvested` — which adds up the same cells' targets
   *  Progress Details adds up one cell's. Omitted where the caller has
   *  not read the sessions; a section with none stays absent rather
   *  than showing a zero it has not measured. */
  timeBySection: ReadonlyMap<ShapesSectionId, TimeSplit> = new Map(),
  /** What has been taken out of the score through Edit what counts.
   *  The card reads out of what he is going for, not out of everything
   *  that exists — see `OutOfScore`. */
  outOfScore?: OutOfScore,
): CategoryCardModel[] {
  return SHAPES_SECTIONS.map(section => {
    const rows = section.itemRefPrefix === null
      ? [...mentalVizRows]
      : shapesRows.filter(r =>
        r.itemRef.startsWith(section.itemRefPrefix!)
        // Practice data for the qualities cut on 20 Aug 2026 is KEPT,
        // so the numerator would otherwise outrun the denominator.
        && countsTowardShapesCoverage(r.itemRef));

    // Distinct items touched — a row exists once a cell has been
    // engaged with at all, which is this module's "seen".
    const itemsSeen = new Set(rows.map(r => r.itemRef)).size;
    /**
     * FLUENT+ TARGETS, OUT OF THE TARGETS STILL IN THE SCORE.
     *
     * It came from the catalog rather than from the rows that happen
     * to exist — that part is unchanged and is what makes a
     * denominator a denominator. What changed is the UNIT: a cell was
     * one thing however many drills were under it, so twelve chord
     * targets at Mastered counted as one and eleven-of-twelve counted
     * as none. Neither is how much of the work is done.
     */
    const byRefHand = rowsByRefHand(
      section.itemRefPrefix === null ? mentalVizRows : shapesRows,
    );
    const targets = sectionTargets(section.id, outOfScore);
    const { total: targetTotal, fluentPlus } =
      countFluentPlusTargets(targets, byRefHand);
    const time = timeBySection.get(section.id);
    const latest = rows.reduce<number | null>(
      (max, r) => (r.lastEngagedAt !== null && (max === null || r.lastEngagedAt > max)
        ? r.lastEngagedAt
        : max),
      null,
    );

    return {
      key: section.id,
      label: section.label,
      // THE DRILLS THIS SECTION HOLDS, still in the score. Same
      // enumeration as the grid, the goals and the generator's scope.
      itemCount: targetTotal,
      // The counts speak for themselves here: one row per drillable
      // cell, which is what the grids below render.
      countDetail: null,
      description: null,
      // Duration and a self-rating, never right/wrong — see the header.
      accuracy: null,
      itemsSeen,
      // FLUENT+ CELLS. The field and the sentence it prints now use
      // the app's own word; "acquired" is retired everywhere.
      fluentPlus,
      // ABSENT, NOT ZERO. A section with nothing logged shows no time
      // rather than a measured nothing — and a split of two zeroes
      // would be exactly that.
      ...(time !== undefined && totalSeconds(time) > 0
        ? { timeInvested: time }
        : {}),
      lastPracticedDaysAgo: latest === null
        ? null
        : daysBetween(localDayKey(new Date(latest)), localDayKey(new Date(now))),
    };
  });
}

/** Re-exported so the page reads one import for both refs. */
export { MENTAL_VIZ_MODULE_REF };
