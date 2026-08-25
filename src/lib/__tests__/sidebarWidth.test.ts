/**
 * The sidebar's bounds, and where they come from.
 *
 * =====================================================================
 * DRAGGING NARROW NOW REACHES THE ICON PRESENTATION, DELIBERATELY.
 *
 * It used to be forbidden: the floor sat clear of the rail so a drag
 * could not imitate a collapse. Narrow now shows icons instead — the
 * same presentation the button reaches, arrived at a different way, and
 * the two stay distinct because the button switches a STATE that
 * persists while this is only a consequence of the current width.
 * Dragging back out restores the labels, since nothing was switched.
 *
 * The ceiling is unchanged: what the sidebar is today. Dragging
 * reclaims space, it never takes more.
 * =====================================================================
 *
 * Both bounds are asserted RELATIVE to the widths that already existed,
 * never against a pixel figure written here — a literal would pass just
 * as happily on a wrong-but-matching value.
 */
import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_DEFAULT_REM,
  SIDEBAR_LABELS_MIN_REM,
  SIDEBAR_MAX_REM,
  SIDEBAR_MIN_REM,
  SIDEBAR_RAIL_REM,
  clampSidebarWidth,
  showsLabels,
} from '../sidebarWidth';

describe('the bounds derive from what exists', () => {
  it('never opens wider than the sidebar is today', () => {
    expect(SIDEBAR_MAX_REM).toBe(SIDEBAR_DEFAULT_REM);
  });

  it('floors at an icon column, and no narrower', () => {
    // The rail IS an icon and its padding, so there is nothing to show
    // below it.
    expect(SIDEBAR_MIN_REM).toBe(SIDEBAR_RAIL_REM);
  });

  it('takes the labels threshold from the rail too', () => {
    // Twice the icon column: below it there is less room for the word
    // than for the icon beside it.
    expect(SIDEBAR_LABELS_MIN_REM).toBe(SIDEBAR_RAIL_REM * 2);
    expect(SIDEBAR_LABELS_MIN_REM).toBeGreaterThan(SIDEBAR_MIN_REM);
    expect(SIDEBAR_LABELS_MIN_REM).toBeLessThan(SIDEBAR_MAX_REM);
  });

  it('leaves a real range to drag through', () => {
    expect(SIDEBAR_MAX_REM).toBeGreaterThan(SIDEBAR_MIN_REM);
  });

  it('starts at the width it has always started at', () => {
    expect(SIDEBAR_DEFAULT_REM).toBe(SIDEBAR_MAX_REM);
  });
});

describe('clamping', () => {
  it('holds a width inside the bounds', () => {
    const middle = (SIDEBAR_MIN_REM + SIDEBAR_MAX_REM) / 2;
    expect(clampSidebarWidth(middle)).toBe(middle);
  });

  it('refuses to go past either end', () => {
    expect(clampSidebarWidth(SIDEBAR_MAX_REM + 10)).toBe(SIDEBAR_MAX_REM);
    expect(clampSidebarWidth(SIDEBAR_MIN_REM - 10)).toBe(SIDEBAR_MIN_REM);
  });

  it('can never produce anything under an icon column', () => {
    for (const attempt of [0, -50, SIDEBAR_RAIL_REM - 1]) {
      expect(clampSidebarWidth(attempt), String(attempt))
        .toBeGreaterThanOrEqual(SIDEBAR_RAIL_REM);
    }
  });

  it('falls back to today’s width for anything unusable', () => {
    for (const bad of [null, undefined, 'wide', {}, Number.NaN, Infinity]) {
      expect(clampSidebarWidth(bad), String(bad)).toBe(SIDEBAR_DEFAULT_REM);
    }
  });
});

describe('where the labels give out', () => {
  it('shows them at the default width', () => {
    expect(showsLabels(SIDEBAR_DEFAULT_REM)).toBe(true);
  });

  it('shows them right down to the threshold, and not below it', () => {
    expect(showsLabels(SIDEBAR_LABELS_MIN_REM)).toBe(true);
    expect(showsLabels(SIDEBAR_LABELS_MIN_REM - 0.01)).toBe(false);
  });

  it('shows none at the floor', () => {
    expect(showsLabels(SIDEBAR_MIN_REM)).toBe(false);
  });

  it('is reachable by dragging, which is the point', () => {
    // The threshold has to sit inside the drag range or the icon
    // presentation could never be reached by hand.
    expect(SIDEBAR_LABELS_MIN_REM).toBeGreaterThan(clampSidebarWidth(0));
  });
});
