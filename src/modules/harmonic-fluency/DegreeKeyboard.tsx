/**
 * The visual aid, rendered on KEYS.
 *
 * =====================================================================
 * WHY THIS DID NOT EXIST, AND WHAT THAT LOOKED LIKE.
 *
 * `DisplayMode` has had three values since the module was built — text,
 * number grid, keyboard — and the toggle has offered all three. But the
 * dispatcher behind it switched on `card.category` alone and never read
 * the mode it was handed, so "keyboard" and "number grid" both drew the
 * linear scale strip and the toggle appeared to do nothing at all. The
 * mode was passed into the module and dropped there.
 *
 * This is what the third mode draws. It renders THE SAME FACTS the
 * strip does, and no others — same start, same reveal, same silence
 * before an answer — because a display mode is a choice of how to see
 * the card, never a choice of how much of it to see. A keyboard that
 * showed one more note than the strip would make "keyboard" the easier
 * mode, and the reader would pick it for that.
 * =====================================================================
 *
 * ONE OCTAVE, AND EVERY NOTE PLACED IN IT. Degrees are a pitch-class
 * idea here — "the 5 of C" is G wherever your hand is — so the notes
 * are not given octaves and `KeyboardVisual` resolves them all to the
 * one it draws. A two-octave keyboard would have to answer "which G",
 * which is a question the card never asks.
 */
import KeyboardVisual, { type HighlightedNote } from '../../components/KeyboardVisual';
import { degreeNote, parseKeyRoot, type Flashcard } from './catalog';

/** The scale, before the start and the reveal are painted over it. */
const SCALE_DEGREES = [1, 2, 3, 4, 5, 6, 7];

export interface DegreeKeyboardSpec {
  /** Root name for the keyboard's sharp/flat spelling, or null when the
   *  card has not named a key. */
  keyRoot: string | null;
  notes: HighlightedNote[];
}

/**
 * What to light, from the same hint the strip reads.
 *
 * TWO SHAPES, and which one applies is decided by whether the hint
 * names a key — not by the category, so a card that grows a key later
 * picks up the fuller drawing without this being edited.
 *
 *   WITH A KEY  the seven scale degrees sit neutral, the starting
 *               degree is blue, and the destination is painted in on
 *               the reveal. The strip labels all seven the same way.
 *
 *   WITHOUT ONE the key is what is being ASKED — "C is the 1 of which
 *               major key?" — so only the starting note shows, and the
 *               tonic joins it on the reveal. Lighting a scale here
 *               would be printing the answer.
 *
 * `KeyboardVisual` takes the FIRST highlight that matches a key, so the
 * list is built most-specific first: the reveal, then the start, then
 * the scale underneath them. Building it in reading order would put the
 * neutral scale in front and swallow both.
 */
export function degreeKeyboardSpec(
  card: Flashcard,
  answered: boolean,
  correct: boolean,
): DegreeKeyboardSpec | null {
  const hint = card.visualHint;
  if (!hint || hint.startingDegree === undefined) return null;

  const notes: HighlightedNote[] = [];
  const revealColor = correct ? 'green' : 'red';

  if (hint.key) {
    const root = parseKeyRoot(hint.key);
    if (answered && hint.destinationDegree !== undefined) {
      notes.push({
        note: degreeNote(root, hint.destinationDegree),
        color: revealColor,
      });
    }
    notes.push({ note: degreeNote(root, hint.startingDegree), color: 'blue' });
    for (const d of SCALE_DEGREES) {
      notes.push({ note: degreeNote(root, d), color: 'neutral' });
    }
    return { keyRoot: root, notes };
  }

  if (!hint.startingNote) return null;
  if (answered) {
    // The answer names the key; its root is the tonic the reader was
    // asked to find. Same source the strip's after-answer label uses.
    notes.push({ note: parseKeyRoot(card.correctAnswer), color: revealColor });
  }
  notes.push({ note: hint.startingNote, color: 'blue' });
  return { keyRoot: null, notes };
}

export default function DegreeKeyboard({
  card, answered, correct,
}: {
  card: Flashcard;
  answered: boolean;
  correct: boolean;
}) {
  const spec = degreeKeyboardSpec(card, answered, correct);
  if (spec === null) return null;
  return (
    <div className="flex justify-center" data-testid="degree-keyboard">
      <KeyboardVisual
        keySignature={spec.keyRoot === null ? undefined : `${spec.keyRoot} major`}
        keyLabel={card.visualHint?.key}
        highlightedNotes={spec.notes}
        octaves={1}
        startOctave={4}
        width={260}
      />
    </div>
  );
}
