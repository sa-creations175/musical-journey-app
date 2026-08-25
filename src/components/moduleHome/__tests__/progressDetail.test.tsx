// @vitest-environment jsdom
/**
 * The progress-detail surface: grid, tail, view toggle, item.
 *
 * The four things worth pinning are the four that pass on a wrong
 * implementation if tested loosely — an axis derived from the items, a
 * grid that drops its tail, a toggle that filters rather than reorders,
 * and a strip drawn from a summary.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ProgressDetail from '../ProgressDetail';
import { placeItems, columnItems } from '../placeItems';
import { viewsAgree, type AxisSpec, type GridSpec } from '../axis';
import type { SkillRecord } from '../../../modules/skills/registry';

const NOW = Date.UTC(2026, 7, 24, 12);
const DAY = 86400000;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function rec(
  itemId: string,
  axis: Record<string, string | number> | undefined,
  window: SkillRecord['window'] = [],
): SkillRecord {
  return {
    skillId: `reading:test:${itemId}`,
    moduleId: 'reading',
    moduleLabel: 'reading',
    moduleRoute: '/reading',
    itemId,
    name: `name of ${itemId}`,
    category: 'Key signatures',
    skillType: 'theory',
    currentTier: 'developing',
    freshness: 'fresh',
    daysSince: 1,
    lastPracticed: NOW - DAY,
    totalTime: 0,
    tags: [],
    window,
    ...(axis ? { axis } : {}),
  };
}

/**
 * A deliberately ODD column order.
 *
 * Not alphabetical, not the order the items are supplied in, and not
 * its own reverse — so a grid that sorted, or that collected values off
 * the items, differs from this in a way the assertion can see. A test
 * using the natural order cannot fail.
 */
const ODD_COLUMNS = ['c', 'a', 'd', 'b'] as const;

const columnAxis: AxisSpec = {
  field: 'key',
  label: 'key',
  views: [
    { id: 'odd', label: 'odd', values: ODD_COLUMNS },
    // Same four values, reordered — that is what makes the toggle a
    // display choice rather than a filter.
    { id: 'reversed', label: 'reversed', values: ['b', 'd', 'a', 'c'] },
  ],
};

const rowAxis: AxisSpec = {
  field: 'mode',
  label: 'mode',
  views: [{ id: 'default', label: 'mode', values: ['major', 'minor'] }],
};

const GRID: GridSpec = { columns: columnAxis, rows: rowAxis };

/** Eight placed items plus three with no coordinates — the tail. */
const ITEMS: SkillRecord[] = [
  ...['a', 'b', 'c', 'd'].flatMap(k => ['major', 'minor'].map(
    m => rec(`${k}-${m}`, { key: k, mode: m }),
  )),
  rec('formula-1', undefined),
  rec('formula-2', undefined),
  // Carries coordinates, but a key the axis does not list. Tail too:
  // extending the axis to fit would make the grid a picture of the
  // data rather than a claim about a known set.
  rec('offaxis', { key: 'z', mode: 'major' }),
];

async function render(
  items: SkillRecord[] = ITEMS,
  grid: GridSpec | null = GRID,
  viewId: string | null = null,
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ProgressDetail
        categoryLabel="Key signatures"
        items={items}
        grid={grid}
        accentHex="#6f4a2f"
        now={NOW}
        viewFor={() => viewId}
        onViewChange={() => {}}
        onClose={() => {}}
      />,
    );
  });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const columns = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-testid="grid-column"]')]
    .map(c => c.getAttribute('data-column'));

describe('the axis order comes from the passed list', () => {
  it('follows a deliberately odd order rather than sorting', async () => {
    const el = await render();
    expect(columns(el)).toEqual([...ODD_COLUMNS]);
    // The three things it must NOT be.
    expect(columns(el)).not.toEqual([...ODD_COLUMNS].sort());
    expect(columns(el)).not.toEqual([...ODD_COLUMNS].reverse());
  });

  it('ignores the order the items arrive in', async () => {
    // Same items, shuffled. A grid collecting values off the records
    // would follow this and change; the passed list does not.
    const shuffled = [...ITEMS].reverse();
    const el = await render(shuffled);
    expect(columns(el)).toEqual([...ODD_COLUMNS]);
  });

  it('keeps a column the items never fill', async () => {
    // 'd' has no items here. The column stays, because the axis is a
    // claim about a known set — dropping it would make an untouched
    // key invisible, which is the opposite of what this page is for.
    const el = await render(ITEMS.filter(i => i.axis?.key !== 'd'));
    expect(columns(el)).toContain('d');
    expect(el.querySelectorAll('[data-testid="grid-gap"]').length).toBeGreaterThan(0);
  });
});

describe('a category with a tail renders BOTH halves', () => {
  it('shows the grid and the list, and loses nothing', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="progress-grid"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="progress-tail"]')).not.toBeNull();

    const inGrid = el.querySelectorAll('[data-testid="grid-cell"]').length;
    const inTail = el.querySelectorAll('[data-testid="tail-item"]').length;
    // EVERY item is somewhere. A grid-only page passes a cell count and
    // still drops the three.
    expect(inGrid + inTail).toBe(ITEMS.length);
    expect(inTail).toBe(3);
  });

  it('names the tail rather than leaving it unexplained', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="progress-tail"]')!.textContent)
      .toContain('3 items with no');
  });

  it('renders a flat list and no grid when the category has no axes', async () => {
    const el = await render(ITEMS, null);
    expect(el.querySelector('[data-testid="progress-grid"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="tail-item"]')).toHaveLength(ITEMS.length);
  });
});

describe('the view toggle changes display only', () => {
  it('reorders the columns', async () => {
    const el = await render(ITEMS, GRID, 'reversed');
    expect(columns(el)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('selects the SAME items for a column in either view', () => {
    // The property the toggle rests on. Compared per column, because a
    // whole-grid comparison passes on a toggle that swapped two
    // columns' contents while keeping the totals.
    const a = placeItems(ITEMS, GRID, columnAxis.views[0], rowAxis.views[0]);
    const b = placeItems(ITEMS, GRID, columnAxis.views[1], rowAxis.views[0]);
    for (const key of ODD_COLUMNS) {
      const inA = columnItems(a.grid!, key).map(i => i.itemId);
      const inB = columnItems(b.grid!, key).map(i => i.itemId);
      expect(inB, key).toEqual(inA);
      expect(inA.length).toBeGreaterThan(0);
    }
    // And the tail is unaffected by how the grid is ordered.
    expect(b.tail.map(i => i.itemId)).toEqual(a.tail.map(i => i.itemId));
  });

  it('refuses a view that holds a different set', () => {
    // `viewsAgree` is what would catch a "view" that quietly filtered.
    expect(viewsAgree(columnAxis)).toBe(true);
    expect(viewsAgree({
      ...columnAxis,
      views: [
        { id: 'all', label: 'all', values: ['a', 'b', 'c', 'd'] },
        { id: 'some', label: 'some', values: ['a', 'b'] },
      ],
    })).toBe(false);
  });

  it('falls back to the first view when the remembered id is gone', async () => {
    const el = await render(ITEMS, GRID, 'a-view-that-no-longer-exists');
    expect(columns(el)).toEqual([...ODD_COLUMNS]);
  });
});

describe('an item opens onto its real reps', () => {
  it('draws the strip from window rows, not from the tier', async () => {
    // ASYMMETRIC outcomes: a strip reconstructed from a summary would
    // have to guess an order, and could not produce this one.
    const withReps = rec('a-major', { key: 'a', mode: 'major' }, [
      { correct: true, timestamp: NOW },
      { correct: false, timestamp: NOW - DAY },
      { correct: false, timestamp: NOW - 2 * DAY },
    ]);
    const el = await render([withReps]);
    await act(async () => {
      (el.querySelector('[data-testid="grid-cell"]') as HTMLElement).click();
    });
    const detail = el.querySelector('[data-testid="item-detail"]')!;
    const outcomes = [...detail.querySelectorAll('[data-tick]')]
      .map(t => (t as HTMLElement).dataset.outcome)
      .filter(o => o !== 'empty');
    // Oldest first in the strip, so the reverse of the window order.
    expect(outcomes).toEqual(['wrong', 'wrong', 'right']);
    expect(detail.querySelector('[data-testid="item-proven"]')!.textContent)
      .toBe('1 of 3');
  });

  it('says "no reps recorded" rather than guessing when the window is empty', async () => {
    const el = await render([rec('a-major', { key: 'a', mode: 'major' })]);
    await act(async () => {
      (el.querySelector('[data-testid="grid-cell"]') as HTMLElement).click();
    });
    const detail = el.querySelector('[data-testid="item-detail"]')!;
    expect(detail.textContent).toContain('no reps recorded');
    expect(detail.textContent).not.toContain('not practised yet');
  });

  it('opens from the tail as well as from the grid', async () => {
    const el = await render();
    await act(async () => {
      (el.querySelector('[data-testid="tail-item"]') as HTMLElement).click();
    });
    expect(el.querySelector('[data-testid="item-detail"]')!.getAttribute('data-item'))
      .toBe('formula-1');
  });
});
