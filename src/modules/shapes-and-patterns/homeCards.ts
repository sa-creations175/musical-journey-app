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
      lastPracticedDaysAgo: latest === null
        ? null
        : daysBetween(localDayKey(new Date(latest)), localDayKey(new Date(now))),
    };
  });
}

/** Re-exported so the page reads one import for both refs. */
export { MENTAL_VIZ_MODULE_REF };
