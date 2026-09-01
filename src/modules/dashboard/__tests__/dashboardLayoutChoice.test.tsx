// @vitest-environment jsdom
/**
 * Which dashboard renders, and who decided.
 *
 * =====================================================================
 * WHAT THIS CANNOT CHECK. jsdom has no layout engine: nothing here can
 * measure a pixel, so "no overflow, no stretched rows at a wide
 * viewport" cannot be asserted by measuring. What CAN be asserted is
 * the thing that makes it true — that the card view stands in a column
 * with a ceiling on it, and that the ceiling is a whole Tailwind class
 * rather than a width assembled from a number, which would emit no rule
 * and silently not exist. How it actually looks at 1024px is Silas's
 * eye, and is listed as such in the report.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import DashboardScreen from '../DashboardScreen';
import {
  CARDS_COLUMN,
  DASHBOARD_LAYOUT_CHOICES,
  DASHBOARD_LAYOUT_FIELD,
  dashboardShowsCards,
  resolveDashboardLayout,
} from '../layoutChoice';
import { MOBILE_QUERY } from '../../../lib/useIsMobile';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_700_000_000_000;

describe('the three states', () => {
  it('defaults to following the screen, whatever was stored', () => {
    // The stored value is only ever a hint — the same rule the axis
    // views follow, so a renamed state cannot leave the dashboard
    // unable to decide what to draw.
    expect(resolveDashboardLayout(null)).toBe('screen');
    expect(resolveDashboardLayout('mobile')).toBe('screen');
    for (const c of DASHBOARD_LAYOUT_CHOICES) {
      expect(resolveDashboardLayout(c.id)).toBe(c.id);
    }
  });

  it('leads the control with the default, so it is what an untouched dashboard shows', () => {
    expect(DASHBOARD_LAYOUT_CHOICES[0].id).toBe('screen');
  });

  it('defers to the viewport under "follow the screen", and to nothing else otherwise', () => {
    expect(dashboardShowsCards('screen', true)).toBe(true);
    expect(dashboardShowsCards('screen', false)).toBe(false);
    expect(dashboardShowsCards('cards', false)).toBe(true);
    expect(dashboardShowsCards('cards', true)).toBe(true);
    expect(dashboardShowsCards('tree', true)).toBe(false);
    expect(dashboardShowsCards('tree', false)).toBe(false);
  });
});

describe('the card view’s ceiling', () => {
  it('is a whole Tailwind class', () => {
    // A width built from a constant is never the class it looks like:
    // the scanner sees source text, emits no rule, and the ceiling
    // silently does not exist. Pinned as the whole string, the way
    // `GRID_CELL_MIN` is.
    expect(CARDS_COLUMN).toBe('max-w-3xl');
  });
});

// ---------------------------------------------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  vi.unstubAllGlobals();
  await db.userPrefs.clear();
});

/**
 * A viewport, as `useIsMobile` reads one.
 *
 * jsdom has no `matchMedia` at all, which is why every dashboard test
 * before this one rendered the tree without asking for it.
 */
function stubViewport(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query === MOBILE_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/']}><DashboardScreen now={NOW} /></MemoryRouter>,
    );
  });
  await settle();
  return container!;
}

async function remount() {
  await act(async () => root!.unmount());
  container!.remove();
  return mount();
}

const tree = () => container!.querySelector('[data-testid="dashboard-screen"]');
const cards = () => container!.querySelector('[data-testid="mobile-dashboard"]');
const layoutSwitch = () =>
  container!.querySelector('[data-testid="dashboard-layout-switch"]');

async function choose(id: string) {
  const b = container!.querySelector(`[data-testid="dashboard-layout-${id}"]`) as HTMLElement;
  await act(async () => { b.click(); });
  await settle();
}

describe('the default follows the viewport, exactly as before', () => {
  it('draws the tree at a desktop width', async () => {
    stubViewport(false);
    await mount();
    expect(tree()).not.toBeNull();
    expect(cards()).toBeNull();
    expect(layoutSwitch()?.getAttribute('data-choice')).toBe('screen');
  });

  it('draws the cards at a mobile width', async () => {
    stubViewport(true);
    await mount();
    expect(cards()).not.toBeNull();
    expect(tree()).toBeNull();
    expect(layoutSwitch()?.getAttribute('data-choice')).toBe('screen');
  });

  it('draws the tree where there is no media query to read at all', async () => {
    // jsdom's own state, and what every dashboard test has relied on.
    await mount();
    expect(tree()).not.toBeNull();
  });
});

describe('the override', () => {
  it('renders the tree at a mobile width when the tree is chosen', async () => {
    stubViewport(true);
    await mount();
    expect(cards(), 'starts on the cards').not.toBeNull();

    await choose('tree');
    expect(tree()).not.toBeNull();
    expect(cards()).toBeNull();
  });

  it('renders the cards at a desktop width when the cards are chosen', async () => {
    stubViewport(false);
    await mount();
    expect(tree(), 'starts on the tree').not.toBeNull();

    await choose('cards');
    expect(cards()).not.toBeNull();
    expect(tree()).toBeNull();
  });

  it('goes back to following the screen', async () => {
    stubViewport(false);
    await mount();
    await choose('cards');
    await choose('screen');
    expect(tree()).not.toBeNull();
  });
});

describe('the way back', () => {
  it('is on screen in both views, at both widths', async () => {
    // A control that lived only on the tree could send you to the cards
    // and then be gone. It is offered on a phone for the same reason —
    // the choice is remembered across devices, so a stored `tree`
    // arriving on a phone needs something on screen to undo it.
    for (const narrow of [false, true]) {
      stubViewport(narrow);
      await mount();
      expect(layoutSwitch(), `switch at narrow=${narrow}`).not.toBeNull();
      await choose('cards');
      expect(layoutSwitch(), `switch on the cards at narrow=${narrow}`).not.toBeNull();
      await choose('tree');
      expect(layoutSwitch(), `switch on the tree at narrow=${narrow}`).not.toBeNull();
      await act(async () => root!.unmount());
      container!.remove();
      await db.userPrefs.clear();
    }
  });
});

describe('the choice is remembered', () => {
  it('survives leaving the dashboard and coming back', async () => {
    stubViewport(false);
    await mount();
    await choose('cards');

    await remount();
    expect(cards(), 'still the cards').not.toBeNull();
    expect(layoutSwitch()?.getAttribute('data-choice')).toBe('cards');
  });

  it('rides the store the axis views and the card sort already use', async () => {
    // ONE MECHANISM FOR A REMEMBERED DISPLAY CHOICE, and no new stored
    // shape: this is one more field in the map that already holds which
    // way up a grid is drawn and how the module-home cards are ordered.
    stubViewport(false);
    await mount();
    await choose('tree');
    const row = await db.userPrefs.get('moduleHome.axisViews');
    expect(row?.value).toMatchObject({ [DASHBOARD_LAYOUT_FIELD]: 'tree' });
    expect(await db.userPrefs.toArray()).toHaveLength(1);
  });
});

describe('the card view at a desktop width', () => {
  it('stands in a column with a ceiling on it', async () => {
    // What stops the rows stretching: every one of them is a full-width
    // block with its number pushed to the far right, so the fix is the
    // container, not a second copy of the view.
    stubViewport(false);
    await mount();
    await choose('cards');
    expect(cards()!.className.split(/\s+/)).toContain(CARDS_COLUMN);
  });

  it('puts the control inside that same column', async () => {
    stubViewport(false);
    await mount();
    await choose('cards');
    const row = layoutSwitch()!.parentElement!;
    expect(row.className.split(/\s+/)).toContain(CARDS_COLUMN);
  });

  it('is the same component the phone shows, not a copy of it', async () => {
    // Both widths render the one `MobileDashboard`, with its own view
    // switch and its own legend. A desktop variant would show up here
    // as a different testid or a missing control.
    stubViewport(true);
    await mount();
    const onPhone = cards()!.querySelectorAll('[data-testid]').length;
    await act(async () => root!.unmount());
    container!.remove();
    await db.userPrefs.clear();

    stubViewport(false);
    await mount();
    await choose('cards');
    expect(cards()!.querySelector('[data-testid="mobile-view-switch"]')).not.toBeNull();
    expect(cards()!.querySelector('[data-testid="mobile-tier-legend"]')).not.toBeNull();
    expect(cards()!.querySelectorAll('[data-testid]').length).toBe(onPhone);
  });
});
