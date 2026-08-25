// @vitest-environment jsdom
/**
 * The note drill asks for a letter, and shows the octave anyway.
 *
 * =====================================================================
 * BOTH HALVES, BECAUSE ONE HALF PASSES ON THE WRONG CHANGE.
 *
 * "The question has no octave control" passes on a change that deleted
 * the reveal too. "The reveal shows the octave" passes on a change that
 * never removed the picker. Neither alone says what was actually
 * wanted, which is that the octave moved from one side of the answer to
 * the other. So both are asserted, in the same file, against the same
 * rendered card.
 *
 * A2 AND A3 STAY TWO ITEMS. Simplifying the answer is not merging the
 * cards: the refs are keyed on staff position and always were, so two
 * positions that share a letter keep separate spacing rows and separate
 * schedules. That is asserted here rather than in the catalog test
 * because the risk arrived with this change — a "tidy-up" that keyed
 * note items on their answer would look like a simplification and would
 * silently collapse seventeen positions per clef into seven.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ReadingDrill from '../ReadingDrill';
import {
  enumerateNoteItems,
  noteItemRef,
  parseReadingItemRef,
} from '../catalog';
import { pitchAtStaffPosition } from '../pitch';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNote(focusRef: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ReadingDrill skill="note" focusRefs={[focusRef]} />);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** The picker titles on screen, in DOM order. */
const pickers = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[data-picker]')]
    .map(n => n.getAttribute('data-picker')!);

/** Click the option carrying `label` inside the question panel. */
async function pick(el: HTMLElement, label: string): Promise<void> {
  const panel = el.querySelector('[data-testid="note-question"]')!;
  const button = [...panel.querySelectorAll('button')]
    .find(b => b.textContent?.trim() === label);
  if (!button) throw new Error(`no option "${label}" in the question`);
  await act(async () => { button.click(); });
}

// note:bass:0 is the bottom line of the bass clef — G2.
const CARD = noteItemRef('bass', 0);

describe('the question asks for a letter and nothing else', () => {
  it('renders the letter picker and NO octave picker', async () => {
    const el = await renderNote(CARD);
    expect(el.querySelector('[data-testid="note-question"]')).not.toBeNull();
    expect(pickers(el)).toEqual(['letter']);
  });

  it('stays one picker after the letter is chosen', async () => {
    // The octave used to appear only once a letter was picked, so a
    // check on the initial render alone would have passed throughout
    // the staged version.
    const el = await renderNote(CARD);
    await pick(el, 'G');
    expect(pickers(el)).toEqual(['letter']);
  });

  it('is submittable on the letter alone', async () => {
    const el = await renderNote(CARD);
    const submitOf = () => [...el.querySelectorAll('button')]
      .find(b => /^(submit|check)/i.test(b.textContent?.trim() ?? ''));
    expect(submitOf()?.disabled, 'submit before answering').toBe(true);
    await pick(el, 'G');
    expect(submitOf()?.disabled, 'submit after the letter').toBe(false);
  });
});

describe('the reveal still shows the octave', () => {
  it('captions the scientific pitch and draws the keyboard', async () => {
    const el = await renderNote(CARD);
    await pick(el, 'G');
    const submit = [...el.querySelectorAll('button')]
      .find(b => /^(submit|check)/i.test(b.textContent?.trim() ?? ''))!;
    await act(async () => { submit.click(); });

    const caption = el.querySelector('[data-testid="reveal-caption"]');
    expect(caption, 'the reveal caption').not.toBeNull();
    // G2 — the letter that was asked for, and the octave that was not.
    expect(caption!.textContent?.trim()).toBe('G2');
    expect(caption!.textContent).toMatch(/^[A-G]\d$/);

    // The mnemonic + keyboard block, which is where the octave is
    // placed on an instrument rather than merely named.
    expect(el.querySelector('[data-testid="note-reveal"]')).not.toBeNull();
  });
});

describe('two positions sharing a letter remain distinct items', () => {
  it('keeps a separate ref per staff position', () => {
    // Bass position 0 is G2 and position 7 is G3: one letter, two
    // items, two refs, two schedules.
    const low = noteItemRef('bass', 0);
    const high = noteItemRef('bass', 7);
    expect(pitchAtStaffPosition('bass', 0).letter)
      .toBe(pitchAtStaffPosition('bass', 7).letter);
    expect(pitchAtStaffPosition('bass', 0).octave)
      .not.toBe(pitchAtStaffPosition('bass', 7).octave);
    expect(low).not.toBe(high);
  });

  it('NO REF IS KEYED ON THE ANSWER — every catalog item stays unique', () => {
    const refs = enumerateNoteItems();
    expect(new Set(refs).size, 'duplicate note refs').toBe(refs.length);

    // The letters repeat many times over; the refs never do. If refs
    // were ever keyed on the answer this count would collapse to the
    // number of distinct letters.
    const letters = new Set(
      refs.map(ref => {
        const p = parseReadingItemRef(ref)!;
        if (p.skill !== 'note') throw new Error(`not a note item: ${ref}`);
        return pitchAtStaffPosition(p.clef, p.position).letter;
      }),
    );
    expect(letters.size).toBeLessThan(refs.length);
    expect(letters.size).toBe(7);
  });

  it('serves the position it was handed, not another with the same letter', async () => {
    const el = await renderNote(noteItemRef('bass', 7));
    expect(el.querySelector('[data-item-ref]')?.getAttribute('data-item-ref'))
      .toBe('note:bass:7');
  });
});
