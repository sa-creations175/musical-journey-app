// @vitest-environment jsdom
/**
 * The drawing, and the mnemonics behind it.
 *
 * NO LAYOUT ASSERTIONS. jsdom has no layout engine, so nothing here
 * claims a space note LOOKS like it sits between two ledger lines.
 * What is pinned is the mechanism that makes it so: every position is
 * drawn, each carries its kind, and a line is dotted exactly when it is
 * a ledger.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import StaffReference from '../StaffReference';
import { buildLadder } from '../staffLadder';
import { MNEMONICS_PREF_KEY, mergeMnemonics } from '../mnemonics';
import { db } from '../../../lib/db';
import { getPref, setPref } from '../../../lib/userPrefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: Parameters<typeof StaffReference>[0] = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<StaffReference {...props} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

beforeEach(async () => { await db.userPrefs.clear(); });

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
});

/**
 * Type into a controlled input the way React notices.
 *
 * React tracks an input's value on the node, so assigning `.value`
 * directly and firing `input` looks like no change at all — the
 * assignment has to go through the native setter first.
 */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const row = (el: HTMLElement, note: string) =>
  el.querySelector(`[data-testid="staff-row"][data-note="${note}"]`) as HTMLElement;

describe('the drawing', () => {
  it('renders every position on the ladder, once', async () => {
    const el = await mount();
    const rows = el.querySelectorAll('[data-testid="staff-row"]');
    expect(rows).toHaveLength(buildLadder().length);
    expect(row(el, 'A1')).not.toBeNull();
    expect(row(el, 'E6')).not.toBeNull();
  });

  it('draws a line for every line position and none for a space', async () => {
    const el = await mount();
    expect(row(el, 'E4').querySelector('[data-testid="staff-line"]')).not.toBeNull();
    expect(row(el, 'F4').querySelector('[data-testid="staff-line"]')).toBeNull();
  });

  it('dots the ledger lines and only those', async () => {
    const el = await mount();
    const staffLine = row(el, 'E4').querySelector('[data-testid="staff-line"]')!;
    const ledger = row(el, 'C4').querySelector('[data-testid="staff-line"]')!;
    expect(staffLine.className).toContain('border-solid');
    expect(ledger.className).toContain('border-dashed');
  });

  it('runs the ledger line the full width, like the staff lines', async () => {
    // A ledger drawn only under the notehead leaves the space note
    // above it looking like it floats.
    const ledger = row(await mount(), 'A5').querySelector('[data-testid="staff-line"]')!;
    expect(ledger.className).toContain('left-0');
    expect(ledger.className).toContain('right-0');
  });

  it('marks middle C', async () => {
    const el = await mount();
    expect(row(el, 'C4').querySelector('[data-testid="staff-middle-c"]')).not.toBeNull();
    expect(row(el, 'E4').querySelector('[data-testid="staff-middle-c"]')).toBeNull();
  });

  it('distinguishes a ledger note from a staff note', async () => {
    const el = await mount();
    const ledgerNote = row(el, 'C6').querySelector('[data-testid="staff-note"]')!;
    const staffNote = row(el, 'B4').querySelector('[data-testid="staff-note"]')!;
    expect(ledgerNote.className).not.toBe(staffNote.className);
    expect(ledgerNote.className).toContain('border-dashed');
  });
});

describe('the octave toggle', () => {
  it('is a control, and starts off', async () => {
    const el = await mount();
    const box = el.querySelector('[data-testid="staff-reference-octaves"]') as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(false);
    expect(row(el, 'C4').textContent).not.toContain('C4');
  });

  it('shows the numbers when switched on', async () => {
    const el = await mount();
    const box = el.querySelector('[data-testid="staff-reference-octaves"]') as HTMLInputElement;
    await act(async () => { box.click(); });
    expect(row(el, 'C4').querySelector('[data-testid="staff-note"]')!.textContent)
      .toContain('4');
  });
});

describe('the mnemonics', () => {
  it('show the standard sets', async () => {
    const el = await mount();
    expect(row(el, 'E4').textContent).toContain('Every');
    expect(row(el, 'G3').textContent).toContain('Grass');
  });

  it('offer a prompt where a position has none', async () => {
    const el = await mount({ editable: true });
    // Every ledger position ships empty.
    expect(row(el, 'A5').querySelector('[data-testid="staff-mnemonic-add"]')).not.toBeNull();
    expect(row(el, 'E4').querySelector('[data-testid="staff-mnemonic-add"]')).toBeNull();
  });

  it('do not offer the prompt where the drawing is read-only', async () => {
    const el = await mount({ editable: false });
    expect(row(el, 'A5').querySelector('[data-testid="staff-mnemonic-add"]')).toBeNull();
  });

  it('persist an edit to the one central row', async () => {
    const el = await mount({ editable: true });
    const add = row(el, 'A5').querySelector('[data-testid="staff-mnemonic-add"]') as HTMLElement;
    await act(async () => { add.click(); });
    const input = row(el, 'A5').querySelector('[data-testid="staff-mnemonic-input"]') as HTMLInputElement;
    await act(async () => { type(input, 'A ledger word'); });
    // `focusout`, not `blur`: React delegates from the root and blur
    // does not bubble, so a plain blur event never reaches the handler.
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    const stored = await getPref<Record<string, string>>(MNEMONICS_PREF_KEY, {});
    expect(stored.A5).toBe('A ledger word');
  });

  it('read stored values over the shipped ones', async () => {
    await setPref(MNEMONICS_PREF_KEY, { E4: 'Elephants' });
    const el = await mount();
    expect(row(el, 'E4').textContent).toContain('Elephants');
    expect(row(el, 'E4').textContent).not.toContain('Every');
    // Untouched positions still fall through to the default.
    expect(row(el, 'G4').textContent).toContain('Good');
  });
});

describe('merging stored over shipped', () => {
  it('keeps a cleared mnemonic cleared', () => {
    // An empty string is a real value: clearing has to survive a
    // reload rather than springing back to what it was cleared from.
    expect(mergeMnemonics({ E4: '' }).E4).toBe('');
  });

  it('ignores a row that is not a map of strings', () => {
    expect(mergeMnemonics(null).E4).toBe('Every');
    expect(mergeMnemonics('nonsense').E4).toBe('Every');
    expect(mergeMnemonics({ E4: 42 }).E4).toBe('Every');
  });
});

describe('the highlight', () => {
  it('marks the answered note and only it', async () => {
    const el = await mount({ highlight: 'C6' });
    expect(row(el, 'C6').getAttribute('data-highlighted')).toBe('true');
    expect(row(el, 'C4').getAttribute('data-highlighted')).toBe('false');
  });

  it('marks nothing when there is nothing to mark', async () => {
    const el = await mount();
    expect(el.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
  });
});

/**
 * THE DEFECT THIS COMPONENT REPLACED, pinned at the level that
 * mattered: the panel shown after a note question has to CONTAIN the
 * note that was asked.
 *
 * The old reveal chose one of four mnemonic sets by clef and parity —
 * treble lines, treble spaces, bass lines, bass spaces. A ledger note
 * belongs to none of them, so a missed middle C was explained by five
 * treble lines that did not include it.
 */
describe('the panel always contains the answer', () => {
  it('holds a ledger note, marked', async () => {
    for (const note of ['C4', 'A5', 'C6', 'E6', 'E2', 'C2', 'A1']) {
      const el = await mount({ highlight: note });
      const marked = el.querySelector('[data-highlighted="true"]');
      expect(marked, note).not.toBeNull();
      expect(marked!.getAttribute('data-note')).toBe(note);
      await act(async () => root!.unmount());
      container!.remove();
    }
  });

  it('holds a staff note in either clef, marked', async () => {
    for (const note of ['E4', 'F4', 'G2', 'A2']) {
      const el = await mount({ highlight: note });
      expect(el.querySelector('[data-highlighted="true"]')!.getAttribute('data-note'), note)
        .toBe(note);
      await act(async () => root!.unmount());
      container!.remove();
    }
  });
});
