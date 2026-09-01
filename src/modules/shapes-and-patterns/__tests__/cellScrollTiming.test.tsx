// @vitest-environment jsdom
/**
 * Clicking a cell moves the page — and WHEN it asks to is the whole
 * defect.
 *
 * =====================================================================
 * WHAT WAS WRONG, AND WHY IT LOOKED LIKE NOTHING HAPPENING.
 *
 * The handler picked the cell and asked for the scroll in the same
 * breath. At that instant React had not re-rendered, so the room the
 * panel reserves ONLY WHILE A CELL IS PICKED was not in the document
 * yet — and a browser clamps a scroll request to the document's current
 * maximum. On chord shapes, whose grid is tall, that meant the page did
 * not move at all: the panel had opened, far below the fold, and
 * clicking a cell appeared to do nothing.
 *
 * =====================================================================
 * WHAT THIS TEST CAN AND CANNOT SAY.
 *
 * jsdom has no layout and no scrolling, so nothing here proves the page
 * arrives anywhere. What it proves is the ORDER: at the moment the
 * scroll is asked for, the reserved room is already in the document.
 * That is exactly the difference between the two versions, and it is
 * the part that was wrong.
 *
 * Whether it now lands where Silas wants is his eye.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ShapesAndPatternsSection from '../ShapesAndPatternsSection';
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

/** Whether the panel's reserved room is in the document right now. */
function roomIsReserved(): boolean {
  const band = container?.querySelector('[data-testid="scale-progress-details"]');
  const wrapper = band?.parentElement;
  return wrapper?.className.split(/\s+/).includes(SCROLL_ROOM_CLASS) ?? false;
}

async function renderSection(section: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[`/shapes-and-patterns/${section}`]}>
        <Routes>
          <Route
            path="/shapes-and-patterns/:section"
            element={<ShapesAndPatternsSection />}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

/** Records what the document looked like each time a scroll was asked
 *  for. */
function watchScrolls(): Array<{ roomReserved: boolean }> {
  const seen: Array<{ roomReserved: boolean }> = [];
  window.scrollTo = (() => {
    seen.push({ roomReserved: roomIsReserved() });
  }) as unknown as typeof window.scrollTo;
  return seen;
}

const GRIDS: ReadonlyArray<{ section: string; cell: string }> = [
  { section: 'chord-shapes', cell: 'chord-shape-cell' },
  { section: 'scales', cell: 'scale-cell' },
  // The voice-leading grid draws through the shared `BandCell`.
  { section: 'voice-leading', cell: 'band-cell' },
];

describe('picking a cell', () => {
  for (const { section, cell } of GRIDS) {
    it(`on ${section}, asks to scroll only once the room exists`, async () => {
      const el = await renderSection(section);
      const scrolls = watchScrolls();

      // NOT GUARDED. A missing cell means the grid did not render, and
      // a test that shrugged at that would be the one place this file
      // could quietly stop checking anything.
      const target = el.querySelector(`[data-testid="${cell}"]`) as HTMLElement;
      expect(target, `${section} drew a cell to press`).not.toBeNull();

      expect(roomIsReserved(), 'no room before a cell is picked').toBe(false);
      await act(async () => { target.click(); });

      expect(scrolls.length, 'it asked for a scroll').toBeGreaterThan(0);
      for (const scroll of scrolls) {
        expect(scroll.roomReserved, `${section}: room was in place`).toBe(true);
      }
      expect(roomIsReserved(), 'and the panel is open').toBe(true);
    });
  }

  it('scrolls again when the same cell is pressed a second time', async () => {
    // Keying the scroll on WHICH cell is picked would make the second
    // press on one cell do nothing — the same complaint in a smaller
    // form.
    const el = await renderSection('chord-shapes');
    const scrolls = watchScrolls();
    const target = el.querySelector('[data-testid="chord-shape-cell"]') as HTMLElement;
    await act(async () => { target.click(); });
    const after = scrolls.length;
    await act(async () => { target.click(); });
    expect(scrolls.length).toBeGreaterThan(after);
  });

  it('does not scroll on arrival', async () => {
    // A page that scrolled itself on arrival would take the reader
    // somewhere they did not ask to go.
    const scrolls: number[] = [];
    window.scrollTo = (() => { scrolls.push(1); }) as unknown as typeof window.scrollTo;
    await renderSection('chord-shapes');
    expect(scrolls).toHaveLength(0);
  });
});
