/**
 * Splitting a category's items into the grid and the tail.
 *
 * =====================================================================
 * THE TAIL IS NOT AN EDGE CASE. IT IS MOST CATEGORIES.
 *
 * Pentatonic scales is 36 keyed cards and 5 formula cards. Progressions
 * is 6 keyed and 20 one-offs. A surface that renders only a grid drops
 * those 5 and 20 without saying anything — the page looks complete,
 * every cell is filled, and a fifth of the category is missing.
 *
 * So placement returns BOTH halves and the caller renders both. An item
 * lands in the grid only when it carries both coordinates AND both
 * values appear in the axis lists; everything else is tail. There is no
 * third outcome and nothing is dropped.
 * =====================================================================
 */
import type { SkillRecord } from '../../modules/skills/registry';
import type { AxisView, GridSpec } from './axis';

export interface PlacedGrid {
  /** `cells.get(columnValue)?.get(rowValue)` — the items in that cell.
   *  An array, not one item: two records can share coordinates when the
   *  category varies by something the grid does not show. */
  cells: Map<string, Map<string, SkillRecord[]>>;
  columns: readonly (string | number)[];
  rows: readonly (string | number)[];
}

export interface Placement {
  grid: PlacedGrid | null;
  /** Everything the grid could not place, in the order supplied. */
  tail: SkillRecord[];
}

const key = (v: string | number): string => String(v);

export function placeItems(
  items: readonly SkillRecord[],
  spec: GridSpec | null,
  columnView: AxisView,
  rowView: AxisView,
): Placement {
  if (spec === null) return { grid: null, tail: [...items] };

  const colKeys = new Set(columnView.values.map(key));
  const rowKeys = new Set(rowView.values.map(key));
  // A 1-D grid has no row FIELD, so every placed item shares the one
  // row. Reading `axis[undefined]` would put everything in the tail.
  const oneRow = spec.rows === undefined;
  const cells = new Map<string, Map<string, SkillRecord[]>>();
  const tail: SkillRecord[] = [];

  for (const item of items) {
    const c = item.axis?.[spec.columns.field];
    const r = oneRow ? rowView.values[0] : item.axis?.[spec.rows!.field];
    // Missing a coordinate, or carrying one the axis does not list —
    // both are tail. Extending the axis to fit would make the grid a
    // picture of the data rather than a claim about a known set.
    if (c === undefined || r === undefined
      || !colKeys.has(key(c)) || !rowKeys.has(key(r))) {
      tail.push(item);
      continue;
    }
    const col = cells.get(key(c)) ?? new Map<string, SkillRecord[]>();
    const bucket = col.get(key(r)) ?? [];
    bucket.push(item);
    col.set(key(r), bucket);
    cells.set(key(c), col);
  }

  return {
    grid: { cells, columns: columnView.values, rows: rowView.values },
    tail,
  };
}

/** Every item in a column, in row order — what tapping a column header
 *  would eventually drill. Used today only to prove the two views
 *  select the same set. */
export function columnItems(
  grid: PlacedGrid,
  columnValue: string | number,
): SkillRecord[] {
  const col = grid.cells.get(key(columnValue));
  if (!col) return [];
  return grid.rows.flatMap(r => col.get(key(r)) ?? []);
}
