import type { SongCell } from '../../../lib/db';

/**
 * What a matrix cell looks like, as two numbers.
 *
 * ---------------------------------------------------------------
 * THE SAME SHAPE AS THE S&P GRID, MEANING SOMETHING DIFFERENT.
 *
 * Shapes & Patterns ramps on TIME INVESTED. A matrix cell has no
 * useful notion of that — a section is not more learned for having
 * taken longer — so this ramps on HOW FAR IT HAS GOT: nothing logged,
 * started, partway to the gate, through it.
 *
 * Reading as "how close to done" rather than "how much time in" is
 * why the ramp is worth copying and the metric is not.
 * ---------------------------------------------------------------
 *
 * CELLS DO NOT LAPSE. Only KEYS do — `isHeld` reads a per-key due date
 * from the spacing engine, and there is no per-cell equivalent.
 * Inventing one here would create a second decay rule competing with
 * the one the stage rules already use, and the two would disagree
 * within a week. A stale cell fades; a lapsed KEY is marked on its
 * row, where the fact actually lives.
 */

export const CELL_FILL_EMPTY = 0.05;
export const CELL_FILL_STARTED = 0.25;
export const CELL_FILL_PARTWAY = 0.55;
export const CELL_FILL_COMFORTABLE = 0.85;

/** Matches the S&P freshness ramp exactly — one visual language means
 *  a faded cell means the same thing in both grids. */
const DAY_MS = 24 * 60 * 60 * 1000;

export function cellFreshnessAlpha(lastRunAt: number | null, now: number): number {
  if (lastRunAt === null) return 0.5;
  const days = (now - lastRunAt) / DAY_MS;
  if (days <= 3) return 1.0;
  if (days <= 10) return 0.9;
  if (days <= 20) return 0.7;
  return 0.5;
}

export interface CellHeat {
  fill: number;
  alpha: number;
  /** Comfortable: the gate is a threshold, not the top of the ramp. */
  bordered: boolean;
}

export function cellHeat(cell: SongCell | null, now: number): CellHeat {
  if (cell === null || cell.cellState === 'empty') {
    // `lastRunAt` on an empty cell is either null or history from
    // before a reset; either way there is nothing to be fresh about.
    return { fill: CELL_FILL_EMPTY, alpha: 1, bordered: false };
  }

  const alpha = cellFreshnessAlpha(cell.lastRunAt, now);

  if (cell.cellState === 'comfortable') {
    return { fill: CELL_FILL_COMFORTABLE, alpha, bordered: true };
  }

  // Learning: the clean-run streak is the distance still to travel, so
  // it is what the ramp reads. A cell with two in a row is visibly
  // nearer than one with none, which is the whole point of showing it.
  const fill = cell.consecutiveCleanCount >= 1
    ? CELL_FILL_PARTWAY
    : CELL_FILL_STARTED;
  return { fill, alpha, bordered: false };
}
