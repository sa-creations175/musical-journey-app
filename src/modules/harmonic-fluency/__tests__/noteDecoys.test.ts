/**
 * A decoy must not give the answer away by looking different from it.
 *
 * `noteDecoys` built its wrong answers with the SHARP table
 * unconditionally, whatever the correct answer was spelled with. So on
 * every card whose answer is a flat, the options read:
 *
 *     Ab      ← correct
 *     G       F#      A
 *
 * One flat, three not. The card is answerable without knowing any
 * theory: pick the odd one out. That is a correctness bug in the drill,
 * independent of the spelling setting and older than it — and it bites
 * hardest in `enharmonic-equivalents`, the category whose entire
 * subject is that Ab and G# are the same pitch.
 */
import { describe, it, expect } from 'vitest';
import { FLASHCARDS } from '../catalog';

/** Does this note name carry a flat, a sharp, or neither? */
function accidental(note: string): 'flat' | 'sharp' | 'natural' {
  if (/[b♭]/.test(note.slice(1))) return 'flat';
  if (/[#♯]/.test(note.slice(1))) return 'sharp';
  return 'natural';
}

/** Cards whose answer is a single note name — the ones noteDecoys serves. */
const NOTE_ANSWER_CATEGORIES = new Set(['tritone-pairs', 'enharmonic-equivalents']);
const singleNote = (s: string) => /^[A-G][b#♭♯]?$/.test(s);

const noteCards = FLASHCARDS.filter(
  c => NOTE_ANSWER_CATEGORIES.has(c.category)
    && singleNote(c.correctAnswer)
    && (c.decoys ?? []).every(singleNote),
);

describe('note decoys do not single out the answer by accidental', () => {
  it('has cards to check', () => {
    expect(noteCards.length).toBeGreaterThan(10);
  });

  it('never leaves the correct answer as the only flat on screen', () => {
    for (const card of noteCards) {
      if (accidental(card.correctAnswer) !== 'flat') continue;
      const options = [card.correctAnswer, ...(card.decoys ?? [])];
      const flats = options.filter(o => accidental(o) === 'flat');
      expect(
        flats.length,
        `${card.id} "${card.question}" — options ${options.join(', ')}: `
        + 'the answer is the only flat, so the card is answerable by shape',
      ).toBeGreaterThan(1);
    }
  });

  it('never leaves the correct answer as the only sharp on screen', () => {
    for (const card of noteCards) {
      if (accidental(card.correctAnswer) !== 'sharp') continue;
      const options = [card.correctAnswer, ...(card.decoys ?? [])];
      const sharps = options.filter(o => accidental(o) === 'sharp');
      expect(
        sharps.length,
        `${card.id} "${card.question}" — options ${options.join(', ')}: `
        + 'the answer is the only sharp',
      ).toBeGreaterThan(1);
    }
  });

  it('still never offers a decoy that is the answer at another spelling', () => {
    // The existing guarantee, kept: a decoy sharing the answer's pitch
    // would make the card unanswerable rather than merely guessable.
    const PC: Record<string, number> = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6,
      Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
    };
    for (const card of noteCards) {
      const answerPc = PC[card.correctAnswer];
      if (answerPc === undefined) continue;
      for (const d of card.decoys ?? []) {
        expect(PC[d], `${card.id}: decoy ${d} is the answer ${card.correctAnswer}`)
          .not.toBe(answerPc);
      }
    }
  });
});
