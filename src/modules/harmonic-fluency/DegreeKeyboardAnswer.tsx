/**
 * Answer a degree card by finding the key.
 *
 * =====================================================================
 * THIS IS THE ASSESSMENT, AND THAT IS THE DIFFERENCE.
 *
 * On the two written types the keyboard appears AFTER the answer and
 * writes nothing — it shows where the note sits once you have named it.
 * Here the keyboard IS the question: "in the key of C, press the ♭6",
 * and locating it is the skill being tested.
 *
 * Which is why nothing on the board helps. `AnswerKeyboard`'s own
 * header forbids candidate highlighting, dimming and hover hints, and
 * this passes it nothing that would amount to one: before submission
 * the only mark is the subject — the key itself — because a card that
 * did not say which C it meant would be asking a different question.
 *
 * =====================================================================
 * A PITCH CLASS, IN WHATEVER OCTAVE THE HAND REACHES FOR.
 *
 * "The ♭6 of C" names a note, not a register. So both A♭s on a
 * two-octave board are accepted, and the card says so rather than the
 * keyboard assuming it: a directional interval would accept exactly
 * one, and the keyboard deliberately knows neither rule.
 *
 * The press is turned into the card's own answer string before it
 * reaches the shell, so the shell judges this card the way it judges
 * every other one — string against `correctAnswer`. See
 * `renderAnswerSurface`.
 * =====================================================================
 */
import AnswerKeyboard from '../../components/AnswerKeyboard';
import type { KeyPosition } from '../../lib/answerKeyboard';
import type { Flashcard } from './catalog';
import { parsePressedId, pressedPitchClass, pressedRootPitchClass } from './degreeNoteCards';

/** Both octaves of the board, for an answer that names a note rather
 *  than a register. */
function acceptedPositions(pc: number): KeyPosition[] {
  return [{ pc, octave: 0 }, { pc, octave: 1 }];
}

export default function DegreeKeyboardAnswer({
  card, answered, chosen, answer,
}: {
  card: Flashcard;
  answered: boolean;
  chosen: string | null;
  answer: (choice: string) => void;
}) {
  const targetPc = pressedPitchClass(card.id);
  const rootPc = pressedRootPitchClass(card.id);
  const parsed = parsePressedId(card.id);
  // A card whose root or degree cannot be placed has no board to draw.
  // Reachable only through a malformed id, and falling back to null
  // hands the reader the ordinary four buttons rather than a broken
  // keyboard.
  if (targetPc === null || rootPc === null || parsed === null) return null;

  /**
   * What the reader pressed, as a board position.
   *
   * Derived from the chosen ANSWER STRING rather than held as state,
   * because the shell owns what was chosen — a second copy here would
   * be a second answer to "what did they press", and Previous would
   * show one of them.
   */
  const pressed: KeyPosition | null = chosen === null
    ? null
    : { pc: pitchClassOfChoice(chosen, targetPc), octave: 0 };

  return (
    <div className="space-y-2" data-testid="degree-keyboard-answer">
      <AnswerKeyboard
        subject={{ pc: rootPc, octave: 0 }}
        accepted={acceptedPositions(targetPc)}
        pressed={pressed}
        revealed={answered}
        onPress={key => {
          if (answered) return;
          // THE CARD JUDGES. A press on the right pitch class, in
          // either octave, IS the answer — so it is turned into the
          // answer string and the shell's one comparison does the rest.
          // Anything else is sent as the note it actually names, so the
          // attempt records what the reader really did.
          answer(key.pc === targetPc ? card.correctAnswer : `pc:${key.pc}`);
        }}
      />
    </div>
  );
}

/**
 * The pitch class behind a recorded choice.
 *
 * A right answer is stored as the note's name; a wrong one as the
 * pitch class that was actually pressed, because a wrong key may name
 * a note this card never mentions and inventing a spelling for it would
 * put a note in the attempt row that nobody played.
 */
function pitchClassOfChoice(choice: string, targetPc: number): number {
  const m = /^pc:(\d+)$/.exec(choice);
  return m === null ? targetPc : Number(m[1]);
}
