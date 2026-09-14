// @vitest-environment jsdom
/**
 * A Harmonic Fluency card that answers by picking shows its four buttons.
 *
 * =====================================================================
 * THE BUG THIS HOLDS (13 Sep 2026): the session handed the shell an
 * element for every card that was not pressed, and the shell only draws
 * the buttons when it is handed null. `BuiltAnswer` returned null inside
 * itself, too late, so a Diatonic Chord Qualities card showed its
 * question and nothing to tap. The old guard rendered the shell with a
 * stand-in function, not the session's, and so never saw it.
 *
 * So these go through the function the session actually passes, and a
 * last check reads the session's source to be sure it still passes it.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, isValidElement } from 'react';
import FlashcardSession from '../../../lib/flashcards/FlashcardSession';
import { FLASHCARDS } from '../catalog';
import { renderHfAnswerSurface } from '../answerSurface';
import { builtTargetFor } from '../builtAnswers/cardTargets';
import BuiltAnswer from '../builtAnswers/BuiltAnswer';
import DegreeKeyboardAnswer from '../DegreeKeyboardAnswer';
import { isPressedCard } from '../degreeNoteCards';
import { db } from '../../../lib/db';
import sessionSource from '../HarmonicFluencySession.tsx?raw';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** "In major, what quality is the 4 chord?" — the card Silas could not answer. */
const QUALITY_CARD = FLASHCARDS.find(c => c.id === 'dq-maj-4')!;
const PROGRESSION_CARD = FLASHCARDS.find(c => c.category === 'progressions' && builtTargetFor(c) !== null)!;
const PRESSED_CARD = FLASHCARDS.find(c => isPressedCard(c.id))!;

const surfaceFor = (card: typeof QUALITY_CARD) =>
  renderHfAnswerSurface({ card, answered: false, chosen: null, answer: () => {} });

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.attempts.clear();
  await db.spacingState.clear();
});

describe('which surface a card answers with', () => {
  it('a card that answers by picking gets null, so the shell draws its buttons', () => {
    expect(builtTargetFor(QUALITY_CARD)).toBeNull();
    expect(surfaceFor(QUALITY_CARD)).toBeNull();
  });

  it('a progression card builds its answer', () => {
    expect(PROGRESSION_CARD).toBeDefined();
    const surface = surfaceFor(PROGRESSION_CARD);
    expect(isValidElement(surface) && surface.type).toBe(BuiltAnswer);
  });

  it('a pressed card answers on the keyboard', () => {
    expect(PRESSED_CARD).toBeDefined();
    const surface = surfaceFor(PRESSED_CARD);
    expect(isValidElement(surface) && surface.type).toBe(DegreeKeyboardAnswer);
  });

  it('no card in the deck is handed an element that draws nothing', () => {
    // Every card either picks (null) or has somewhere to answer.
    for (const card of FLASHCARDS) {
      const surface = surfaceFor(card);
      if (surface === null) continue;
      expect(isPressedCard(card.id) || builtTargetFor(card) !== null, card.id).toBe(true);
    }
  });
});

describe('through the session shell, with the session\'s own function', () => {
  it('In major, what quality is the 4 chord? shows four buttons, the answer among them', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <FlashcardSession
          queue={[QUALITY_CARD]}
          timerMode="off"
          onExit={() => {}}
          onCardAnswered={() => {}}
          renderAnswerSurface={renderHfAnswerSurface}
        />,
      );
    });
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent ?? '');
    for (const option of [QUALITY_CARD.correctAnswer, ...QUALITY_CARD.decoys]) {
      expect(buttons.some(t => t.includes(option)), option).toBe(true);
    }
  });

  it('the session passes this function and nothing inline', () => {
    expect(sessionSource).toContain('renderAnswerSurface={renderHfAnswerSurface}');
  });
});
