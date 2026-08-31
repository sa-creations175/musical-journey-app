// @vitest-environment jsdom
/**
 * The scales page.
 *
 * =====================================================================
 * A CELL NAMES ITS STATUS, AND CLICKING ONE OPENS NOTHING.
 *
 * It was a square shaded by time invested — which told you something
 * had happened without saying what — and tapping it opened a modal, so
 * reading one cell hid the grid you were reading it against.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ScaleDrills from '../ScaleDrills';

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ScaleDrills />); });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host;
}

const text = () => (host?.textContent ?? '');
const buttons = () => [...(host?.querySelectorAll('button') ?? [])];
const press = async (label: string) => {
  const b = buttons().find(x => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no button "${label}"`);
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
/** A hand's row carries its status and its times in the same button,
 *  so it is matched on the name it starts with. */
const pressHand = async (name: string) => {
  const b = buttons().find(x => (x.textContent ?? '').replace(/\s+/g, ' ').includes(name));
  if (!b) throw new Error(`no row for "${name}"`);
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
/** Any cell tile — they carry a status word and are pressable. */
const cells = () => buttons().filter(b => b.hasAttribute('aria-pressed')
  && /Not Started|Started|Needs Work|Developing|Fluent|Mastered/.test(b.textContent ?? ''));

describe('a cell names its status', () => {
  it('prints one of the six words on the tile', async () => {
    await render();
    expect(cells().length).toBeGreaterThan(0);
    expect(cells()[0].textContent).toMatch(
      /Not Started|Started|Needs Work|Developing|Fluent|Mastered/,
    );
  });

  it('and the retired words appear nowhere', async () => {
    await render();
    expect(text()).not.toContain('Acquired');
    expect(text()).not.toContain('In Progress');
  });
});

describe('clicking a cell fills Progress Details', () => {
  it('OPENS NO MODAL', async () => {
    await render();
    const before = document.querySelectorAll('[role="dialog"]').length;
    await act(async () => {
      cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(before);
  });

  it('replaces the empty state with the cell', async () => {
    await render();
    expect(text()).toContain('Pick a cell above and everything about it shows up here.');
    await act(async () => {
      cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).not.toContain('Pick a cell above');
    expect(text()).toContain('still counted');
  });

  it('names the three hands, always two octaves', async () => {
    await render();
    await act(async () => {
      cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).toContain('Left hand');
    expect(text()).toContain('Right hand');
    expect(text()).toContain('Both hands');
    expect(text()).toContain('Two octaves, always.');
  });

  it('the roll-up reads the counted hands, and drops one when it is taken out', async () => {
    await render();
    await act(async () => {
      cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).toContain('the furthest of the 3 hands still counted');
    await press('Edit what counts');
    await pressHand('Left hand');
    expect(text()).toContain('the furthest of the 2 hands still counted');
    expect(text()).toContain('not counted');
  });

  it('opening a hand shows the Drill button ABOVE both logs', async () => {
    await render();
    await act(async () => {
      cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await pressHand('Left hand');
    const t = text();
    expect(t).toContain('Drill left hand');
    expect(t).toContain('Practice runs');
    expect(t).toContain('Test runs');
    expect(t.indexOf('Drill left hand')).toBeLessThan(t.indexOf('Practice runs'));
    expect(t.indexOf('Practice runs')).toBeLessThan(t.indexOf('Test runs'));
  });
});

describe('the old way in is gone', () => {
  it('no hand chooser and no All Three', async () => {
    await render();
    await act(async () => {
      cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(text()).not.toContain('All Three');
    // The chooser asked which hand before anything opened; the hands
    // are now rows you open in place.
    expect(buttons().some(b => (b.textContent ?? '').trim() === 'All Three')).toBe(false);
  });
});

describe('three layouts, one set of data', () => {
  it('render the same cells', async () => {
    await render();
    const count = cells().length;
    await press('6 + 6 across');
    expect(cells().length).toBe(count);
    await press('12 across');
    expect(cells().length).toBe(count);
    await press('Keys down the left');
    expect(cells().length).toBe(count);
  });

  it('and default to keys down the left', async () => {
    await render();
    const b = buttons().find(x => (x.textContent ?? '').trim() === 'Keys down the left');
    expect(b?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('rearrange', () => {
  it('reorders the sections on the page', async () => {
    await render();
    const first = () => text().indexOf('Major Pentatonic');
    const before = first();
    await press('Rearrange');
    const downs = buttons().filter(b => b.getAttribute('aria-label') === 'Move section down');
    await act(async () => {
      downs[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(first()).not.toBe(before);
    await press('Done rearranging');
  });
});
