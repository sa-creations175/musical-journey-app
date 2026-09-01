// @vitest-environment jsdom
/**
 * There is always a way back to the labelled sidebar.
 *
 * =====================================================================
 * THE TRAP THIS EXISTS FOR.
 *
 * Two independent things put the sidebar on the rail: the button's
 * stored state, and a width below the labels threshold. Raising that
 * threshold to what the words actually need turned every previously
 * stored width between the rail and 11.82rem into a forced rail — and
 * with the button also collapsed there was nothing on screen to undo
 * it. Pressing expand cleared the state, the width still failed the
 * threshold, and the sidebar did not move. The button worked and
 * appeared dead.
 *
 * So what is asserted here is not a width. It is that from EVERY state
 * the app can load in, one press of the button produces a labelled
 * sidebar.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../Layout';
import { SessionTimerProvider } from '../../lib/sessionTimer/SessionTimerContext';
import {
  SIDEBAR_DEFAULT_REM, SIDEBAR_RAIL_REM, SIDEBAR_WIDTH_PREF,
  labelsMinRem,
} from '../../lib/sidebarWidth';
import { NAV_LABELS } from '../SidebarNav';
import { db } from '../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A desktop window. jsdom has no `matchMedia` at all, and the sidebar
 * reads one to decide whether it starts collapsed — this is the screen
 * the bug is about, wide enough that the sidebar opens by default.
 */
window.matchMedia = ((query: string) => ({
  matches: query.includes('min-width'),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const THRESHOLD = labelsMinRem(NAV_LABELS);

/** A width that was a perfectly good labelled sidebar before the
 *  threshold moved, and is below it now. */
const OLD_GOOD_WIDTH = (SIDEBAR_RAIL_REM + THRESHOLD) / 2;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/']}>
        {/* The provider the app wraps `Layout` in — mounted here for
            the same reason, not as scaffolding: `Layout` reads the
            session timer on every render. */}
        <SessionTimerProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<div>page</div>} />
            </Route>
          </Routes>
        </SessionTimerProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

const aside = () => container!.querySelector('aside') as HTMLElement;

/** What a person sees: the sidebar's actual width on screen. */
function widthRem(): number {
  const el = aside();
  if (el.className.includes('md:w-14')) return SIDEBAR_RAIL_REM;
  return parseFloat(el.style.width);
}

const showsLabelsOnScreen = () => widthRem() >= THRESHOLD;

/** The one control a person can press. */
function sidebarButton(): HTMLElement {
  const found = [...container!.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') ?? '').includes('sidebar'));
  expect(found, 'the sidebar button is on screen').toBeDefined();
  return found!;
}

/**
 * Drag the divider until the sidebar snaps to the rail.
 *
 * THE SNAPPED STATE IS REACHED BY DRAGGING NOW, not by seeding a narrow
 * width into the database — a width that cannot show labels is no
 * longer stored, so loading into that state is not something a person
 * can do any more. It is still very much reachable inside a session,
 * which is what this drives.
 */
async function dragToTheRail() {
  const el = container!.querySelector('[data-testid="sidebar-resize-handle"]') as HTMLElement;
  expect(el, 'the handle is there to grab').not.toBeNull();
  await act(async () => {
    el.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: 400,
    }) as unknown as PointerEvent);
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true, clientX: 0,
    }) as unknown as PointerEvent);
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }) as unknown as PointerEvent);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
}

async function press(el: HTMLElement) {
  await act(async () => { el.click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
}

/**
 * Every state the app can load in.
 *
 * THE NARROW-WIDTH ROWS ARE STILL HERE, and they are now upgrade cases
 * rather than live ones: a width that cannot show labels is no longer
 * written, so the only way one exists is that it was stored before that
 * rule. Loading into them must still end with a labelled sidebar — it
 * just takes no press now, which the assertion allows for. The snapped
 * state a person can still reach inside a session is dragged into
 * below.
 */
const STATES: ReadonlyArray<{ name: string; collapsed?: boolean; width?: number }> = [
  { name: 'a fresh install' },
  { name: 'button-collapsed', collapsed: true },
  { name: 'a width stored below the threshold', width: OLD_GOOD_WIDTH },
  { name: 'button-collapsed AND a width below the threshold', collapsed: true, width: OLD_GOOD_WIDTH },
  { name: 'a width stored at the very floor', width: SIDEBAR_RAIL_REM },
  { name: 'both, at the floor', collapsed: true, width: SIDEBAR_RAIL_REM },
  { name: 'a width stored above the threshold', width: SIDEBAR_DEFAULT_REM },
];

async function loadInto(state: typeof STATES[number]) {
  if (state.collapsed !== undefined) {
    await db.userPrefs.put({ key: 'sidebarCollapsed', value: state.collapsed });
  }
  if (state.width !== undefined) {
    await db.userPrefs.put({ key: SIDEBAR_WIDTH_PREF, value: state.width });
  }
  return mount();
}

describe('the way back', () => {
  for (const state of STATES) {
    it(`is one press of the sidebar button from ${state.name}`, async () => {
      await loadInto(state);
      // However it loaded, the button is the control that gets you out.
      if (!showsLabelsOnScreen()) {
        await press(sidebarButton());
      }
      expect(showsLabelsOnScreen(), `${state.name}: labels are back`).toBe(true);
    });
  }

  it('never leaves the button saying nothing happened', async () => {
    // The trap: expand cleared the state, the width still failed the
    // threshold, and the sidebar did not move.
    await loadInto({ name: 'trap', collapsed: true, width: OLD_GOOD_WIDTH });
    expect(widthRem(), 'starts on the rail').toBe(SIDEBAR_RAIL_REM);
    await press(sidebarButton());
    expect(widthRem(), 'and one press opens it').toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('says what it will do, from what is on screen rather than from a flag', async () => {
    await loadInto({ name: 'default' });
    await dragToTheRail();
    expect(widthRem()).toBe(SIDEBAR_RAIL_REM);
    // It looks collapsed, so it must offer to expand.
    expect(sidebarButton().getAttribute('aria-label')).toBe('expand sidebar');
    expect(sidebarButton().getAttribute('aria-expanded')).toBe('false');
    await press(sidebarButton());
    expect(sidebarButton().getAttribute('aria-label')).toBe('collapse sidebar');
    expect(sidebarButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('is one press away from a sidebar dragged onto the rail', async () => {
    // The state a person can still reach inside a session, now that a
    // width this narrow is no longer written down.
    await loadInto({ name: 'default' });
    await dragToTheRail();
    expect(showsLabelsOnScreen(), 'on the rail').toBe(false);
    await press(sidebarButton());
    expect(showsLabelsOnScreen(), 'and back with one press').toBe(true);
  });

  it('is one press away from dragged onto the rail AND then button-collapsed', async () => {
    // Both forces at once, which was the original trap. Reached the
    // only way it can be reached now.
    await loadInto({ name: 'default' });
    await dragToTheRail();
    await press(sidebarButton());   // expands
    await press(sidebarButton());   // collapses again
    expect(showsLabelsOnScreen()).toBe(false);
    await press(sidebarButton());
    expect(showsLabelsOnScreen()).toBe(true);
  });

  it('still collapses, and still gets back out', async () => {
    await loadInto({ name: 'default' });
    expect(showsLabelsOnScreen()).toBe(true);
    await press(sidebarButton());
    expect(widthRem(), 'collapsed to the rail').toBe(SIDEBAR_RAIL_REM);
    await press(sidebarButton());
    expect(showsLabelsOnScreen(), 'and back').toBe(true);
  });

  it('keeps a dragged width that can show labels', async () => {
    // Only an unusable width is replaced. A narrower one that still
    // fits the words is the reader's choice and survives the trip.
    const usable = (THRESHOLD + SIDEBAR_DEFAULT_REM) / 2;
    await loadInto({ name: 'usable', width: usable });
    expect(widthRem()).toBeCloseTo(usable, 5);
    await press(sidebarButton());
    await press(sidebarButton());
    expect(widthRem()).toBeCloseTo(usable, 5);
  });
});
