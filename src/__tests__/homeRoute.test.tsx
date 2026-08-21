// @vitest-environment jsdom
/**
 * Everything that means "home" points at one place.
 *
 * THE FAILURE THIS EXISTS FOR. A route swap that leaves three paths on
 * the old screen is worse than no swap: the app disagrees with itself
 * about where it starts, and which screen you get depends on whether
 * you used the sidebar, the phone tab bar or the installed icon.
 *
 * So this asserts the paths rather than the screen. Each one is read
 * from the module that owns it — including `vite.config.ts`, read off
 * disk, because the PWA `start_url` is what an installed app opens and
 * nothing else in the suite would notice it drifting.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import RedirectPreservingSearch from '../components/RedirectPreservingSearch';
import { DASHBOARD_META } from '../lib/moduleMeta';
import { titleForPath } from '../lib/pageTitle';
// Source read as text. `?raw` rather than node:fs, which would need
// @types/node in an app tsconfig that has none — and the type gate is
// the point of running tsc at all.
import appSource from '../App.tsx?raw';
import sidebarSource from '../components/SidebarNav.tsx?raw';
import bottomNavSource from '../components/MobileBottomNav.tsx?raw';
import viteConfigSource from '../../vite.config.ts?raw';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const HOME = '/';

describe('every surface that means "home" agrees', () => {
  it('the sidebar and the phone tab bar both link to it', () => {
    // Read as source rather than by rendering: both files build their
    // nav from module meta and rendering either pulls the whole app
    // shell in. What matters is the literal each declares.
    //
    // The dashboard entry in each, found by its neighbouring id/meta so
    // the match cannot land on some other `to: '/'` in the file.
    expect(sidebarSource).toMatch(/id: 'dashboard',\s*\n\s*label: 'dashboard',\s*\n\s*to: '\/',/);
    expect(bottomNavSource).toMatch(/meta: DASHBOARD_META,\s*\n\s*to: '\/',/);
  });

  it('the module meta the icon chips read points at it', () => {
    expect(DASHBOARD_META.route).toBe(HOME);
  });

  it('the page-title map names it, and names the old one differently', () => {
    expect(titleForPath(HOME)).toBe('Dashboard');
    // The comparison path is labelled, so the two screens are never
    // both just "Dashboard" in a browser tab while both are reachable.
    expect(titleForPath('/dashboard-old')).toBe('Dashboard (old)');
  });

  it("the PWA start_url opens it — what an installed icon launches", () => {
    const match = /start_url:\s*'([^']+)'/.exec(viteConfigSource);
    expect(match, 'no start_url in vite.config.ts').not.toBeNull();
    expect(match![1]).toBe(HOME);
  });

  it('the home route renders the NEW dashboard, and the old one is elsewhere', () => {
    // Asserted against App.tsx's route table as source. Rendering it
    // would boot auth, sync, Dexie and the session timer to learn one
    // thing about one line.
    expect(appSource).toContain('<Route index element={<DashboardScreen />} />');
    expect(appSource).toContain('<Route path="dashboard-old" element={<Dashboard />} />');
    // Guard the guard: both components must still be imported, or the
    // assertions above are matching text in a comment.
    expect(appSource).toMatch(/^import DashboardScreen from/m);
    expect(appSource).toMatch(/^import Dashboard from/m);
  });
});

// =====================================================================
// The redirect
// =====================================================================

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Renders wherever the router ended up, so the assertion is on the
 *  router's own location rather than on `window`, which does not move
 *  under MemoryRouter. */
function Landed() {
  const { pathname, search } = useLocation();
  return <i data-testid="landed">{pathname + search}</i>;
}

function renderAt(entry: string): string {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<Landed />} />
        <Route path="/dashboard-next" element={<RedirectPreservingSearch to="/" />} />
      </Routes>
    </MemoryRouter>,
  ));
  return container.querySelector('[data-testid="landed"]')!.textContent!;
}

describe('the old preview path keeps working', () => {
  it('redirects /dashboard-next to home', () => {
    expect(renderAt('/dashboard-next')).toBe('/');
  });

  it('CARRIES THE QUERY STRING, so a bookmarked view arrives as itself', () => {
    // The dashboard keeps filters, sort and expansion in the URL, so
    // dropping the search would land a saved view on the default one
    // and read as the filters having been lost.
    expect(renderAt('/dashboard-next?sort=cw&x=1.2')).toBe('/?sort=cw&x=1.2');
  });

  it('leaves an unfiltered visit unfiltered rather than inventing state', () => {
    expect(renderAt('/dashboard-next')).not.toContain('?');
  });
});
