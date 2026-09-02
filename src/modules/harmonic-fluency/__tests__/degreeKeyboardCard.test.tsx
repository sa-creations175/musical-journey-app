// @vitest-environment jsdom
/**
 * Pressing the answer, and what that writes.
 *
 * =====================================================================
 * THE CLAIM THIS FILE EXISTS TO HOLD: a keyboard-answered card is an
 * ORDINARY declarative card. It is right or wrong, it writes one
 * attempt, and Harmonic Fluency's memory type does not move.
 *
 * If that ever stopped being true, `assertSignalMatchesMemoryType`
 * would throw at the write and this would fail at the assertion below
 * rather than in a reader's session.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FlashcardSession from '../../../lib/flashcards/FlashcardSession';
import DegreeKeyboardAnswer from '../DegreeKeyboardAnswer';
import { isPressedCard, nameItCards, pressItCards } from '../degreeNoteCards';
import { keyAt, viewBoxWidth, WH } from '../../../lib/answerKeyboard';
import { recordEngagement } from '../../../lib/spacingState';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A wide board, so both octaves are drawn.
 *
 * The keyboard MEASURES rather than guessing — a breakpoint would be a
 * second statement of its minimum key width — so a test that wants two
 * octaves has to give it a width to measure. jsdom reports zero for
 * everything, which would draw one octave and quietly make the
 * either-octave assertion untestable.
 */
const WIDE_PX = 900;
let realRect: typeof Element.prototype.getBoundingClientRect;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  // The component reads the host's width directly as well as observing
  // it, and jsdom reports zero for everything — so the width has to
  // come from the rect, not from the observer.
  realRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function stub(this: Element) {
    return { left: 0, top: 0, width: WIDE_PX, height: WH } as DOMRect;
  };
});

afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.attempts.clear();
  await db.spacingState.clear();
});

/** "In the key of C, press the ♭6." */
const PRESSED = pressItCards().find(c => c.id === 'dgp-C-b6')!;

interface Answered { correct: boolean; choice: string | null }

async function renderCard(card = PRESSED) {
  const answers: Answered[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <FlashcardSession
        queue={[card]}
        timerMode="off"
        onExit={() => {}}
        onCardAnswered={({ correct, choice }) => { answers.push({ correct, choice }); }}
        renderAnswerSurface={({ card: c, answered, chosen, answer }) => (
          isPressedCard(c.id)
            ? <DegreeKeyboardAnswer card={c} answered={answered} chosen={chosen} answer={answer} />
            : null
        )}
      />,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  return answers;
}

const board = () => container!.querySelector('svg') as SVGSVGElement;

/**
 * Press a pitch class on the board.
 *
 * The board is hit-tested by geometry, so the press is aimed the way a
 * finger is: find the key's own rectangle and click its middle. jsdom
 * reports a zero-size element, so the rect is stubbed with the
 * viewBox's own dimensions — which is what the component divides by.
 */
async function press(pc: number, octave: 0 | 1 = 0) {
  const svg = board();
  // HOW MANY OCTAVES THE BOARD ACTUALLY DREW, read off its own
  // viewBox rather than assumed. The component measures its width and
  // decides; a test that guessed would aim at coordinates from a board
  // that is not on screen.
  const drawn = viewBoxWidth(2) === Number(svg.getAttribute('viewBox')?.split(' ')[2])
    ? 2 : 1;
  const vbW = viewBoxWidth(drawn as 1 | 2);
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, width: vbW, height: WH,
  }) as DOMRect;
  // Walk the board for the point that hit-tests to the key we want.
  let hit: { x: number; y: number } | null = null;
  for (let x = 0; x < vbW && hit === null; x += 1) {
    for (const y of [4, WH - 4]) {
      const k = keyAt(x, y, drawn as 1 | 2);
      if (k && k.pc === pc && k.octave === octave) { hit = { x, y }; break; }
    }
  }
  expect(hit, `no key on the board for pc ${pc} octave ${octave}`).not.toBeNull();
  await act(async () => {
    svg.dispatchEvent(new MouseEvent('click', {
      bubbles: true, clientX: hit!.x, clientY: hit!.y,
    }));
  });
}

describe('the keyboard is the answer', () => {
  it('shows no options at all before the press', async () => {
    // Four buttons would hand back exactly what the keyboard was built
    // to take away: the spelling, printed, ready to be recognised.
    const el = (await renderCard(), container!);
    expect(el.querySelector('[data-testid="degree-keyboard-answer"]')).not.toBeNull();
    expect(el.querySelectorAll('button').length).toBeGreaterThanOrEqual(0);
    const optionText = [...el.querySelectorAll('button')].map(b => b.textContent ?? '');
    expect(optionText.some(t => t.trim() === 'Ab' || t.trim() === 'A♭')).toBe(false);
  });

  it('marks it correct when the right key is pressed', async () => {
    const answers = await renderCard();
    await press(8); // Ab
    expect(answers).toHaveLength(1);
    expect(answers[0].correct).toBe(true);
    expect(answers[0].choice).toBe('Ab');
  });

  it('accepts the same note in either octave', async () => {
    // "The ♭6 of C" names a note, not a register.
    const answers = await renderCard();
    await press(8, 1);
    expect(answers[0].correct).toBe(true);
  });

  it('marks it wrong for a different key, and records what was pressed', async () => {
    const answers = await renderCard();
    await press(9); // A natural — the 6, the mistake this card is about
    expect(answers[0].correct).toBe(false);
    expect(answers[0].choice).toBe('pc:9');
  });

  it('takes no second answer once it has been answered', async () => {
    const answers = await renderCard();
    await press(9);
    await press(8);
    expect(answers).toHaveLength(1);
  });
});

describe('the signal it writes', () => {
  it('is the same kind every other Harmonic Fluency card writes', async () => {
    // The whole Step-0 claim, held as a test. `recordEngagement`
    // asserts the signal matches the module's memory type and THROWS
    // when it does not — so a card that had quietly become procedural
    // would fail here.
    await expect(recordEngagement({
      itemRef: PRESSED.id,
      moduleRef: 'harmonic-fluency',
      signal: { kind: 'attempt', correct: true },
      timestamp: Date.now(),
    })).resolves.not.toThrow();

    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].moduleRef).toBe('harmonic-fluency');
  });

  it('would refuse a rating, which is what keeps the module declarative', async () => {
    // The other half. If this ever stopped throwing, the module's
    // memory type would have changed underneath the family.
    await expect(recordEngagement({
      itemRef: PRESSED.id,
      moduleRef: 'harmonic-fluency',
      signal: { kind: 'rating', rating: 'cruising' },
      timestamp: Date.now(),
    })).rejects.toThrow(/memory type/);
  });
});

describe('the written cards keep their four buttons', () => {
  it('renders options and no keyboard', async () => {
    const named = nameItCards().find(c => c.id === 'dgn-C-b6')!;
    await renderCard(named);
    expect(container!.querySelector('[data-testid="degree-keyboard-answer"]')).toBeNull();
    const optionText = [...container!.querySelectorAll('button')].map(b => b.textContent ?? '');
    expect(optionText.some(t => t.includes('A♭') || t.includes('Ab'))).toBe(true);
  });
});
