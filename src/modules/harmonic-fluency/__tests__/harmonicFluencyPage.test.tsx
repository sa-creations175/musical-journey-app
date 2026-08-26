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
import { db, newAttemptId, type AttemptRecord } from '../../../lib/db';

// Attempts carry client-minted ids (see db.ts), so seed rows are
// stamped the way the production write path stamps them.
const withAttemptId = (r: AttemptRecord): AttemptRecord => ({ id: newAttemptId(), ...r });

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

  it('leaves a saved category filter behind when the MIXED drill starts', async () => {
    /**
     * The defect this pins: "all categories mixed" used to start with
     * whatever `harmonicFluencyCategoryFilter` held, and a card's
     * "drill category" writes that pref. Drilling one category once
     * left every later mixed run serving only that category, in this
     * visit and in every visit afterwards, with nothing on screen
     * saying so.
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
    await click(byText(/all categories mixed/i), 'mixed drill');
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
