// @vitest-environment jsdom
/**
 * The four matrices moved behind their cards.
 *
 * =====================================================================
 * WHAT THIS PROVES: that the module home carries no matrix, that Open
 * on a card goes to that sub-module's page, that the page renders that
 * sub-module's matrix and no other, and that the addresses stored
 * elsewhere in the app still land.
 *
 * WHAT IT CANNOT: whether the scroll lands anywhere useful. jsdom has
 * no layout engine and nothing here moves — that needs Silas's eye.
 * What it CAN say is that the page asks the app's scroll rather than
 * the element's own, and that the block it scrolls to has room below it
 * to reach the top with.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ShapesAndPatterns from '../ShapesAndPatterns';
import ShapesAndPatternsSection from '../ShapesAndPatternsSection';
import { SHAPES_SECTIONS } from '../homeCards';
import { SCROLL_TO_DETAIL_STATE } from '../sectionRoutes';
import { SCROLL_ROOM_CLASS } from '../../../lib/scrollSectionToTop';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
});

function Probe() {
  const location = useLocation();
  return <span data-testid="at" data-path={location.pathname} />;
}

async function renderAt(path: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/shapes-and-patterns" element={<ShapesAndPatterns />} />
          {/* THE VOICE-LEADING SECTION IS CHORD MOVEMENTS & PASSES
              (ruling 19) — same component, same section, its own
              address. Declared here the way `App.tsx` declares it, so
              this harness routes what the app routes. */}
          <Route
            path="/shapes-and-patterns/movements"
            element={<ShapesAndPatternsSection section="voice-leading" />}
          />
          <Route path="/shapes-and-patterns/:section" element={<ShapesAndPatternsSection />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

const at = () =>
  container!.querySelector('[data-testid="at"]')!.getAttribute('data-path');

const card = (key: string) =>
  container!.querySelector(`[data-card-key="${key}"]`) as HTMLElement | null;

const click = async (el: Element | null) => {
  expect(el, 'no element to press').toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

describe('the module home', () => {
  it('carries the four cards and no matrix', async () => {
    const el = await renderAt('/shapes-and-patterns');
    expect([...el.querySelectorAll('[data-card-key]')].map(c => c.getAttribute('data-card-key')))
      .toEqual(SHAPES_SECTIONS.map(s => s.id));
    // The matrices used to render inline under the cards.
    expect(el.querySelector('[data-testid="shapes-section-detail"]')).toBeNull();
  });

  it('goes to a sub-module’s page from Open', async () => {
    const el = await renderAt('/shapes-and-patterns');
    await click(card('scales')!.querySelector('[data-testid="category-card-toggle"]'));
    await click(card('scales')!.querySelector('[data-testid="category-card-drill"]'));
    expect(at()).toBe('/shapes-and-patterns/scales');
    expect(el.querySelector('[data-testid="shapes-section-page"]')!
      .getAttribute('data-section')).toBe('scales');
  });

  it('goes to the same page from Progress Detail', async () => {
    const el = await renderAt('/shapes-and-patterns');
    await click(card('voice-leading')!.querySelector('[data-testid="category-card-toggle"]'));
    await click(card('voice-leading')!.querySelector('[data-testid="category-card-progress-detail"]'));
    // Its own address since 8 Sep 2026. `shapesSectionPath` owns which
    // address that is, and the card reads it — so the card never
    // learned the new one.
    expect(at()).toBe('/shapes-and-patterns/movements');
    // And the detail it asked about is on the page it landed on.
    expect(el.querySelector('[data-testid="shapes-section-detail"]')).not.toBeNull();
  });
});

describe('a sub-module page', () => {
  it('renders its own matrix, under a row of tiles rather than a card', async () => {
    // THE PEACH CARD IS GONE. It was the module home's card drawn again
    // for the one section you were already on — a big tinted box
    // repeating the Fluent+ count the header below it already printed,
    // with a blank body wherever nothing had been drilled.
    const el = await renderAt('/shapes-and-patterns/scales');
    expect(el.querySelector('[data-testid="shapes-section-detail"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-card-key]'), 'no card').toHaveLength(0);
    expect(el.querySelector('[data-testid="summary-tiles"]'), 'tiles instead')
      .not.toBeNull();
  });

  it('puts the tiles above the white content card, not inside it', async () => {
    const el = await renderAt('/shapes-and-patterns/scales');
    const tiles = el.querySelector('[data-testid="summary-tiles"]')!;
    const detail = el.querySelector('[data-testid="shapes-section-detail"]')!;
    expect(detail.contains(tiles), 'not inside the matrix block').toBe(false);
    expect(
      tiles.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING,
      'and above it',
    ).toBeTruthy();
  });

  it('carries the three standing facts, with the figures bare', async () => {
    const el = await renderAt('/shapes-and-patterns/scales');
    const labels = [...el.querySelectorAll('[data-testid^="summary-tile"]')]
      .map(t => t.getAttribute('data-label'))
      .filter(l => l !== null);
    expect(labels).toEqual(['Fluent+', 'Total', 'Last practiced']);

    // NO UNIT NOUN. The figure is bare — "0 / 288", never
    // "0 / 288 hands" or "0 / 288 patterns".
    const fluent = el.querySelector('[data-testid="summary-tile-fluent-plus"]')!;
    expect(fluent.textContent).toMatch(/^Fluent\+\s*\d+ \/ \d+$/);
  });

  it('says the absences rather than printing zeros that read as data', async () => {
    // Nothing has been drilled in this test's database.
    const el = await renderAt('/shapes-and-patterns/scales');
    const total = el.querySelector('[data-testid="summary-tile-total"]')!;
    const last = el.querySelector('[data-testid="summary-tile-last-practised"]')!;
    expect(total.textContent).toContain('none yet');
    expect(last.textContent).toContain('never');
    // Muted, so an empty page LOOKS empty rather than measured.
    expect(total.getAttribute('data-muted')).toBe('true');
    expect(last.getAttribute('data-muted')).toBe('true');
  });

  it('sends a slug that names no sub-module back to the module home', async () => {
    await renderAt('/shapes-and-patterns/arpeggios');
    expect(at()).toBe('/shapes-and-patterns');
  });
});

describe('the addresses already stored elsewhere', () => {
  it('turns a ?tab= link into the section’s page', async () => {
    // The skills catalogue's jump and the session generator's
    // quick-launch both build one, and neither is this module's to
    // rewrite.
    await renderAt('/shapes-and-patterns?tab=mental-viz');
    expect(at()).toBe('/shapes-and-patterns/mental-viz');
  });

  it('leaves a ?tab= naming nothing on the module home', async () => {
    await renderAt('/shapes-and-patterns?tab=nonsense');
    expect(at()).toBe('/shapes-and-patterns');
  });
});

/** The page as the module home's Progress Tracker button reaches it —
 *  a navigation carrying the request to land on the matrix. */
async function renderAtWithDetailRequest(path: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[{ pathname: path, state: SCROLL_TO_DETAIL_STATE }]}>
        <Probe />
        <Routes>
          <Route path="/shapes-and-patterns" element={<ShapesAndPatterns />} />
          {/* THE VOICE-LEADING SECTION IS CHORD MOVEMENTS & PASSES
              (ruling 19) — same component, same section, its own
              address. Declared here the way `App.tsx` declares it, so
              this harness routes what the app routes. */}
          <Route
            path="/shapes-and-patterns/movements"
            element={<ShapesAndPatternsSection section="voice-leading" />}
          />
          <Route path="/shapes-and-patterns/:section" element={<ShapesAndPatternsSection />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

describe('landing on the matrix', () => {
  it('gives the block room to reach the top', async () => {
    // A browser cannot scroll past the end of the document, and this
    // block is the last thing on the page — so without a floor a short
    // one cannot be scrolled clear of the sticky header however it is
    // asked. The floor only fills when the drills are shorter than a
    // screen, which is the case that was landing short.
    const el = await renderAt('/shapes-and-patterns/scales');
    const detail = el.querySelector('[data-testid="shapes-section-detail"]')!;
    expect(detail.className.split(/\s+/)).toContain(SCROLL_ROOM_CLASS);
  });

  it('asks the window to scroll rather than the element', async () => {
    // `scrollIntoView` aligns with the top of the scrollport, which is
    // underneath the sticky header. See `scrollSectionToTop`. The card
    // that used to carry this button is gone, so the press that lands
    // here now is the module home's Progress Tracker, which arrives
    // carrying the request.
    let moved = false;
    let intoView = 0;
    window.scrollTo = (() => { moved = true; }) as unknown as typeof window.scrollTo;
    Element.prototype.scrollIntoView = function stub() { intoView += 1; };

    await renderAtWithDetailRequest('/shapes-and-patterns/scales');

    expect(moved, 'it moved the window').toBe(true);
    expect(intoView, 'and did not fall back to scrollIntoView').toBe(0);
  });
});
