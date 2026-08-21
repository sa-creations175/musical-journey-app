// @vitest-environment jsdom
/**
 * Chord motion opening in focus mode from a dashboard row tap.
 *
 * Three things are being pinned, and only the first is the same as the
 * other modules':
 *
 *   The pool reaches the drill, and focus protection comes with it.
 *
 *   FOCUS OVERRIDES SCOPE. The scope filters used to apply on top of
 *   the focus set, so a chromatic motion arriving while the default
 *   diatonic-only scope was active produced an empty pool — and the
 *   scope controls are hidden while focus is active, so there was no
 *   way to see the cause or fix it from the screen.
 *
 *   THE PREFS HYDRATION DOES NOT CLOBBER IT. Unlike the other quizzes,
 *   this one restores its persisted focus selection in an effect, which
 *   runs after the first render.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordMotionTab from '../ChordMotionTab';
import { setPref } from '../../../../lib/userPrefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Diatonic, so the default scope would have kept it. */
const DIATONIC = 'motion:1-4-asc';
/** Chromatic: the default diatonic-only scope would have excluded it,
 *  which is the case that produced an empty pool. */
const CHROMATIC = 'motion:1-b2-asc';

async function render(initialFocusKeys?: string[]): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <ChordMotionTab
          attempts={[]}
          {...(initialFocusKeys ? { initialFocusKeys } : {})}
        />
      </MemoryRouter>,
    );
  });
  // The prefs hydration is async — settle past it, because clobbering
  // is exactly what this file is watching for.
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container;
}

function protectionNotice(el: HTMLElement): Element | null {
  return el.querySelector('[data-testid="fluency-protection-notice"]');
}

/**
 * Whether the drill has anything to serve.
 *
 * THE POOL IS NOT THE SELECTION. "1 motion selected" is rendered from
 * `focusKeys` and would read the same over an empty pool — which is
 * precisely the state the scope bug produced. `play motion` is
 * disabled on `activePool.length === 0`, so it is the one thing on
 * screen that reports the pool itself.
 */
function poolIsEmpty(el: HTMLElement): boolean {
  const play = el.querySelector('[data-testid="play-motion"]') as HTMLButtonElement | null;
  if (!play) throw new Error('play control not rendered');
  return play.disabled;
}

beforeEach(async () => {
  await setPref('chordProgressionsMotionFocus', []);
  await setPref('chordProgressionsMotionNoteContext', 'diatonic');
});

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

  it('starts focused on exactly the motions it was given', async () => {
    const el = await render([DIATONIC, CHROMATIC, 'motion:1-5-asc', 'motion:1-3-asc']);
    expect(el.textContent).toContain('focused practice');
    expect(el.textContent).toContain('4 motions selected');
  });

  it('treats an empty list as no focus at all', async () => {
    const el = await render([]);
    expect(el.textContent).not.toContain('focused practice');
  });
});

describe('focus overrides scope', () => {
  it('serves a chromatic motion under the default diatonic scope', async () => {
    // THE BUG THIS PREVENTS: the scope filters composed with the focus
    // set, so this pool came out empty. An empty pool reads as a broken
    // drill, and the control that caused it is hidden while focus is
    // on — no visible cause and no way to fix it from the screen.
    const el = await render([CHROMATIC]);
    expect(el.textContent).toContain('1 motion selected');
    expect(poolIsEmpty(el)).toBe(false);
  });

  it('does not quietly widen the pool past what was asked for', async () => {
    // Overriding scope must not mean ignoring focus.
    const el = await render([CHROMATIC, DIATONIC]);
    expect(el.textContent).toContain('2 motions selected');
    expect(poolIsEmpty(el)).toBe(false);
  });

  it('a pool naming nothing real is empty rather than everything', async () => {
    // Overriding scope must not degrade into ignoring focus: a stale
    // ref should leave nothing to serve, not silently restore the full
    // 132.
    const el = await render(['motion:not-a-motion']);
    expect(poolIsEmpty(el)).toBe(true);
  });
});

describe('the persisted selection does not clobber the sent one', () => {
  it('keeps the dashboard pool over what was last hand-picked', async () => {
    // This tab restores its focus selection in an async effect, so the
    // stored pool would land one tick after the sent one and replace
    // it — a tap that arrives on the right motions and then moves.
    await setPref('chordProgressionsMotionFocus', [
      'motion:1-5-desc', 'motion:1-4-desc', 'motion:1-3-desc', 'motion:1-2-desc',
    ]);
    const el = await render([CHROMATIC]);
    expect(el.textContent).toContain('1 motion selected');
    expect(el.textContent).not.toContain('4 motions selected');
  });

  it('still restores the stored selection when nothing was sent', async () => {
    // Guard the guard: the hydration is skipped for a sent pool, not
    // broken outright.
    await setPref('chordProgressionsMotionFocus', ['motion:1-5-desc']);
    const el = await render();
    // Not focus-ACTIVE — restoring the selection is not the same as
    // turning focus on — but the panel's selection is what it stored.
    expect(el.textContent).not.toContain('focused practice');
  });
});

describe('focus protection is not bypassed', () => {
  it('warns on a pool the dashboard sent', async () => {
    const el = await render([CHROMATIC]);
    expect(protectionNotice(el)).not.toBeNull();
  });

  it('does not warn once the pool is large enough', async () => {
    const el = await render([DIATONIC, CHROMATIC, 'motion:1-5-asc', 'motion:1-3-asc']);
    expect(protectionNotice(el)).toBeNull();
  });

  it('counts distinct motions, not repeats', async () => {
    const el = await render([CHROMATIC, CHROMATIC, CHROMATIC, CHROMATIC]);
    expect(el.textContent).toContain('1 motion selected');
    expect(protectionNotice(el)).not.toBeNull();
  });
});
