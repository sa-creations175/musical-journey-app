/**
 * What is underneath a square.
 *
 * =====================================================================
 * A SQUARE'S TARGETS ARE WHAT IT IS FOR, NOT WHAT HAS BEEN DRILLED.
 *
 * The grids paint one square per (row × key), and each square stands
 * for more than one spacing row:
 *
 *   chord shape   inversion states × hands   — twelve for a triad
 *   scale         hands                      — three
 *   voice leading one row                    — two-handed by nature
 *
 * The square's word is the LOWEST of those, and that only means
 * anything if untouched targets are counted. Enumerating from the rows
 * that happen to exist would let one Mastered inversion speak for the
 * eleven nobody has opened. So the list comes from the catalog, and
 * `rollUpTargets` is handed `undefined` wherever there is no row.
 * =====================================================================
 *
 * SUPPLEMENTARY IS NOT ONE OF THEM. Sevenths carry a supplementary
 * state that `itemRefForSkill` already describes as "filtered out of
 * acquisition queries", and the chord panel keeps it out of its grid
 * and below with its own control. It is extra material, not a rung of
 * the square — counting it would hold every seventh square back on
 * something the square is not claiming.
 */
import type { DrillHand, SpacingState } from '../../lib/db';
import { rollUpTargets } from '../../lib/spacing/rollup';
import type { BandVerdict } from '../../lib/spacing/banding';
import { CHORD_QUALITY_BY_ID, INVERSION_STATES_FOR_CHORD_SHAPE_KIND } from './catalog';
import { HAND_ORDER, handsFor } from './acquisition';

/** One thing a square is waiting on. */
export interface CellTarget {
  itemRef: string;
  hand: DrillHand;
}

/**
 * A chord square's targets: every acquisition-path inversion state for
 * the quality, across all three hands.
 *
 * Extensions and specials have no inversion state and their itemRef has
 * no fourth segment — `INVERSION_STATES_FOR_CHORD_SHAPE_KIND` says
 * `[null]` for both, which is what produces the bare ref here.
 */
export function chordCellTargets(quality: string, keyName: string): CellTarget[] {
  const kind = CHORD_QUALITY_BY_ID.get(quality)?.kind ?? 'special';
  const base = `chord-shape:${quality}:${keyName}`;
  const out: CellTarget[] = [];
  for (const state of INVERSION_STATES_FOR_CHORD_SHAPE_KIND[kind]) {
    if (state === 'supplementary') continue;
    const itemRef = state === null ? base : `${base}:${state}`;
    for (const hand of HAND_ORDER) out.push({ itemRef, hand });
  }
  return out;
}

/**
 * A square with one itemRef: every hand that itemRef is drilled on.
 *
 * The hand list comes from `handsFor`, which is the app's one answer to
 * whether an itemRef has a hand dimension at all. Voice leading and
 * mental visualisation come back with `both` alone — asking them for a
 * left hand would hold their squares at Started forever, waiting on a
 * row that cannot exist.
 */
export function itemCellTargets(itemRef: string): CellTarget[] {
  return handsFor(itemRef).map(hand => ({ itemRef, hand }));
}

/** `${itemRef} ${hand}` → the row, for the lookups below. */
export function rowsByRefHand(
  rows: readonly SpacingState[],
): ReadonlyMap<string, SpacingState> {
  const m = new Map<string, SpacingState>();
  for (const r of rows) m.set(`${r.itemRef} ${r.hand}`, r);
  return m;
}

/** The square's one word, given its targets and the rows in hand. */
export function verdictForTargets(
  targets: readonly CellTarget[],
  byRefHand: ReadonlyMap<string, SpacingState>,
): BandVerdict {
  return rollUpTargets(targets.map(t => byRefHand.get(`${t.itemRef} ${t.hand}`)));
}
