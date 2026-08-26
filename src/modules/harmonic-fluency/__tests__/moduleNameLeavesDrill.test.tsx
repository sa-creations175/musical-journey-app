// @vitest-environment jsdom
/**
 * Pressing the module name in the nav ends a running drill.
 *
 * =====================================================================
 * WHY THIS COULD NOT BE OBSERVED AS A ROUTE CHANGE.
 *
 * Harmonic fluency's drill is component state on the module home, so
 * pressing "harmonic fluency" while one is running navigates to the URL
 * already on screen — and react-router turns a link to the current URL
 * into a REPLACE, so there is no push, no new path, and nothing a
 * location watcher could act on without also firing on the page's own
 * navigations. The nav therefore says what it means in `location.state`,
 * and this asserts the whole contract end to end: the real sidebar's
 * real module link, pressed mid-drill, against the real page.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SidebarNav from '../../../components/SidebarNav';
import HarmonicFluency from '../HarmonicFluency';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  await db.userPrefs.clear();
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

/**
 * Wait for a condition rather than for a fixed number of ticks. The
 * queue is built through Dexie, and a fixed count is a race that fails
 * for the wrong reason on a loaded machine. Bounded, so a value that
 * never arrives still fails rather than hanging.
 */
async function settle(ready: () => boolean) {
  for (let i = 0; i < 200 && !ready(); i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/harmonic-fluency']}>
        <SidebarNav />
        <Routes>
          <Route path="/harmonic-fluency" element={<HarmonicFluency />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container!;
}

const byText = (re: RegExp) =>
  [...container!.querySelectorAll('button')]
    .find(b => re.test((b.textContent ?? '').trim()));

const moduleName = () =>
  container!.querySelector(
    '[data-testid="module-nav-name"][data-module="harmonic-fluency"]',
  ) as HTMLElement | null;

const drilling = () => container!.textContent?.match(/card\s*1\s*\//) !== null
  && /card\s*1\s*\//.test(container!.textContent ?? '');

describe('the module name is the way out', () => {
  it('ends a running drill and leaves the cards up', async () => {
    const el = await render();
    await act(async () => { byText(/all categories mixed/i)!.click(); });
    await settle(drilling);
    expect(drilling(), 'a drill is running').toBe(true);
    expect(el.querySelector('[data-testid="category-card-grid"]')).toBeNull();

    const name = moduleName();
    expect(name, 'the sidebar renders a harmonic fluency module link').not.toBeNull();
    await act(async () => { name!.click(); });
    await settle(() => !drilling());

    // No warning, no staying put: the run is over and the home is back.
    expect(drilling(), 'the drill survived the nav').toBe(false);
    expect(el.querySelector('[data-testid="category-card-grid"]')).not.toBeNull();
    expect(byText(/all categories mixed/i)).toBeTruthy();
  });
});
