/**
 * What a Harmonic Fluency card answers with, in place of the four
 * buttons — or null, which leaves the four buttons.
 *
 * =====================================================================
 * NULL MEANS THE BUTTONS, AND AN ELEMENT IS NEVER NULL.
 *
 * `FlashcardSession` draws `answerSurface ?? (four buttons)`. It used to
 * be handed `<BuiltAnswer />` for every card that was not pressed, and
 * `BuiltAnswer` returns null INSIDE itself when the card has no built
 * target — but by then the session already holds an element, so the
 * four buttons never drew. Every card that answers by picking (Diatonic
 * Chord Qualities among them) showed its question and nothing to tap.
 * Found 13 Sep 2026; it had been so since 9 Sep.
 *
 * So the decision is made here, before an element exists:
 *   · a pressed card answers on the keyboard
 *   · a card with a built target builds its answer
 *   · every other card returns null, and gets its four buttons
 * =====================================================================
 */
import type { ReactNode } from 'react';
import type { Flashcard } from './catalog';
import DegreeKeyboardAnswer from './DegreeKeyboardAnswer';
import BuiltAnswer from './builtAnswers/BuiltAnswer';
import { builtTargetFor } from './builtAnswers/cardTargets';
import { isPressedCard } from './degreeNoteCards';

export function renderHfAnswerSurface({ card, answered, chosen, answer }: {
  card: Flashcard;
  answered: boolean;
  chosen: string | null;
  answer: (choice: string) => void;
}): ReactNode | null {
  if (isPressedCard(card.id)) {
    return <DegreeKeyboardAnswer card={card} answered={answered} chosen={chosen} answer={answer} />;
  }
  if (builtTargetFor(card) !== null) {
    return <BuiltAnswer card={card} answered={answered} answer={answer} />;
  }
  return null;
}
