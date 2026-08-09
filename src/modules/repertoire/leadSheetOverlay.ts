/**
 * Where a floating overlay sits relative to the grid cell it is about.
 *
 * Two consumers, one set of rules:
 *   · the refusal message, which is about the cell you just tapped
 *   · the line-end prompt, which is about the cell your line's head
 *     just landed in
 *
 * Both exist because a message at the bottom of the viewport is
 * nowhere near where the user is looking. Keeping the geometry in one
 * pure function is what stops the two drifting into subtly different
 * flip and clamp behaviour.
 *
 * THE DIFFERENCE BETWEEN THEM is lifetime, and it is why the
 * edge-sticking modes exist. The refusal message self-dismisses in a
 * couple of seconds, so its cell is always on screen. The line-end
 * prompt stays up until the gesture completes — long enough to scroll
 * from bar 1 to bar 12 looking for the end cell — so its anchor can
 * leave the viewport entirely. It must never leave with it: the prompt
 * carries the only cancel control, so losing it strands the gesture.
 *
 * Pure and viewport-relative: callers pass measured rects in, so this
 * is unit-testable without a DOM and has no opinion about how the
 * anchor was found or how often it is re-measured.
 */

export type OverlayPlacement =
  /** Floating just above the anchor cell — the default. */
  | 'above'
  /** Flipped under it, when there is no room above. */
  | 'below'
  /** Anchor has scrolled off the top; pinned to the top edge. */
  | 'top-edge'
  /** Anchor has scrolled off the bottom (or is unknown); pinned to the
   *  bottom edge. */
  | 'bottom-edge';

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

export interface OverlayPosition {
  left: number;
  top: number;
  placement: OverlayPlacement;
}

export interface OverlayGeometry {
  /** Measured anchor cell, or null when there is nothing to anchor to
   *  — an unmounted section, say. Null pins to the bottom edge rather
   *  than hiding, because a prompt that vanishes takes its cancel
   *  control with it. */
  cell: AnchorRect | null;
  viewport: { width: number; height: number };
  /** Fixed box size. Callers use a known width so centring and clamping
   *  are arithmetic rather than a measure-then-reposition pass. */
  box: { width: number; height: number };
  gap: number;
  edgePad: number;
}

export function anchoredOverlayPosition({
  cell,
  viewport,
  box,
  gap,
  edgePad,
}: OverlayGeometry): OverlayPosition {
  // `Math.max(edgePad, …)` on the upper bound keeps a viewport narrower
  // or shorter than the box from producing a negative clamp range,
  // which would push the overlay off the opposite edge.
  const clampLeft = (x: number) =>
    Math.min(
      Math.max(edgePad, x),
      Math.max(edgePad, viewport.width - box.width - edgePad),
    );
  const topEdge = edgePad;
  const bottomEdge = Math.max(edgePad, viewport.height - box.height - edgePad);

  if (!cell) {
    return {
      left: clampLeft(viewport.width / 2 - box.width / 2),
      top: bottomEdge,
      placement: 'bottom-edge',
    };
  }

  // Horizontal tracking continues even in the edge modes: the anchor's
  // column is still meaningful when it has only scrolled away
  // vertically, and keeping x continuous stops the prompt jumping
  // sideways as it sticks.
  const left = clampLeft(cell.left + cell.width / 2 - box.width / 2);

  if (cell.bottom <= edgePad) return { left, top: topEdge, placement: 'top-edge' };
  if (cell.top >= viewport.height - edgePad) {
    return { left, top: bottomEdge, placement: 'bottom-edge' };
  }

  // Above by default — it keeps the cell itself, and the row under it,
  // unobscured.
  const above = cell.top - box.height - gap;
  if (above >= edgePad) return { left, top: above, placement: 'above' };

  const below = cell.bottom + gap;
  if (below <= bottomEdge) return { left, top: below, placement: 'below' };

  return { left, top: bottomEdge, placement: 'bottom-edge' };
}

/** Read a DOM rect into the shape this module takes. */
export function toAnchorRect(rect: DOMRect): AnchorRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
  };
}
