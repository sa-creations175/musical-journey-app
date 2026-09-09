// @vitest-environment jsdom
/**
 * The keyboard on a written card, and the two things it must not do.
 *
 * =====================================================================
 * IT MUST NOT APPEAR BEFORE THE ANSWER, and it must not write anything.
 *
 * The first is the rule `DegreePlayback` already states: sounding or
 * showing the note before it is named "would turn a written question
 * into an ear question — a different card". A board with the answer
 * marked on it, up while the question is open, is that same card by
 * another route — you would find the note by looking.
 *
 * The second is what keeps it from becoming a second, unscored
 * assessment. The card was scored when the option was tapped; this is
 * what happens afterwards.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FlashcardSession from '../../../lib/flashcards/FlashcardSession';
import DegreeNoteReveal from '../DegreeNoteReveal';
import { nameItCards, placeItCards } from '../degreeNoteCards';
import { WH } from '../../../lib/answerKeyboard';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let realRect: typeof Element.prototype.getBoundingClientRect;

beforeEach(() => {
  realRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function stub(this: Element) {
    return { left: 0, top: 0, width: 900, height: WH } as DOMRect;
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  Element.prototype.getBoundingClientRect = realRect;
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.attempts.clear();
  await db.spacingState.clear();
});

const NAMED = nameItCards().find(c => c.id === 'dgn-C-b6')!;

async function renderCard(card = NAMED) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <FlashcardSession
        queue={[card]}
        timerMode="off"
        onExit={() => {}}
        onCardAnswered={() => {}}
        renderFooter={(c, { answered }) => (
          answered
            ? <DegreeNoteReveal root="C" degreeId="b6" card={c} />
            : null
        )}
      />,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  return container!;
}

const reveal = () => container!.querySelector('[data-testid="degree-note-reveal"]');

async function answerWith(text: string) {
  const button = [...container!.querySelectorAll('button')]
    .find(b => (b.textContent ?? '').includes(text));
  expect(button, `no option reading ${text}`).toBeDefined();
  await act(async () => { button!.click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
}

describe('the reveal', () => {
  it('is not on screen while the question is open', async () => {
    await renderCard();
    expect(reveal(), 'nothing before the answer').toBeNull();
  });

  it('appears once the card has been answered', async () => {
    await renderCard();
    await answerWith('Ab');
    expect(reveal()).not.toBeNull();
  });

  it('shows the same board for a right answer and a wrong one', async () => {
    // It explains the card, so it does not depend on how you did.
    await renderCard();
    await answerWith('A');
    expect(reveal()).not.toBeNull();
  });

  it('writes nothing at all', async () => {
    // The card was scored by the shell when the option was tapped. If
    // the reveal ever started writing, this is where a second attempt
    // row or a second spacing row would show up.
    await renderCard();
    const before = await db.attempts.count();
    await answerWith('Ab');
    expect(reveal()).not.toBeNull();
    expect(await db.attempts.count()).toBe(before);
    expect(await db.spacingState.count()).toBe(0);
  });

  it('takes no press — it is a picture, not a question', async () => {
    await renderCard();
    await answerWith('Ab');
    const svg = reveal()!.querySelector('svg') as SVGSVGElement;
    expect(svg, 'the board is there').not.toBeNull();
    await act(async () => {
      svg.dispatchEvent(new MouseEvent('click', {
        bubbles: true, clientX: 10, clientY: WH - 4,
      }));
    });
    // Still one card, still no extra rows: a press changed nothing.
    expect(await db.attempts.count()).toBe(0);
    expect(await db.spacingState.count()).toBe(0);
  });

  it('offers a way to hear it, and only after the answer', async () => {
    // `card-play` RATHER THAN A TEST ID OF THIS CARD'S OWN. Ruling 33
    // made the button one component for every family, so the id it
    // carries is the shared one — and this card's control being the
    // same control is the claim worth pinning.
    await renderCard();
    expect(container!.querySelector('[data-testid="card-play"]')).toBeNull();
    await answerWith('Ab');
    expect(container!.querySelector('[data-testid="card-play"]')).not.toBeNull();
  });

  it('is offered on the note→degree direction too', async () => {
    const placed = placeItCards().find(c => c.id === 'dgd-C-b6')!;
    await renderCard(placed);
    await answerWith('b6');
    expect(reveal()).not.toBeNull();
  });
});
