/**
 * The sidebar's bounds, and where they come from.
 *
 * =====================================================================
 * DRAGGING MUST NOT BE ABLE TO IMITATE COLLAPSING.
 *
 * The rail is a STATE, reached by the button. If a drag could reach the
 * same width, there would be two ways to arrive at the same-looking
 * sidebar and only one of them would come back the way it went. So the
 * floor is comfortably clear of the rail, and the ceiling is what the
 * sidebar is today — dragging reclaims space, it never takes more.
 * =====================================================================
 *
 * Both bounds are asserted RELATIVE to the widths that already existed,
 * never against a pixel figure written here — a literal would pass just
 * as happily on a wrong-but-matching value.
 */
import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_DEFAULT_REM,
  SIDEBAR_MAX_REM,
  SIDEBAR_MIN_REM,
  SIDEBAR_RAIL_REM,
  clampSidebarWidth,
} from '../sidebarWidth';

describe('the bounds derive from what exists', () => {
  it('never opens wider than the sidebar is today', () => {
    expect(SIDEBAR_MAX_REM).toBe(SIDEBAR_DEFAULT_REM);
  });

  it('keeps the floor clear of the collapsed rail', () => {
    expect(SIDEBAR_MIN_REM).toBeGreaterThan(SIDEBAR_RAIL_REM);
    // Comfortably, not marginally: a drag that could land within a
    // hair of the rail is a drag that can imitate collapsing.
    expect(SIDEBAR_MIN_REM).toBe(SIDEBAR_RAIL_REM * 2);
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

  it('can never produce the rail, or anything under it', () => {
    for (const attempt of [0, -50, SIDEBAR_RAIL_REM, SIDEBAR_RAIL_REM + 0.1]) {
      expect(clampSidebarWidth(attempt), String(attempt))
        .toBeGreaterThan(SIDEBAR_RAIL_REM);
    }
  });

  it('falls back to today’s width for anything unusable', () => {
    for (const bad of [null, undefined, 'wide', {}, Number.NaN, Infinity]) {
      expect(clampSidebarWidth(bad), String(bad)).toBe(SIDEBAR_DEFAULT_REM);
    }
  });
});
