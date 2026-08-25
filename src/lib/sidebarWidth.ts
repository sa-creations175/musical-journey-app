/**
 * How wide the sidebar may be, and where those bounds come from.
 *
 * =====================================================================
 * BOTH BOUNDS ARE THE WIDTHS THAT ALREADY EXISTED.
 *
 * The sidebar has had two widths since it shipped: `md:w-60` open and
 * `md:w-14` as the collapsed rail. Dragging introduces no new number —
 * it moves between those two facts.
 *
 *   MAXIMUM is today's open width. The sidebar never gets WIDER than it
 *   is now; dragging can only reclaim space, never take more.
 *
 *   MINIMUM is twice the rail. It has to be comfortably wider than the
 *   rail so that dragging cannot imitate collapsing — the rail is a
 *   separate state, reached by the button, and two ways to arrive at
 *   the same-looking thing is two things the reader has to tell apart.
 *
 *   DEFAULT is the maximum, which is what the sidebar is today. Nobody
 *   picked a new starting width.
 * =====================================================================
 *
 * Expressed in Tailwind's own spacing unit rather than in pixels, so
 * these stay the classes they came from rather than becoming a second
 * measurement of them.
 */

/** Tailwind's spacing unit: `w-1` is `0.25rem`. */
const TAILWIND_UNIT_REM = 0.25;

/** `md:w-14` — the collapsed rail, still drawn by that class. */
export const SIDEBAR_RAIL_UNITS = 14;

/** `md:w-60` — the width the sidebar opens at, and its ceiling. */
export const SIDEBAR_FULL_UNITS = 60;

export const SIDEBAR_RAIL_REM = SIDEBAR_RAIL_UNITS * TAILWIND_UNIT_REM;

/** Never wider than it is today. */
export const SIDEBAR_MAX_REM = SIDEBAR_FULL_UNITS * TAILWIND_UNIT_REM;

/**
 * Comfortably clear of the rail, so a drag cannot imitate a collapse.
 *
 * Twice the rail: derived from it, so a rail that changed width would
 * carry its own floor with it.
 */
export const SIDEBAR_MIN_REM = SIDEBAR_RAIL_REM * 2;

/** The width the sidebar has always opened at. */
export const SIDEBAR_DEFAULT_REM = SIDEBAR_MAX_REM;

/** The pref row holding the dragged width. */
export const SIDEBAR_WIDTH_PREF = 'sidebarWidthRem';

/**
 * A width made safe to use.
 *
 * ANYTHING UNUSABLE BECOMES THE DEFAULT — an absent row, a stored value
 * from a future shape, a NaN. Falling back to today's width means a bad
 * row costs the reader nothing and cannot produce a sidebar narrower
 * than the rail.
 */
export function clampSidebarWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SIDEBAR_DEFAULT_REM;
  return Math.min(SIDEBAR_MAX_REM, Math.max(SIDEBAR_MIN_REM, value));
}

/** Pixels per rem, read from the document rather than assumed to be 16. */
export function rootFontSizePx(): number {
  if (typeof window === 'undefined') return 16;
  const size = parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(size) && size > 0 ? size : 16;
}
