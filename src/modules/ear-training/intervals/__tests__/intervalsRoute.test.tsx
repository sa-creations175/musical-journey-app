// @vitest-environment jsdom
/**
 * The seam between the URL and the quiz.
 *
 * `intervalsFocus.test.tsx` hands `IntervalsQuiz` its pool directly, so
 * it proves the filter and says nothing about whether `Intervals.tsx`
 * reads `?focus=`. Deleting that read would leave this module's suite
 * green — the same shape as the dashboard dead tap, where both units
 * were right and only the call between them was wrong.
 *
 * Backfilled with the chord-recognition wiring rather than when
 * intervals shipped, because that is when the gap was noticed.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import Intervals from '../Intervals';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderAt(entry: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Intervals />
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 20; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    if (!container.textContent?.includes('loading intervals')) break;
  }
  return container;
}

/** The notice, by its own testid rather than by its words — the
 *  wording is one shared sentence and belongs to `lib/fluencyPool`,
 *  so matching on a phrase here would fail on a rewrite that changed
 *  nothing about whether the rule fired. */
function protectionNotice(el: HTMLElement): Element | null {
  return el.querySelector('[data-testid="fluency-protection-notice"]');
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('?focus= reaches the quiz', () => {
  it('opens unfocused with no param', async () => {
    const el = await renderAt('/ear-training/intervals');
    expect(el.textContent).not.toContain('loading intervals');
    expect(el.textContent).not.toContain('focused practice');
  });

  it('opens focused on the intervals the dashboard named', async () => {
    const el = await renderAt('/ear-training/intervals?focus=M3|asc,m7|desc');
    expect(el.textContent).toContain('2 intervals selected');
  });

  it('carries focus protection in from the URL', async () => {
    const el = await renderAt('/ear-training/intervals?focus=m7|desc');
    expect(el.textContent).toContain('1 interval selected');
    expect(protectionNotice(el)).not.toBeNull();
  });
});
