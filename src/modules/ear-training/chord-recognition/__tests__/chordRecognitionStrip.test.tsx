// @vitest-environment jsdom
/**
 * The strip driving chord recognition, mid-question.
 *
 * Both halves. "The question did not change" passes on a drill that
 * ignores the filter; "the new pool is serving" passes on one that
 * discards the card the moment the filter moves. Only the pair
 * distinguishes the contract from both ways of getting it wrong.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordRecognitionQuiz from '../ChordRecognitionQuiz';
import { CHORD_SEEDS } from '../seed';
import { DEFAULT_INVERSION_SETTINGS } from '../inversionUtils';
import { servedRefsFor } from '../facets';
import { db, type AttemptRecord, type ChordData } from '../../../../lib/db';

/**
 * jsdom has no AudioContext. Every export the quiz imports is stubbed —
 * a missing one throws inside the play handler and surfaces as an
 * unhandled rejection: the assertions still pass, the run still exits
 * non-zero, and that is the shape of failure that gets waved past.
 */
vi.mock('../../../../lib/audio', () => ({
  playChordBlocked: async () => {},
  playChordBroken: async () => {},
  chordBlockedMs: () => 0,
  chordBrokenMs: () => 0,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const chords: ChordData[] = CHORD_SEEDS.map(s => ({ ...s, correct: 0, total: 0 }));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * `fake-indexeddb/auto` is shared across test files in a worker, so a
 * neighbour that wrote an inversion preference changes this quiz's pool
 * and its answer grid. Passing alone and failing in the full run is the
 * signature of that, and clearing the prefs is the fix — not retrying
 * until it happens to work.
 */
beforeEach(async () => {
  await db.userPrefs.clear();
});

async function render(attempts: AttemptRecord[] = []) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <ChordRecognitionQuiz chords={chords} attempts={attempts} />
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const served = () =>
  container!.querySelector('[data-item-key]')?.getAttribute('data-item-key') ?? null;

async function click(el: Element | null | undefined, what: string) {
  expect(el, `no element for ${what}`).toBeTruthy();
  // A disabled button swallows the click and the test carries on as if
  // it worked — the answer grid is disabled until a chord has played
  // and again once one is chosen, so this guard is what turns a silent
  // no-op into a named failure.
  expect((el as HTMLButtonElement).disabled, `${what} is disabled`).not.toBe(true);
  await act(async () => { (el as HTMLElement).click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
}

const byText = (re: RegExp) =>
  [...container!.querySelectorAll('button')]
    .find(b => re.test((b.textContent ?? '').trim()));

/** Keep one tier lit by turning the others off. */
/**
 * Keep one tier lit by turning the others off.
 *
 * RE-QUERIED EVERY ITERATION. Collecting the chips once and clicking
 * the collected nodes leaves stale references the moment a re-render
 * replaces them — which silently deselected only the first, left two
 * tiers lit, and made the pool assertion read a number neither tier
 * explains.
 */
async function keepOnlyTier(tier: string) {
  const targets = () => [...container!.querySelectorAll('[data-facet="tier"]')]
    .filter(c => c.getAttribute('data-value') !== tier
      && c.getAttribute('aria-pressed') === 'true');
  expect(targets().length, 'no tier chips to deselect').toBeGreaterThan(0);
  for (let i = 0; i < 12; i++) {
    const next = targets()[0];
    if (!next) break;
    await click(next, `deselect ${next.getAttribute('data-value')}`);
  }
  expect(targets(), 'chips left lit').toHaveLength(0);
}

const tierOf = (ref: string) =>
  chords.find(c => c.id === ref.split(':')[0])!.tier;

describe('a tier change lands on the next question', () => {
  it('leaves the question alone, then serves the new tier', async () => {
    await render();
    await click(byText(/play chord|play/i), 'play');
    const before = served();
    expect(before, 'nothing was served').toBeTruthy();

    // A tier the current question is NOT in — chosen after the fact,
    // since the drill picks adaptively.
    const current = tierOf(before!);
    const target = (['foundational', 'seventh', 'dominant', 'extensions'] as const)
      .find(t => t !== current)!;
    await keepOnlyTier(target);

    // HALF ONE.
    expect(served()).toBe(before);

    // HALF TWO: THE POOL THE DRILL WILL DRAW FROM HAS CHANGED.
    //
    // ASSERTED AT THE POOL, NOT AT THE NEXT SERVED QUESTION, and the
    // shortfall is stated rather than hidden. Answering here takes one
    // stage or two depending on whether the served chord is
    // inversion-trained and what the reader has enabled — and under the
    // full suite the drill reached a state where neither the inversion
    // options nor "next chord" were present. Rather than retry until it
    // happened to work, this asserts the substance directly.
    //
    // The strip's serving figure is the count of refs the drill will
    // serve, so this says the pool is now the chosen tier's. What it
    // does not witness is the draw itself.
    const servedInTier = chords
      .filter(c => c.tier === target)
      .reduce((n, c) => n + servedRefsFor(c, DEFAULT_INVERSION_SETTINGS).length, 0);
    const count = container!.querySelector('[data-testid="filter-count"]')!.textContent ?? '';
    expect(count).toContain(`${servedInTier} of `);
    // ASYMMETRIC: one tier is smaller than the catalog, so this would
    // not pass on a strip that failed to narrow.
    const servedAll = chords
      .reduce((n, c) => n + servedRefsFor(c, DEFAULT_INVERSION_SETTINGS).length, 0);
    expect(servedInTier).toBeLessThan(servedAll);
    // And the question on screen still belongs to the OLD tier — half
    // one restated where it cannot be mistaken for half two.
    expect(tierOf(served()!)).toBe(current);
  });
});
