/**
 * The parenthetical came off the answer. The teaching did not.
 *
 * =====================================================================
 * A TEST THAT ONLY CHECKS THE ANSWERS ARE CLEAN PASSES ON A DELETION.
 *
 * Fourteen cards carried an explanation inside the answer option —
 * "raised 9 (augmented 2nd above root)" against three bare decoys. The
 * bracket marked the right one, so the card was answerable by picking
 * the option that explained itself: the only bracketed option was the
 * answer on 14 of the 15 cards where exactly one had a bracket, 93%
 * against 25% chance. It is the gloss leak in different words, and the
 * rule was already in force — `catalogExpansions.ts` states it as "the
 * gloss lives in question text and explanations, where it can teach
 * without being a tell".
 *
 * Stripping the bracket satisfies the guard. Stripping it and deleting
 * what it said ALSO satisfies the guard, and quietly makes the deck
 * teach less. So the removed text is recorded here and every content
 * word of it must still be findable in that card's explanation.
 *
 * NOT GLOSSING THE DECOYS INSTEAD. Forcing a parenthetical onto three
 * decoys to hide which one is real produces claims nobody checked, and
 * where the gloss is a spelling it produces false ones — "A♭ (G♯)"
 * says G♯ is correct-but-unspoken when it is a spelling people write
 * every day. Same objection, recorded in the same place.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { BLIND_RULES } from '../decoyGuard';

/**
 * What was taken out of each answer, verbatim.
 *
 * A record, not a rule — this is the only place the old text survives,
 * so it is written out rather than derived from anything.
 */
const REMOVED: ReadonlyArray<{ id: string; parenthetical: string }> = [
  { id: 'cc-9', parenthetical: 'augmented 2nd above root' },
  { id: 'et-1', parenthetical: 'borrowed from parallel minor' },
  { id: 'et-8', parenthetical: 'Lydian color' },
  { id: 'et-11', parenthetical: 'as #9' },
  { id: 'fh-17', parenthetical: 'ii-V-I' },
  { id: 'fh-19', parenthetical: 'the 3rd chord' },
  { id: 'ksc-2', parenthetical: 'three flattened notes' },
  { id: 'ksc-16', parenthetical: 'C major → C minor' },
  { id: 'ksc-16', parenthetical: 'C major → A minor' },
  { id: 'mo-9', parenthetical: 'in a minor tonic' },
  { id: 'mo-16', parenthetical: "dominant 7 that doesn't resolve" },
  { id: 'pent-1', parenthetical: 'removes the 4th and 7th from the major scale' },
  { id: 'pent-9', parenthetical: 'or b3 of the minor root' },
  { id: 'pr-9', parenthetical: 'rotation' },
  { id: 'pr-17', parenthetical: 'dominant' },
];

/** Words too common to prove anything by their presence. */
const IGNORED = new Set(['a', 'an', 'the', 'of', 'or', 'is', 'as', 'in', 'to', 'that']);

function contentWords(phrase: string): string[] {
  return phrase
    .split(/[\s,.]+/)
    .map(w => w.trim())
    // A token with no letter or digit in it carries no teaching — the
    // arrow in "C major → C minor" is punctuation, and the explanation
    // draws the same relation with "↔".
    .filter(w => /[A-Za-z0-9]/.test(w) && !IGNORED.has(w.toLowerCase()));
}

const card = (id: string) => {
  const found = FLASHCARDS.find(c => c.id === id);
  expect(found, `no card ${id}`).toBeDefined();
  return found!;
};

describe('the fourteen stripped answers', () => {
  it('covers every card that had a lone bracket', () => {
    expect(new Set(REMOVED.map(r => r.id)).size).toBe(14);
  });

  for (const { id, parenthetical } of REMOVED) {
    it(`${id}: "${parenthetical}" survives in the explanation`, () => {
      const explanation = card(id).explanation ?? '';
      for (const word of contentWords(parenthetical)) {
        expect(
          explanation.toLowerCase(),
          `${id} lost "${word}" — the answer got shorter and the teaching went with it`,
        ).toContain(word.toLowerCase());
      }
    });
  }

  for (const { id } of REMOVED) {
    it(`${id}: the answer carries no bracket`, () => {
      expect(card(id).correctAnswer).not.toMatch(/[()]/);
    });
  }

  it('leaves no card in the deck where the bracket marks the answer', () => {
    const rule = BLIND_RULES.find(r => r.id === 'only-bracket')!;
    const caught = FLASHCARDS.filter(
      c => rule.pick([c.correctAnswer, ...c.decoys]) === c.correctAnswer,
    );
    expect(caught.map(c => c.id)).toEqual([]);
  });

  it('stops pent-1 from answering pent-2', () => {
    // A CROSS-CARD LEAK, AND A DIFFERENT DEFECT FROM THE BRACKET.
    // pent-1's parenthetical read "removes the 4th and 7th from the
    // major scale", and pent-2 asks which two notes the major
    // pentatonic removes — answer "The 4th and 7th". Drilling one
    // handed you the other before you had answered it.
    //
    // The phrase now lives in pent-1's explanation, which is where the
    // deck is supposed to teach that fact — after an answer, not
    // instead of one.
    const one = card('pent-1');
    const two = card('pent-2');
    expect(one.correctAnswer.toLowerCase())
      .not.toContain(two.correctAnswer.toLowerCase().replace(/^the /, ''));
    expect((one.explanation ?? '').toLowerCase()).toContain('4th and 7th');
  });
});
