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
 * no layout engine and no `scrollIntoView` — that needs Silas's eye.
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
    expect(at()).toBe('/shapes-and-patterns/voice-leading');
    // And the detail it asked about is on the page it landed on.
    expect(el.querySelector('[data-testid="shapes-section-detail"]')).not.toBeNull();
  });
});

describe('a sub-module page', () => {
  it('renders its own matrix, and carries its own card', async () => {
    const el = await renderAt('/shapes-and-patterns/scales');
    expect(el.querySelector('[data-testid="shapes-section-detail"]')).not.toBeNull();
    expect([...el.querySelectorAll('[data-card-key]')].map(c => c.getAttribute('data-card-key')))
      .toEqual(['scales']);
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
