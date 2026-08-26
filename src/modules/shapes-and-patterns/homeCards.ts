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
 * COUNTS COME FROM `shapesCounts()`, the same function the coverage
 * denominators use — so a catalog that grows moves the card and the
 * goal together. Mental visualisation is not in it (excluded from
 * breadth/depth by the April 27 call), so its denominator comes from
 * its own library.
 */
import type { SpacingState } from '../../lib/db';
import type { CategoryCardModel } from '../../components/moduleHome/model';
import { shapesCounts } from '../../lib/moduleItemCounts';
import { countsTowardShapesCoverage } from './drillModel';
import { acquisitionIndex, handCounts, handsFor } from './acquisition';
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

export type ShapesSectionId = 'scales' | 'chord-shapes' | 'voice-leading' | 'mental-viz';

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
     * ACQUIRED BY THE MODULE'S ONE RULE — see `acquisition.ts`.
     *
     * The card used to show `itemsSeen`, which counted a cell the
     * moment any hand was touched. The matrix under it counted all
     * three hands and the Progress line counted only `both`, so the
     * three surfaces described the same cell three ways. Only items
     * with rows can be acquired, so walking `touched` is the whole
     * numerator.
     */
    const index = acquisitionIndex(rows);
    const touched = [...index.touched];
    const acquired = touched
      .filter(ref => index.cell(ref) === 'acquired').length;

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
        acquired,
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
      itemCount: totalFor[section.id],
      // The counts speak for themselves here: one row per drillable
      // cell, which is what the grids below render.
      countDetail: null,
      description: null,
      // Duration and a self-rating, never right/wrong — see the header.
      accuracy: null,
      itemsSeen,
      acquired,
      bars,
      lastPracticedDaysAgo: latest === null
        ? null
        : daysBetween(localDayKey(new Date(latest)), localDayKey(new Date(now))),
    };
  });
}

/** Re-exported so the page reads one import for both refs. */
export { MENTAL_VIZ_MODULE_REF };
