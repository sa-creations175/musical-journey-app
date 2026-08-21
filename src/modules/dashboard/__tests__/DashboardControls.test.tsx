// @vitest-environment jsdom
/**
 * The controls.
 *
 * Every one is stateless: it reports a NEXT view state through one
 * callback. So the assertions are on what comes back out, dispatched
 * through real clicks on elements queried from the container.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import DashboardControls from '../DashboardControls';
import {
  DEFAULT_VIEW_STATE,
  type DashboardViewState,
} from '../read/urlState';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function state(patch: Partial<DashboardViewState> = {}): DashboardViewState {
  return { ...DEFAULT_VIEW_STATE, ...patch };
}

function render(
  s: DashboardViewState = state(),
): { el: HTMLDivElement; onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<DashboardControls state={s} onChange={onChange} />));
  return { el: container, onChange };
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function type(el: Element, value: string) {
  const input = el as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function find(el: HTMLElement, testId: string): HTMLElement {
  const node = el.querySelector(`[data-testid="${testId}"]`);
  expect(node, testId).not.toBeNull();
  // Inside the controls, not floating elsewhere in the container.
  expect(node!.closest('[data-testid="dashboard-controls"]')).not.toBeNull();
  return node as HTMLElement;
}

// ── Sort ─────────────────────────────────────────────────────────────

describe('sort', () => {
  it('reports the field without touching the direction', () => {
    const { el, onChange } = render();
    click(find(el, 'sort-coverage'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      sort: { field: 'coverage', direction: 'worst-first' },
    }));
  });

  it('marks the active field and only that one', () => {
    const { el } = render(state({ sort: { field: 'recency', direction: 'worst-first' } }));
    expect(find(el, 'sort-recency').getAttribute('data-active')).toBe('true');
    expect(find(el, 'sort-accuracy').getAttribute('data-active')).toBe('false');
    expect(find(el, 'sort-coverage').getAttribute('data-active')).toBe('false');
  });

  it('words the direction for the field it applies to', () => {
    // "Worst" means a different number in each column, and recency's
    // two directions read opposite halves of the same cell — so the
    // control says which rather than abstracting it away.
    const accuracy = render(state({ sort: { field: 'accuracy', direction: 'worst-first' } }));
    expect(find(accuracy.el, 'sort-direction').textContent).toBe('worst first');
    act(() => root!.unmount()); container!.remove();

    const recency = render(state({ sort: { field: 'recency', direction: 'worst-first' } }));
    expect(find(recency.el, 'sort-direction').textContent).toBe('stalest first');
    act(() => root!.unmount()); container!.remove();

    const coverage = render(state({ sort: { field: 'coverage', direction: 'best-first' } }));
    expect(find(coverage.el, 'sort-direction').textContent).toBe('most covered');
  });

  it('flips the direction without touching the field', () => {
    const { el, onChange } = render(
      state({ sort: { field: 'recency', direction: 'worst-first' } }),
    );
    click(find(el, 'sort-direction'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      sort: { field: 'recency', direction: 'best-first' },
    }));
  });
});

// ── Grouping ─────────────────────────────────────────────────────────

describe('grouping', () => {
  it('says which mode it is in, not which it would switch to', () => {
    // A toggle labelled with its destination reads as its current
    // state to half of everyone who looks at it.
    expect(find(render(state({ grouping: true })).el, 'grouping-toggle').textContent)
      .toBe('grouped');
    act(() => root!.unmount()); container!.remove();
    expect(find(render(state({ grouping: false })).el, 'grouping-toggle').textContent)
      .toBe('flat');
  });

  it('toggles', () => {
    const { el, onChange } = render(state({ grouping: true }));
    click(find(el, 'grouping-toggle'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ grouping: false }));
  });
});

// ── Filters ──────────────────────────────────────────────────────────

describe('threshold filters', () => {
  it('sets a number', () => {
    const { el, onChange } = render();
    type(find(el, 'filter-accuracy'), '70');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ accuracyBelow: 70 }),
    }));
  });

  it('CLEARS on empty rather than setting zero', () => {
    // `accuracy below 0` matches nothing. Arriving at it by deleting a
    // digit would empty the list and look broken.
    const { el, onChange } = render(state({
      filter: { match: 'all', accuracyBelow: 70 },
    }));
    type(find(el, 'filter-accuracy'), '');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ accuracyBelow: undefined }),
    }));
  });

  it('keeps zero when zero is typed deliberately', () => {
    const { el, onChange } = render();
    type(find(el, 'filter-coverage'), '0');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ coverageBelow: 0 }),
    }));
  });

  it('shows the current value', () => {
    const { el } = render(state({
      filter: { match: 'all', notPractisedInDays: 30 },
    }));
    expect((find(el, 'filter-stale') as HTMLInputElement).value).toBe('30');
  });
});

describe('the due filter', () => {
  it('turns on and back off to undefined, not false', () => {
    // An absent field is not a filter. `false` would be a filter that
    // matches nothing.
    const { el, onChange } = render();
    click(find(el, 'filter-due'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ hasDueItems: true }),
    }));
    act(() => root!.unmount()); container!.remove();

    const on = render(state({ filter: { match: 'all', hasDueItems: true } }));
    click(find(on.el, 'filter-due'));
    expect(on.onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ hasDueItems: undefined }),
    }));
  });
});

describe('the module filter', () => {
  it('offers one toggle per module, in nav order', () => {
    const { el } = render();
    const labels = [...el.querySelectorAll('[data-testid^="filter-module-"]')]
      .map(n => n.textContent);
    expect(labels).toEqual([
      'harmonic fluency', 'ear training', 'reading',
      'shapes & patterns', 'song repertoire', 'production',
    ]);
  });

  it('accumulates rather than replacing', () => {
    const { el, onChange } = render(state({
      filter: { match: 'all', modules: ['reading'] },
    }));
    click(find(el, 'filter-module-production'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ modules: ['reading', 'production'] }),
    }));
  });

  it('clears the field when the last one comes off', () => {
    // An empty array is not the same as no filter — `modules: []` would
    // read as an active filter matching nothing.
    const { el, onChange } = render(state({
      filter: { match: 'all', modules: ['reading'] },
    }));
    click(find(el, 'filter-module-reading'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ modules: undefined }),
    }));
  });
});

describe('the match switch', () => {
  it('says what it does rather than naming an operator', () => {
    expect(find(render().el, 'match-switch').textContent).toBe('match all');
    act(() => root!.unmount()); container!.remove();
    expect(find(render(state({ filter: { match: 'any' } })).el, 'match-switch').textContent)
      .toBe('match any');
  });

  it('flips', () => {
    const { el, onChange } = render();
    click(find(el, 'match-switch'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ match: 'any' }),
    }));
  });
});

// ── Reset ────────────────────────────────────────────────────────────

describe('reset', () => {
  it('is disabled at the default, so pressing it can never be a no-op', () => {
    const { el } = render();
    expect((find(el, 'reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is enabled once anything changes, and returns the default', () => {
    const { el, onChange } = render(state({
      filter: { match: 'all', accuracyBelow: 70 },
    }));
    const button = find(el, 'reset') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    click(button);
    expect(onChange).toHaveBeenCalledWith(DEFAULT_VIEW_STATE);
  });

  it('is enabled by a non-default sort alone', () => {
    const { el } = render(state({ sort: { field: 'coverage', direction: 'worst-first' } }));
    expect((find(el, 'reset') as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Mobile ───────────────────────────────────────────────────────────

describe('the mobile collapse', () => {
  it('reports its state and toggles the body', () => {
    // jsdom does not evaluate the breakpoint, so what is asserted here
    // is the MECHANISM: the toggle controls the body and says so.
    // Whether it collapses at the right width is hand-verification.
    const { el } = render();
    const toggle = find(el, 'controls-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('dashboard-controls-body');
    expect(el.querySelector('#dashboard-controls-body')).not.toBeNull();

    click(toggle);
    expect(find(el, 'controls-toggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('badges the filter count, not the switch or the sort', () => {
    // The switch narrows nothing on its own; sort reorders rather than
    // hides. Counting either would overstate how filtered the list is.
    const none = render(state({ filter: { match: 'any' } }));
    expect(none.el.querySelector('[data-testid="filter-count-badge"]')).toBeNull();
    act(() => root!.unmount()); container!.remove();

    const sorted = render(state({ sort: { field: 'recency', direction: 'best-first' } }));
    expect(sorted.el.querySelector('[data-testid="filter-count-badge"]')).toBeNull();
    act(() => root!.unmount()); container!.remove();

    const filtered = render(state({
      filter: { match: 'any', accuracyBelow: 70, hasDueItems: true },
    }));
    expect(find(filtered.el, 'filter-count-badge').textContent).toBe('2');
  });
});

describe('collapse all', () => {
  const ALL = ['harmonic-fluency', 'ear-training', 'reading',
    'shapes-and-patterns', 'repertoire', 'production'];

  it('collapses every module in one press', () => {
    const { el, onChange } = render();
    click(find(el, 'collapse-all'));
    const next = onChange.mock.calls[0][0] as DashboardViewState;
    expect([...next.collapsedModules].sort()).toEqual([...ALL].sort());
  });

  it('expands them all when they are already folded', () => {
    const { el, onChange } = render(state({ collapsedModules: new Set(ALL) }));
    expect(find(el, 'collapse-all').textContent).toBe('expand all');
    click(find(el, 'collapse-all'));
    expect((onChange.mock.calls[0][0] as DashboardViewState).collapsedModules.size)
      .toBe(0);
  });

  it('still reads "collapse all" when only some are folded', () => {
    // Half-collapsed is not folded. A button that said "uncollapse all" here
    // would expand two and leave four, which is not what it said.
    const { el } = render(state({ collapsedModules: new Set(['reading']) }));
    expect(find(el, 'collapse-all').textContent).toBe('collapse all');
  });

  it('clears deeper expansion when folding', () => {
    // A branch left open inside a collapsed module is invisible state
    // that reappears on expand, having moved without being touched.
    const { el, onChange } = render(state({
      expanded: new Set(['reading~0', 'reading~0.2']),
    }));
    click(find(el, 'collapse-all'));
    expect((onChange.mock.calls[0][0] as DashboardViewState).expanded.size).toBe(0);
  });

  it('is not the same button as reset', () => {
    // Reset returns to submodule depth, which is the opposite of what
    // folding is for.
    const { el } = render();
    expect(find(el, 'collapse-all')).not.toBe(find(el, 'reset'));
    expect((find(el, 'reset') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the nav-order default', () => {
  it('offers it as a field, first', () => {
    const { el } = render();
    const fields = [...el.querySelectorAll('[data-testid^="sort-"]')]
      .filter(n => n.getAttribute('data-testid') !== 'sort-direction')
      .map(n => n.textContent);
    expect(fields).toEqual(['nav order', 'accuracy', 'coverage', 'recency']);
  });

  it('marks it active at the default view', () => {
    expect(find(render().el, 'sort-natural').getAttribute('data-active')).toBe('true');
  });

  it('disables the direction control under it', () => {
    // "Worst first" of nothing is not a question. Disabled rather than
    // hidden, so picking a sort field does not shift the pills sideways
    // under the finger about to press one.
    const natural = render();
    const button = find(natural.el, 'sort-direction') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('direction');
    act(() => root!.unmount()); container!.remove();

    const sorted = render(state({ sort: { field: 'accuracy', direction: 'worst-first' } }));
    expect((find(sorted.el, 'sort-direction') as HTMLButtonElement).disabled).toBe(false);
  });
});
