/**
 * Which built surface a card gets, or none.
 *
 * =====================================================================
 * ONE DISPATCH, READ OFF THE TARGET AND NOT OFF THE CATEGORY.
 *
 * `builtTargetFor` already decided whether this card can be built and
 * what shape the answer takes; switching on the target's `kind` rather
 * than on the card's category means a family that gains a second
 * question shape gets the right surface without this file being
 * edited — and a card whose axis is missing gets the four buttons
 * rather than a broken picker.
 * =====================================================================
 */
import type { Flashcard } from '../catalog';
import { builtTargetFor } from './cardTargets';
import ProgressionAnswer from './ProgressionAnswer';
import RootAnswer from './RootAnswer';
import ScaleAnswer from './ScaleAnswer';
import SignatureAnswer from './SignatureAnswer';
import SlashAnswer from './SlashAnswer';

export default function BuiltAnswer({
  card, answered, answer,
}: {
  card: Flashcard;
  answered: boolean;
  answer: (choice: string) => void;
}) {
  const target = builtTargetFor(card);
  if (target === null) return null;
  switch (target.kind) {
    case 'progression':
      return (
        /**
         * KEYED ON THE CARD, so a new card is a new build.
         *
         * The shell keeps one surface mounted and hands it a different
         * card, so without this the slots a reader filled in for one
         * progression would still be sitting there for the next.
         * Remounting is how React is told "this is a different thing",
         * and it beats an effect that reaches in and clears six pieces
         * of state on a dependency change.
         */
        <ProgressionAnswer
          key={card.id}
          card={card}
          target={target}
          answered={answered}
          answer={answer}
        />
      );
    case 'slash':
      return (
        <SlashAnswer
          key={card.id}
          card={card}
          target={target}
          answered={answered}
          answer={answer}
        />
      );
    case 'scale':
      return (
        <ScaleAnswer
          key={card.id}
          card={card}
          target={target}
          answered={answered}
          answer={answer}
        />
      );
    case 'root':
      return (
        <RootAnswer
          key={card.id}
          card={card}
          target={target}
          answered={answered}
          answer={answer}
        />
      );
    case 'signature':
      return (
        <SignatureAnswer
          key={card.id}
          card={card}
          target={target}
          answered={answered}
          answer={answer}
        />
      );
  }
}
