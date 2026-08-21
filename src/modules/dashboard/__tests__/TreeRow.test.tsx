// @vitest-environment jsdom
/**
 * The row, rendered.
 *
 * Two rules, both from failures this project has already had:
 *
 *   QUERY FROM THE CONTAINER, and assert ancestry where placement
 *   matters. A DOM-order assertion that never checks its container
 *   passes just as happily on a node rendered somewhere else entirely.
 *
 *   DISPATCH REAL EVENTS, never call a handler directly. A control that
 *   is unreachable - not rendered, hidden, disabled - still has a
 *   perfectly callable handler, and a suite full of those tests nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import TreeRow, { drillLabel } from '../TreeRow';
import { buildModuleTree, type TreeNode } from '../read/tree';
import type { CatalogItem, ModuleCatalog } from '../read/catalogs';
import { emptyItemStats, type ItemStats } from '../read/itemStats';
import { drillTargetFor, drillTargetSummary } from '../read/drillTarget';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(ui));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Click the way a person does — a real event, through the DOM. */
function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/**
 * `sourceId` is a parameter because it is what decides filterability.
 *
 * The node carries its own catalog and the row resolves against that,
 * so a fixture that hard-codes a filterable source can only ever
 * produce filterable rows - and the negative-case test below was
 * passing a different `moduleId` in the belief that it was choosing.
 */
function nodeFrom(
  items: CatalogItem[],
  stats: Partial<ItemStats>[],
  accuracyKind: ModuleCatalog['accuracyKind'] = 'measured',
  sourceId = 'intervals',
): TreeNode {
  return buildModuleTree(
    { sourceId, moduleId: 'ear-training', label: 'intervals', accuracyKind, items },
    stats.map((s, i) => ({ ...emptyItemStats(items[i].id), ...s })),
  );
}

function leaf(
  patch: Partial<ItemStats> = {},
  kind: ModuleCatalog['accuracyKind'] = 'measured',
  sourceId = 'intervals',
) {
  const tree = nodeFrom(
    [{ id: 'M3:asc', label: 'Major 3rd (ascending)', path: ['intervals'], itemRefs: ['M3:asc'] }],
    [patch],
    kind,
    sourceId,
  );
  return tree.children[0];
}

function parent(stats: Partial<ItemStats>[]) {
  return nodeFrom(
    stats.map((_, i) => ({
      id: `i${i}`, label: `item ${i}`, path: ['intervals', 'ascending'], itemRefs: [`i${i}`],
    })),
    stats,
  ).children[0];
}

// ── Cells ────────────────────────────────────────────────────────────

describe('the four cells', () => {
  it('renders name, score, coverage and recency', () => {
    const el = render(
      <TreeRow node={leaf({ score: 61, engagementCount: 5, lastAt: NOW - 12 * DAY })}
        moduleId="intervals" now={NOW} expanded={false} />,
    );
    expect(el.querySelector('[data-testid="tree-row"]')).not.toBeNull();
    expect(el.textContent).toContain('Major 3rd (ascending)');
    expect(el.querySelector('[data-testid="cell-score"]')!.textContent).toBe('61%');
    expect(el.querySelector('[data-testid="cell-coverage"]')!.textContent).toBe('5 attempts');
    expect(el.querySelector('[data-testid="cell-recency"]')!.textContent).toBe('12d');
  });

  it('renders a dash and no band when nothing is graded', () => {
    const el = render(
      <TreeRow node={leaf({ score: null })} moduleId="intervals" now={NOW} expanded={false} />,
    );
    const score = el.querySelector('[data-testid="cell-score"]')!;
    expect(score.textContent).toBe('—');
    expect(score.getAttribute('data-band')).toBe('none');
  });

  it('carries the band as data, so a colour class cannot drift from it', () => {
    for (const [value, band] of [[40, 'red'], [60, 'amber'], [75, 'yellow-green'], [90, 'green']] as const) {
      const el = render(
        <TreeRow node={leaf({ score: value })} moduleId="intervals" now={NOW} expanded={false} />,
      );
      expect(el.querySelector('[data-testid="cell-score"]')!.getAttribute('data-band'))
        .toBe(band);
      act(() => root!.unmount());
      container!.remove();
    }
  });

  it('marks a self-rated cell as self-rated', () => {
    // A self-rated 75 must never read as "75% correct". The kind rides
    // on the cell so the header and the affordance can both read it.
    const el = render(
      <TreeRow node={leaf({ score: 75 }, 'self-rated')}
        moduleId="shapes-and-patterns" now={NOW} expanded={false} />,
    );
    const score = el.querySelector('[data-testid="cell-score"]')!;
    expect(score.getAttribute('data-kind')).toBe('self-rated');
    expect(score.getAttribute('data-band')).toBe('yellow-green');
  });

  it('shows two recency numbers on a parent and one on a leaf', () => {
    const el = render(
      <TreeRow node={parent([
        { lastAt: NOW - 2 * DAY }, { lastAt: NOW - 40 * DAY },
      ])} moduleId="intervals" now={NOW} expanded={false} />,
    );
    expect(el.querySelector('[data-testid="cell-recency"]')!.textContent).toBe('2d / 40d');
  });
});

// ── Expansion ────────────────────────────────────────────────────────

describe('the expand control', () => {
  it('is absent on a leaf', () => {
    // Not merely hidden — a chevron on a row with nothing under it
    // promises something that cannot happen.
    const el = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW} expanded={false}
        onToggleExpand={() => {}} />,
    );
    expect(el.querySelector('[data-testid="expand-toggle"]')).toBeNull();
  });

  it('is present and reachable on a parent', () => {
    const onToggle = vi.fn();
    const el = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW}
        expanded={false} onToggleExpand={onToggle} />,
    );
    const toggle = el.querySelector('[data-testid="expand-toggle"]') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.disabled).toBe(false);
    expect(toggle.getAttribute('aria-hidden')).toBeNull();
    // Inside the row, not floating somewhere else in the container.
    expect(toggle.closest('[data-testid="tree-row"]')).not.toBeNull();

    click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reports its state to assistive tech', () => {
    const el = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW}
        expanded onToggleExpand={() => {}} />,
    );
    const toggle = el.querySelector('[data-testid="expand-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toContain('Collapse');
  });
});

// ── Compare ──────────────────────────────────────────────────────────

describe('the compare control', () => {
  it('is absent on a leaf — comparing its children asks about nothing', () => {
    const el = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW} expanded={false}
        onCompare={() => {}} />,
    );
    expect(el.querySelector('[data-testid="compare-toggle"]')).toBeNull();
  });

  it('is reachable and reports pressed state', () => {
    const onCompare = vi.fn();
    const el = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW}
        expanded={false} onCompare={onCompare} compareActive />,
    );
    const button = el.querySelector('[data-testid="compare-toggle"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.closest('[data-testid="tree-row"]')).not.toBeNull();
    click(button);
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('tints a highlighted row and marks which extreme it is', () => {
    for (const which of ['weakest', 'strongest'] as const) {
      const el = render(
        <TreeRow node={leaf()} moduleId="intervals" now={NOW}
          expanded={false} compareHighlight={which} />,
      );
      const row = el.querySelector('[data-testid="tree-row"]')!;
      expect(row.getAttribute('data-compare')).toBe(which);
      act(() => root!.unmount());
      container!.remove();
    }
  });

  it('carries no compare marker when it is not an extreme', () => {
    const el = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW} expanded={false} />,
    );
    expect(el.querySelector('[data-testid="tree-row"]')!.getAttribute('data-compare'))
      .toBeNull();
  });
});

// ── The drill affordance ─────────────────────────────────────────────

describe('the drill affordance says what pressing it will do', () => {
  it('names the item count when the drill can be filtered', () => {
    const el = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW} expanded={false} />,
    );
    const button = el.querySelector('[data-testid="drill-affordance"]')!;
    expect(button.getAttribute('data-filtered')).toBe('true');
    expect(button.textContent).toBe('drill 1 item');
  });

  it('says "open module" when it cannot, rather than implying a filter', () => {
    // THE NEGATIVE CASE. A row that silently opened a whole module
    // while implying it had narrowed the drill would be worse than one
    // that says where it is taking you.
    // Unfilterable because of the CATALOG the row's items come from,
    // which is the only thing that decides it — an intervals row under
    // any module id in the world still drills intervals.
    const el = render(
      <TreeRow node={leaf({}, 'measured', 'scales-modes')}
        moduleId="ear-training" now={NOW} expanded={false} />,
    );
    const button = el.querySelector('[data-testid="drill-affordance"]')!;
    expect(button.getAttribute('data-filtered')).toBe('false');
    // Same information as a filterable row, same column, same word —
    // only the verb differs, because only the verb is different.
    expect(button.textContent).toBe('open module · 1 item');
    expect(button.textContent).not.toContain('drill');
  });

  it('pluralises against the count it is actually showing', () => {
    expect(drillLabel({ filtered: true, itemCount: 1 }, 1)).toBe('drill 1 item');
    expect(drillLabel({ filtered: true, itemCount: 13 }, 13)).toBe('drill 13 items');
    // The unfiltered branch pluralises on the TOTAL, not on the
    // summary's zero — which would have said "0 items" forever.
    expect(drillLabel({ filtered: false, itemCount: 0 }, 188))
      .toBe('open module · 188 items');
    expect(drillLabel({ filtered: false, itemCount: 0 }, 1))
      .toBe('open module · 1 item');
  });

  it('agrees with the read layer rather than deciding for itself', () => {
    // The row must not have its own opinion about filterability.
    //
    // Varying the SOURCE, not the module id: the module id no longer
    // changes the answer, so looping over four of those would have run
    // the same case four times.
    const seen = new Set<boolean>();
    for (const sourceId of ['intervals', 'reading', 'scales-modes', 'harmonic-fluency']) {
      const node = leaf({}, 'measured', sourceId);
      const expected = drillTargetSummary(drillTargetFor(node, 'ear-training'));
      const el = render(
        <TreeRow node={node} moduleId="ear-training" now={NOW} expanded={false} />,
      );
      seen.add(expected.filtered);
      expect(
        el.querySelector('[data-testid="drill-affordance"]')!.getAttribute('data-filtered'),
        sourceId,
      ).toBe(String(expected.filtered));
      act(() => root!.unmount());
      container!.remove();
    }
    // Guard the guard: the four sources must not all answer the same
    // way, or the loop proves agreement on one case four times.
    expect(seen).toEqual(new Set([true, false]));
  });

  it('is reachable', () => {
    const onDrill = vi.fn();
    const el = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW}
        expanded={false} onDrill={onDrill} />,
    );
    const button = el.querySelector('[data-testid="drill-affordance"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    click(button);
    expect(onDrill).toHaveBeenCalledTimes(1);
  });
});

// ── Depth and the flat view ──────────────────────────────────────────

describe('depth and module label', () => {
  it('carries its depth as data and indents by it', () => {
    const el = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW} expanded={false} />,
    );
    expect(el.querySelector('[data-testid="tree-row"]')!.getAttribute('data-depth')).toBe('1');
  });

  it('trails the module name only when one is given', () => {
    // The flat view needs it; the grouped view would be repeating the
    // heading directly above.
    const withLabel = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW}
        expanded={false} moduleLabel="ear training" />,
    );
    expect(withLabel.querySelector('[data-testid="row-module-label"]')!.textContent)
      .toBe('ear training');
    act(() => root!.unmount());
    container!.remove();

    const without = render(
      <TreeRow node={leaf()} moduleId="intervals" now={NOW} expanded={false} />,
    );
    expect(without.querySelector('[data-testid="row-module-label"]')).toBeNull();
  });
});

describe('a chevron only where there is something to toggle', () => {
  it('renders none on a parent with no handler', () => {
    // A module row's submodules always show, so a chevron there would
    // look live and do nothing — the same class of failure as a
    // disabled control that tests still exercise.
    const el = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW} expanded={false} />,
    );
    expect(el.querySelector('[data-testid="expand-toggle"]')).toBeNull();
  });

  it('keeps the name cell aligned with and without one', () => {
    const withToggle = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW}
        expanded={false} onToggleExpand={() => {}} />,
    );
    const a = withToggle.querySelector('span[title]')!.previousElementSibling!;
    expect(a.className).toContain('w-4');
    act(() => root!.unmount());
    container!.remove();

    const without = render(
      <TreeRow node={parent([{}, {}])} moduleId="intervals" now={NOW} expanded={false} />,
    );
    const b = without.querySelector('span[title]')!.previousElementSibling!;
    expect(b.className).toContain('w-4');
  });
});
