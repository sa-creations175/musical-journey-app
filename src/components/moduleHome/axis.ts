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
  /** How a value reads on screen. Defaults to `String(value)`. */
  labelFor?: (value: string | number) => string;
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

export function axisLabel(axis: AxisSpec, value: string | number): string {
  return axis.labelFor ? axis.labelFor(value) : String(value);
}
