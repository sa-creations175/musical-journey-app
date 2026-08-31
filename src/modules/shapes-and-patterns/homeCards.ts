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
 * NUMBER FOR CHORD SHAPES, AND THAT IS DELIBERATE.
 *
 * The Fluent+ figure and its denominator both come from
 * `sectionCells()`, which is the grid's own enumeration — so the card
 * and the grid under it are two readings of one count and cannot
 * disagree. For scales, voice leading and mental visualisation a cell
 * IS an item and the number is unchanged.
 *
 * For chord shapes it is not. `shapesCounts().chordShapeDrills`
 * multiplies quality × key × inversion state, because that is what a
 * COVERAGE GOAL counts — every drillable item. The grid draws quality
 * × key and keeps the inversion states inside a cell. So the card's
 * denominator is the smaller of the two now, and `shapesCounts()` is
 * untouched: the goals it feeds are not this commit's to move.
 *
 * The per-hand bars still read `acquisitionIndex`, the retired
 * three-bucket rule. They are unapproved pending a prototype and were
 * left exactly as they were rather than half-moved.
 * =====================================================================
 */
import type { SpacingState } from '../../lib/db';
import type { CategoryCardModel } from '../../components/moduleHome/model';
import { shapesCounts } from '../../lib/moduleItemCounts';
import { countsTowardShapesCoverage } from './drillModel';
import { acquisitionIndex, handCounts, handsFor } from './acquisition';
import { countFluentPlus, rowsByRefHand, sectionCells, type SectionId } from './cellTargets';
import type { DrillHand } from '../../lib/db';

/** What a per-hand bar is called. Silas's three letters. */
const HAND_BAR_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'L',
  right: 'R',
  both: 'BOTH',
};

/** Mental visualisation has no `itemRefPrefix` — it lives under its own
 *  moduleRef entirely — so `handsFor` is asked with a stand-in that
 *  matches none of the hand-dimension prefixes, which is the true
 *  answer for it. */
const MENTAL_VIZ_PREFIX = 'mv:';
import { MENTAL_VIZ_ITEMS, MENTAL_VIZ_MODULE_REF } from './mentalVizLibrary';
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
  /** Seconds per section, from `shapesTimeInvested`. Omitted where the
   *  caller has not read the sessions; a section with none stays
   *  absent rather than showing a zero it has not measured. */
  timeBySection: ReadonlyMap<ShapesSectionId, number> = new Map(),
): CategoryCardModel[] {
  const counts = shapesCounts();
  const totalFor: Readonly<Record<ShapesSectionId, number>> = {
    'scales': counts.scaleDrills,
    'chord-shapes': counts.chordShapeDrills,
    'voice-leading': counts.voiceLeading,
    'mental-viz': MENTAL_VIZ_ITEMS.length,
  };

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
    // The bars, and only the bars. See the header.
    const index = acquisitionIndex(rows);
    const touched = [...index.touched];

    /**
     * ONE BAR PER HAND THE SECTION IS DRILLED ON.
     *
     * Which hands those are comes from the items themselves, not from
     * this list — scales and chord shapes run three, voice leading is
     * two-handed by nature and mental visualisation has none. Drawing
     * L and R for the last two would put two permanently empty bars on
     * a card and read as work not done rather than work that does not
     * exist.
     *
     * The DENOMINATOR is the section's full catalog count; the
     * numerators can only come from items with rows, so `touched` is
     * the whole walk.
     */
    // ASKED OF THE SECTION, NOT OF WHATEVER HAPPENS TO BE LOGGED. The
    // prefix is what `handsFor` matches on, and it is a fact about the
    // section — so an empty section draws the same bars it will draw
    // once it has rows, rather than growing two of them on first use.
    const hands = handsFor(section.itemRefPrefix ?? MENTAL_VIZ_PREFIX);
    // THE BARS KEEP THE OLD DENOMINATOR AS WELL AS THE OLD RULE. They
    // count items at an acquisition stage against the item total, and
    // both halves are left alone together — moving one would give the
    // bar a numerator and a denominator counting different things.
    const total = totalFor[section.id];
    const bars = hands.length > 1
      ? hands.map(hand => {
        const counts = handCounts(index, touched, hand);
        return {
          label: HAND_BAR_LABEL[hand],
          acquired: counts.acquired,
          inProgress: counts.inProgress,
          total,
        };
      })
      // NO LABEL ON A LONE BAR. There is no other bar to tell it apart
      // from, and naming it would invent a hand the section has not
      // got.
      : [{
        acquired: touched.filter(ref => index.cell(ref) === 'acquired').length,
        inProgress: touched.filter(ref => index.cell(ref) === 'in-progress').length,
        total,
      }];
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
      // THE FIELD STILL CARRIES THE RETIRED WORD, and the number in it
      // is Fluent+ cells. `CategoryCard` renders it into a sentence
      // that also still says "acquired"; the word and the field are
      // one change and belong to the rebuild that replaces the
      // sentence. Renaming the field alone would edit that line for
      // no visible gain.
      acquired: fluentPlus,
      bars,
      ...(timeBySection.has(section.id)
        ? { timeInvestedSeconds: timeBySection.get(section.id)! }
        : {}),
      lastPracticedDaysAgo: latest === null
        ? null
        : daysBetween(localDayKey(new Date(latest)), localDayKey(new Date(now))),
    };
  });
}

/** Re-exported so the page reads one import for both refs. */
export { MENTAL_VIZ_MODULE_REF };
