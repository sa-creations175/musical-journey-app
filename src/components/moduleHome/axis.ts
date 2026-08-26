/**
 * How a category's items are arranged, and where that arrangement's
 * ORDER comes from.
 *
 * =====================================================================
 * A GRID NEVER SORTS ITS OWN AXIS.
 *
 * The tempting implementation is
 * `[...new Set(items.map(i => i.axis.key))]` — derive the columns from
 * the items present. It is one line, it looks like derivation, and it
 * is a per-screen sort wearing derivation's clothes: the order it
 * produces is first-appearance order, which is an accident of how the
 * catalog was walked, and it changes silently when a generator is
 * reordered.
 *
 * So an `AxisSpec` carries `values` — the ordered source list — and the
 * adapter passes the list that ALREADY EXISTS, by reference: the flat
 * twelve, `INTERVAL_SEEDS`, 1–7. Nothing here builds one.
 *
 * The consequence worth stating: a value present on an item but ABSENT
 * from `values` does not appear in the grid. That is deliberate. It
 * falls to the tail list instead of silently extending the axis, which
 * is how a grid stays a claim about a known set rather than a picture
 * of whatever turned up.
 * =====================================================================
 */
import type { ComponentType } from 'react';
import type { SkillRecord } from '../../modules/skills/registry';

/** One ordering of an axis. A view is DISPLAY ONLY. */
export interface AxisView {
  id: string;
  label: string;
  /** The ordered values, by reference where a list already exists. */
  values: readonly (string | number)[];
}

export interface AxisSpec {
  /** The `axis` field on a SkillRecord this reads. */
  field: string;
  label: string;
  /**
   * Orderings of the same values. One is the default; more than one
   * puts a toggle on the grid.
   *
   * EVERY VIEW HOLDS THE SAME SET, only reordered. That is what makes
   * the toggle display-only, and what lets a column mean the same thing
   * in either view — see `viewsAgree`.
   */
  views: readonly AxisView[];
  /**
   * How a value reads on screen. Defaults to `String(value)`.
   *
   * `group` is the row value of the grid this label is being drawn in,
   * and is passed only where the grid is SPLIT — see `splitRows`. It
   * exists because one axis value can mean different things in
   * different groups: staff position 0 is E4 in the treble clef and G2
   * in the bass, so a label function that could not see the clef could
   * only print the index.
   */
  labelFor?: (value: string | number, group?: string | number) => string;
  /**
   * Which values sit inside the axis's own frame.
   *
   * A run of staff positions covers the five lines AND the ledger
   * positions either side of them; without a mark, the ledgers read as
   * more staff. Where this is given, the grid draws a rule across the
   * framed columns. Absent means the axis has no such frame, which is
   * every other axis in the app.
   */
  inFrame?: (value: string | number) => boolean;
}

/** The grid for one category, or `null` where it has no axes. */
export interface GridSpec {
  columns: AxisSpec;
  /**
   * The second axis, when the category has one.
   *
   * ABSENT MEANS ONE ROW, not no grid. Several categories vary along a
   * single dimension — twelve tritone pairs, a run of staff positions —
   * and forcing a second axis on them would mean inventing one. A
   * 12 x 1 strip of cells is the honest picture of a 1-D category, and
   * it still colours, still opens an item, and still has a tail.
   */
  rows?: AxisSpec;
  /**
   * ONE TABLE PER ROW VALUE INSTEAD OF ONE TABLE WITH A ROW EACH.
   *
   * Set where the rows do not share the columns' MEANING. Reading's
   * note positions are the case: treble and bass ran as two rows over
   * one axis of indices −4…12, and position 0 is E4 in one clef and G2
   * in the other — so a single header could only ever print the index,
   * which is a coordinate rather than a note.
   *
   * Split, each table gets its own headers and `labelFor` is told which
   * group it is labelling. The cells, their tiers and the tail are
   * unchanged: this is how the same placement is DRAWN.
   */
  splitRows?: boolean;
  /**
   * THE SAME ITEMS, DRAWN THE OTHER WAY UP — supplied as a component,
   * because the second drawing is not a table and cannot be described
   * by axes.
   *
   * Reading's is the notation reference it already teaches from, with
   * each position coloured by its tier. A category that supplies one
   * gets a toggle; every other has only the table, and no toggle.
   */
  vertical?: ComponentType<VerticalViewProps>;
}

/** What a vertical view is handed: the category's items, and the way
 *  to open one — the same two things a cell press carries. */
export interface VerticalViewProps {
  items: readonly SkillRecord[];
  onOpen: (item: SkillRecord) => void;
}

/** The single row a 1-D grid renders along. Its value never shows. */
export const SINGLE_ROW: AxisView = { id: 'only', label: '', values: [''] };

/**
 * Whether every view of an axis holds the same values.
 *
 * The property the toggle rests on: chromatic and circle-of-fourths are
 * two orderings of twelve keys, so tapping a column selects the same
 * key either way. A view that added or dropped one would make the
 * toggle a filter pretending to be a sort, and the drill it eventually
 * starts would depend on which way you happened to be looking.
 */
export function viewsAgree(axis: AxisSpec): boolean {
  if (axis.views.length < 2) return true;
  const first = [...axis.views[0].values].sort().join(' ');
  return axis.views.every(v => [...v.values].sort().join(' ') === first);
}

/** The view to render, falling back to the first when the remembered
 *  one no longer exists. */
export function resolveView(axis: AxisSpec, viewId: string | null): AxisView {
  return axis.views.find(v => v.id === viewId) ?? axis.views[0];
}

export function axisLabel(
  axis: AxisSpec,
  value: string | number,
  group?: string | number,
): string {
  return axis.labelFor ? axis.labelFor(value, group) : String(value);
}

// ---------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------

/**
 * WHICH WAY UP A GRID IS DRAWN, remembered the way an axis view is.
 *
 * Transposing is display only, exactly like choosing chromatic over
 * fourths: the same cells, the same coordinates, the same items — the
 * table is simply drawn on its side. So it rides the SAME remembered
 * store an axis view rides, under a field name no axis can collide
 * with, rather than a second preference with its own loading and its
 * own chance to be stale.
 *
 * KEYED PER CATEGORY, not per module and not globally. Which way up a
 * 7 x 24 grid reads is a fact about that grid's shape; a 12 x 7 one has
 * no reason to inherit the answer.
 */
export const ORIENTATION_FIELD_PREFIX = 'grid-orientation:';

/** The stored value meaning "drawn on its side". Anything else, absent
 *  included, means the orientation the category declared. */
export const TRANSPOSED = 'transposed';
export const AS_DECLARED = 'as-declared';

export function orientationField(categoryLabel: string): string {
  return `${ORIENTATION_FIELD_PREFIX}${categoryLabel}`;
}

// ---------------------------------------------------------------------
// Layout — the table, or the category's own vertical drawing
// ---------------------------------------------------------------------

/**
 * WHICH DRAWING IS SHOWN, remembered exactly as the orientation is.
 *
 * A different kind of choice from transposing: the two are not the same
 * picture turned, they are a table and a staff. But it is remembered
 * for the same reason and through the same store — re-choosing a view
 * on every visit is the friction that makes a view stop being used.
 *
 * HORIZONTAL IS THE DEFAULT because it is what every other category
 * shows; absent means the table.
 */
export const LAYOUT_FIELD_PREFIX = 'grid-layout:';

export const HORIZONTAL = 'horizontal';
export const VERTICAL = 'vertical';

export function layoutField(categoryLabel: string): string {
  return `${LAYOUT_FIELD_PREFIX}${categoryLabel}`;
}

/**
 * The grid as it should be drawn, given the remembered choice.
 *
 * A one-dimensional grid is returned untouched: it has no second axis
 * to swap with, and inventing one to turn a 12-wide strip into a
 * 12-tall one would be a different picture, not the same one rotated.
 */
export function orientedGrid(grid: GridSpec, transposed: boolean): GridSpec {
  if (!transposed || !canTranspose(grid)) return grid;
  return { columns: grid.rows!, rows: grid.columns };
}

/**
 * Whether this grid can be turned at all.
 *
 * A SPLIT GRID CANNOT. Its rows are already separate tables, and the
 * columns are labelled per group — swapping the two would ask each
 * clef's note names to become the thing the tables are split BY.
 */
export function canTranspose(grid: GridSpec | null): boolean {
  return grid !== null && grid.rows !== undefined && grid.splitRows !== true;
}
