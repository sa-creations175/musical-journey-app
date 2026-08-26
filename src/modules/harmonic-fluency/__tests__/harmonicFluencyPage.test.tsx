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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import HarmonicFluency from '../HarmonicFluency';
import HarmonicFluencyCategory from '../HarmonicFluencyCategory';
import { CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS } from '../catalog';
import { mixedDrillLabel } from '../../../components/moduleHome/mixedDrillLabel';
import { db, newAttemptId, type AttemptRecord } from '../../../lib/db';

// Attempts carry client-minted ids (see db.ts), so seed rows are
// stamped the way the production write path stamps them.
const withAttemptId = (r: AttemptRecord): AttemptRecord => ({ id: newAttemptId(), ...r });

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * The module home and a category page, mounted together.
 *
 * BOTH ROUTES, ALWAYS. "Drill category goes to the category's page" is
 * a claim about a journey, and a harness holding only the home could
 * not tell a navigation from a no-op.
 */
function Probe() {
  const location = useLocation();
  return <span data-testid="at" data-path={location.pathname} />;
}

async function renderAt(path: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/harmonic-fluency" element={<HarmonicFluency />} />
          <Route path="/harmonic-fluency/:category" element={<HarmonicFluencyCategory />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

const renderPage = () => renderAt('/harmonic-fluency');

const at = () =>
  container!.querySelector('[data-testid="at"]')!.getAttribute('data-path');

/**
 * Flush until `ready` holds, or give up.
 *
 * The page's figures arrive from Dexie across several `useLiveQuery`
 * resolutions, and the streak row's own query starts a render AFTER the
 * page's — it lives in `ModuleHomeHeader`, a child. One `setTimeout(0)`
 * happened to be enough before that component existed; asserting on a
 * fixed number of ticks is asserting on how fast the machine is.
 *
 * BOUNDED, so a value that never arrives still fails the test rather
 * than hanging it.
 */
async function settle(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 20 && !ready(); i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

afterEach(async () => {
  await db.attempts.clear();
  // The page persists its filter and its display prefs, so a test that
  // seeds one must not leave it for the next.
  await db.userPrefs.clear();
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const card = (key: string) =>
  container!.querySelector(`[data-card-key="${key}"]`) as HTMLElement | null;

/** The mixed drill by its SEAM, not by its copy. Its wording is
 *  Silas's to change; what it does is not. */
const mixedDrill = () =>
  container!.querySelector('[data-testid="mixed-drill-start"]') as HTMLElement | null;

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
    const mixed = mixedDrill();
    expect(mixed).toBeTruthy();
    // THE COUNT IS DERIVED, so this fails the day a category is added
    // rather than leaving a stale number on the button.
    expect(mixed!.textContent).toBe(mixedDrillLabel(CATEGORY_ORDER.length));
    expect(mixed!.textContent).toContain(String(CATEGORY_ORDER.length));
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
    expect(mixedDrill(), 'the start button is gone').toBeTruthy();
    // A session replaces the start button with the flashcard shell, so
    // its presence is the absence of a session.
    expect(el.querySelector('[data-testid="category-card-grid"]')).not.toBeNull();
  });
});

describe('the two card actions', () => {
  it('goes to the category\u2019s own page from Drill Category', async () => {
    // IT USED TO START A RUN HERE, which meant a category had no page
    // and the nav's sub-item pointing at one had nowhere to land.
    const el = await renderPage();
    const cat = 'tritone-pairs';
    await click(card(cat)!.querySelector('[data-testid="category-card-toggle"]'), 'expand');
    await click(card(cat)!.querySelector('[data-testid="category-card-drill"]'), 'drill');
    expect(at()).toBe(`/harmonic-fluency/${cat}`);
    // And the page that arrives is that category's, carrying its card.
    const page = el.querySelector('[data-testid="hf-category-page"]');
    expect(page?.getAttribute('data-category')).toBe(cat);
    expect(mixedDrill(), 'the mixed drill is not here').toBeNull();
  });

  it('starts only that category from its page', async () => {
    const cat = 'tritone-pairs';
    const supply = FLASHCARDS.filter(c => c.category === cat).length;
    const el = await renderAt(`/harmonic-fluency/${cat}`);
    // Title Case, matching the home's own button.
    expect(el.querySelector('[data-testid="hf-category-start"]')!.textContent)
      .toBe('Start Drill');
    await click(el.querySelector('[data-testid="hf-category-start"]'), 'start');
    const headerRe = /card\s*1\s*\/\s*(\d+)/;
    await settle(() => headerRe.test(el.textContent ?? ''));
    // The queue cannot be longer than the category holds. Derived from
    // the catalog, so it stays a real bound as the deck grows.
    expect(Number(headerRe.exec(el.textContent ?? '')?.[1]))
      .toBeLessThanOrEqual(supply);
  });

  it('spans every lit category, not just its own', async () => {
    /**
     * THE POOL IS WHAT IS LIT. `tritone-pairs` holds fewer cards than a
     * session targets, so a run drawn from it alone cannot reach the
     * target — lighting a category big enough to close the gap and
     * getting a full-length queue is proof the second one joined the
     * pool. Both numbers come off the catalog.
     */
    const own = 'tritone-pairs';
    const added = 'scale-degree-math';
    const supply = FLASHCARDS.filter(c => c.category === own).length;
    const el = await renderAt(`/harmonic-fluency/${own}`);

    // It starts lit, alone.
    const lit = () => [...el.querySelectorAll('[data-testid="pool-option"]')]
      .filter(b => b.getAttribute('data-lit') === 'true')
      .map(b => b.getAttribute('data-option'));
    expect(lit()).toEqual([own]);

    await click(el.querySelector(`[data-option="${added}"]`), 'light a second category');
    expect(lit().sort()).toEqual([own, added].sort());

    await click(el.querySelector('[data-testid="hf-category-start"]'), 'start');
    const headerRe = /card\s*1\s*\/\s*(\d+)/;
    await settle(() => headerRe.test(el.textContent ?? ''));
    expect(Number(headerRe.exec(el.textContent ?? '')?.[1]))
      .toBeGreaterThan(supply);
  });

  it('sends a slug that names no category back to the module home', async () => {
    await renderAt('/harmonic-fluency/plagal-cadences');
    expect(at()).toBe('/harmonic-fluency');
  });

  it('leaves a saved category filter behind when the MIXED drill starts', async () => {
    /**
     * The defect this pins: "all categories mixed" used to start with
     * whatever `harmonicFluencyCategoryFilter` held, and a card's
     * "drill category" wrote that pref. Drilling one category once left
     * every later mixed run serving only that category, in this visit
     * and in every visit afterwards, with nothing on screen saying so.
     *
     * The pref is retired and nothing reads it now; it is still seeded
     * here, because "nothing reads it" is the thing that has to keep
     * being true.
     *
     * MEASURED BY QUEUE LENGTH, and the fixture is what makes that
     * mean something. `tritone-pairs` holds fewer cards than a session
     * targets, so a run drawn from it alone CANNOT reach the target —
     * a full-length queue is proof the pool was not the saved filter.
     * Both numbers come off the catalog, so the day either of them
     * changes this fails rather than quietly stops testing anything.
     */
    const POISON = 'tritone-pairs';
    const supply = FLASHCARDS.filter(c => c.category === POISON).length;
    await db.userPrefs.put({ key: 'harmonicFluencyCategoryFilter', value: [POISON] });

    const el = await renderPage();
    await click(mixedDrill(), 'mixed drill');
    // The queue is built through Dexie, so wait for the header rather
    // than for a fixed number of ticks — under a loaded machine the
    // fixed count is a race, and a race that reads NaN out of a header
    // that has not arrived yet fails for the wrong reason.
    const headerRe = /card\s*1\s*\/\s*(\d+)/;
    await settle(() => headerRe.test(el.textContent ?? ''));

    const queueLength = Number(headerRe.exec(el.textContent ?? '')?.[1]);
    expect(queueLength, 'a session is running').toBeGreaterThan(0);
    expect(supply, 'the fixture category is smaller than a session')
      .toBeLessThan(queueLength);
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


/**
 * What the landing page says about the reader, and what it stopped
 * saying.
 *
 * ---------------------------------------------------------------
 * THE NUMBERS ARE DERIVED, NOT TYPED IN.
 *
 * The fixture below is ASYMMETRIC on purpose: its hot streak (3) and
 * its day streak differ, so wiring the two figures into each other's
 * slots fails here. A fixture where both came to the same number would
 * pass either way round.
 * ---------------------------------------------------------------
 */
describe('the landing statistics', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NOW = Date.now();
  // Wrong, then three right: hot streak 3. All today, so the day
  // streak cannot also be 3.
  const FIXTURE: AttemptRecord[] = [
    { moduleId: 'harmonic-fluency', itemId: 'a', correct: false, timestamp: NOW - 4 * 1000 },
    { moduleId: 'harmonic-fluency', itemId: 'b', correct: true, timestamp: NOW - 3 * 1000 },
    { moduleId: 'harmonic-fluency', itemId: 'c', correct: true, timestamp: NOW - 2 * 1000 },
    { moduleId: 'harmonic-fluency', itemId: 'd', correct: true, timestamp: NOW - 1 * 1000 },
    // An older day, so the module has history beyond today.
    { moduleId: 'harmonic-fluency', itemId: 'e', correct: true, timestamp: NOW - 9 * DAY_MS },
  ];

  it('does not show a Today counter before a session starts', async () => {
    await db.attempts.bulkAdd(FIXTURE.map(a => withAttemptId({ ...a })));
    const el = await renderPage();
    // The cards are up — this is the module home, not some other state.
    expect(el.querySelector('[data-testid="category-card-grid"]')).not.toBeNull();
    expect(el.textContent).not.toMatch(/Today:/i);
  });

  it('shows the day streak, with its glyph and its words', async () => {
    // WAS "shows both streaks". The flame and its count are gone as a
    // concept, so the assertions that described them go with the
    // behaviour rather than being rewritten to expect nothing.
    await db.attempts.bulkAdd(FIXTURE.map(a => withAttemptId({ ...a })));
    const el = await renderPage();
    await settle(() => el.querySelector('[data-kind="day"] .tabular-nums') !== null);

    const row = el.querySelector('a[href="/harmonic-fluency/calendar"]')!.parentElement!;
    expect(row.querySelector('[data-kind="hot"]')).toBeNull();
    expect(row.textContent).not.toContain('correct in a row');
    expect(row.textContent).not.toContain('🔥');

    const day = row.querySelector('[data-kind="day"]')!;
    expect(day.textContent).toContain('📅');
    expect(day.textContent).toContain('day streak');
  });

  it('counts days practised, not days that met a number', async () => {
    // The label is invariant now — "day streak", whatever the count —
    // because the figure is days practised rather than days at a
    // target. The old label pluralised because it named a threshold.
    await db.attempts.bulkAdd(FIXTURE.map(a => withAttemptId({ ...a })));
    const el = await renderPage();
    const day = el.querySelector('[data-testid="hf-streak"][data-kind="day"]')!;
    expect(day.lastElementChild!.textContent).toBe('day streak');
  });
});
