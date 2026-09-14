// @vitest-environment jsdom
import 'fake-indexeddb/auto';
/**
 * The chart, as the prototype behaves.
 *
 * =====================================================================
 * EVERY PATH SILAS WALKED, ASSERTED ON THE RENDERED CHART.
 *
 * Tap a cell and the card fills in; the switch puts a dot on and takes
 * it off; typing a note puts it on by itself; the dotted list follows;
 * the other modes fold. Against a real Dexie (fake-indexeddb), because
 * the marks are stored and read back, not held in component state.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ChordQualitiesChart from '../ChordQualitiesChart';
import { db } from '../../lib/db';
import { markSyncReady } from '../../lib/sync/syncReady';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 15)); });
  }
};

async function mount(props: Parameters<typeof ChordQualitiesChart>[0] = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ChordQualitiesChart {...props} />); });
  await settle();
  return host;
}

const $ = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(async () => {
  markSyncReady();
  await db.userPrefs.clear();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('on a card\'s reveal', () => {
  it('opens on the card\'s own cell, the card at the top already filled in', async () => {
    await mount({ select: { scale: 'harmonic', degree: 7 }, modesFolded: true });
    expect($('cqc-title')!.textContent).toBe('In harmonic minor, the 7 chord is diminished 7');
    expect($('cqc-in')!.textContent).toBe('In C harmonic minor:');
    expect($('cqc-example')!.textContent).toBe('B°7 · B D F A♭');
    expect($('cqc-why')!.textContent).toContain('raising the 7 turns it into diminished 7');
    expect($('cell-harmonic-7')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('starts with the other modes folded, and unfolds them', async () => {
    await mount({ select: { scale: 'natural', degree: 5 }, modesFolded: true });
    expect(($('row-dorian') as HTMLTableRowElement).hidden).toBe(true);
    await act(async () => { $('modes-toggle')!.click(); });
    expect(($('row-dorian') as HTMLTableRowElement).hidden).toBe(false);
  });
});

describe('in the diary', () => {
  it('opens on no cell, with the modes showing', async () => {
    await mount({ showTitle: false });
    expect($('chord-quality-card')).toBeNull();
    expect(($('row-dorian') as HTMLTableRowElement).hidden).toBe(false);
  });
});

describe('the cells', () => {
  it('shows each chord computed from the scale', async () => {
    await mount();
    expect($('cell-harmonic-3')!.textContent).toBe('+maj7');
    expect($('cell-melodic-6')!.textContent).toBe('ø');
    expect($('cell-major-5')!.textContent).toBe('7');
  });
});

describe('the marks', () => {
  it('arrive seeded, and the dotted list includes the major row', async () => {
    await mount();
    expect($('dot-harmonic-7')).not.toBeNull();
    expect($('dot-major-1')).not.toBeNull();
    const list = $('cqc-used')!.textContent ?? '';
    expect(list).toContain('harmonic minor · 7 · °7');
    expect(list).toContain('the pass into the 1 (B°7 in C)');
    // SILAS, 14 SEP 2026: major's dots are dots, and the list has them.
    expect(list).toContain('major · 1 ·');
  });

  it('switches a dot on with the switch, and off again, keeping nothing', async () => {
    await mount();
    await act(async () => { $('cell-melodic-2')!.click(); });
    expect(($('cqc-use') as HTMLInputElement).checked).toBe(false);
    await act(async () => { $('cqc-use')!.click(); });
    await settle();
    expect($('dot-melodic-2')).not.toBeNull();
    expect($('cqc-used')!.textContent).toContain('melodic minor · 2 · m7');
    expect($('cqc-used')!.textContent).toContain('no note yet');

    await act(async () => { $('cqc-use')!.click(); });
    await settle();
    expect($('dot-melodic-2')).toBeNull();
    expect(await db.userPrefs.get('chordQualityMark:melodic-2')).toBeUndefined();
  });

  it('switches the dot on by itself when a note is typed', async () => {
    await mount();
    await act(async () => { $('cell-locrian-1')!.click(); });
    await act(async () => { type($('cqc-note') as HTMLInputElement, 'the bridge of a ballad'); });
    await settle();
    expect(($('cqc-use') as HTMLInputElement).checked).toBe(true);
    expect($('dot-locrian-1')).not.toBeNull();
    expect($('cqc-used')!.textContent).toContain('the bridge of a ballad (Cø in C)');
  });
});
