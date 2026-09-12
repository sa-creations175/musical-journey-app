// @vitest-environment jsdom
/**
 * The diary's ⓘ opens the chord naming reference, and closes it.
 *
 * =====================================================================
 * EVERY ROW, COUNTED OFF THE FILE.
 *
 * The sheet is rendered from `docs/CHORD_NAMING_REFERENCE.md`. So the
 * rows on screen are counted against the document's own text: table
 * lines less headers and rules, numbered lines, bulleted lines. A row
 * the renderer dropped fails here without the test ever naming a chord.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ChordNamingInfo from '../ChordNamingInfo';
import { CHORD_NAMING_REFERENCE_SOURCE } from '../chordNamingReference';
import diarySource from '../HarmonicDiary.tsx?raw';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const LABEL = 'How a chord gets its name';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<ChordNamingInfo />));
  return host;
}

const sheet = () => document.body.querySelector<HTMLElement>(`[role="dialog"][aria-label="${LABEL}"]`);

function open(el: HTMLElement) {
  const button = el.querySelector<HTMLButtonElement>(`button[aria-label="${LABEL}"]`);
  expect(button).not.toBeNull();
  act(() => button!.click());
  expect(sheet()).not.toBeNull();
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('the info button', () => {
  it('sits in the diary header beside the view toggle', () => {
    expect(diarySource).toMatch(/<ChordNamingInfo \/>\s*<ViewToggle/);
  });

  it('opens the sheet and closes it with the ×', () => {
    const el = mount();
    expect(sheet()).toBeNull();
    open(el);
    act(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label="close"]')!.click());
    expect(sheet()).toBeNull();
  });

  it('closes on Escape', () => {
    const el = mount();
    open(el);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(sheet()).toBeNull();
  });

  it('closes on a tap outside the sheet, and not on a tap inside it', () => {
    const el = mount();
    open(el);
    act(() => sheet()!.querySelector<HTMLElement>('table')!.click());
    expect(sheet()).not.toBeNull();
    act(() => sheet()!.click());
    expect(sheet()).toBeNull();
  });
});

describe('the sheet', () => {
  it('renders every row the file holds', () => {
    const el = mount();
    open(el);
    const lines = CHORD_NAMING_REFERENCE_SOURCE
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n').map(l => l.trim());
    const pipe = lines.filter(l => l.startsWith('|'));
    const tableRules = pipe.filter(l => /^\|[\s|:-]+\|$/.test(l));
    const s = sheet()!;

    expect(s.querySelectorAll('table')).toHaveLength(tableRules.length);
    expect(s.querySelectorAll('tbody tr')).toHaveLength(pipe.length - tableRules.length * 2);
    expect(s.querySelectorAll('ol > li')).toHaveLength(lines.filter(l => /^\d+\.\s/.test(l)).length);
    expect(s.querySelectorAll('ul > li')).toHaveLength(lines.filter(l => l.startsWith('- ')).length);
  });

  it('shows the marks as marks, not as asterisks and backticks', () => {
    const el = mount();
    open(el);
    const text = sheet()!.textContent ?? '';
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
  });
});
