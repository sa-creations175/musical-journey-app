// @vitest-environment jsdom
/**
 * Five things Silas found by using the three grids.
 *
 * =====================================================================
 * The gutter was one width but the names were right-aligned inside it,
 * so `C` began further right than `B♭` and the column's own left edge
 * wobbled down the page. Only scales could be turned. Voice leading's
 * cells were a twelfth of the screen wide and hyphenated "Not Started"
 * into "Not Start-ed" in every one. Clicking a cell put Progress
 * Details at the BOTTOM of the screen. And a target row read as plain
 * text, with "Total time — (— practice, — testing)" under it saying
 * nothing twice.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, type Root } from 'react-dom/client';
// THE PANEL READS THE GLOBAL INSTRUMENT, so a surface that shows it
// has to be mounted inside the provider the app mounts it inside.
import { InstrumentProvider } from '../../../lib/instrumentContext';
import ScaleDrills from '../ScaleDrills';
import ChordShapeDrills from '../ChordShapeDrills';
import VoiceLeadingDrills from '../VoiceLeadingDrills';
import { LAYOUTS, DEFAULT_LAYOUT } from '../KeyedGrid';
import { GRID_CELL_MIN } from '../BandCell';
import { db } from '../../../lib/db';

vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));
vi.mock('../../../components/Toaster', () => ({
  useToast: () => ({ toast: () => {} }),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
/** Where the page was asked to scroll to, and how. */
let scrolled: { top: number; behavior?: string } | null = null;

beforeEach(async () => {
  await db.spacingState.clear();
  await db.drillSessions.clear();
  await db.drillSkills.clear();
  await db.drillTypes.clear();
  scrolled = null;
  window.scrollTo = ((opts: { top: number; behavior?: string }) => {
    scrolled = opts;
  }) as typeof window.scrollTo;
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
  document.querySelectorAll('[data-app-chrome="top"]').forEach(e => e.remove());
});

async function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // THE PAGE ROUTES NOW — its add button opens a movement's own page —
  // so it needs a router around it. Rendering it bare threw where the
  // subject is the grid, which is not what these are about.
  await act(async () => {
    root!.render(
      <InstrumentProvider><MemoryRouter>{node}</MemoryRouter></InstrumentProvider>,
    );
  });
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host;
}

const buttons = () => [...document.body.querySelectorAll('button')];
const gutters = () => [...document.body.querySelectorAll('[data-testid="grid-gutter"]')];
const layoutToggles = () =>
  [...document.body.querySelectorAll('[data-testid="layout-toggle"]')];
const targetRows = () =>
  [...document.body.querySelectorAll('[data-testid="detail-target"]')];
const statusCells = () => buttons().filter(
  b => /(Not Started|Started|Needs Work|Developing|Fluent|Mastered)/
    .test(b.textContent ?? ''),
);

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

const press = async (label: string) => {
  const b = buttons().find(x => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no button "${label}"`);
  await click(b);
};

const GRIDS: Array<[string, React.ReactNode]> = [
  ['scales', <ScaleDrills key="s" />],
  ['chord shapes', <ChordShapeDrills key="c" scope="all" onScopeChange={() => {}} />],
  ['voice leading', <VoiceLeadingDrills key="v" />],
];

// ---------------------------------------------------------------------
// 1. The key names share a left edge
// ---------------------------------------------------------------------

describe('the key names are left-justified', () => {
  it.each(GRIDS)('on %s', async (_name, node) => {
    await render(node);
    const withText = gutters().filter(g => (g.textContent ?? '').trim() !== '');
    expect(withText.length).toBeGreaterThan(0);
    for (const g of withText) {
      // RIGHT-ALIGNING THEM was the bug: a one-character name started
      // further right than a two-character one, so the left edge of the
      // column wobbled. The gap to the tile varies instead, which is
      // the accidental's business.
      expect(g.className).toContain('text-left');
      expect(g.className).not.toContain('text-right');
    }
  });

  it('and a flat-sign name starts where a bare letter starts', async () => {
    await render(<ScaleDrills />);
    const named = gutters().filter(g => (g.textContent ?? '').trim() !== '');
    const flat = named.find(g => (g.textContent ?? '').includes('♭'))!;
    const bare = named.find(g => (g.textContent ?? '').trim() === 'C')!;
    expect(flat.className).toBe(bare.className);
  });
});

// ---------------------------------------------------------------------
// 2. Every grid can be turned
// ---------------------------------------------------------------------

describe('the layout control is on every grid', () => {
  it.each(GRIDS)('on %s, all three options', async (_name, node) => {
    await render(node);
    const labels = layoutToggles().map(b => (b.textContent ?? '').trim());
    for (const [, label] of LAYOUTS) expect(labels).toContain(label);
  });

  it('and it actually turns the grid rather than doing nothing', async () => {
    await render(<VoiceLeadingDrills />);
    const before = gutters().filter(g => (g.textContent ?? '').trim() !== '').length;
    await press('12 across');
    const after = gutters().filter(g => (g.textContent ?? '').trim() !== '').length;
    // Keys down the left writes a key name per row; keys across writes
    // none down the side at all.
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
  });

  it.each(GRIDS)('and %s defaults to keys down the left', async (_name, node) => {
    await render(node);
    const pressed = layoutToggles().find(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed?.textContent?.trim()).toBe('Keys down the left');
    expect(DEFAULT_LAYOUT).toBe('keysdown');
  });
});

// ---------------------------------------------------------------------
// 3. No status word hyphenates, at any layout
// ---------------------------------------------------------------------

describe('a status word never hyphenates', () => {
  it.each(GRIDS)('on %s, in every layout', async (_name, node) => {
    await render(node);
    for (const [, label] of LAYOUTS) {
      await press(label);
      const cells = statusCells();
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) {
        // `hyphens-auto` on a ~56px square broke "Not Started" into
        // "Not Start-ed" in every cell.
        expect(c.className, label).not.toContain('hyphens-auto');
        expect(c.textContent).not.toContain('-ed');
      }
    }
  });

  it('and a tile is wide enough for the longest single word', () => {
    // "Developing" is it. Narrower than this and the cell either
    // hyphenates or overflows.
    //
    // A WHOLE CLASS, not a length to interpolate: Tailwind scans source
    // as text, so `min-w-[${value}]` is never the class it looks like
    // and the rule is never emitted. Asserted as the class so the day
    // someone "tidies" it into a value, this fails.
    expect(GRID_CELL_MIN).toBe('min-w-[4.75rem]');
  });
});

// ---------------------------------------------------------------------
// 4. The band lands at the top of the viewport
// ---------------------------------------------------------------------

describe('clicking a cell puts the band at the top of the screen', () => {
  /** A stand-in for the sticky app header, measured not declared. */
  const withChrome = (height: number) => {
    const bar = document.createElement('div');
    bar.setAttribute('data-app-chrome', 'top');
    bar.getBoundingClientRect = () => ({ height } as DOMRect);
    document.body.appendChild(bar);
  };

  it.each(GRIDS)('on %s, clear of the header', async (_name, node) => {
    withChrome(64);
    await render(node);
    // The band sits some way down a long page.
    const band = document.querySelector('[data-testid="scale-progress-details"]')!;
    band.getBoundingClientRect = () => ({ top: 900 } as DOMRect);
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });

    await click(statusCells()[0]);

    expect(scrolled).not.toBeNull();
    // 900 (from the top of the viewport) + 100 (already scrolled)
    // − 64 (the header) − 8 (a gap) = 928.
    expect(scrolled!.top).toBe(928);
    expect(scrolled!.behavior).toBe('smooth');
  });

  it('and the section reserves room below so it can get there', async () => {
    // A browser cannot scroll past the end of the document.
    await render(<ScaleDrills />);
    const band = document.querySelector('[data-testid="scale-progress-details"]')!;
    expect(band.parentElement!.className).not.toContain('min-h-[85vh]');
    await click(statusCells()[0]);
    expect(band.parentElement!.className).toContain('min-h-[85vh]');
  });
});

// ---------------------------------------------------------------------
// 5. A target row reads as a control
// ---------------------------------------------------------------------

describe('a Progress Details row exposes itself as a control', () => {
  it.each(GRIDS)('on %s', async (_name, node) => {
    await render(node);
    await click(statusCells()[0]);
    const rows = targetRows();
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    // A real button, so it takes keyboard focus.
    expect(row.tagName).toBe('BUTTON');
    expect((row as HTMLButtonElement).disabled).toBe(false);
    // A boundary, a pointer, a hover, a focus ring — without hovering.
    expect(row.className).toContain('border');
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('hover:border-fluent');
    expect(row.className).toContain('focus-visible:ring');
    // And a disclosure that says it opens.
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('the caret turns when it opens', async () => {
    await render(<ScaleDrills />);
    await click(statusCells()[0]);
    await click(targetRows()[0]);
    expect(targetRows()[0].getAttribute('aria-expanded')).toBe('true');
    expect(targetRows()[0].innerHTML).toContain('rotate-90');
  });

  it('and it takes keyboard focus', async () => {
    await render(<ScaleDrills />);
    await click(statusCells()[0]);
    const row = targetRows()[0] as HTMLButtonElement;
    row.focus();
    expect(document.activeElement).toBe(row);
  });
});

// ---------------------------------------------------------------------
// 5b. No empty time fields
// ---------------------------------------------------------------------

describe('an untouched target prints no empty time fields', () => {
  it.each(GRIDS)('on %s', async (_name, node) => {
    await render(node);
    await click(statusCells()[0]);
    const t = (document.body.textContent ?? '').replace(/\s+/g, ' ');
    // It printed "Total time — (— practice, — testing)" on the row AND
    // on the cell's roll-up line: a row of em dashes, twice.
    expect(t).not.toContain('Total time');
    expect(t).not.toContain('— practice');
    expect(t).not.toContain('— testing');
    // The row is still there and still says where it stands.
    expect(targetRows().length).toBeGreaterThan(0);
    expect(targetRows()[0].textContent).toContain('Not Started');
  });
});
