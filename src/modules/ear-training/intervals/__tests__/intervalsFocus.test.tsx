// @vitest-environment jsdom
/**
 * Intervals opening in focus mode from a dashboard row tap.
 *
 * The mechanism already existed and was wired to a modal; this pins
 * that a caller-supplied pool reaches it, and — the part that matters —
 * that focus protection is not bypassed on the way in.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import IntervalsQuiz from '../IntervalsQuiz';
import { INTERVAL_SEEDS } from '../seed';
import type { AttemptRecord, IntervalData } from '../../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const intervals: IntervalData[] = INTERVAL_SEEDS.map(seed => ({
  ...seed, ascAnchor: null, descAnchor: null,
} as unknown as IntervalData));

async function render(
  initialFocusKeys?: string[],
  attempts: AttemptRecord[] = [],
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <IntervalsQuiz
          intervals={intervals}
          attempts={attempts}
          {...(initialFocusKeys ? { initialFocusKeys } : {})}
        />
      </MemoryRouter>,
    );
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

describe('opening in focus mode', () => {
  it('starts unfocused with no keys', async () => {
    const el = await render();
    expect(el.textContent).not.toContain('focused practice');
  });

  it('starts focused on exactly the keys it was given', async () => {
    const el = await render(['M3|asc', 'm7|desc']);
    expect(el.textContent).toContain('focused practice');
    expect(el.textContent).toContain('2 intervals selected');
  });

  it('reports a single-interval pool honestly', async () => {
    const el = await render(['m7|desc']);
    expect(el.textContent).toContain('1 interval selected');
  });

  it('treats an empty list as no focus at all', async () => {
    const el = await render([]);
    expect(el.textContent).not.toContain('focused practice');
  });
});

describe('focus protection is not bypassed', () => {
  it('warns on a pool the dashboard sent, exactly as on a hand-picked one', async () => {
    // THE RULE THIS PINS: excludeFromFluency is about how few items you
    // were choosing between, not about who chose them. Tapping "minor
    // 7th descending" and drilling one interval must not move an
    // accuracy number, and the screen has to say so.
    const el = await render(['m7|desc']);
    expect(el.textContent).toMatch(/fewer than 4 items|don't count toward fluency/i);
  });

  it('does not warn once the pool is large enough', async () => {
    const el = await render(['M3|asc', 'm7|desc', 'P5|asc', 'm2|desc']);
    expect(el.textContent).toContain('4 intervals selected');
    expect(el.textContent).not.toMatch(/fewer than 4 items/i);
  });
});
