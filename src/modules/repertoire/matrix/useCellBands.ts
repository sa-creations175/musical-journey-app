import { useLiveQuery } from 'dexie-react-hooks';
import type { SongCell } from '../../../lib/db';
import { type CellBands, NO_CELL_BANDS, loadCellBands } from './cellBands';

/**
 * The bands for a set of cells, live.
 *
 * A LIVE QUERY BECAUSE THE BAND IS NOT ON THE CELL. It lives in
 * `spacingState`, written by whatever rated the rep — the song test,
 * or the charting signal. A component holding `songCells` from its own
 * live query would otherwise render a stale band until something
 * happened to touch the cell row, which is not what changed.
 *
 * Keyed on the cell ids rather than the cell objects: the cells
 * re-fetch on any change to any of their own fields, and re-running
 * the band query for a `lastEngagedAt` bump would be pure cost.
 *
 * Returns `NO_CELL_BANDS` while loading, which reads as Not Started
 * everywhere. That is the right direction to be wrong in briefly — it
 * under-claims rather than showing a band the reader has not earned.
 */
export function useCellBands(
  cells: ReadonlyArray<SongCell> | undefined,
): CellBands {
  const ids = (cells ?? []).map(c => c.id);
  const key = ids.join(',');
  return useLiveQuery(
    () => loadCellBands(ids),
    [key],
    NO_CELL_BANDS,
  ) ?? NO_CELL_BANDS;
}
