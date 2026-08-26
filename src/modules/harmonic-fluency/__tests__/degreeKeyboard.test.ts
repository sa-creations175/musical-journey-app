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
import { FLASHCARDS, degreeNote, parseKeyRoot, type Flashcard } from '../catalog';

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
  const card = firstOf('named-notes');
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
  const card = firstOf('reverse-key-pivots');

  it('lights the starting note and nothing else', () => {
    // A scale here would print the answer: the question is which key
    // this note is the 1 of.
    const spec = degreeKeyboardSpec(card, false, false)!;
    expect(spec.keyRoot).toBeNull();
    expect(spec.notes).toHaveLength(1);
    expect(spec.notes[0]).toEqual({ note: card.visualHint!.startingNote, color: 'blue' });
  });

  it('adds the tonic on the reveal, read off the answer', () => {
    const spec = degreeKeyboardSpec(card, true, true)!;
    expect(colourOf(spec, parseKeyRoot(card.correctAnswer))).toBe('green');
  });
});

describe('a card with nothing to draw', () => {
  it('draws nothing rather than an empty keyboard', () => {
    const bare = FLASHCARDS.find(c => c.visualHint === undefined)!;
    expect(degreeKeyboardSpec(bare, false, false)).toBeNull();
  });
});
