/**
 * Resolve the prep-screen per-item breakdown into an ordered list of
 * scale cells for the in-session drill runner (Level 3 auto-nav).
 *
 * The breakdown is the source of truth: which cell to open (each
 * scale itemRef → its ScaleCell) and how long to drill it (the item's
 * allotted seconds). Non-scale itemRefs are dropped here; chord-shape
 * blocks have their own resolver (inSessionChordShapeRunner).
 */
import {
  scaleCellForItemRef,
  type ScaleCell,
} from '../shapes-and-patterns/scaleSkills';

export interface BreakdownItem {
  itemRef: string;
  seconds: number;
}

export interface ScaleRunnerItem extends BreakdownItem {
  cell: ScaleCell;
}

/** Map breakdown items to scale cells in order, dropping any that
 *  aren't recognised scale itemRefs. */
export function resolveScaleRunnerItems(
  items: ReadonlyArray<BreakdownItem>,
): ScaleRunnerItem[] {
  const out: ScaleRunnerItem[] = [];
  for (const item of items) {
    const cell = scaleCellForItemRef(item.itemRef);
    if (cell) out.push({ ...item, cell });
  }
  return out;
}

/** True when a breakdown's first item is a scale cell — the signal to
 *  drive the in-session runner instead of a route fallback. */
export function isScaleRunnerBlock(
  items: ReadonlyArray<BreakdownItem> | null | undefined,
): boolean {
  return (
    !!items && items.length > 0 && scaleCellForItemRef(items[0].itemRef) !== null
  );
}
