// SM-2 drill queue for the mental-viz chord library. Orders the full
// item library so the drill surfaces what needs practice first:
//   1. unseen items (no spacing row yet) — new material to learn
//   2. due items (nextDueAt ≤ now) — most overdue first
//   3. not-yet-due items — soonest review first (review-ahead tail)
// The drill walks this order for the session's allotted time.

import { db } from '../../lib/db';
import {
  MENTAL_VIZ_ITEMS,
  MENTAL_VIZ_MODULE_REF,
  type MentalVizItem,
} from './mentalVizLibrary';

export interface MentalVizSpacingRow {
  itemRef: string;
  nextDueAt: number | null;
}

/**
 * Pure ordering: unseen first, then by `nextDueAt` ascending (overdue
 * → soonest-future), library order breaking ties. Sorting ascending by
 * due date already places overdue items ahead of future ones, so `now`
 * isn't needed.
 */
export function orderMentalVizQueue(
  rows: ReadonlyArray<MentalVizSpacingRow>,
): MentalVizItem[] {
  const dueByRef = new Map<string, number | null>();
  for (const r of rows) dueByRef.set(r.itemRef, r.nextDueAt);

  // Sort key: unseen → -Infinity (lead); seen → nextDueAt (null due
  // treated as 0 so a logged-but-undated row still sorts early).
  const keyFor = (item: MentalVizItem): number => {
    if (!dueByRef.has(item.itemRef)) return -Infinity;
    return dueByRef.get(item.itemRef) ?? 0;
  };

  return MENTAL_VIZ_ITEMS
    .map((item, i) => ({ item, i, key: keyFor(item) }))
    .sort((a, b) => (a.key - b.key) || (a.i - b.i))
    .map(e => e.item);
}

/** Read the mental-viz spacing rows and return the ordered drill queue. */
export async function loadMentalVizQueue(): Promise<MentalVizItem[]> {
  const rows = await db.spacingState
    .where('moduleRef')
    .equals(MENTAL_VIZ_MODULE_REF)
    .toArray();
  return orderMentalVizQueue(
    rows.map(r => ({ itemRef: r.itemRef, nextDueAt: r.nextDueAt ?? null })),
  );
}
