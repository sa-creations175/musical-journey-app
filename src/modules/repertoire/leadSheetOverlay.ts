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

/**
 * BOX SIZE — shared by both overlays, because both got it wrong in
 * different directions from the same cause: a declared size that did
 * not match what the content actually rendered as.
 *
 *   · the line-end prompt declared a fixed 268px width and truncated,
 *     so it read "tap the beat wher… [cancel]"
 *   · the refusal message declared 232px wide by 30px tall, but its
 *     sentence wraps to two lines at that width — so it rendered
 *     taller than the geometry believed and sat lower than intended,
 *     clipping into the cell it was pointing at
 *
 * The rule now: **never truncate, always wrap.** Width is a MAXIMUM,
 * not a fixed size, so a box shrinks to its content and a long message
 * wraps instead of clipping. Height is a two-line BUDGET.
 *
 * Both dimensions are deliberately modest. A very wide box covers the
 * cells the user is about to aim at; a very tall one covers whole
 * rows. Two lines and a moderate width keeps the anchor cell and its
 * immediate neighbours visible enough to hit — and the pass-through
 * behaviour on the prompt body covers what is still overlapped.
 *
 * Geometry uses the MAX width for centring and clamping rather than
 * the rendered width. That keeps positioning arithmetic — no
 * measure-then-reposition pass, no frame in the wrong place — and
 * errs conservatively, since clamping a box as if it were wider than
 * it is can only keep it further inside the viewport. Both current
 * messages run to the cap anyway.
 */
export const OVERLAY_MAX_W = 240;
/** Two wrapped lines at 11px with `leading-tight`, plus `py-1`. */
export const OVERLAY_H = 40;
export const OVERLAY_GAP = 6;
export const OVERLAY_EDGE_PAD = 8;
/** Narrowest viewport the layout supports; `OVERLAY_MAX_W` must leave
 *  padding on both sides of it, or wrapping could not save a box from
 *  running off the screen. Asserted in the tests. */
export const MIN_SUPPORTED_VIEWPORT_W = 320;

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

export interface SafeArea {
  /** Pixels of app chrome pinned at the top — the sticky header, plus
   *  the session banner when one is showing. */
  top: number;
  /** Pixels of chrome pinned at the bottom — the mobile nav bar. */
  bottom: number;
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
  /** App chrome to stay clear of. The sticky boundary is the top of
   *  the CONTENT AREA, not the top of the window — sticking to the raw
   *  viewport put the overlay on top of the app header, covering the
   *  logo and page title. Omitted means no chrome. */
  safeArea?: SafeArea;
}

export function anchoredOverlayPosition({
  cell,
  viewport,
  box,
  gap,
  edgePad,
  safeArea,
}: OverlayGeometry): OverlayPosition {
  // `Math.max(edgePad, …)` on the upper bound keeps a viewport narrower
  // or shorter than the box from producing a negative clamp range,
  // which would push the overlay off the opposite edge.
  const clampLeft = (x: number) =>
    Math.min(
      Math.max(edgePad, x),
      Math.max(edgePad, viewport.width - box.width - edgePad),
    );
  // Everything below works in CONTENT-AREA coordinates: the usable
  // band between the app's top and bottom chrome.
  const safeTop = safeArea?.top ?? 0;
  const safeBottom = safeArea?.bottom ?? 0;
  const topEdge = safeTop + edgePad;
  const bottomLimit = viewport.height - safeBottom;
  // `Math.max(topEdge, …)` keeps a content area shorter than the box
  // from producing a bottom edge above the top one.
  const bottomEdge = Math.max(topEdge, bottomLimit - box.height - edgePad);

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

  // A cell hidden BEHIND the chrome counts as scrolled away, not
  // visible — pointing at something the header is covering is no
  // better than pointing off-screen.
  if (cell.bottom <= topEdge) return { left, top: topEdge, placement: 'top-edge' };
  if (cell.top >= bottomLimit - edgePad) {
    return { left, top: bottomEdge, placement: 'bottom-edge' };
  }

  // BELOW by default. Above puts the box over the CHORD row for that
  // bar, and the chord is the thing the lyric is being placed against —
  // covering it is worse than covering an empty cell. The row beneath a
  // lyric row is usually empty, and the next tap is heading later in
  // the bar anyway, so below sits ahead of where the user is going
  // rather than behind it.
  const below = cell.bottom + gap;
  if (below <= bottomEdge) return { left, top: below, placement: 'below' };

  const above = cell.top - box.height - gap;
  if (above >= topEdge) return { left, top: above, placement: 'above' };

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

/**
 * Measure the app chrome the overlays must stay clear of.
 *
 * The ONE DOM-reading function in this module — everything above is
 * pure and unit-tested without a browser. It is measured rather than
 * declared as a constant because **no reliable constant exists**: the
 * header's height varies with `env(safe-area-inset-top)` on notched
 * devices, with responsive padding across breakpoints, and with
 * whether the current page carries a tagline. The mobile nav varies
 * with `env(safe-area-inset-bottom)` and is `display: none` above the
 * md breakpoint. A hardcoded number would be wrong on most of those
 * axes and would rot silently the next time the header changes.
 *
 * Chrome marks itself with `data-app-chrome="top" | "bottom"`, so this
 * measures whatever is actually there — including the session banner
 * when one is showing — rather than hunting for known selectors.
 */
export function measureSafeArea(): SafeArea {
  if (typeof document === 'undefined') return { top: 0, bottom: 0 };
  const vh = window.innerHeight;
  let top = 0;
  let bottom = 0;
  for (const el of document.querySelectorAll('[data-app-chrome]')) {
    const r = el.getBoundingClientRect();
    // `display: none` reports an all-zero rect. Counting one as bottom
    // chrome would inset the ENTIRE viewport, which is exactly what
    // the mobile nav looks like on desktop.
    if (r.width === 0 && r.height === 0) continue;
    const side = el.getAttribute('data-app-chrome');
    if (side === 'top') top = Math.max(top, Math.min(r.bottom, vh));
    else if (side === 'bottom') bottom = Math.max(bottom, Math.min(vh - r.top, vh));
  }
  return { top: Math.max(0, top), bottom: Math.max(0, bottom) };
}
