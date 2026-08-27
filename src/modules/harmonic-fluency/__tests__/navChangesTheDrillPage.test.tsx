// @vitest-environment jsdom
/**
 * Pressing a category in the nav changes the drill page.
 *
 * =====================================================================
 * WHAT THIS PROVES.
 *
 * That the chip row, the card and the page's own identity all move
 * together when the URL does — one value, read in three places, rather
 * than three mechanisms that can disagree. The old page held the lit
 * set in `useState`, and React Router reuses one instance across a
 * param change, so the state never re-seeded and all three stayed put.
 *
 * WHAT IT CANNOT PROVE: how any of it LOOKS. jsdom has no layout
 * engine — the chip row wrapping across a narrow screen needs Silas's
 * eye.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SidebarNav from '../../../components/SidebarNav';
import HarmonicFluencyCategory from '../HarmonicFluencyCategory';
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
 * The sidebar keeps module rows collapsed until pressed, so the
 * sub-items only exist once harmonic fluency is expanded. Seeded in
 * the pref the sidebar hydrates from rather than by pressing the
 * module name — pressing it navigates, which is a different test.
 */
async function render(path: string) {
  await db.userPrefs.put({
    key: 'sidebarExpandedGroups',
    value: { 'harmonic-fluency': true },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <SidebarNav />
        <Routes>
          <Route path="/harmonic-fluency/:category" element={<HarmonicFluencyCategory />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container!;
}

const page = () =>
  container!.querySelector('[data-testid="hf-category-page"]')!;

const litChips = () =>
  [...container!.querySelectorAll('[data-testid="pool-option"]')]
    .filter(b => b.getAttribute('data-lit') === 'true')
    .map(b => b.getAttribute('data-option'));

const allChips = () =>
  [...container!.querySelectorAll('[data-testid="pool-option"]')]
    .map(b => b.getAttribute('data-option'));

/** No card grid on this page — the detail blocks ARE what the pool
 *  renders as. Sorted where a test compares sets rather than order. */
const detailBlockKeys = () =>
  [...container!.querySelectorAll('[data-testid="category-detail"]')]
    .map(d => d.getAttribute('data-detail-key'));

/**
 * A sub-item by where it GOES, not by what it reads.
 *
 * The nav writes its own labels and title-cases them for display; the
 * destination is the thing this test is about, and it is the thing the
 * page reads.
 */
const navItem = (category: string) =>
  [...container!.querySelectorAll('a')]
    .find(a => a.getAttribute('href') === `/harmonic-fluency/${category}`);

const click = async (el: Element | undefined) => {
  expect(el, 'no element to press').toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

describe('the nav moves the page', () => {
  it('takes the chip row and the detail block with it', async () => {
    // THE RULE IS UNCHANGED: every surface on this page is derived from
    // the one value in the URL, so they cannot disagree. The summary
    // card used to be the third of them; the detail block is now.
    await render('/harmonic-fluency/modes');
    expect(page().getAttribute('data-category')).toBe('modes');
    expect(litChips()).toEqual(['modes']);
    expect(detailBlockKeys()).toEqual(['modes']);

    await click(navItem('intervals'));

    expect(page().getAttribute('data-category'), 'the page').toBe('intervals');
    expect(litChips(), 'the chip row').toEqual(['intervals']);
    expect(detailBlockKeys(), 'the detail blocks').toEqual(['intervals']);
  });

  it('drops what was lit beside the old category', async () => {
    // Arriving at a category means arriving at THAT category — a nav
    // link carries no `?also`, so nothing rides along.
    await render('/harmonic-fluency/modes?also=intervals');
    expect(litChips().sort()).toEqual(['intervals', 'modes']);

    await click(navItem('slash-chords'));
    expect(litChips()).toEqual(['slash-chords']);
  });
});

describe('the detail block mirrors the chip row', () => {
  const detailKeys = () =>
    [...container!.querySelectorAll('[data-testid="category-detail"]')]
      .map(b => b.getAttribute('data-detail-key'));
  const expandedKeys = () =>
    [...container!.querySelectorAll('[data-testid="category-detail"]')]
      .filter(b => b.getAttribute('data-expanded') === 'true')
      .map(b => b.getAttribute('data-detail-key'));

  it('opens the page\u2019s own category and nothing else', async () => {
    await render('/harmonic-fluency/modes?also=intervals');
    expect(detailKeys()!.sort()).toEqual(['intervals', 'modes']);
    expect(expandedKeys()).toEqual(['modes']);
  });

  it('gives Scale Degree Math its 7 x 24 grid', async () => {
    // The one Silas named. 24 movement columns, 7 degree rows — read
    // off the generator's own lists, so this fails if either moves.
    // Both counts asserted: checking only the columns passes on a grid
    // that lost rows.
    await render('/harmonic-fluency/scale-degree-math');
    const own = container!.querySelector('[data-detail-key="scale-degree-math"]')!;
    const grid = own.querySelector('[data-testid="progress-grid"]');
    expect(grid, 'the grid rendered').not.toBeNull();
    expect(grid!.querySelectorAll('[data-testid="grid-column"]')).toHaveLength(24);
    expect(grid!.querySelectorAll('[data-testid="grid-row"]')).toHaveLength(7);
  });

  it('renders a flat list for a category with no coordinates', async () => {
    // Chord construction is hand-written and varies by nothing a grid
    // could show. That is the answer for it rather than a gap.
    await render('/harmonic-fluency/chord-construction');
    const own = container!.querySelector('[data-detail-key="chord-construction"]')!;
    expect(own.getAttribute('data-expanded')).toBe('true');
    expect(own.querySelector('[data-testid="progress-grid"]')).toBeNull();
  });
});

// The card's Progress Detail button was tested here. There is no card
// on this page any more, and the button's own rule is pinned where it
// still exists — on the module home (`harmonicFluencyPage.test.tsx`)
// and at the component seam (`categoryDetailStack.test.tsx`), which
// asserts that the block asked for is the block scrolled to.

describe('the chip row writes the same value', () => {
  it('lights a second category and the details follow', async () => {
    await render('/harmonic-fluency/modes');
    await click(container!.querySelector('[data-option="intervals"]')!);
    expect(litChips().sort()).toEqual(['intervals', 'modes']);
    const details = [...container!.querySelectorAll('[data-testid="category-detail"]')];
    expect(details.map(d => d.getAttribute('data-detail-key')).sort())
      .toEqual(['intervals', 'modes']);
    // The new one arrives COLLAPSED — lighting is not opening.
    expect(details.find(d => d.getAttribute('data-detail-key') === 'intervals')!
      .getAttribute('data-expanded')).toBe('false');
    // The page is still the page — lighting is not navigating.
    expect(page().getAttribute('data-category')).toBe('modes');
  });

  it('cannot put out the category the page IS', async () => {
    await render('/harmonic-fluency/modes?also=intervals');
    const own = container!.querySelector('[data-option="modes"]') as HTMLButtonElement;
    expect(own.disabled).toBe(true);
    await act(async () => { own.click(); });
    expect(litChips()).toContain('modes');
  });
});

describe('Select All on the chip row', () => {
  it('lights every chip, and the cards follow', async () => {
    await render('/harmonic-fluency/scale-degree-math');
    // Only the page's own to begin with — a nav link carries no ?also.
    expect(litChips()).toEqual(['scale-degree-math']);

    const control = container!.querySelector('[data-testid="pool-select-all"]');
    await click(control!);

    // EVERY chip, compared against the row itself rather than a list
    // written here — a hard-coded expectation would pass on a control
    // that lit some fixed subset the catalogue has since outgrown.
    expect(litChips()).toEqual(allChips());
    expect(litChips().length).toBeGreaterThan(1);
    // The detail blocks are derived from the same value, so they follow.
    expect(detailBlockKeys()).toEqual(allChips());
  });

  it('has nothing left to do afterwards', async () => {
    await render('/harmonic-fluency/scale-degree-math');
    await click(container!.querySelector('[data-testid="pool-select-all"]')!);
    const control = container!
      .querySelector('[data-testid="pool-select-all"]') as HTMLButtonElement;
    expect(control.disabled).toBe(true);
  });
});

describe('the page carries no summary card', () => {
  it('renders no category card at all', async () => {
    // DELETED, not hidden. The lit chip names the category and the grid
    // below reports it cell by cell; a card between them was a third
    // account of the same one thing.
    await render('/harmonic-fluency/scale-degree-math');
    expect(container!.querySelector('[data-testid="category-card-grid"]')).toBeNull();
    expect(container!.querySelectorAll('[data-card-key]')).toHaveLength(0);
  });

  it('still opens its own detail block, with no button to press', async () => {
    // The card's Progress Detail button was the only way to open one
    // here. The page's own arrives expanded, so nothing was lost.
    await render('/harmonic-fluency/scale-degree-math');
    const own = container!.querySelector('[data-detail-key="scale-degree-math"]')!;
    expect(own.getAttribute('data-expanded')).toBe('true');
    expect(own.querySelector('[data-testid="progress-grid"]')).not.toBeNull();
  });
});

describe('session settings are a link, not a card', () => {
  it('renders nothing until the link is pressed', async () => {
    await render('/harmonic-fluency/scale-degree-math');
    expect(document.querySelector('[data-testid="fluency-session-settings"]')).toBeNull();

    await click(container!.querySelector('[data-testid="session-settings-link"]')!);

    // Portalled out of the page, so it is found on the document.
    const panel = document.querySelector('[data-testid="fluency-session-settings"]');
    expect(panel, 'the settings opened').not.toBeNull();
    // The same controls, unchanged — only where they live moved.
    expect(panel!.textContent).toContain('display mode');
    expect(panel!.textContent).toContain('timer per card');
    expect(panel!.textContent).toContain('Flagged Cards Only');
  });

  it('sits LEFT of the streak in the same row', async () => {
    await render('/harmonic-fluency/scale-degree-math');
    const link = container!.querySelector('[data-testid="session-settings-link"]')!;
    const streak = container!.querySelector('[data-testid="hf-streak"]')!;
    expect(link.compareDocumentPosition(streak) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(link.parentElement!.parentElement).toBe(streak.parentElement);
  });
});
