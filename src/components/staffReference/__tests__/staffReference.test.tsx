// @vitest-environment jsdom
/**
 * The drawing, and the mnemonics behind it.
 *
 * =====================================================================
 * NO LAYOUT ASSERTIONS, AND THIS FILE CANNOT MAKE ANY.
 *
 * jsdom has no layout engine. It resolves no boxes, measures no text
 * and paints nothing, so whether the two columns actually clear each
 * other, whether a line passes behind its row's text rather than
 * through it, and whether the brace meets the staves cannot be observed
 * here at all. Those need the app.
 *
 * What IS pinned is the structure underneath: every position drawn
 * once, in the column its kind puts it in, at the y its ladder index
 * gives it; a line for every line position; ledgers dashed and full
 * width; the furniture present; the mnemonics stored centrally.
 * =====================================================================
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

/** The staff or ledger line drawn AT a position — now in the stage's
 *  own SVG rather than inside the row, so the line can run the full
 *  width behind both label columns. */
const line = (el: HTMLElement, note: string) =>
  el.querySelector(`[data-testid="staff-line"][data-note="${note}"]`);

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
    expect(line(el, 'E4')).not.toBeNull();
    expect(line(el, 'F4')).toBeNull();
    const lines = el.querySelectorAll('[data-testid="staff-line"]');
    expect(lines).toHaveLength(buildLadder().filter(p => p.kind === 'line').length);
  });

  it('puts spaces and lines in two separate columns', async () => {
    // The reason for the split: within a column the rows are two
    // diatonic steps apart, which is what stops them colliding.
    const el = await mount();
    const spaceLeft = (row(el, 'F4') as HTMLElement).style.left;
    const lineLeft = (row(el, 'E4') as HTMLElement).style.left;
    expect(spaceLeft).not.toBe(lineLeft);
    for (const pos of buildLadder()) {
      const expected = pos.kind === 'space' ? spaceLeft : lineLeft;
      expect((row(el, pos.id) as HTMLElement).style.left, pos.id).toBe(expected);
    }
  });

  it('places every row from its ladder index, one step apart', async () => {
    const el = await mount();
    const ladder = buildLadder();
    const topOf = (id: string) => parseFloat((row(el, id) as HTMLElement).style.top);
    const step = topOf(ladder[0].id) - topOf(ladder[1].id);
    expect(step).toBeGreaterThan(0);
    for (let i = 1; i < ladder.length; i++) {
      expect(topOf(ladder[i - 1].id) - topOf(ladder[i].id), ladder[i].id)
        .toBeCloseTo(step, 5);
    }
  });

  it('draws no noteheads — the letter is the mark', async () => {
    const el = await mount();
    const note = el.querySelector('[data-testid="staff-note"]')!;
    expect(note.className).not.toContain('rounded-full');
    expect(note.className).not.toContain('border');
  });

  it('dots the ledger lines and only those', async () => {
    const el = await mount();
    expect(line(el, 'E4')!.getAttribute('stroke-dasharray')).toBeNull();
    expect(line(el, 'C4')!.getAttribute('stroke-dasharray')).not.toBeNull();
    expect(line(el, 'A5')!.getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('colours ledgers and middle C from tokens, not literals', async () => {
    const el = await mount();
    expect(line(el, 'A5')!.getAttribute('class')).toContain('text-developing');
    expect(line(el, 'C4')!.getAttribute('class')).toContain('text-fluent');
    expect(line(el, 'E4')!.getAttribute('class')).toContain('text-neutral');
    // No hex anywhere in the drawing.
    expect(el.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it('runs the ledger line the full width, like the staff lines', async () => {
    // A ledger drawn only under the note leaves the space note above it
    // looking like it floats.
    const el = await mount();
    const ledger = line(el, 'A5')!;
    const staff = line(el, 'E4')!;
    expect(ledger.getAttribute('x1')).toBe(staff.getAttribute('x1'));
    expect(ledger.getAttribute('x2')).toBe(staff.getAttribute('x2'));
  });

  it('gives a line row an opaque break so the staff passes behind it', async () => {
    // Without it the line runs THROUGH the text and strikes it out.
    const el = await mount();
    expect(row(el, 'E4').className).toContain('bg-white');
    // A space row needs none: nothing is drawn where it sits.
    expect(row(el, 'F4').className).not.toContain('bg-white');
  });

  it('marks middle C', async () => {
    // WAS a text label beside the letter. It is marked by COLOUR now —
    // its own dotted line and its letter both take the shared-note
    // token, and the legend beneath the card says what that colour
    // means. The rule is unchanged: middle C is distinguishable from
    // every other position at a glance.
    const el = await mount();
    expect(row(el, 'C4').getAttribute('data-middle-c')).toBe('true');
    expect(row(el, 'C4').querySelector('[data-testid="staff-note"]')!.className)
      .toContain('text-fluent');
    expect(line(el, 'C4')!.getAttribute('class')).toContain('text-fluent');
    // And nothing else claims it.
    expect(el.querySelectorAll('[data-middle-c="true"]')).toHaveLength(1);
    expect(row(el, 'E4').querySelector('[data-testid="staff-note"]')!.className)
      .not.toContain('text-fluent');
    expect(el.querySelector('[data-testid="staff-legend"]')!.textContent)
      .toContain('middle C');
  });

  it('distinguishes a ledger note from a staff note', async () => {
    const el = await mount();
    const ledgerNote = row(el, 'C6').querySelector('[data-testid="staff-note"]')!;
    const staffNote = row(el, 'B4').querySelector('[data-testid="staff-note"]')!;
    const middleC = row(el, 'C4').querySelector('[data-testid="staff-note"]')!;
    expect(ledgerNote.className).toContain('text-developing');
    expect(middleC.className).toContain('text-fluent');
    expect(staffNote.className).toContain('text-neutral');
  });

  it('carries the furniture the staff needs to read as one', async () => {
    const el = await mount();
    expect(el.querySelector('[data-testid="staff-brace"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ledger-bracket-above"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ledger-bracket-below"]')).not.toBeNull();
    expect([...el.querySelectorAll('[data-testid="clef-label"]')].map(n => n.textContent))
      .toEqual(['TREBLE', 'BASS']);
    expect([...el.querySelectorAll('[data-testid="column-header"]')].map(n => n.textContent))
      .toEqual(['SPACES', 'LINES']);
    expect(el.querySelector('[data-testid="staff-legend"]')).not.toBeNull();
  });
});

describe('the octave toggle', () => {
  it('says what it does, and shows the digit after the letter', async () => {
    // It was labelled "8va", which is an instruction to play an octave
    // higher — a different thing entirely.
    const el = await mount();
    const box = el.querySelector('[data-testid="staff-reference-octaves"]') as HTMLInputElement;
    expect(box.parentElement!.textContent).toContain('show octave numbers');
    expect(el.textContent).not.toContain('8va');
    expect(row(el, 'F5').querySelector('[data-testid="staff-octave"]')!.textContent).toBe('5');
  });

  it('hides the digits when switched off, and the letters stay', async () => {
    const el = await mount();
    const box = el.querySelector('[data-testid="staff-reference-octaves"]') as HTMLInputElement;
    await act(async () => { box.click(); });
    expect(row(el, 'F5').querySelector('[data-testid="staff-octave"]')).toBeNull();
    expect(row(el, 'F5').querySelector('[data-testid="staff-note"]')!.textContent).toBe('F');
  });
});

describe('the mnemonics', () => {
  it('show the standard sets', async () => {
    const el = await mount();
    expect(row(el, 'E4').textContent).toContain('Every');
    expect(row(el, 'G3').textContent).toContain('Grass');
  });

  it('prompt an empty ledger position in words', async () => {
    const el = await mount({ editable: true });
    const field = row(el, 'A5').querySelector('[data-testid="staff-mnemonic"]') as HTMLInputElement;
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('add your own');
  });

  it('do not ask for one on the four treble spaces', async () => {
    // They spell F-A-C-E, so they already are a mnemonic. Asking for
    // one would be asking for a mnemonic for the mnemonic.
    const el = await mount({ editable: true });
    for (const note of ['F4', 'A4', 'C5', 'E5']) {
      expect(row(el, note).querySelector('[data-testid="staff-mnemonic"]'), note).toBeNull();
    }
  });

  it('say it ONCE, beside the four, not once per row', async () => {
    // Repeated per row it read as each row's own mnemonic. The four
    // spell it together.
    const el = await mount({ editable: true });
    const tags = el.querySelectorAll('[data-testid="staff-spells-face"]');
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toContain('F');
    expect(tags[0].textContent).toContain('E');
  });

  it('offer no field at all where the drawing is read-only', async () => {
    const el = await mount({ editable: false });
    expect(row(el, 'A5').querySelector('[data-testid="staff-mnemonic"]')).toBeNull();
    // A position that HAS words still shows them.
    expect(row(el, 'E4').textContent).toContain('Every');
  });

  it('persist an edit to the one central row', async () => {
    const el = await mount({ editable: true });
    const input = row(el, 'A5').querySelector('[data-testid="staff-mnemonic"]') as HTMLInputElement;
    await act(async () => { input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
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
