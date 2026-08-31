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
 * THE CARD COUNTS CELLS. THE GOAL COUNTS ITEMS. THEY ARE NOT THE SAME
 * NUMBER FOR CHORD SHAPES, AND THAT IS STILL OPEN.
 *
 * The Fluent+ figure and its denominator both come from
 * `sectionCells()`, which is the grid's own enumeration — so the card
 * and the grid under it are two readings of one count and cannot
 * disagree. For scales, voice leading and mental visualisation a cell
 * IS an item and the number is unchanged.
 *
 * For chord shapes it is not. `shapesCounts().chordShapeDrills`
 * multiplies quality × key × inversion state, because that is what a
 * COVERAGE GOAL counts. The grid draws quality × key and keeps the
 * inversion states inside a cell. Making the two one number is a rule
 * change with an unresolved question inside it — see
 * `cc-scratch/tab1b-2026-08-31-counting-and-card.md` — so it is not
 * done here and this file no longer reads `shapesCounts` at all.
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
import { countFluentPlus, rowsByRefHand, sectionCells, type SectionId } from './cellTargets';
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
     * FLUENT+ CELLS, COUNTED THE WAY THE GRID DRAWS THEM.
     *
     * This walked the ROWS that existed and asked
     * `acquisitionIndex.cell` about each distinct itemRef — one item,
     * all its hands. Two things were wrong with it as a description of
     * the grid. It counted items rather than cells, which for chord
     * shapes is four numbers for every one the grid shows. And it
     * could only ever count what had been touched, so a cell was
     * counted by whether a row for it happened to exist.
     *
     * `sectionCells` enumerates from the catalog instead, and every
     * cell is rolled up by the same `verdictForTargets` the squares
     * use. An untouched cell is Not Started and counts as one cell
     * that is not Fluent+, which is what it is.
     */
    const byRefHand = rowsByRefHand(
      section.itemRefPrefix === null ? mentalVizRows : shapesRows,
    );
    const cells = sectionCells(section.id);
    const { total: cellTotal, fluentPlus } = countFluentPlus(cells, byRefHand);
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
      // THE GRID'S CELL COUNT, so the card's two numbers are one
      // reading of one count. See the header for why this and the
      // bars' `total` are allowed to differ.
      itemCount: cellTotal,
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
