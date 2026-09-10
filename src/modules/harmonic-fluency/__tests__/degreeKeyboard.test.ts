/**
 * The keyboard mode draws the card, not more of it.
 *
 * The rule these pin is the one that makes three display modes a
 * choice of view rather than a choice of difficulty: what the keyboard
 * lights before an answer is exactly what the strip labels before an
 * answer, and the reveal arrives at the same moment in both.
 */
import { describe, expect, it } from 'vitest';
import { degreeKeyboardSpec } from '../DegreeKeyboard';
import {
  FLASHCARDS, degreeNote, parseKeyRoot, type Flashcard,
} from '../catalog';

const firstOf = (category: string): Flashcard => {
  const card = FLASHCARDS.find(
    c => c.category === category && c.visualHint?.startingDegree !== undefined,
  );
  if (!card) throw new Error(`no ${category} card carries a starting degree`);
  return card;
};

/** The colour the keyboard would paint a note — first match wins, the
 *  same rule `KeyboardVisual` applies. */
const colourOf = (
  spec: ReturnType<typeof degreeKeyboardSpec>,
  note: string,
) => spec?.notes.find(n => n.note === note)?.color ?? null;

describe('a card that names its key', () => {
  // The F♯ card, the one survivor of the Named Notes fold-in — and the
  // only card in `degree-notes` that carries a `visualHint` at all.
  const card = firstOf('degree-notes');
  const root = parseKeyRoot(card.visualHint!.key!);

  it('lights the whole scale, with the start on top of it', () => {
    const spec = degreeKeyboardSpec(card, false, false)!;
    expect(spec.keyRoot).toBe(root);
    for (const d of [1, 2, 3, 4, 5, 6, 7]) {
      expect(colourOf(spec, degreeNote(root, d)), `degree ${d}`).not.toBeNull();
    }
    expect(colourOf(spec, degreeNote(root, card.visualHint!.startingDegree!)))
      .toBe('blue');
  });

  it('holds the destination back until the card is answered', () => {
    const dest = degreeNote(root, card.visualHint!.destinationDegree!);
    const before = degreeKeyboardSpec(card, false, false)!;
    // Before: it is in the scale like any other degree, saying nothing.
    expect(colourOf(before, dest)).toBe('neutral');
    expect(before.notes.some(n => n.color === 'green' || n.color === 'red'))
      .toBe(false);
    expect(colourOf(degreeKeyboardSpec(card, true, true)!, dest)).toBe('green');
    expect(colourOf(degreeKeyboardSpec(card, true, false)!, dest)).toBe('red');
  });
});

describe('a card whose ANSWER is the key', () => {
  /**
   * BUILT HERE, BECAUSE NO CARD IN THE DECK REACHES THIS BRANCH.
   *
   * It used to be read off `generateReversePivotCards`, which retired
   * into `degree-notes` on 3 Sep 2026 and was deleted with the
   * migration passes on 10 Sep. The generated replacements ask the same
   * question — "C♭ (B) is the 4 of which major key?" — and carry no
   * `visualHint`, so nothing draws a keyboard for them today.
   *
   * THE BRANCH IS KEPT AND SO IS ITS TEST. `degreeKeyboardSpec` decides
   * which shape to draw from whether the HINT names a key, not from a
   * category — its own header says so — so this is a live rule about a
   * kind of card rather than support for one generator. A branch that
   * stops being exercised and stops being tested on the same day is a
   * branch nobody notices rotting; the fixture is what keeps the second
   * half of that from happening.
   */
  const card = {
    id: 'test-key-answer',
    category: 'degree-notes',
    categoryName: 'Notes of the Number System',
    question: 'C♭ (B) is the 4 of which major key?',
    correctAnswer: 'Gb major',
    decoys: ['C major', 'D major', 'E major'],
    skillTag: 'test',
    visualHint: { startingNote: 'Cb', startingDegree: 4 },
  } as unknown as Flashcard;

  it('lights the starting note and nothing else', () => {
    // A scale here would print the answer: the question is which key
    // this note is the 4 of.
    const spec = degreeKeyboardSpec(card, false, false)!;
    expect(spec.keyRoot).toBeNull();
    expect(spec.notes).toHaveLength(1);
    expect(spec.notes[0]).toEqual({ note: card.visualHint!.startingNote, color: 'blue' });
  });

  it('adds the tonic on the reveal, read off the answer', () => {
    const spec = degreeKeyboardSpec(card, true, true)!;
    expect(colourOf(spec, parseKeyRoot(card.correctAnswer))).toBe('green');
  });

  it('is a shape the deck no longer produces, and that is checked', () => {
    // If a generated card ever grows a keyless hint again, this fails
    // and the comment above it stops being true.
    expect(FLASHCARDS.filter(
      c => c.visualHint?.startingDegree !== undefined && !c.visualHint.key,
    )).toEqual([]);
  });
});

describe('a card with nothing to draw', () => {
  it('draws nothing rather than an empty keyboard', () => {
    const bare = FLASHCARDS.find(c => c.visualHint === undefined)!;
    expect(degreeKeyboardSpec(bare, false, false)).toBeNull();
  });
});
