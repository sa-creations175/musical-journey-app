/**
 * The hand-written cards of Chord Construction, Functional Harmony and
 * Mode Identification, in the app's own conventions (Silas, 13 Sep 2026).
 *
 * =====================================================================
 * EVERY SURVIVING `cc-`, `fh-` AND `mo-` CARD WITH A NUMBERED ID, on its
 * question, answer, decoys and explanation. The generated cards in the
 * same categories carry their own rules and their own tests, and are not
 * what the 14 Sep review read.
 *
 * Each rule is the one on the Decisions page, checked as a pattern rather
 * than as a list of strings, so a card rewritten later in the old style
 * fails here without anyone having to remember this file exists.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, type Flashcard } from '../catalog';

const HAND_WRITTEN = FLASHCARDS.filter(c => /^(cc|fh|mo)-\d+$/.test(c.id));

const textsOf = (c: Flashcard): string[] =>
  [c.question, c.correctAnswer, ...c.decoys, c.explanation ?? ''];

/** Every piece of text on a card, with the card's id for the failure. */
const everyText = (): Array<[string, string]> =>
  HAND_WRITTEN.flatMap(c => textsOf(c).map((t): [string, string] => [c.id, t]));

describe('the cards in scope', () => {
  it('are the forty-four that survived the cleanup', () => {
    // 20 Chord Construction, 14 Functional Harmony, 10 Mode Identification.
    expect(HAND_WRITTEN).toHaveLength(44);
  });
});

describe('the conventions', () => {
  it('writes numbers, not Roman numerals', () => {
    // A song title is not a chord: "I Wish" stays.
    const roman = /(^|[^A-Za-z])(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)(°|ø|\+)?(?![A-Za-z'])/;
    for (const [id, text] of everyText()) {
      expect(text.replace("'I Wish'", ''), id).not.toMatch(roman);
    }
  });

  it('writes ♭ and ♯, never b and #', () => {
    for (const [id, text] of everyText()) {
      expect(text, id).not.toContain('#');
      expect(text, id).not.toMatch(/(^|[^A-Za-z])[A-G]b(?![a-z])/);
      expect(text, id).not.toMatch(/(^|[^A-Za-z])b\d/);
    }
  });

  it('joins chords in a row with a middle dot', () => {
    for (const [id, text] of everyText()) {
      expect(text, id).not.toContain(' | ');
      expect(text, id).not.toMatch(/\b\d+m?-\d+m?-\d+m?/);
    }
  });

  it('names a quality the way the Diatonic cards do', () => {
    expect(FLASHCARDS.find(c => c.id === 'cc-8')!.correctAnswer).toBe('half-diminished (ø)');
    expect(FLASHCARDS.find(c => c.id === 'cc-15')!.explanation).toContain('minor-major 7 (mMaj7)');
    for (const [id, text] of everyText()) {
      expect(text, id).not.toContain('half-diminished 7');
      expect(text, id).not.toContain('m(maj7)');
    }
  });

  it('carries no em dash', () => {
    for (const [id, text] of everyText()) expect(text, id).not.toContain('—');
  });

  it('asks the Circle of 4ths the way the app drills it', () => {
    const card = FLASHCARDS.find(c => c.id === 'fh-17')!;
    expect(card.question).toBe('The Circle of 4ths moves each chord by _____');
    expect(card.correctAnswer).toBe('up a perfect 4th (down a 5th)');
    for (const [id, text] of everyText()) {
      expect(text.toLowerCase(), id).not.toContain('circle of fifths');
    }
  });
});

describe('no question contains its answer', () => {
  it('holds for every card in scope', () => {
    for (const c of HAND_WRITTEN) {
      expect(c.question.includes(c.correctAnswer), c.id).toBe(false);
    }
  });
});
