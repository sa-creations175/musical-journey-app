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
  // `pent-1` AND `pent-9` RETIRED IN COMMIT 8 with the rest of the
  // pentatonic formula cards — pick the notes, per key, no formulas.
  // Their entries stay as the record of what was stripped; the tests
  // below skip a card that is no longer in the deck rather than
  // asserting against nothing.
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

/** Retired since the strip, so there is nothing left to assert about
 *  their explanations. Named rather than filtered silently. */
// `et-1`, `et-8` and `et-11` went with Ear-Theory Crossover on 14 Sep 2026,
// and `fh-19` retired the same day.
const RETIRED_SINCE = new Set(['pent-1', 'pent-9', 'et-1', 'et-8', 'et-11', 'fh-19']);

/**
 * Rewritten since the strip, by a ruling that changed the words the
 * teaching is written in. `fh-17` became "The Circle of 4ths moves each
 * chord by _____" on 14 Sep 2026: its answer was given its own bracket,
 * "(down a 5th)", with a bracket on every decoy to match, and ii-V-I is
 * written 2 · 5 · 1 in the app's numbers. What it must still teach is
 * named here instead of the stripped words.
 */
const REWRITTEN_SINCE: ReadonlyMap<string, string> = new Map([['fh-17', '2 · 5 · 1']]);

describe('the fourteen stripped answers', () => {
  it('covers every card that had a lone bracket', () => {
    // Twelve distinct cards, from the fourteen strips: `ksc-16` was
    // stripped twice, and `pent-9`'s entry went with the card when the
    // pentatonic formula cards retired in commit 8. `pent-1` keeps its
    // entry as the record of what was taken out of it.
    expect(new Set(REMOVED.map(r => r.id)).size).toBe(12);
  });

  for (const [id, teaching] of REWRITTEN_SINCE) {
    it(`${id}: rewritten, and still teaches "${teaching}"`, () => {
      expect(card(id).explanation ?? '').toContain(teaching);
    });
  }

  for (const { id, parenthetical } of REMOVED) {
    if (RETIRED_SINCE.has(id) || REWRITTEN_SINCE.has(id)) continue;
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
    if (RETIRED_SINCE.has(id) || REWRITTEN_SINCE.has(id)) continue;
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

  it('no longer has a pent-1 to answer pent-2 with', () => {
    // A CROSS-CARD LEAK, AND A DIFFERENT DEFECT FROM THE BRACKET.
    // pent-1's parenthetical read "removes the 4th and 7th from the
    // major scale", and pent-2 asked which two notes the major
    // pentatonic removes. Drilling one handed you the other before you
    // had answered it.
    //
    // Commit 8 retired both — pick the notes, per key, no formulas —
    // which closes the leak by removing the pair rather than by
    // rewording either. Asserted rather than deleted, so a formula card
    // coming back brings the question of the leak back with it.
    for (const id of ['pent-1', 'pent-2']) {
      expect(FLASHCARDS.some(c => c.id === id), id).toBe(false);
    }
    expect(FLASHCARDS.some(c => c.category === 'pentatonic-scales'
      && /make up the .* pentatonic scale/.test(c.question))).toBe(false);
  });
});
