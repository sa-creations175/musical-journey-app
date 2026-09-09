/**
 * Where the note sits, and what it sounds like — after you have named
 * it.
 *
 * =====================================================================
 * REVEAL-SIDE ONLY, AND THAT IS THE WHOLE PROTECTION.
 *
 * The rule is `DegreePlayback`'s, followed rather than restated:
 * playing the note before the answer "would turn a written question
 * into an ear question — a different card". The same argument covers
 * the keyboard. A board showing the answer while the question is still
 * open would let a reader find the note by looking instead of by
 * knowing, which is the thing this family exists to train.
 *
 * So the knowing comes first. The keyboard and the sound follow it and
 * never replace it.
 *
 * =====================================================================
 * IT WRITES NOTHING.
 *
 * No attempt, no engagement, no spacing signal. The card was already
 * scored by the shell when the option was tapped; this is what happens
 * after. That is what keeps a keyboard on a written card from becoming
 * a second, unscored assessment nobody asked for.
 * =====================================================================
 */
import AnswerKeyboard from '../../components/AnswerKeyboard';
import { degreePitchClass } from './chromaticDegrees';
import CardPlayback from './CardPlayback';
import type { Flashcard } from './catalog';

export default function DegreeNoteReveal({
  root, degreeId, card,
}: {
  root: string;
  degreeId: string;
  /** The card, for the shared play control — see `CardPlayback`. */
  card: Flashcard;
}) {
  const rootPc = degreePitchClass(root, '1');
  const notePc = degreePitchClass(root, degreeId);
  if (rootPc === null || notePc === null) return null;

  return (
    <div className="space-y-2 pt-2" data-testid="degree-note-reveal">
      {/* NOT INTERACTIVE. `revealed` is true from the first frame, which
          is what makes the board a picture rather than a question: the
          keyboard ignores presses once revealed, and the marks are on
          before the reader could reach for one. */}
      <AnswerKeyboard
        subject={{ pc: rootPc, octave: 0 }}
        accepted={[{ pc: notePc, octave: 0 }, { pc: notePc, octave: 1 }]}
        pressed={null}
        revealed
        onPress={() => {}}
      />
      {/* THE SHARED CONTROL, CENTRED UNDER THE BOARD (ruling 33). The
          only thing this card is allowed to differ on — see the
          allowed-to-differ list in `cardAudio`. */}
      <CardPlayback card={card} align="center" />
    </div>
  );
}
