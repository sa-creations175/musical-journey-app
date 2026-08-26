// @vitest-environment jsdom
/**
 * The detail block mirrors the chip row.
 *
 * =====================================================================
 * WHAT THIS PROVES: which categories have a block, which of them are
 * expanded, that expanding is per category and unbounded, and that a
 * category with no coordinates renders its flat list rather than an
 * invented grid.
 *
 * WHAT IT CANNOT: how a twenty-four-column table reads on a phone.
 * jsdom has no layout engine — that needs Silas's eye.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import CategoryDetailStack, {
  detailAnchorId, type DetailEntry,
} from '../CategoryDetailStack';
import type { SkillRecord } from '../../../modules/skills/registry';
import type { GridSpec } from '../axis';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const record = (itemId: string, axis?: Record<string, string | number>): SkillRecord => ({
  skillId: `s:${itemId}`,
  moduleId: 'harmonic-fluency',
  moduleLabel: 'Harmonic Fluency',
  moduleRoute: '/harmonic-fluency',
  itemId,
  name: itemId,
  category: 'Alpha',
  skillType: 'flashcard',
  currentTier: null,
  freshness: 'fresh',
  daysSince: 0,
  lastPracticed: null,
  totalTime: 0,
  tags: [],
  window: [],
  ...(axis ? { axis } : {}),
} as unknown as SkillRecord);

const GRID: GridSpec = {
  columns: { field: 'col', label: 'col', views: [{ id: 'd', label: 'col', values: ['x', 'y'] }] },
};

const ENTRIES: DetailEntry[] = [
  { key: 'a', label: 'Alpha', grid: GRID, items: [record('a1', { col: 'x' })] },
  { key: 'b', label: 'Beta', grid: null, items: [record('b1'), record('b2')] },
  { key: 'c', label: 'Gamma', grid: GRID, items: [] },
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

function render(expanded: Set<string>) {
  const toggled: string[] = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const draw = (open: Set<string>) => {
    act(() => {
      root!.render(
        <CategoryDetailStack
          entries={ENTRIES}
          expanded={open}
          onToggle={k => { toggled.push(k); }}
          accentHex="#7a5aa8"
          now={Date.now()}
          viewFor={() => null}
          onViewChange={() => {}}
        />,
      );
    });
  };
  draw(expanded);
  return { toggled, draw };
}

const blocks = () =>
  [...host!.querySelectorAll('[data-testid="category-detail"]')];
const openKeys = () =>
  blocks().filter(b => b.getAttribute('data-expanded') === 'true')
    .map(b => b.getAttribute('data-detail-key'));

describe('the stack', () => {
  it('gives one block per lit category, in the order passed', () => {
    render(new Set(['a']));
    expect(blocks().map(b => b.getAttribute('data-detail-key')))
      .toEqual(['a', 'b', 'c']);
  });

  it('expands only what it is told to, and collapses the rest', () => {
    // The page's own category is expanded; everything else lit is a
    // collapsed header. Nothing renders fifteen grids uninvited.
    render(new Set(['a']));
    expect(openKeys()).toEqual(['a']);
    expect(host!.querySelectorAll('[data-testid="progress-grid"]')).toHaveLength(1);
    expect(host!.querySelectorAll('[data-testid="category-detail-toggle"]'))
      .toHaveLength(2);
  });

  it('holds any number open at once', () => {
    // Comparing two categories is what lighting a second chip is FOR;
    // an accordion that closed the last one would make it impossible.
    const { draw } = render(new Set(['a']));
    draw(new Set(['a', 'b', 'c']));
    expect(openKeys()).toEqual(['a', 'b', 'c']);
  });

  it('reports the category pressed, expanded or collapsed', () => {
    const { toggled } = render(new Set(['a']));
    act(() => {
      (host!.querySelector('[data-detail-key="b"] [data-testid="category-detail-toggle"]') as HTMLElement).click();
    });
    // And an expanded block's own close reads as collapse.
    act(() => {
      ([...host!.querySelectorAll('button')]
        .find(x => (x.textContent ?? '').trim() === 'close') as HTMLElement).click();
    });
    expect(toggled).toEqual(['b', 'a']);
  });

  it('renders a flat list where the category has no coordinates', () => {
    // Three of the fifteen are hand-written and vary by nothing a grid
    // could show. That is the answer for them, not a gap.
    render(new Set(['b']));
    const flat = host!.querySelector('[data-detail-key="b"]')!;
    expect(flat.querySelector('[data-testid="progress-grid"]')).toBeNull();
    expect(flat.textContent).toContain('Beta');
  });

  it('anchors every block by a name both sides compute', () => {
    render(new Set(['a']));
    for (const key of ['a', 'b', 'c']) {
      expect(host!.querySelector(`#${detailAnchorId(key)}`), key).not.toBeNull();
    }
  });
});
