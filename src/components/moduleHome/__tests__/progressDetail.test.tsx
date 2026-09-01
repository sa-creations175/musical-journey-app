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
import { TIER_BAR_CLASS, TIER_LABEL, type Tier } from '../../../lib/tier';
import { placeItems, columnItems } from '../placeItems';
import {
  AS_DECLARED, HORIZONTAL, TRANSPOSED, VERTICAL, layoutField, orientationField,
  viewsAgree,
  type VerticalViewProps,
  type AxisSpec, type GridSpec,
} from '../axis';
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

/**
 * As `render`, but with the remembered store WIRED — reads come out of
 * a map the test owns and writes go back into it, which is what the
 * page's `useAxisViews` does. A stub that only records writes cannot
 * show the grid actually turning.
 */
async function renderRemembering(
  remembered: Record<string, string>,
  grid: GridSpec | null = GRID,
): Promise<{ el: HTMLDivElement; wrote: Array<[string, string]> }> {
  const wrote: Array<[string, string]> = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const draw = () =>
    root!.render(
      <ProgressDetail
        categoryLabel="Key signatures"
        items={ITEMS}
        grid={grid}
        accentHex="#6f4a2f"
        now={NOW}
        viewFor={f => remembered[f] ?? null}
        onViewChange={(f, v) => {
          wrote.push([f, v]);
          remembered[f] = v;
          act(() => { draw(); });
        }}
        onClose={() => {}}
      />,
    );
  await act(async () => { draw(); });
  return { el: container, wrote };
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
    expect(detail.textContent).not.toContain('not practiced yet');
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

describe('the legend under the grid', () => {
  const legendEntries = (el: HTMLElement) =>
    [...el.querySelectorAll('[data-legend-tier]')];

  it('names the six states plus stale, in reading order', async () => {
    const el = await render();
    expect(legendEntries(el).map(li => li.getAttribute('data-legend-tier'))).toEqual([
      'untouched', 'started', 'needsWork', 'developing', 'fluent', 'mastered', 'stale',
    ]);
  });

  it('shows each tier its OWN name, not a word of its own', async () => {
    const el = await render();
    for (const li of legendEntries(el)) {
      const t = li.getAttribute('data-legend-tier') as Tier;
      expect(li.textContent).toContain(TIER_LABEL[t]);
    }
  });

  it('paints each swatch with the class its cells paint with', async () => {
    // THE RULE. A legend that spelled its own colours would pass a test
    // that only checked the swatch was coloured; this compares it to
    // the map the grid cell reads, so the two cannot drift.
    const el = await render();
    for (const li of legendEntries(el)) {
      const t = li.getAttribute('data-legend-tier') as Tier;
      const swatch = li.querySelector('span[aria-hidden]')!;
      for (const cls of TIER_BAR_CLASS[t].split(' ')) {
        expect(swatch.className).toContain(cls);
      }
    }
  });

  it('is not drawn for a category with no grid to explain', async () => {
    const el = await render(ITEMS, null);
    expect(el.querySelector('[data-testid="tier-legend"]')).toBeNull();
  });
});

describe('which way up the grid is drawn', () => {
  const turn = () =>
    container!.querySelector('[data-testid="grid-orientation"]') as HTMLButtonElement | null;
  const rows = (el: HTMLElement) =>
    [...el.querySelectorAll('[data-testid="grid-row"]')].map(r => r.getAttribute('data-row'));

  it('draws the declared orientation when nothing is remembered', async () => {
    const el = await render();
    expect(columns(el)).toEqual([...ODD_COLUMNS]);
    expect(rows(el)).toEqual(['major', 'minor']);
    expect(turn()!.getAttribute('data-transposed')).toBe('false');
  });

  it('swaps the axes when the choice is remembered', async () => {
    const { el } = await renderRemembering({
      [orientationField('Key signatures')]: TRANSPOSED,
    });
    // The SAME two lists, each on the other axis. Not a re-sort.
    expect(columns(el)).toEqual(['major', 'minor']);
    expect(rows(el)).toEqual([...ODD_COLUMNS]);
  });

  it('turns on a press and turns back on the next one', async () => {
    const { el, wrote } = await renderRemembering({});
    await act(async () => { turn()!.click(); });
    expect(columns(el)).toEqual(['major', 'minor']);

    await act(async () => { turn()!.click(); });
    expect(columns(el)).toEqual([...ODD_COLUMNS]);

    // Written under this category's own key, so another category's
    // grid does not turn with it.
    expect(wrote.map(([f]) => f))
      .toEqual([orientationField('Key signatures'), orientationField('Key signatures')]);
    expect(wrote.map(([, v]) => v)).toEqual([TRANSPOSED, AS_DECLARED]);
  });

  it('places every item it placed before, on either orientation', async () => {
    // THE PROPERTY THAT MAKES IT DISPLAY-ONLY. A turn that dropped an
    // item into the tail would be a filter wearing a rotation's coat.
    const flat = await render();
    const before = flat.querySelectorAll('[data-testid="grid-cell"]').length;
    const tailBefore = flat.querySelectorAll('[data-testid="tail-item"]').length;
    if (root) await act(async () => root!.unmount());
    container?.remove();

    const { el } = await renderRemembering({
      [orientationField('Key signatures')]: TRANSPOSED,
    });
    expect(el.querySelectorAll('[data-testid="grid-cell"]').length).toBe(before);
    expect(el.querySelectorAll('[data-testid="tail-item"]').length).toBe(tailBefore);
  });

  it('keeps the axis-view toggle with its axis when the grid turns', async () => {
    // The key axis carries two orderings. Turning the grid used to take
    // the toggle off screen with the axis it belonged to.
    const { el } = await renderRemembering({
      [orientationField('Key signatures')]: TRANSPOSED,
    });
    expect(el.querySelector('[data-testid="axis-view-odd"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="axis-view-reversed"]')).not.toBeNull();
  });

  it('is not offered where there is nothing to swap', async () => {
    // One axis, so no second one to trade places with. A 12-wide strip
    // turned 12-tall would be a different picture, not the same one.
    await render(ITEMS, { columns: columnAxis });
    expect(turn()).toBeNull();
  });

  it('is not offered for a category with no grid at all', async () => {
    await render(ITEMS, null);
    expect(turn()).toBeNull();
  });

  it('has no name yet — Silas writes it', async () => {
    // Pinned so a placeholder cannot arrive by accident: the control is
    // there and pressable, and the word is his.
    const el = await render();
    expect(el.querySelector('[data-testid="grid-orientation"]')).not.toBeNull();
    expect(turn()!.textContent).toBe('');
  });
});

describe('a grid split by its rows', () => {
  /**
   * The shape reading's note grid has: the rows do not share the
   * columns' MEANING, so each row becomes its own table with its own
   * headers and the label function is told which group it is drawing.
   */
  const SPLIT: GridSpec = {
    columns: {
      ...columnAxis,
      views: [columnAxis.views[0]],
      labelFor: (v, group) => `${String(group)}-${String(v)}`,
      // Two of the four, adjacent in the declared order — so "framed"
      // and "every column" are distinguishable.
      inFrame: v => v === 'a' || v === 'd',
    },
    rows: rowAxis,
    splitRows: true,
  };

  const tables = (el: HTMLElement) =>
    [...el.querySelectorAll('[data-testid="progress-grid"]')];

  it('draws one table per row value, each naming its group', async () => {
    const el = await render(ITEMS, SPLIT);
    expect(tables(el).map(t => t.getAttribute('data-group')))
      .toEqual(['major', 'minor']);
    expect([...el.querySelectorAll('[data-testid="grid-caption"]')]
      .map(c => c.textContent)).toEqual(['major', 'minor']);
  });

  it('labels the same column differently in each table', async () => {
    // THE REASON THE SPLIT EXISTS. One header over both rows could only
    // print the coordinate; two can each say what it means there.
    const el = await render(ITEMS, SPLIT);
    const headers = tables(el).map(t =>
      [...t.querySelectorAll('[data-testid="grid-column"]')].map(c => c.textContent));
    expect(headers[0]).toEqual(['major-c', 'major-a', 'major-d', 'major-b']);
    expect(headers[1]).toEqual(['minor-c', 'minor-a', 'minor-d', 'minor-b']);
  });

  it('places every item it placed unsplit, and keeps the tail', async () => {
    const el = await render(ITEMS, SPLIT);
    const cells = [...el.querySelectorAll('[data-testid="grid-cell"]')]
      .map(c => c.getAttribute('data-cell'));
    expect(cells.sort()).toEqual(
      ['a', 'b', 'c', 'd'].flatMap(k => ['major', 'minor'].map(m => `${k}|${m}`)).sort(),
    );
    expect(el.querySelectorAll('[data-testid="tail-item"]')).toHaveLength(3);
  });

  it('rules off the framed columns and only those', async () => {
    const el = await render(ITEMS, SPLIT);
    const framed = [...tables(el)[0].querySelectorAll('[data-testid="grid-frame-cell"]')]
      .filter(c => c.getAttribute('data-framed') === 'true')
      .map(c => c.getAttribute('data-column'));
    expect(framed).toEqual(['a', 'd']);
  });

  it('draws no frame row where the axis declares no frame', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="grid-frame"]')).toBeNull();
  });

  it('cannot be turned — the rows are already separate tables', async () => {
    const el = await render(ITEMS, SPLIT);
    expect(el.querySelector('[data-testid="grid-orientation"]')).toBeNull();
  });
});

describe('the layout toggle', () => {
  /** A stand-in for reading's ladder: any component the category
   *  supplies, handed the items and the way to open one. */
  function Alt({ items, onOpen }: VerticalViewProps) {
    return (
      <button
        type="button"
        data-testid="alt-view"
        data-count={items.length}
        onClick={() => onOpen(items[0])}
      />
    );
  }

  const WITH_ALT: GridSpec = { ...GRID, vertical: Alt };

  it('is not offered by a category with no second drawing', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="grid-layout"]')).toBeNull();
  });

  it('opens horizontal the first time, with nothing remembered', async () => {
    const el = await render(ITEMS, WITH_ALT);
    expect(el.querySelector('[data-testid="grid-layout"]')!.getAttribute('data-layout'))
      .toBe(HORIZONTAL);
    expect(el.querySelector('[data-testid="progress-grid"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="alt-view"]')).toBeNull();
  });

  it('opens on what was last used', async () => {
    const { el } = await renderRemembering(
      { [layoutField('Key signatures')]: VERTICAL }, WITH_ALT,
    );
    expect(el.querySelector('[data-testid="alt-view"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="progress-grid"]')).toBeNull();
  });

  it('remembers per category, under a key no axis can collide with', async () => {
    const { el, wrote } = await renderRemembering({}, WITH_ALT);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-testid="grid-layout-vertical"]')!.click();
    });
    expect(wrote).toEqual([[layoutField('Key signatures'), VERTICAL]]);
    expect(layoutField('Key signatures')).toContain('Key signatures');
    expect(el.querySelector('[data-testid="alt-view"]')).not.toBeNull();

    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-testid="grid-layout-horizontal"]')!.click();
    });
    expect(wrote[1]).toEqual([layoutField('Key signatures'), HORIZONTAL]);
    expect(el.querySelector('[data-testid="progress-grid"]')).not.toBeNull();
  });

  it('hands the vertical view every item in the category', async () => {
    // The tail included — a second drawing is not a second placement,
    // and what it can show is its own business.
    const { el } = await renderRemembering(
      { [layoutField('Key signatures')]: VERTICAL }, WITH_ALT,
    );
    expect(el.querySelector('[data-testid="alt-view"]')!.getAttribute('data-count'))
      .toBe(String(ITEMS.length));
  });

  it('opens an item from the vertical view, as a cell does', async () => {
    const { el } = await renderRemembering(
      { [layoutField('Key signatures')]: VERTICAL }, WITH_ALT,
    );
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-testid="alt-view"]')!.click();
    });
    expect(el.querySelector('[data-testid="item-detail"]')).not.toBeNull();
  });
});
