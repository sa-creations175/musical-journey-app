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
import { MODE_BY_DEGREE } from '../catalogExpansions';
import {
  DUPLICATE_FOLDS, DUPLICATES_WITHOUT_DESTINATION,
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
  { from: 'et-1', answered: 'iv minor', to: 'fh-15', asks: /4m chord/, answers: 'parallel minor' },
  { from: 'et-3', answered: 'bVII borrowed from Mixolydian', to: 'fh-14', asks: /♭7 chord/, answers: 'Mixolydian / parallel minor' },
  { from: 'et-4', answered: 'bVII', to: 'fh-14', asks: /♭7 chord/, answers: 'Mixolydian / parallel minor' },
  { from: 'et-6', answered: 'deceptive cadences (V - vi)', to: 'fh-6', asks: /5 goes to the 6m/, answers: 'deceptive cadence' },
  { from: 'et-7', answered: 'sus4', to: 'cc-13', asks: /sus4/, answers: 'the 4th' },
  { from: 'et-8', answered: 'IV maj7#11', to: 'mo-15', asks: /Lydian/, answers: 'the 1 as a maj7♯11 chord' },
  { from: 'et-9', answered: 'minor-major 7', to: 'cc-15', asks: /AmMaj7/, answers: 'A C E G♯' },
  { from: 'et-11', answered: 'major 3rd and minor 3rd', to: 'cc-9', asks: /7♯9/, answers: 'raised 9' },
  { from: 'et-14', answered: 'Mixolydian', to: 'mo-16', asks: /Mixolydian/, answers: 'the 1 as a 7 chord' },
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

/**
 * THE MODE CARDS ARE COMPARED ON WHAT THEY ARE ABOUT. `mo-1` asked
 * "Dorian mode starts on which scale degree?" and answered 2; the live
 * card asks for the mode of the key of C major starting on its 2 and
 * answers D Dorian. The pair holds when the live card sits on that degree
 * of the key of C and names that mode.
 */
const MODE_PAIRS: ReadonlyArray<{ from: string; mode: string; answered: string }> = [
  { from: 'mo-1', mode: 'Dorian', answered: '2' },
  { from: 'mo-2', mode: 'Phrygian', answered: '3' },
  { from: 'mo-3', mode: 'Lydian', answered: '4' },
  { from: 'mo-4', mode: 'Mixolydian', answered: '5' },
  { from: 'mo-5', mode: 'Aeolian', answered: '6' },
  { from: 'mo-6', mode: 'Locrian', answered: '7' },
];

/**
 * THE SECONDARY DOMINANTS ARE COMPARED WORD FOR WORD: the question, the
 * answer and all three decoys, as the retired cards had them.
 */
const SECONDARY_DOMINANT_PAIRS = [
  { from: 'fh-11', to: 'fh-v-of-v-C',
    question: 'A secondary dominant V/V in the key of C major is which chord?',
    correctAnswer: 'D7', decoys: ['G7', 'A7', 'E7'] },
  { from: 'fh-12', to: 'fh-v-of-vi-C',
    question: 'V/vi in the key of C major resolves to _____',
    correctAnswer: 'Am', decoys: ['Em', 'Dm', 'Fmaj7'] },
] as const;

describe('the duplicates are gone', () => {
  it('leaves none of them in the deck, and neither of the two with nowhere to go', () => {
    for (const id of [...Object.keys(DUPLICATE_FOLDS), ...DUPLICATES_WITHOUT_DESTINATION]) {
      expect(FLASHCARDS.some(c => c.id === id), id).toBe(false);
    }
  });

  it('folds exactly the pairs written here', () => {
    expect(DUPLICATE_FOLDS).toEqual({
      ...Object.fromEntries(MODE_PAIRS.map(p => [p.from, `mo-mode-C-${p.answered}`])),
      ...Object.fromEntries(SECONDARY_DOMINANT_PAIRS.map(p => [p.from, p.to])),
    });
  });
});

describe('each mode card folds onto the key of C\'s card for its degree', () => {
  for (const pair of MODE_PAIRS) {
    it(`${pair.from} (${pair.mode} starts on ${pair.answered}) → ${DUPLICATE_FOLDS[pair.from]}`, () => {
      expect(MODE_BY_DEGREE.find(m => m.degree === pair.answered)?.mode).toBe(pair.mode);
      const target = cardById(DUPLICATE_FOLDS[pair.from]);
      expect(target, 'in the deck').toBeDefined();
      expect(target!.axis).toMatchObject({ key: 'C', degree: Number(pair.answered) });
      expect(target!.correctAnswer.endsWith(` ${pair.mode}`), target!.correctAnswer).toBe(true);
    });
  }
});

describe('each secondary dominant folds onto the generated card that asks it word for word', () => {
  for (const pair of SECONDARY_DOMINANT_PAIRS) {
    it(`${pair.from} → ${pair.to}`, () => {
      expect(DUPLICATE_FOLDS[pair.from]).toBe(pair.to);
      const target = cardById(pair.to);
      expect(target, 'in the deck').toBeDefined();
      expect(target!.question).toBe(pair.question);
      expect(target!.correctAnswer).toBe(pair.correctAnswer);
      expect(target!.decoys).toEqual(pair.decoys);
    });
  }
});

describe('cc-18 has one right answer', () => {
  it('offers no second chord without a perfect 5th', () => {
    // A half-diminished 7 has a flat 5th too, so as a decoy it was right.
    const card = cardById('cc-18')!;
    expect(card.correctAnswer).toBe('diminished 7');
    expect(card.decoys).not.toContain('half-diminished 7');
    expect(card.decoys).toContain('minor 7');
  });
});
