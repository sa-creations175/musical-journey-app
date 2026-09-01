// @vitest-environment jsdom
/**
 * The one summary shell, and the sweep that keeps it one.
 *
 * =====================================================================
 * WHAT THIS CANNOT SAY. jsdom has no layout, so nothing here proves a
 * tile is thirty pixels tall rather than eighty. What it proves is the
 * thing that MAKES it thin — one line, label then value on the same
 * baseline — and that no surface draws its own.
 *
 * How the row reads against the dark green Progress Details band lower
 * on the page is Silas's eye.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import SummaryTiles, { TILE_BOX } from '../SummaryTiles';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

function render(tiles: Parameters<typeof SummaryTiles>[0]['tiles']) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<SummaryTiles tiles={tiles} />); });
  return host!;
}

const tiles = () => [...host!.querySelectorAll('[data-testid^="summary-tile"]')]
  .filter(el => el.getAttribute('data-label') !== null);

describe('a tile', () => {
  it('reads label then value, on one line', () => {
    // The value used to sit ABOVE its label, which is what made these
    // eighty pixels tall.
    const el = render([{ label: 'Total', value: '7m' }]);
    const tile = el.querySelector('[data-testid="summary-tile"]')!;
    expect(tile.textContent).toBe('Total7m');
    const parts = [...tile.children].map(c => c.textContent);
    expect(parts).toEqual(['Total', '7m']);
  });

  it('is drawn in the body font, never a second typeface', () => {
    // A mono face for four numbers is what made one module read as a
    // different product.
    const el = render([{ label: 'Total', value: '7m' }]);
    expect(el.innerHTML).not.toContain('font-mono');
  });

  it('says an absence quietly rather than printing a zero', () => {
    const el = render([{ label: 'Total', value: 'none yet', muted: true }]);
    const tile = el.querySelector('[data-testid="summary-tile"]')!;
    expect(tile.getAttribute('data-muted')).toBe('true');
    expect(tile.querySelector('[data-testid="summary-tile-value"]')!.className)
      .toContain('text-neutral-400');
  });

  it('is a button only where it is also a door', () => {
    const plain = render([{ label: 'Total', value: '7m' }]);
    expect(plain.querySelector('button')).toBeNull();
    act(() => { root!.unmount(); });
    host!.remove();

    let opened = 0;
    const door = render([{ label: 'Glossary', value: '0/199', onClick: () => { opened += 1; } }]);
    const button = door.querySelector('button')!;
    act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opened).toBe(1);
  });

  it('draws nothing at all for an empty row', () => {
    const el = render([]);
    expect(el.querySelector('[data-testid="summary-tiles"]')).toBeNull();
  });

  it('keeps every tile it is given, in order', () => {
    render([
      { label: 'Fluent+', value: '0 / 288' },
      { label: 'Total', value: 'none yet', muted: true },
      { label: 'Last practiced', value: 'never', muted: true },
    ]);
    expect(tiles().map(t => t.getAttribute('data-label')))
      .toEqual(['Fluent+', 'Total', 'Last practiced']);
  });
});

// =====================================================================
// The sweep
// =====================================================================

const SOURCES = import.meta.glob('../../../**/*.{ts,tsx}', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;

/** Every surface that shows a summary row. Adding one means adding it
 *  here, which is the moment of thought this sweep exists to force. */
const SURFACES = [
  'modules/shapes-and-patterns/ShapesAndPatternsSection.tsx',
  'modules/production/ProductionOverview.tsx',
];

/** The glob's keys are relative and normalised, so a file is found by
 *  the tail of its path rather than by guessing the prefix. */
function source(file: string): string {
  const key = Object.keys(SOURCES).find(k => k.endsWith(`/${file}`) || k.endsWith(file));
  expect(key, `no source for ${file}`).toBeTypeOf('string');
  return SOURCES[key!];
}

describe('one shell, not a copy per module', () => {
  it('reads its own source', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(200);
  });

  it('is the only file that draws a tile', () => {
    // A fifth module written later cannot quietly grow its own look:
    // the box exists in exactly one place, and a hand-rolled copy would
    // have to retype it — which is what this catches.
    // The second half of the box, which is a whole literal in the
    // source and distinctive enough that nothing else in the app
    // happens to carry it.
    const fragment = 'border-black/[0.07] dark:border-white/10 px-2.5 py-1 leading-5';
    expect(TILE_BOX, 'the fragment is really part of the box')
      .toContain(fragment);
    const drawers = Object.entries(SOURCES)
      .filter(([key]) => !key.includes('__tests__'))
      .filter(([, src]) => src.includes(fragment))
      .map(([key]) => key.slice(key.lastIndexOf('/') + 1));
    expect(drawers).toEqual(['SummaryTiles.tsx']);
  });

  it('is what every surface with a summary row reaches for', () => {
    for (const file of SURFACES) {
      expect(source(file), file).toMatch(/import SummaryTiles from/);
    }
  });

  it('left no module its own tile component behind', () => {
    // Production's `Stat` was the second look. It is gone, and this is
    // what says so.
    expect(source('modules/production/ProductionOverview.tsx'))
      .not.toContain('function Stat(');
  });
});
