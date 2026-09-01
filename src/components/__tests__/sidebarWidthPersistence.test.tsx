// @vitest-environment jsdom
/**
 * What the sidebar remembers about its width.
 *
 * =====================================================================
 * THE RULE: THE STORED WIDTH IS ALWAYS ONE THAT CAN SHOW LABELS.
 *
 * Dragging narrower still snaps to the rail for the rest of the
 * session — that is unchanged, and it is what the reader asked for by
 * dragging. What changes is that the narrow figure is never written
 * down. It is a drag position, not a preference: the sidebar cannot
 * open at it, so remembering it means opening on the rail next time
 * with nothing on screen saying why.
 *
 * =====================================================================
 * THIS FILE DRAGS. jsdom has no layout, so nothing here says the box
 * ends up any particular number of pixels wide — what it drives is the
 * real pointer sequence the divider listens for, and what it reads is
 * the width the sidebar renders itself at and the row left in the
 * database. Both are decisions rather than measurements, which is why
 * they are testable at all.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../Layout';
import { SessionTimerProvider } from '../../lib/sessionTimer/SessionTimerContext';
import { NAV_LABELS } from '../SidebarNav';
import {
  SIDEBAR_DEFAULT_REM, SIDEBAR_RAIL_REM, SIDEBAR_WIDTH_PREF,
  labelsMinRem, usableStoredWidth,
} from '../../lib/sidebarWidth';
import { db } from '../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** A desktop window — the screen this behaviour is about. */
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
/** Wide enough for the words, narrower than the default: a width
 *  somebody would choose on purpose. */
const USABLE = (THRESHOLD + SIDEBAR_DEFAULT_REM) / 2;
/** Below the threshold — the rail, whatever the pointer says. */
const TOO_NARROW = (SIDEBAR_RAIL_REM + THRESHOLD) / 2;

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

/** Unmount and mount again — a reload, as far as this component is
 *  concerned: the only thing that survives is the database. */
async function reload() {
  await act(async () => root!.unmount());
  container!.remove();
  return mount();
}

const aside = () => container!.querySelector('aside') as HTMLElement;

/** What the sidebar draws itself at. */
function widthRem(): number {
  const el = aside();
  if (el.className.includes('md:w-14')) return SIDEBAR_RAIL_REM;
  return parseFloat(el.style.width);
}

const stored = async () =>
  (await db.userPrefs.get(SIDEBAR_WIDTH_PREF))?.value as number | undefined;

const handle = () =>
  container!.querySelector('[data-testid="sidebar-resize-handle"]') as HTMLElement;

/**
 * Drag the divider to a target width and let go.
 *
 * The drag starts from what is ON SCREEN, so the delta is measured from
 * there — the same arithmetic `startResize` does.
 */
async function dragTo(targetRem: number) {
  const from = widthRem();
  const startX = 400;
  await act(async () => {
    handle().dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: startX,
    }) as unknown as PointerEvent);
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true, clientX: startX + (targetRem - from) * 16,
    }) as unknown as PointerEvent);
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }) as unknown as PointerEvent);
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

describe('dragging', () => {
  it('writes a width that can show labels', async () => {
    await mount();
    await dragTo(USABLE);
    expect(widthRem()).toBeCloseTo(USABLE, 1);
    expect(await stored()).toBeCloseTo(USABLE, 1);
  });

  it('leaves the stored width alone when dragged too narrow', async () => {
    await mount();
    await dragTo(USABLE);
    const kept = await stored();

    await dragTo(TOO_NARROW);
    // On screen: the rail, as asked for.
    expect(widthRem(), 'snapped to the rail').toBe(SIDEBAR_RAIL_REM);
    // In the database: nothing new.
    expect(await stored(), 'the last usable width is still what is kept')
      .toBe(kept);
  });

  it('never writes anything below the threshold, from a fresh install either', async () => {
    await mount();
    await dragTo(TOO_NARROW);
    const value = await stored();
    if (value !== undefined) {
      expect(value).toBeGreaterThanOrEqual(THRESHOLD);
    }
  });

  it('lets the labels come back by dragging out again, within the session', async () => {
    // Unchanged behaviour, and the reason the narrow width does not
    // need remembering: nothing was switched, so nothing has to be
    // switched back.
    await mount();
    await dragTo(TOO_NARROW);
    expect(widthRem()).toBe(SIDEBAR_RAIL_REM);
    await dragTo(USABLE);
    expect(widthRem()).toBeCloseTo(USABLE, 1);
  });
});

describe('reloading', () => {
  it('comes back at the last width that could show words', async () => {
    await mount();
    await dragTo(USABLE);
    await dragTo(TOO_NARROW);
    expect(widthRem(), 'the session ends on the rail').toBe(SIDEBAR_RAIL_REM);

    await reload();
    expect(widthRem(), 'and comes back where the words fit')
      .toBeCloseTo(USABLE, 1);
  });

  it('opens at the usual width for someone who has never had one', async () => {
    await mount();
    expect(widthRem()).toBe(SIDEBAR_DEFAULT_REM);
    await reload();
    expect(widthRem()).toBe(SIDEBAR_DEFAULT_REM);
  });
});

describe('a width stored before this rule', () => {
  it('opens with labels rather than on the rail, with no press needed', async () => {
    // The upgrade path. Anything between the rail and the threshold was
    // a perfectly good labelled sidebar before the threshold moved.
    await db.userPrefs.put({ key: SIDEBAR_WIDTH_PREF, value: TOO_NARROW });
    await mount();
    expect(widthRem(), 'not the rail').not.toBe(SIDEBAR_RAIL_REM);
    expect(widthRem()).toBe(SIDEBAR_DEFAULT_REM);
  });

  it('is replaced once, so the rule is true of the database too', async () => {
    await db.userPrefs.put({ key: SIDEBAR_WIDTH_PREF, value: TOO_NARROW });
    await mount();
    expect(await stored()).toBe(SIDEBAR_DEFAULT_REM);
  });

  it('leaves a usable stored width exactly as it is', async () => {
    // Only a width the sidebar cannot open at is replaced.
    await db.userPrefs.put({ key: SIDEBAR_WIDTH_PREF, value: USABLE });
    await mount();
    expect(widthRem()).toBeCloseTo(USABLE, 5);
    expect(await stored()).toBe(USABLE);
  });
});

describe('the rule itself', () => {
  it('keeps what can show labels and replaces what cannot', () => {
    expect(usableStoredWidth(USABLE, NAV_LABELS)).toBe(USABLE);
    expect(usableStoredWidth(TOO_NARROW, NAV_LABELS)).toBe(SIDEBAR_DEFAULT_REM);
    expect(usableStoredWidth(SIDEBAR_RAIL_REM, NAV_LABELS)).toBe(SIDEBAR_DEFAULT_REM);
  });

  it('still catches everything an unusable row could be', () => {
    for (const bad of [null, undefined, 'wide', {}, Number.NaN, -5, 900]) {
      const out = usableStoredWidth(bad, NAV_LABELS);
      expect(out, String(bad)).toBeGreaterThanOrEqual(THRESHOLD);
      expect(out, String(bad)).toBeLessThanOrEqual(SIDEBAR_DEFAULT_REM);
    }
  });

  it('answers to the labels, not to a figure', () => {
    // A longer module name raises the threshold, and a width that was
    // storable yesterday stops being so.
    const longer = [...NAV_LABELS, { text: 'counterpoint', kind: 'module' as const }];
    const between = THRESHOLD + 0.01;
    expect(usableStoredWidth(between, NAV_LABELS)).toBe(between);
    expect(usableStoredWidth(between, longer)).toBe(SIDEBAR_DEFAULT_REM);
  });
});
