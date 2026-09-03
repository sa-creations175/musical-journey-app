// @vitest-environment jsdom
/**
 * The drill still builds its queue when React mounts it twice.
 *
 * =====================================================================
 * THE BUG THIS EXISTS FOR RENDERED NOTHING AT ALL.
 *
 * `FluencyDrill` builds its queue in a mount effect and returns `null`
 * until the build resolves. It used to hold two guards at once: a
 * `built` ref that returned early on any run after the first, and a
 * `live` flag that the cleanup set false. Under `StrictMode` — which
 * mounts, cleans up, and mounts again on the same fiber, so refs
 * survive — the first pass started the build, the cleanup marked its
 * result unwanted, and the second pass returned at the ref without
 * starting anything. `queue` stayed null forever.
 *
 * The symptom had no edges. No thrown error, so the console stayed
 * clean. No empty queue, so no caught-up message. The component simply
 * returned `null` and the whole subtree — drill, practice-ahead notice
 * and daily goal bar alike — was absent from the page.
 *
 * NOTHING IN THE SUITE COULD SEE IT. Every other test mounts this tree
 * bare, and a single mount runs the effect once, which the old code
 * handled correctly. The bug lived only in the double invoke, so the
 * harness has to be the thing that changes: this file mounts the real
 * page inside a real `<StrictMode>`.
 * =====================================================================
 *
 * ASSERTED ON THE GOAL BAR RATHER THAN ON A CARD. `DailyGoalBar` is the
 * first thing `FluencyDrill` renders that survives regardless of which
 * cards the queue drew, so it answers "did the component render at
 * all" without also depending on the catalog, the shuffle, or what is
 * due today. A card assertion would fail for reasons that are not this
 * bug.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import FluencyDrill from '../FluencyDrill';
import { CATEGORY_ORDER } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * THE QUEUE CAN NOW DRAW A PRESSED CARD, which renders `AnswerKeyboard`,
 * which measures its host. jsdom has no `ResizeObserver`, so a queue
 * that happened to include one threw where the point of the file is
 * whether the component rendered at all. Stubbed rather than avoided:
 * steering the queue away from a third of `degree-notes` would be
 * testing a narrower thing than the drill.
 */
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

/**
 * Mount the drill, optionally wrapped in StrictMode.
 *
 * The wrapper is a parameter rather than two harnesses because the
 * pair of assertions below is only meaningful as a comparison: the
 * bare mount is the control that says the queue can be built at all,
 * so a StrictMode failure is about the double invoke and not about
 * the fixture.
 */
async function mountDrill(strict: boolean): Promise<{
  el: HTMLDivElement;
  caughtUp: () => number;
}> {
  let caughtUpCalls = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const tree = (
    <MemoryRouter initialEntries={['/harmonic-fluency']}>
      <FluencyDrill
        categories={[...CATEGORY_ORDER]}
        onExit={() => {}}
        onCaughtUp={() => { caughtUpCalls += 1; }}
      />
    </MemoryRouter>
  );

  await act(async () => {
    root!.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });

  // POLLED, NOT COUNTED. The build is several IndexedDB round trips
  // deep, so "flush a fixed number of microtasks" is a guess that
  // passes or fails on machine speed. This waits for the outcome
  // instead — either the drill rendered or the caller was told there
  // was nothing to serve — and gives up after a bounded number of
  // task turns so a genuine hang fails rather than hanging the suite.
  for (let i = 0; i < 50; i++) {
    if (container.textContent !== '' || caughtUpCalls > 0) break;
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  }

  return { el: container, caughtUp: () => caughtUpCalls };
}

/**
 * Did `FluencyDrill` render its subtree at all?
 *
 * Two markers, one from each half of what the component owns: the goal
 * bar it renders above the session ("Today:"), and the session's own
 * card counter. Either alone would be satisfiable by a partial render;
 * the bug being guarded is the whole subtree being absent, so both is
 * the honest test of "it is there".
 */
function rendered(el: HTMLElement): boolean {
  const text = el.textContent ?? '';
  return text.includes('Today:') && /card\s*1\s*\/\s*\d+/.test(text);
}

describe('FluencyDrill builds its queue under StrictMode', () => {
  it('renders the drill on a bare mount — the control', async () => {
    const { el, caughtUp } = await mountDrill(false);
    expect(caughtUp(), 'nothing to serve — fixture problem, not the bug')
      .toBe(0);
    expect(rendered(el), 'drill did not render even on a single mount')
      .toBe(true);
  });

  it('renders the drill when the effect is mounted twice', async () => {
    const { el, caughtUp } = await mountDrill(true);
    expect(caughtUp()).toBe(0);
    // THE REGRESSION. Before the fix this was an empty container: the
    // build the first pass started had its result discarded, and the
    // second pass never started one.
    expect(
      rendered(el),
      'FluencyDrill rendered nothing under StrictMode — the mount effect '
      + 'cancelled its own build and never started another',
    ).toBe(true);
  });

  it('does not report caught-up when the catalog has cards to serve', async () => {
    // Guards the other way the subtree can vanish: `onCaughtUp` unmounts
    // the drill from the caller. If a future change routes a healthy
    // catalog down that path, the page goes blank again for a different
    // reason, and the two failures would otherwise look identical.
    const { caughtUp } = await mountDrill(true);
    expect(caughtUp()).toBe(0);
  });
});
