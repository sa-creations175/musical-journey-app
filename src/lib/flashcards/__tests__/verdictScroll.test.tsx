// @vitest-environment jsdom
/**
 * The verdict goes to the top the moment a card is answered (Silas,
 * 14 Sep 2026). One shell, every deck; held here through a slash-chord
 * card, whose built-answer board is the tall surface that left the badge
 * below the fold.
 *
 * Through the app's own scroll (`scrollSectionToTop`): the badge's top,
 * less the measured header, less its gap. Not on arrival, not while the
 * answer is being built — only on Submit.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('../../audio', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  playSeqChords: () => Promise.resolve({ stop: () => {} }),
  setInstrument: () => {},
}));
vi.mock('../../musicalPlayback', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  playBlocked: () => Promise.resolve({ stop: () => {} }),
}));

const FlashcardSession = (await import('../FlashcardSession')).default;
const { FLASHCARDS } = await import('../../../modules/harmonic-fluency/catalog');
const { renderHfAnswerSurface } = await import('../../../modules/harmonic-fluency/answerSurface');
const { InstrumentProvider } = await import('../../instrumentContext');
const { SCROLL_ROOM_CLASS } = await import('../../scrollSectionToTop');
const { db } = await import('../../db');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** G over B, built on the board: G on the chord row, B in the low octave. */
const CARD = FLASHCARDS.find(c => c.id === 'sc-slash-5-7-C')!;

const VERDICT_TOP = 640;
const HEADER = 56;
const GAP = 8;

let container: HTMLDivElement | null = null;
let chrome: HTMLDivElement | null = null;
let root: Root | null = null;
let scrollTo: ReturnType<typeof vi.fn>;
const realRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  // jsdom lays nothing out, so the badge and the header are given places.
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    const at = (top: number, height: number) =>
      ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    if (this.dataset.testid === 'flashcard-verdict') return at(VERDICT_TOP, 80);
    if (this.dataset.appChrome === 'top') return at(0, HEADER);
    return realRect.call(this);
  };
  chrome = document.createElement('div');
  chrome.dataset.appChrome = 'top';
  document.body.appendChild(chrome);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  chrome?.remove();
  root = null; container = null; chrome = null;
  HTMLElement.prototype.getBoundingClientRect = realRect;
  await db.attempts.clear();
  await db.spacingState.clear();
});

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <InstrumentProvider>
        <FlashcardSession
          queue={[CARD]}
          timerMode="off"
          onExit={() => {}}
          onCardAnswered={() => {}}
          renderAnswerSurface={renderHfAnswerSurface}
        />
      </InstrumentProvider>,
    );
  });
  await settle();
  return container;
}

const q = (sel: string) => container!.querySelector(sel);
const tap = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('answering a card', () => {
  it('scrolls the Correct badge to the top of the view, through the app\'s scroll', async () => {
    await render();
    await tap(q('[data-testid="letter-G"]'));
    await tap(q('rect[data-midi="47"]'));
    // Arriving and building the answer move nothing.
    expect(scrollTo).not.toHaveBeenCalled();

    await tap(q('[data-testid="submit"]'));
    await settle();
    const verdict = q('[data-testid="flashcard-verdict"]')!;
    expect(verdict.textContent).toContain('Correct');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: VERDICT_TOP - HEADER - GAP, behavior: 'smooth' });
    // With room under it to get there.
    expect(verdict.parentElement!.className).toContain(SCROLL_ROOM_CLASS);
  });

  it('does the same for Not Quite', async () => {
    await render();
    await tap(q('[data-testid="letter-G"]'));
    await tap(q('rect[data-midi="43"]'));
    await tap(q('[data-testid="submit"]'));
    await settle();
    expect(q('[data-testid="flashcard-verdict"]')!.textContent).toContain('Not Quite');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: VERDICT_TOP - HEADER - GAP, behavior: 'smooth' });
  });

  it('keeps no room reserved before the card is answered', async () => {
    await render();
    expect(q('[data-testid="flashcard-verdict"]')).toBeNull();
    expect(container!.innerHTML).not.toContain(SCROLL_ROOM_CLASS);
  });
});
