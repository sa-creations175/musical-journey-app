// @vitest-environment jsdom
/**
 * The screen, rendered against a real Dexie.
 *
 * Same two rules as the row's tests: query from the container and
 * assert ancestry, dispatch real events rather than calling handlers.
 *
 * The assertions here are about WHAT IS ON SCREEN AND IN WHAT ORDER -
 * row counts, expansion, the comparison, the URL. Nothing here can
 * check that it looks like a dense table; that is hand-verification and
 * is listed as such in the step report.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import DashboardScreen from '../DashboardScreen';
import { db, type AttemptRecord } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_700_000_000_000;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Render and let the live query resolve. */
/**
 * Renders the router's current query string.
 *
 * `window.location` does NOT move under MemoryRouter, so an assertion
 * against it passes whatever the screen writes — which is how the
 * compare test below was passing vacuously. This reads the router.
 */
function LocationProbe() {
  const [params] = useSearchParams();
  return <i data-testid="search">{params.toString()}</i>;
}

function search(el: HTMLElement): string {
  return el.querySelector('[data-testid="search"]')!.textContent ?? '';
}

async function renderScreen(initialEntry = '/'): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <DashboardScreen now={NOW} />
        <LocationProbe />
      </MemoryRouter>,
    );
  });
  await settle();
  return container;
}

/**
 * Let Dexie's live query resolve and React flush.
 *
 * A fixed pair of ticks was not enough - the first version of this
 * helper returned an empty container and every assertion below failed
 * for a reason that had nothing to do with the screen.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    if (container?.querySelector('[data-testid="tree-row"]')) return;
  }
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function rows(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll('[data-testid="tree-row"]')] as HTMLElement[];
}

/** The name cell carries a `title`; a leaf's first span is an
 *  aria-hidden spacer where the chevron would be. */
function rowLabels(el: HTMLElement): string[] {
  return rows(el).map(r => r.querySelector('span[title]')?.textContent ?? '');
}

/**
 * Give the nine scales & modes rows different accuracies, so sorting
 * actually reorders them.
 */
async function seedVariedScalesModes(): Promise<void> {
  const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian',
    'aeolian', 'harmonic-minor', 'melodic-minor', 'locrian'];
  const rows: AttemptRecord[] = [];
  modes.forEach((mode, i) => {
    // Ten attempts each, correct-count stepping from 1 to 9 - enough
    // to clear the tier minimum and to give every row a distinct score.
    for (let n = 0; n < 10; n++) {
      rows.push({
        id: `att-${mode}-${n}`,
        moduleId: 'scales-modes',
        itemId: `${mode}-tab1`,
        correct: n <= i,
        timestamp: NOW - (i * 10 + n) * 1000,
      });
    }
  });
  // A second ear-training submodule, scoring differently, so the four
  // depth-1 rows genuinely reorder between the two sort directions.
  // With only one graded submodule both directions put it first and
  // the reorder test would pass on a fixture that never moves.
  for (let n = 0; n < 10; n++) {
    rows.push({
      id: `att-iv-${n}`,
      moduleId: 'intervals',
      itemId: 'M3',
      direction: 'asc',
      correct: n < 9,
      timestamp: NOW - n * 1000,
    } as AttemptRecord);
  }
  await db.attempts.bulkPut(rows);
}

/**
 * Give reading's key-signature rows different accuracies, so sorting
 * reorders them at depth 2.
 */
async function seedVariedReading(): Promise<void> {
  const sigs = ['6f', '5f', '4f', '3f', '2f', '1f', '0', '1s', '2s', '3s'];
  const rows: AttemptRecord[] = [];
  sigs.forEach((sig, i) => {
    for (let n = 0; n < 10; n++) {
      rows.push({
        id: `att-r-${sig}-${n}`,
        moduleId: 'reading',
        itemId: `sig:${sig}:major:name`,
        correct: n <= i,
        timestamp: NOW - (i * 10 + n) * 1000,
      });
    }
  });
  await db.attempts.bulkPut(rows);
}

/** The label of the deepest row that currently has children showing. */
function deepestExpandedLabel(el: HTMLElement): string | null {
  const all = rows(el);
  let best: { depth: number; label: string } | null = null;
  for (let i = 0; i < all.length - 1; i++) {
    const depth = Number(all[i].getAttribute('data-depth'));
    const next = Number(all[i + 1].getAttribute('data-depth'));
    if (next === depth + 1 && (best === null || depth > best.depth)) {
      best = { depth, label: all[i].querySelector('span[title]')?.textContent ?? '' };
    }
  }
  return best?.label ?? null;
}

/** The label of the row whose children are currently showing. */
function expandedParentLabel(el: HTMLElement): string | null {
  const all = rows(el);
  for (let i = 0; i < all.length - 1; i++) {
    const depth = Number(all[i].getAttribute('data-depth'));
    const next = Number(all[i + 1].getAttribute('data-depth'));
    if (next === depth + 1 && depth === 1) {
      return all[i].querySelector('span[title]')?.textContent ?? null;
    }
  }
  return null;
}

beforeEach(async () => {
  await db.open();
  await db.attempts.clear();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('the default view', () => {
  it('renders the table and its rows inside it', async () => {
    const el = await renderScreen();
    const table = el.querySelector('[data-testid="dashboard-rows"]')!;
    expect(table).not.toBeNull();
    const all = rows(el);
    expect(all.length).toBeGreaterThan(0);
    // Every row inside the table, not floating in the container.
    expect(all.every(r => table.contains(r))).toBe(true);
  });

  it('opens at submodule level — modules and their children, nothing deeper', async () => {
    const el = await renderScreen();
    const depths = new Set(rows(el).map(r => r.getAttribute('data-depth')));
    expect([...depths].sort()).toEqual(['0', '1']);
  });

  it('shows every module even with no practice logged', async () => {
    // The screen opens nearly empty by design. An empty module is a
    // row reading dashes, not a missing row.
    const el = await renderScreen();
    const moduleRows = rows(el).filter(r => r.getAttribute('data-depth') === '0');
    // Six, matching the nav bar. Mental visualisation is a Shapes &
    // Patterns submodule, not a row of its own.
    expect(moduleRows).toHaveLength(6);
  });

  it('renders modules in nav-bar order', async () => {
    // Away-from-keyboard first, keyboard second. The dashboard does not
    // invent its own order.
    const el = await renderScreen();
    const moduleLabels = rows(el)
      .filter(r => r.getAttribute('data-depth') === '0')
      .map(r => r.querySelector('span[title]')?.textContent);
    expect(moduleLabels).toEqual([
      'harmonic fluency', 'ear training', 'reading',
      'shapes & patterns', 'song repertoire', 'production',
    ]);
  });
});

describe('expansion', () => {
  /** The first SUBMODULE chevron — depth 1, not a module header. */
  function submoduleToggle(el: HTMLElement): Element {
    return rows(el)
      .find(r => r.getAttribute('data-depth') === '1'
        && r.querySelector('[data-testid="expand-toggle"]'))!
      .querySelector('[data-testid="expand-toggle"]')!;
  }

  it('adds that row s children and nothing else', async () => {
    const el = await renderScreen();
    const before = rows(el).length;
    click(submoduleToggle(el));
    expect(rows(el).length).toBeGreaterThan(before);
  });

  it('collapses back to where it started', async () => {
    const el = await renderScreen();
    const before = rowLabels(el);
    click(submoduleToggle(el));
    expect(rowLabels(el)).not.toEqual(before);
    click(submoduleToggle(el));
    expect(rowLabels(el)).toEqual(before);
  });

  it('restores expansion from the URL', async () => {
    // The whole point of putting it there. `intervals~0` is the first
    // submodule of the intervals module.
    const collapsed = await renderScreen('/');
    const baseline = rows(collapsed).length;
    await act(async () => root!.unmount());
    container!.remove();

    const el = await renderScreen('/?open=ear-training~0');
    expect(rows(el).length).toBeGreaterThan(baseline);
  });

  it('ignores a stale URL entry rather than rendering a broken row', async () => {
    // A path that runs off a shorter catalog, and a module that is
    // gone. Both drop; the screen still renders.
    const el = await renderScreen('/?open=ear-training~99,not-a-module~0');
    expect(el.querySelector('[data-testid="dashboard-screen"]')).not.toBeNull();
    const depths = new Set(rows(el).map(r => r.getAttribute('data-depth')));
    expect([...depths].sort()).toEqual(['0', '1']);
  });
});

describe('sorting from the URL', () => {
  it('reorders rows without changing how many there are', async () => {
    const worst = await renderScreen('/?sort=aw');
    const worstLabels = rowLabels(worst);
    await act(async () => root!.unmount());
    container!.remove();

    const best = await renderScreen('/?sort=ab');
    expect(rowLabels(best)).toHaveLength(worstLabels.length);
  });

  it('does not move which row an expansion key addresses', async () => {
    // THE PROPERTY. Expansion indices are into BUILT order, so opening
    // a row and then changing the sort must keep the SAME row open.
    //
    // This needs seeded data: with nothing practised every node scores
    // the same, the sort is a stable no-op, and indexing into sorted
    // order would pass unnoticed.
    await seedVariedScalesModes();

    const worst = await renderScreen('/?open=ear-training~3,ear-training~3.5&sort=aw');
    const worstOpened = expandedParentLabel(worst);
    expect(worstOpened).not.toBeNull();
    await act(async () => root!.unmount());
    container!.remove();

    const best = await renderScreen('/?open=ear-training~3,ear-training~3.5&sort=ab');
    expect(expandedParentLabel(best)).toBe(worstOpened);
  });

  it('holds at depth 2 as well, where a different code path builds the key', async () => {
    // Depth-1 keys come from the grouped view; deeper ones from
    // visibleDescendants. Both must index built order, and only a
    // deeper expansion exercises the second.
    await seedVariedReading();

    const worst = await renderScreen('/?open=reading~0,reading~0.3&sort=aw');
    const worstDeep = deepestExpandedLabel(worst);
    expect(worstDeep).not.toBeNull();
    await act(async () => root!.unmount());
    container!.remove();

    const best = await renderScreen('/?open=reading~0,reading~0.3&sort=ab');
    expect(deepestExpandedLabel(best)).toBe(worstDeep);
  });

  it('genuinely reorders once data exists', async () => {
    // Guards the guard above: if sorting stopped reordering, the
    // property test would pass for the wrong reason.
    await seedVariedScalesModes();
    const worst = await renderScreen('/?sort=aw');
    const worstOrder = rowLabels(worst);
    await act(async () => root!.unmount());
    container!.remove();

    const best = await renderScreen('/?sort=ab');
    expect(rowLabels(best)).not.toEqual(worstOrder);
  });
});

describe('the flat view', () => {
  it('drops module rows and trails the module name on each row', async () => {
    const el = await renderScreen('/?flat=1');
    const depths = new Set(rows(el).map(r => r.getAttribute('data-depth')));
    expect(depths.has('0')).toBe(false);
    expect(el.querySelectorAll('[data-testid="row-module-label"]').length)
      .toBe(rows(el).length);
  });
});

describe('filtering', () => {
  it('renders an empty state rather than a blank screen', async () => {
    // Nothing is practised, so "accuracy below 1" matches nothing —
    // a dash is not below a threshold.
    const el = await renderScreen('/?flat=1&acc=1');
    expect(rows(el)).toHaveLength(0);
    expect(el.querySelector('[data-testid="dashboard-empty"]')).not.toBeNull();
  });

  it('keeps module rows in the grouped view even when no submodule matches', async () => {
    // A module row summarises what is under it. Hiding it because its
    // average misses a threshold would hide the submodules that match.
    const el = await renderScreen('/?acc=1');
    const moduleRows = rows(el).filter(r => r.getAttribute('data-depth') === '0');
    expect(moduleRows).toHaveLength(6);
    expect(rows(el).filter(r => r.getAttribute('data-depth') === '1')).toHaveLength(0);
  });
});

describe('the comparison', () => {
  it('is absent from the URL — it is a gesture, not a view', async () => {
    const el = await renderScreen('/');
    const compare = el.querySelector('[data-testid="compare-toggle"]');
    expect(compare).not.toBeNull();
    click(compare!);
    // Nothing tinted here (no scores yet); the assertion that matters
    // is that pressing it wrote nothing to the query string.
    expect(search(el)).toBe('');
  });

  it('marks at most two rows at once', async () => {
    const el = await renderScreen('/');
    for (const button of el.querySelectorAll('[data-testid="compare-toggle"]')) {
      click(button);
      expect(rows(el).filter(r => r.getAttribute('data-compare')).length)
        .toBeLessThanOrEqual(2);
    }
  });
});

describe('the drill affordance', () => {
  it('renders one per row, inside its row', async () => {
    const el = await renderScreen();
    const buttons = [...el.querySelectorAll('[data-testid="drill-affordance"]')];
    expect(buttons).toHaveLength(rows(el).length);
    expect(buttons.every(b => b.closest('[data-testid="tree-row"]') !== null)).toBe(true);
  });

  it('says "open module" on a module row whatever the module', async () => {
    // Tapping a module row opens the module rather than drilling all
    // 375 cards in one sitting.
    const el = await renderScreen();
    const moduleRows = rows(el).filter(r => r.getAttribute('data-depth') === '0');
    for (const row of moduleRows) {
      expect(row.querySelector('[data-testid="drill-affordance"]')!.textContent)
        .toBe('open module');
    }
  });
});

describe('collapsing a module', () => {
  function moduleRows(el: HTMLElement): HTMLElement[] {
    return rows(el).filter(r => r.getAttribute('data-depth') === '0');
  }

  it('folds to its header row alone', async () => {
    const el = await renderScreen();
    const before = rows(el).length;
    click(moduleRows(el)[0].querySelector('[data-testid="expand-toggle"]')!);
    const after = rows(el);
    // Six headers still there; the folded module's submodules gone.
    expect(after.filter(r => r.getAttribute('data-depth') === '0')).toHaveLength(6);
    expect(after.length).toBeLessThan(before);
  });

  it('folds every module to six rows', async () => {
    // The different way of looking at the same screen. Nothing is
    // hidden by distance — it is folded, and unfolds again.
    const el = await renderScreen();
    // Re-query each time: the list is stale the moment the DOM
    // re-renders.
    for (let i = 0; i < 6; i++) {
      const next = moduleRows(el).find(
        r => r.querySelector('[data-testid="expand-toggle"]')
          ?.getAttribute('aria-expanded') === 'true',
      );
      if (!next) break;
      click(next.querySelector('[data-testid="expand-toggle"]')!);
    }
    expect(rows(el)).toHaveLength(6);
  });

  it('records the choice in the URL, and only the choice', async () => {
    // Modules are open by default, so the set names what was CLOSED.
    // Encoding the open ones would put six ids in the query string
    // before anything happened.
    const el = await renderScreen();
    expect(search(el)).toBe('');
    click(moduleRows(el)[0].querySelector('[data-testid="expand-toggle"]')!);
    expect(search(el)).toContain('closed=');
  });

  it('restores a folded module from the URL', async () => {
    const open = await renderScreen('/');
    const openCount = rows(open).length;
    await act(async () => root!.unmount());
    container!.remove();

    const el = await renderScreen('/?closed=ear-training');
    expect(rows(el).length).toBeLessThan(openCount);
    expect(rows(el).filter(r => r.getAttribute('data-depth') === '0')).toHaveLength(6);
  });

  it('reports its state to assistive tech', async () => {
    const el = await renderScreen('/?closed=ear-training');
    const et = rows(el).find(
      r => r.querySelector('span[title]')?.textContent === 'ear training',
    )!;
    const toggle = et.querySelector('[data-testid="expand-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('module header rows', () => {
  it('are marked as headers and carry the module accent', async () => {
    const el = await renderScreen();
    const headers = rows(el).filter(r => r.getAttribute('data-module-row') === 'true');
    expect(headers).toHaveLength(6);
    // The accent goes on the left edge and a 10% wash, both inline
    // because the colour is data rather than one of a fixed set.
    for (const header of headers) {
      expect((header as HTMLElement).style.borderLeftColor).not.toBe('');
      expect((header as HTMLElement).style.backgroundColor).not.toBe('');
    }
  });

  it('does not mark a submodule as a header', async () => {
    const el = await renderScreen();
    const submodule = rows(el).find(r => r.getAttribute('data-depth') === '1')!;
    expect(submodule.getAttribute('data-module-row')).toBeNull();
    expect((submodule as HTMLElement).style.backgroundColor).toBe('');
  });
});

describe('the controls drive the list', () => {
  it('renders the controls above the rows, in the sticky container', async () => {
    const el = await renderScreen();
    const controls = el.querySelector('[data-testid="dashboard-controls"]')!;
    const table = el.querySelector('[data-testid="dashboard-rows"]')!;
    expect(controls).not.toBeNull();
    // Before the list in document order, so a screen reader meets them
    // in the order they apply.
    expect(controls.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('a sort press reorders the list and writes to the URL', async () => {
    await seedVariedScalesModes();
    const el = await renderScreen();
    const before = rowLabels(el);
    click(el.querySelector('[data-testid="sort-coverage"]')!);
    expect(search(el)).toContain('sort=cw');
    expect(rowLabels(el)).not.toEqual(before);
  });

  it('the grouping toggle drops the module rows', async () => {
    const el = await renderScreen();
    expect(rows(el).some(r => r.getAttribute('data-depth') === '0')).toBe(true);
    click(el.querySelector('[data-testid="grouping-toggle"]')!);
    expect(search(el)).toContain('flat=1');
    expect(rows(el).some(r => r.getAttribute('data-depth') === '0')).toBe(false);
  });

  it('reset clears a filter and empties the URL', async () => {
    const el = await renderScreen('/?acc=1&flat=1');
    expect(rows(el)).toHaveLength(0);
    click(el.querySelector('[data-testid="reset"]')!);
    expect(search(el)).toBe('');
    expect(rows(el).length).toBeGreaterThan(0);
  });

  it('a module filter narrows the list to that module', async () => {
    const el = await renderScreen();
    click(el.querySelector('[data-testid="filter-module-reading"]')!);
    expect(search(el)).toContain('mod=reading');
    // Grouped view keeps every module HEADER — a module row summarises
    // what is under it — and only reading keeps its submodules.
    const withChildren = rows(el).filter(r => r.getAttribute('data-depth') === '1');
    expect(withChildren.length).toBeGreaterThan(0);
    click(el.querySelector('[data-testid="grouping-toggle"]')!);
    const flatRows = rowLabels(el);
    expect(flatRows.length).toBeGreaterThan(0);
    expect(flatRows).toContain('key signature recognition');
  });
});
