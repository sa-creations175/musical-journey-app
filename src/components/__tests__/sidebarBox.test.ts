/**
 * The sidebar's box, and the page beside it.
 *
 * =====================================================================
 * SOURCE-LEVEL, BECAUSE jsdom HAS NO LAYOUT ENGINE.
 *
 * Whether the page actually follows the sidebar at 9rem is a question
 * about boxes, and jsdom resolves no boxes — every width here is 0. So
 * what is pinned is the three declarations that make it true, each of
 * which was individually the difference between working and not:
 *
 *   `shrink-0`        without it the aside is a shrinkable flex item
 *                     whose `min-width: auto` resolves to its widest
 *                     nav row, so the box ignores the dragged width
 *                     and the page never moves;
 *   `overflow-hidden` without it content wider than the box paints
 *                     over the page;
 *   `min-w-0`         so the aside may actually reach a narrow width
 *                     rather than being floored by its own content.
 *
 * Remove any one and the drag breaks in the way it broke before. That
 * is what these catch; the look is for the app.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';

const SOURCE: string = (
  import.meta.glob('../Layout.tsx', { eager: true, query: '?raw', import: 'default' }) as
    Record<string, string>
)['../Layout.tsx'];

/** The `<aside …>` opening tag, where the box is declared. */
function asideTag(): string {
  const start = SOURCE.indexOf('<aside');
  expect(start).toBeGreaterThan(-1);
  return SOURCE.slice(start, SOURCE.indexOf('>', SOURCE.indexOf('style=', start)));
}

describe('the sweep reads the layout', () => {
  it('finds the sidebar', () => {
    expect(SOURCE).toContain('<aside');
    expect(SOURCE).toContain('sidebarWidth');
  });
});

describe('the sidebar keeps to its own box', () => {
  it('does not shrink below the width it was given', () => {
    expect(asideTag()).toContain('shrink-0');
  });

  it('clips anything wider than itself', () => {
    expect(asideTag()).toContain('overflow-hidden');
  });

  it('may be narrower than its own content', () => {
    expect(asideTag()).toContain('min-w-0');
  });

  it('takes its width from the dragged value, not a class', () => {
    // The open width is the drag's; only the button's rail is a class.
    expect(asideTag()).toContain('sidebarWidth}rem');
  });

  it('snaps to the rail once a word would be chopped', () => {
    // Below the labels threshold the sidebar is the rail exactly as the
    // collapse button produces it — not a wide column of icons at
    // whatever width the pointer stopped at. The dragged value is still
    // what is held, so dragging back out returns to it.
    const tag = asideTag();
    expect(tag).toContain('iconsOnly ? SIDEBAR_RAIL_REM : sidebarWidth');
  });
});

describe('the page is an ordinary sibling', () => {
  it('flexes and may be narrower than its content', () => {
    // Together with the aside's `shrink-0`, this is what makes the
    // page's left edge follow the sidebar's right edge.
    const after = SOURCE.slice(SOURCE.indexOf('</aside>'));
    expect(after).toContain('flex-1');
    expect(after).toContain('min-w-0');
  });
});
