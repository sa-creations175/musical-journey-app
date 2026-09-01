// @vitest-environment jsdom
/**
 * The card view's controls, and what a filter does to a card.
 *
 * =====================================================================
 * WHAT THIS FILE CLAIMS, AND WHAT IT CANNOT.
 *
 * jsdom has no viewport and no layout, so nothing here says a square
 * LOOKS dimmed or that the strip wraps legibly. What it says is that
 * the dimming class is on the squares that did not match and off the
 * ones that did, that the strip still has every square it started
 * with, and that a dimmed square still answers a click. How faint 18%
 * reads on a real screen is Silas's eye.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import MobileDashboard from '../MobileDashboard';
import { DIMMED_CLASS, matchLine } from '../cardFilter';
import { MODULE_NAME_CLASS } from '../../TreeRow';
import { DEFAULT_VIEW_STATE, type DashboardViewState } from '../../read/urlState';
import type { FilterContext, ModuleTree } from '../../read/query';
import type { TreeNode } from '../../read/tree';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 7, 31, 12);
const DAY = 24 * 60 * 60 * 1000;

function node(id: string, over: Partial<TreeNode> = {}): TreeNode {
  return {
    id, label: id, depth: 1, children: [],
    itemRefs: [], accuracyKind: 'measured', mixedKinds: false,
    excludedFromParentTotals: false, endsGroup: false,
    score: null, gradedLeafCount: 0, coveredItems: 0, totalItems: 0,
    engagementCount: 0,
    recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
    ...over,
  };
}

/** A module whose categories have deliberately different scores. */
function moduleTree(
  moduleId: string, label: string, score: number, children: TreeNode[],
): ModuleTree {
  return {
    moduleId,
    moduleLabel: label,
    root: node(`${moduleId}-root`, {
      label, depth: 0, children, score, engagementCount: 100,
      gradedLeafCount: children.length,
    }),
  };
}

const graded = (id: string, score: number) =>
  node(id, { score, engagementCount: 20, coveredItems: 1, totalItems: 1 });

/** BUILT FRESH PER TEST. A shared array mutated between tests would be
 *  the same reference, and the memo that orders the cards would not
 *  notice it had changed — which is a bug in the test, not the card. */
function modulesFixture(): ModuleTree[] {
  return [
    moduleTree('harmonic-fluency', 'harmonic fluency', 58, [
      graded('hf-a', 30), graded('hf-b', 95),
    ]),
    moduleTree('ear-training', 'ear training', 90, [
      graded('et-a', 92), graded('et-b', 88), graded('et-c', 40),
    ]),
    moduleTree('reading', 'reading', 79, [graded('r-a', 79)]),
  ];
}

const CTX: FilterContext = { now: NOW };

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let state: DashboardViewState = DEFAULT_VIEW_STATE;
let modules: ModuleTree[] = modulesFixture();

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  state = DEFAULT_VIEW_STATE;
  modules = modulesFixture();
});

/** Renders, and re-renders on every change the controls make — so a
 *  pill press moves the cards the way it does in the app. */
async function render(
  initial: DashboardViewState = DEFAULT_VIEW_STATE,
  fixture: ModuleTree[] = modulesFixture(),
) {
  // A test that renders twice replaces the screen rather than stacking
  // a second one beside it.
  if (root) await act(async () => root!.unmount());
  container?.remove();
  state = initial;
  modules = fixture;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await draw();
  return container!;
}

async function draw() {
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/']}>
        <MobileDashboard
          modules={modules}
          now={NOW}
          state={state}
          onChange={next => { state = next; void draw(); }}
          ctx={CTX}
          openTopic={null}
          onToggleTopic={() => {}}
        />
      </MemoryRouter>,
    );
  });
}

const cards = () => [...container!.querySelectorAll('[data-testid="mobile-module-card"]')];
const cardModules = () => cards().map(c => c.getAttribute('data-module'));
const squares = () => [...container!.querySelectorAll('[data-testid="mobile-strip-cell"]')];
const q = (sel: string) => container!.querySelector(sel) as HTMLElement | null;

async function press(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function openControls() {
  await press(q('[data-testid="dashboard-controls-toggle"]')!);
}

// ---------------------------------------------------------------------

describe('the module name on a card', () => {
  it('is drawn the way the tree draws a module name', async () => {
    // The tree shouts a module row and the cards did not, so the two
    // dashboards disagreed about what a module looks like.
    const el = await render();
    const name = el.querySelector('[data-testid="mobile-module-name"]')!;
    for (const cls of MODULE_NAME_CLASS.split(/\s+/)) {
      expect(name.className.split(/\s+/), cls).toContain(cls);
    }
  });

  it('leaves the string itself in lower case', async () => {
    // The module filter pills read the same strings, and a test pins
    // them. The caps are CSS.
    const el = await render();
    expect(el.querySelector('[data-testid="mobile-module-name"]')!.textContent)
      .toBe('harmonic fluency');
  });
});

describe('the number on the top line', () => {
  it('says what it is', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="mobile-module-score"]')!.textContent)
      .toBe('58% accuracy');
  });
});

describe('the footer under the strip', () => {
  it('puts a swatch before every entry', async () => {
    // The footer is the key for the strip above it.
    const el = await render();
    const footer = el.querySelector('[data-testid="mobile-module-footer"]')!;
    const entries = [...footer.querySelectorAll('[data-testid="mobile-footer-entry"]')];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(
        entry.querySelectorAll('[data-testid="mobile-footer-swatch"]'),
        entry.textContent ?? '',
      ).toHaveLength(1);
    }
  });

  it('counts started and not started as two entries, not one', async () => {
    // A card with one category never touched and one worked below the
    // grading line. The strip draws two colours; the footer used to
    // call them one thing.
    await render(DEFAULT_VIEW_STATE, [
      moduleTree('reading', 'reading', 79, [
        node('untouched-one', { engagementCount: 0 }),
        node('started-one', { score: 100, engagementCount: 2 }),
      ]),
    ]);
    const footer = cards()
      .find(c => c.getAttribute('data-module') === 'reading')!
      .querySelector('[data-testid="mobile-module-footer"]')!;
    const tiers = [...footer.querySelectorAll('[data-testid="mobile-footer-entry"]')]
      .map(e => e.getAttribute('data-tier'));
    expect(tiers).toEqual(['untouched', 'started']);
    expect(footer.textContent).toContain('1 Not Started');
    expect(footer.textContent).toContain('1 Started');
    expect(footer.textContent).not.toContain('not enough yet to say');
  });
});

describe('sort', () => {
  it('reorders the cards', async () => {
    const el = await render();
    expect(cardModules(), 'nav order to start')
      .toEqual(['harmonic-fluency', 'ear-training', 'reading']);

    await openControls();
    await press(el.querySelector('[data-testid="sort-accuracy"]')!);
    // Worst first is the default direction.
    expect(cardModules()).toEqual(['harmonic-fluency', 'reading', 'ear-training']);

    await press(el.querySelector('[data-testid="sort-direction"]')!);
    expect(cardModules()).toEqual(['ear-training', 'reading', 'harmonic-fluency']);
  });

  it('goes back to nav order on reset', async () => {
    const el = await render();
    await openControls();
    await press(el.querySelector('[data-testid="sort-accuracy"]')!);
    await press(el.querySelector('[data-testid="reset"]')!);
    expect(cardModules()).toEqual(['harmonic-fluency', 'ear-training', 'reading']);
  });
});

describe('the module pills', () => {
  it('pick which cards are shown', async () => {
    const el = await render();
    await openControls();
    await press(el.querySelector('[data-testid="filter-module-ear-training"]')!);
    expect(cardModules()).toEqual(['ear-training']);
  });

  it('do not dim anything', async () => {
    // Every square on a card belongs to the same module, so as a
    // per-square question the pills would dim all of them or none.
    const el = await render();
    await openControls();
    await press(el.querySelector('[data-testid="filter-module-ear-training"]')!);
    expect(q('[data-testid="mobile-module-match-line"]')).toBeNull();
    for (const sq of squares()) {
      expect(sq.className).not.toContain(DIMMED_CLASS);
    }
  });
});

describe('the two controls that mean nothing here', () => {
  it('are absent rather than inert', async () => {
    const el = await render();
    await openControls();
    expect(el.querySelector('[data-testid="grouping-toggle"]'), 'grouped').toBeNull();
    expect(el.querySelector('[data-testid="collapse-all"]'), 'collapse all').toBeNull();
    // Everything else is the same panel.
    expect(el.querySelector('[data-testid="sort-natural"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="filter-accuracy"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="filter-due"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="reset"]')).not.toBeNull();
  });
});

describe('a filter on a card', () => {
  const belowFifty: DashboardViewState = {
    ...DEFAULT_VIEW_STATE,
    filter: { match: 'all', accuracyBelow: 50 },
  };

  it('keeps the strip its full length', async () => {
    // The strip's contract is one square per category. Remove squares
    // and what is left is a picture of a subset wearing the shape of
    // the whole.
    await render();
    const before = squares().length;
    expect(before).toBe(6);
    await render(belowFifty);
    expect(squares()).toHaveLength(before);
  });

  it('dims what did not match and leaves what did', async () => {
    await render(belowFifty);
    const dim = (id: string) =>
      squares().find(s => s.getAttribute('data-node') === id)!.className;
    expect(dim('hf-a'), 'hf-a is 30%').not.toContain(DIMMED_CLASS);
    expect(dim('et-c'), 'et-c is 40%').not.toContain(DIMMED_CLASS);
    expect(dim('hf-b'), 'hf-b is 95%').toContain(DIMMED_CLASS);
    expect(dim('et-a'), 'et-a is 92%').toContain(DIMMED_CLASS);
  });

  it('leaves a dimmed square clickable', async () => {
    // Dimming is emphasis, not removal.
    await render(belowFifty);
    const dimmed = squares().find(s => s.getAttribute('data-node') === 'hf-b')!;
    expect(dimmed.className).toContain(DIMMED_CLASS);
    await press(dimmed);
    const popover = q('[data-testid="mobile-cell-popover"]');
    expect(popover, 'it opened its popover').not.toBeNull();
    expect(popover!.getAttribute('data-node')).toBe('hf-b');
  });

  it('dims a footer entry only when nothing of that colour matched', async () => {
    await render(belowFifty);
    const card = cards().find(c => c.getAttribute('data-module') === 'ear-training')!;
    const entries = [...card.querySelectorAll('[data-testid="mobile-footer-entry"]')];
    const matched = entries.filter(e => e.getAttribute('data-matched') === 'true');
    const dimmed = entries.filter(e => e.getAttribute('data-matched') === 'false');
    expect(matched.length + dimmed.length).toBe(entries.length);
    for (const e of dimmed) expect(e.className).toContain(DIMMED_CLASS);
    for (const e of matched) expect(e.className).not.toContain(DIMMED_CLASS);
  });

  it('says how many matched, and only while something is filtering', async () => {
    await render();
    expect(q('[data-testid="mobile-module-match-line"]'), 'nothing filtering')
      .toBeNull();

    await render(belowFifty);
    const card = cards().find(c => c.getAttribute('data-module') === 'ear-training')!;
    expect(card.querySelector('[data-testid="mobile-module-match-line"]')!.textContent)
      .toBe(matchLine(1, 3));
  });

  it('keeps a card where nothing matches, and says so', async () => {
    // A module with no matches is an answer, not a card to drop.
    await render({
      ...DEFAULT_VIEW_STATE,
      filter: { match: 'all', accuracyBelow: 10 },
    });
    expect(cardModules(), 'every card still here')
      .toEqual(['harmonic-fluency', 'ear-training', 'reading']);
    const card = cards().find(c => c.getAttribute('data-module') === 'reading')!;
    expect(card.querySelector('[data-testid="mobile-module-match-line"]')!.textContent)
      .toBe(matchLine(0, 1));
    for (const sq of card.querySelectorAll('[data-testid="mobile-strip-cell"]')) {
      expect(sq.className).toContain(DIMMED_CLASS);
    }
  });

  it('dims on a stale filter too, not only on accuracy', async () => {
    const stale = node('old-one', {
      score: 90, engagementCount: 20,
      recency: { mostRecentAt: NOW - 90 * DAY, stalestAt: NOW - 90 * DAY, hasUntouched: false },
    });
    await render(
      { ...DEFAULT_VIEW_STATE, filter: { match: 'all', notPractisedInDays: 30 } },
      [moduleTree('reading', 'reading', 79, [graded('r-a', 79), stale])],
    );
    const dim = (id: string) =>
      squares().find(s => s.getAttribute('data-node') === id)!.className;
    expect(dim('old-one')).not.toContain(DIMMED_CLASS);
    expect(dim('r-a')).toContain(DIMMED_CLASS);
  });
});

describe('the controls panel', () => {
  it('is offered on the cards and not on the skills list', async () => {
    // The skills tab has a measure switch and a grouping of its own; a
    // second sort above them would be two answers to one question.
    const el = await render();
    expect(q('[data-testid="dashboard-controls-toggle"]')).not.toBeNull();
    await press(el.querySelector('[data-testid="mobile-view-skills"]')!);
    expect(q('[data-testid="dashboard-controls-toggle"]')).toBeNull();
    expect(q('[data-testid="mobile-measure-switch"]')).not.toBeNull();
  });

  it('opens closed, exactly as on the tree', async () => {
    await render();
    expect(q('[data-testid="controls-body"]')).toBeNull();
    await openControls();
    expect(q('[data-testid="controls-body"]')).not.toBeNull();
  });
});

describe('the match line', () => {
  it('says "matches" when exactly one does', async () => {
    // The count is the subject, so one match is singular. It shipped
    // with only the plural and read wrong at exactly one number.
    expect(matchLine(1, 15)).toBe('1 of 15 categories matches');
    expect(matchLine(0, 15)).toBe('0 of 15 categories match');
    expect(matchLine(2, 15)).toBe('2 of 15 categories match');

    // And on the card itself: reading has one category, and it matches.
    await render(
      { ...DEFAULT_VIEW_STATE, filter: { match: 'all', accuracyBelow: 90 } },
    );
    const card = cards().find(c => c.getAttribute('data-module') === 'reading')!;
    expect(card.querySelector('[data-testid="mobile-module-match-line"]')!.textContent)
      .toBe('1 of 1 categories matches');
  });
});

describe('the sub-line', () => {
  it('counts the categories the strip is actually drawing', async () => {
    // A sub-line saying "2 categories" over a strip of seven squares is
    // the count describing a different thing from the picture.
    const el = await render();
    for (const card of cards()) {
      const squareCount =
        card.querySelectorAll('[data-testid="mobile-strip-cell"]').length;
      expect(
        card.querySelector('[data-testid="mobile-module-subline"]')!.textContent,
        card.getAttribute('data-module') ?? '',
      ).toContain(`${squareCount} categor`);
    }
    void el;
  });
});
