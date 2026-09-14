/**
 * The folds of 14 Sep 2026, proved one pair at a time.
 *
 * =====================================================================
 * A FOLD SAYS "THIS RETIRED CARD ASKED WHAT THAT LIVE CARD ASKS", and a
 * wrong one fails nothing on screen: the live card simply reads more
 * practised than it is. The migration cannot read the deck, so the claim
 * is checked here, against it.
 *
 * WHAT IS COMPARED FOR EAR-THEORY CROSSOVER. Its cards described a sound
 * and their targets state a theory fact, so no sentence matches. Each pair
 * records the retired card's own answer (the card is gone; this is where
 * the answer survives), and asserts the live card still asks about the
 * same thing and still answers it the same way. If a target is reworded
 * into asking something else, its pair fails here.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER, FLASHCARDS, cardById } from '../catalog';
import {
  EAR_THEORY_FOLDS, EAR_THEORY_WITHOUT_DESTINATION,
} from '../../../lib/migrations/hfDeckCleanup';

interface Pair {
  from: string;
  /** The retired card's correct answer, verbatim. A record. */
  answered: string;
  to: string;
  /** What the live card's question has to be about. */
  asks: RegExp;
  /** The live card's correct answer. */
  answers: string;
}

const EAR_THEORY_PAIRS: readonly Pair[] = [
  { from: 'et-1', answered: 'iv minor', to: 'fh-15', asks: /iv minor/, answers: 'parallel minor' },
  { from: 'et-3', answered: 'bVII borrowed from Mixolydian', to: 'fh-14', asks: /bVII/, answers: 'Mixolydian / parallel minor' },
  { from: 'et-4', answered: 'bVII', to: 'fh-14', asks: /bVII/, answers: 'Mixolydian / parallel minor' },
  { from: 'et-6', answered: 'deceptive cadences (V - vi)', to: 'fh-6', asks: /V goes to vi/, answers: 'deceptive cadence' },
  { from: 'et-7', answered: 'sus4', to: 'cc-13', asks: /sus4/, answers: 'the 4th' },
  { from: 'et-8', answered: 'IV maj7#11', to: 'mo-15', asks: /Lydian/, answers: 'I maj7#11' },
  { from: 'et-9', answered: 'minor-major 7', to: 'cc-15', asks: /Am\(maj7\)/, answers: 'A C E G#' },
  { from: 'et-11', answered: 'major 3rd and minor 3rd', to: 'cc-9', asks: /7#9/, answers: 'raised 9' },
  { from: 'et-14', answered: 'Mixolydian', to: 'mo-16', asks: /Mixolydian/, answers: 'I7 as a tonic' },
  { from: 'et-15', answered: 'the Amen cadence', to: 'fh-4', asks: /Amen/, answers: 'plagal cadence' },
];

describe('Ear-Theory Crossover is gone', () => {
  it('leaves no card and no category behind', () => {
    expect(FLASHCARDS.filter(c => /^et-\d+$/.test(c.id)).map(c => c.id)).toEqual([]);
    expect(CATEGORY_ORDER as readonly string[]).not.toContain('ear-theory');
  });

  it('folds exactly the pairs written here, and names the rest as having nowhere to go', () => {
    expect(EAR_THEORY_FOLDS).toEqual(
      Object.fromEntries(EAR_THEORY_PAIRS.map(p => [p.from, p.to])),
    );
    for (const id of EAR_THEORY_WITHOUT_DESTINATION) {
      expect(EAR_THEORY_PAIRS.some(p => p.from === id), id).toBe(false);
    }
  });
});

describe('each Ear-Theory card folds onto the card that asks its fact', () => {
  for (const pair of EAR_THEORY_PAIRS) {
    it(`${pair.from} (${pair.answered}) → ${pair.to}`, () => {
      const target = cardById(pair.to);
      expect(target, `${pair.to} is in the deck`).toBeDefined();
      expect(target!.question).toMatch(pair.asks);
      expect(target!.correctAnswer).toBe(pair.answers);
    });
  }
});
