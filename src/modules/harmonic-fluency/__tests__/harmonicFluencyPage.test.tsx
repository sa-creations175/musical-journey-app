// @vitest-environment jsdom
/**
 * Harmonic fluency's module home, as a page.
 *
 * The card component and its adapter are already covered by
 * `harmonicFluencyHomeCards.test.tsx`; this is about the PAGE — that it
 * opens as cards, that the two card actions go where they say, and that
 * nothing is drilling until asked.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import HarmonicFluency from '../HarmonicFluency';
import { CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter initialEntries={['/harmonic-fluency']}><HarmonicFluency /></MemoryRouter>);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const card = (key: string) =>
  container!.querySelector(`[data-card-key="${key}"]`) as HTMLElement | null;

const byText = (re: RegExp) =>
  [...container!.querySelectorAll('button')]
    .find(b => re.test((b.textContent ?? '').trim()));

async function click(el: Element | null | undefined, what: string) {
  expect(el, `no element for ${what}`).toBeTruthy();
  expect((el as HTMLButtonElement).disabled, `${what} is disabled`).not.toBe(true);
  await act(async () => { (el as HTMLElement).click(); });
  // `drillCategory` builds the session through Dexie, so several
  // microtask turns pass before the drill replaces the cards. One flush
  // leaves the assertion looking at the page mid-transition.
  for (let i = 0; i < 5; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

describe('the page opens as cards', () => {
  it('renders one card per category, in CATEGORY_ORDER', async () => {
    const el = await renderPage();
    const keys = [...el.querySelectorAll('[data-card-key]')]
      .map(c => c.getAttribute('data-card-key'));
    // DERIVED, and fifteen today. ASYMMETRIC: the order is pedagogical
    // rather than alphabetical, so a grid that sorted would differ.
    expect(keys).toEqual([...CATEGORY_ORDER]);
    expect(keys).not.toEqual([...CATEGORY_ORDER].sort());
  });

  it('counts each category off the catalog, not a written number', async () => {
    await renderPage();
    for (const cat of CATEGORY_ORDER) {
      const expected = FLASHCARDS.filter(c => c.category === cat).length;
      expect(
        card(cat)!.querySelector('[data-testid="category-card-count"]')!.textContent,
        cat,
      ).toBe(`0/${expected}`);
    }
  });

  it('offers the mixed drill above the cards, saying what it covers', async () => {
    const el = await renderPage();
    const mixed = byText(/all categories mixed/i);
    expect(mixed).toBeTruthy();
    const grid = el.querySelector('[data-testid="category-card-grid"]')!;
    // Precedes the grid in document order.
    expect(mixed!.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('puts session settings below the cards, collapsed', async () => {
    const el = await renderPage();
    const settings = el.querySelector('details')!;
    expect(settings).toBeTruthy();
    expect(settings.hasAttribute('open')).toBe(false);
    const grid = el.querySelector('[data-testid="category-card-grid"]')!;
    expect(grid.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});

describe('nothing is served on mount', () => {
  it('shows no flashcard until a drill is started', async () => {
    // HF has never auto-started; this pins that the cards did not
    // introduce one, which is exactly what went wrong in Reading.
    const el = await renderPage();
    expect(byText(/all categories mixed/i), 'the start button is gone').toBeTruthy();
    // A session replaces the start button with the flashcard shell, so
    // its presence is the absence of a session.
    expect(el.querySelector('[data-testid="category-card-grid"]')).not.toBeNull();
  });
});

describe('the two card actions', () => {
  it('enters the drill from Drill Category', async () => {
    const el = await renderPage();
    const cat = 'tritone-pairs';
    await click(card(cat)!.querySelector('[data-testid="category-card-toggle"]'), 'expand');
    await click(card(cat)!.querySelector('[data-testid="category-card-drill"]'), 'drill');
    // The session replaces the module home: the cards and the mixed
    // start button are both gone.
    expect(el.querySelector('[data-testid="category-card-grid"]')).toBeNull();
    expect(byText(/all categories mixed/i)).toBeUndefined();
  });

  it('opens progress detail from Progress Detail', async () => {
    const el = await renderPage();
    const cat = 'tritone-pairs';
    await click(card(cat)!.querySelector('[data-testid="category-card-toggle"]'), 'expand');
    const detail = card(cat)!.querySelector('[data-testid="category-card-progress-detail"]');
    // Enabled here, unlike a module with no detail surface wired.
    expect((detail as HTMLButtonElement).disabled).toBe(false);
    await click(detail, 'progress detail');
    const panel = el.querySelector('[data-testid="progress-detail"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain(CATEGORY_LABELS[cat]);
  });
});
