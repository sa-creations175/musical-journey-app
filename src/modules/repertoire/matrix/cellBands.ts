import { db } from '../../../lib/db';
import type { BandVerdict } from '../../../lib/spacing/banding';
import { NOT_STARTED } from '../../../lib/spacing/banding';
import { bandVerdictForRow } from '../../../lib/spacing/row';
import { songCellItemRef, REPERTOIRE_MODULE_REF } from '../chartingEngagement';

/**
 * WHAT BAND A MATRIX CELL IS IN.
 *
 * =====================================================================
 * `cellState` was a THREE-VALUE FIELD — empty / learning / comfortable
 * — advanced by a Mark Comfortable button behind a three-clean-runs
 * gate. The four bands replace it, and they are not a wider version of
 * the same thing: a band is derived from rated reps through the shared
 * reader, so nothing declares one and nothing can advance a cell by
 * pressing a button.
 *
 * Two of the words even collided. `cellState: 'comfortable'` and the
 * song's own Comfortable status were the same string saying different
 * things about different objects, which is most of why the ladder and
 * the display sites drifted.
 *
 * ONE READER, TWO QUESTIONS. Everything that used to look at
 * `cellState` wants one of these, and they are genuinely different:
 *
 *   · IS IT COMFORTABLE — Fluent or better. What the ladder means when
 *     it asks whether a key is finished.
 *   · HAS IT BEEN TOUCHED — anything but Not Started. A cell with a
 *     charting signal and no reps answers YES here and NO above, which
 *     is exactly the distinction the old field could not draw.
 *
 * Reading one when you meant the other is how three call sites came to
 * disagree, so both are named rather than left as inline comparisons.
 * =====================================================================
 */

/** cellId → its band verdict. Absent means the cell has no spacing
 *  row at all, which reads as Not Started. */
export type CellBands = ReadonlyMap<string, BandVerdict>;

/** For call sites that have no bands to hand — every cell reads Not
 *  Started. Named rather than an inline `new Map()` so the intent is
 *  legible at the call site. */
export const NO_CELL_BANDS: CellBands = new Map();

/** The verdict for one cell. Never throws and never returns null: a
 *  cell nobody has engaged with IS Not Started, which is a verdict. */
export function cellVerdict(bands: CellBands, cellId: string): BandVerdict {
  return bands.get(cellId) ?? NOT_STARTED;
}

/**
 * Fluent or better.
 *
 * THE LADDER'S DEFINITION OF COMFORTABLE. Practice is capped at
 * Developing, so this can only be true of a cell that has been TESTED
 * at tempo — which is what the old three-clean-runs gate was reaching
 * for and could not express, because it counted runs rather than
 * reading a rating.
 */
export function isCellComfortable(bands: CellBands, cellId: string): boolean {
  const v = cellVerdict(bands, cellId);
  return v.kind === 'band' && (v.band === 'fluent' || v.band === 'mastered');
}

/**
 * Anything but Not Started.
 *
 * NOT THE SAME QUESTION as the one above, and the three call sites
 * that asked `cellState !== 'empty'` were asking this one. Since the
 * Started broadening a cell answers yes on any recorded engagement at
 * all — including a charted lead sheet with no run behind it.
 */
export function isCellTouched(bands: CellBands, cellId: string): boolean {
  return cellVerdict(bands, cellId).kind !== 'not-started';
}

/**
 * Load the bands for a set of cells.
 *
 * Queries the `[moduleRef+itemRef+hand]` index once per cell rather
 * than scanning the table: `songCell:` refs are exact, and a table
 * scan here would run on every matrix render.
 */
export async function loadCellBands(
  cellIds: ReadonlyArray<string>,
): Promise<CellBands> {
  if (cellIds.length === 0) return NO_CELL_BANDS;
  const refs = cellIds.map(songCellItemRef);
  const rows = await db.spacingState
    .where('[moduleRef+itemRef+hand]')
    .anyOf(refs.map(ref => [REPERTOIRE_MODULE_REF, ref, 'both'] as const))
    .toArray();

  const out = new Map<string, BandVerdict>();
  for (const row of rows) {
    const cellId = String(row.itemRef).slice('songCell:'.length);
    if (cellId === '') continue;
    out.set(cellId, bandVerdictForRow(row));
  }
  return out;
}

/** Load the bands for every cell of one song. */
export async function loadCellBandsForSong(songId: string): Promise<CellBands> {
  const cells = await db.songCells.where('songId').equals(songId).toArray();
  return loadCellBands(cells.map(c => c.id));
}
