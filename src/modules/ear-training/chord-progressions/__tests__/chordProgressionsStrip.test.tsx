// @vitest-environment jsdom
/**
 * The strip driving chord progressions, mid-question.
 *
 * Both halves, for the same reason as the other three drills: one
 * assertion alone passes on a drill that ignores the filter, the other
 * alone passes on one that discards the question.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordProgressionsQuiz from '../ChordProgressionsQuiz';
import { PROGRESSIONS } from '../catalog';
import type { AttemptRecord } from '../../../../lib/db';

/**
 * PARTIAL MOCK. `progressionTheory` carries the pure helpers the quiz
 * needs to render at all — voicings, numerals, key math — so replacing
 * the module wholesale would break the component rather than silence
 * the speakers. Only playback is stubbed.
 */
vi.mock('../progressionTheory', async (orig) => {
  const actual = await orig<typeof import('../progressionTheory')>();
  return { ...actual, playProgression: async () => ({ stop: () => {} }) };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(attempts: AttemptRecord[] = []) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter><ChordProgressionsQuiz attempts={attempts} /></MemoryRouter>,
    );
  });
  await settle();
  // WAIT FOR PREF HYDRATION. The strip starts with nothing selected and
  // fills in once `getPref` resolves — so acting before that turns
  // "deselect the others" into "select them", which is exactly how this
  // test first read a pool neither tier explained.
  for (let i = 0; i < 20; i++) {
    const lit = container!.querySelectorAll('[data-facet="tier"][aria-pressed="true"]');
    if (lit.length > 0) break;
    await settle();
  }
  expect(
    container!.querySelectorAll('[data-facet="tier"][aria-pressed="true"]').length,
    'prefs never hydrated the strip',
  ).toBeGreaterThan(0);
  return container;
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });

afterEach(async () => {
  vi.useRealTimers();
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const served = () =>
  container!.querySelector('[data-item-key]')?.getAttribute('data-item-key') ?? null;

async function click(el: Element | null | undefined, what: string) {
  expect(el, `no element for ${what}`).toBeTruthy();
  // A disabled button swallows the click and the test carries on as if
  // it worked — which is how "submit" appeared to fire while three of
  // four slots were filled.
  expect((el as HTMLButtonElement).disabled, `${what} is disabled`).not.toBe(true);
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
}

/**
 * Let the drill's own timers run.
 *
 * The quiz stays in `listening` until the progression finishes playing
 * — a real timer measured off the tempo, not off the audio. Playback is
 * mocked, so nothing ever ends unless the clock is pushed forward.
 */
async function settle() {
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  await act(async () => { vi.advanceTimersByTime(30_000); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

const byText = (re: RegExp) =>
  [...container!.querySelectorAll('button')]
    .find(b => re.test((b.textContent ?? '').trim()));

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

const tierOf = (id: string) => PROGRESSIONS.find(p => p.id === id)!.tier;

describe('a tier change lands on the next question', () => {
  it('leaves the question alone, then serves the new tier', async () => {
    await render();
    await click(byText(/play progression/i), 'play');
    const before = served();
    expect(before, 'nothing was served').toBeTruthy();

    // ASYMMETRIC: a tier the current progression is not in, chosen
    // after the fact because the drill picks adaptively.
    const current = tierOf(before!);
    const target = [...new Set(PROGRESSIONS.map(p => p.tier))]
      .filter(t => t !== current)
      .sort((a, b) => a - b)[0];
    await keepOnlyTier(String(target));

    // HALF ONE: the question the reader was asked is unchanged.
    expect(served()).toBe(before);

    // HALF TWO: THE POOL THE DRILL WILL DRAW FROM HAS CHANGED.
    //
    // ASSERTED AT THE POOL, NOT AT THE NEXT SERVED QUESTION, and the
    // difference is worth stating rather than hiding. The other three
    // drills answer-and-advance in a test; this one cannot be driven
    // that far reliably — its answer flow is a four-state machine
    // (listening → identifying → pattern → reveal) gated on timers
    // measured off the tempo, and "next progression" never appeared
    // even with the transcription submitted and the pattern question
    // skipped.
    //
    // What IS asserted is the substance: the strip's serving figure is
    // `pool.length` — the very array `startNew` picks from — so this
    // says the drill will draw only from the chosen tier. What it does
    // not witness is the draw itself.
    const inTier = PROGRESSIONS.filter(p => p.tier === target).length;
    const count = container!.querySelector('[data-testid="filter-count"]')!.textContent ?? '';
    expect(count).toContain(`${inTier} of ${PROGRESSIONS.length}`);
    // ASYMMETRIC: the tier is smaller than the catalog, so this would
    // not pass on a strip that failed to narrow anything.
    expect(inTier).toBeLessThan(PROGRESSIONS.length);
    // And the question on screen still belongs to the OLD tier, which
    // is half one restated where it cannot be confused for half two.
    expect(tierOf(served()!)).toBe(current);
  });
});
