// @vitest-environment jsdom
/**
 * A filter change lands on the NEXT card, not the one being answered.
 *
 * The card in front of the reader is a question they were already
 * asked. Replacing it because they narrowed the pool discards work
 * mid-answer for no reason they can see — and the attempt that was
 * about to be recorded never happens.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ReadingDrill from '../ReadingDrill';
import { noteItemRef } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Two disjoint pools, so "the card survived" and "the card changed"
 *  are distinguishable rather than a coin flip on a shared pool. */
const POOL_A = [noteItemRef('treble', 0)];
const POOL_B = [noteItemRef('treble', 4)];

async function mount(focusRefs: string[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ReadingDrill skill="note" focusRefs={focusRefs} />);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

async function rerender(focusRefs: string[]) {
  await act(async () => {
    root!.render(<ReadingDrill skill="note" focusRefs={focusRefs} />);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

const served = () =>
  container!.querySelector('[data-item-ref]')!.getAttribute('data-item-ref');

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

describe('the filter applies to the next question', () => {
  it('leaves the current card alone when the filter changes', async () => {
    await mount(POOL_A);
    expect(served()).toBe(POOL_A[0]);

    // Narrow to a DISJOINT pool mid-question.
    await rerender(POOL_B);

    // The question on screen is unchanged. Before the ref, `next` had
    // `focusPool` in its dependency list and this returned POOL_B[0].
    expect(served()).toBe(POOL_A[0]);
  });

  it('serves the new pool once the reader moves on', async () => {
    // Both halves. "The card survived" alone passes on a drill that
    // ignores the filter entirely.
    await mount(POOL_A);
    await rerender(POOL_B);
    expect(served()).toBe(POOL_A[0]);

    // Advancing means answering: a note card wants a letter and an
    // octave, then submit, and only then does "next card" exist.
    // Correctness is irrelevant here — moving on is.
    const click = async (label: RegExp) => {
      const b = [...container!.querySelectorAll('button')]
        .find(x => label.test((x.textContent ?? '').trim()));
      expect(b, `no button matching ${label}`).toBeDefined();
      await act(async () => { b!.click(); });
      await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    };
    await click(/^C$/);
    await click(/^submit$/i);
    await click(/^next card$/i);

    expect(served()).toBe(POOL_B[0]);
  });

  it('still treats a SKILL change as a new drill', async () => {
    // The distinction the ref has to preserve: a filter change is a
    // continuation, a skill change is not.
    await mount(POOL_A);
    expect(served()).toBe(POOL_A[0]);
    await act(async () => {
      root!.render(<ReadingDrill skill="sig" />);
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(served()!.startsWith('sig:')).toBe(true);
  });
});
