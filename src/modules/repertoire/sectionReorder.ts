/**
 * Pure section-reorder helper shared by SongDetailView's reorder-mode
 * up/down controls and its tests.
 *
 * Sections are persisted with an `order` field and rendered sorted by
 * it. Moving a section one step swaps the `order` values of the section
 * and its neighbour, so their relative position flips without
 * renumbering the whole list. Keeping this as a pure function lets the
 * up/down mutations and boundary conditions be unit-tested without a
 * component/db harness (the codebase tests logic, not rendered React).
 */

export interface SectionOrderRow {
  id: string;
  order: number;
}

export interface SectionMovePlan {
  /** The moved section, paired with its new `order` value. */
  moved: { id: string; order: number };
  /** The displaced neighbour, paired with its new `order` value. */
  neighbour: { id: string; order: number };
}

/**
 * Plan a one-step move of `id` within `sections` (assumed sorted by
 * `order`). `dir` is -1 (up) or 1 (down). Returns `null` when the move
 * would cross a boundary (first section up / last section down) or when
 * `id` isn't present — i.e. a no-op.
 */
export function planSectionMove(
  sections: readonly SectionOrderRow[],
  id: string,
  dir: -1 | 1,
): SectionMovePlan | null {
  const idx = sections.findIndex(s => s.id === id);
  if (idx < 0) return null;
  const target = idx + dir;
  if (target < 0 || target >= sections.length) return null;
  const moved = sections[idx];
  const neighbour = sections[target];
  return {
    moved: { id: moved.id, order: neighbour.order },
    neighbour: { id: neighbour.id, order: moved.order },
  };
}
