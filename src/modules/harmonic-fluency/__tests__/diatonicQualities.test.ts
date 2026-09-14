/**
 * Diatonic Chord Qualities: every minor on every degree, and no question
 * that says its own answer.
 *
 * =====================================================================
 * THE QUALITIES ARE DERIVED HERE, NOT COPIED FROM THE CATALOG.
 *
 * Silas's decision of 13 Sep 2026 gave the deck natural, harmonic and
 * melodic minor on all seven degrees. A test that restated the catalog's
 * answers would pass on a wrong card as happily as on a right one, so
 * this builds each seventh chord from the scale's own steps and checks
 * the card against that.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';

const DECK = FLASHCARDS.filter(c => c.category === 'diatonic-qualities');

const STEPS: Readonly<Record<string, ReadonlyArray<number>>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11],
};

/** Third, fifth and seventh above the chord's root → its symbol. */
const SYMBOL: Readonly<Record<string, string>> = {
  '4,7,11': 'maj7', '4,7,10': '7', '3,7,10': 'm7', '3,6,10': 'ø',
  '3,6,9': '°7', '3,7,11': 'mMaj7', '4,8,11': '+maj7',
};

const WORD: Readonly<Record<string, string>> = {
  maj7: 'major 7', 7: 'dominant 7', m7: 'minor 7', 'ø': 'half-diminished',
  '°7': 'diminished 7', mMaj7: 'minor-major 7', '+maj7': 'augmented major 7',
};

/** The seventh chord a scale builds on a degree (1 to 7), stacked in
 *  thirds from the scale itself. */
function quality(scale: string, degree: number): string {
  const s = STEPS[scale];
  const d = degree - 1;
  const above = (i: number) => (s[(d + i) % 7] + (d + i >= 7 ? 12 : 0) - s[d] + 12) % 12;
  return SYMBOL[[above(2), above(4), above(6)].join(',')];
}

const DEGREE_CARD = /^In (major|natural minor|harmonic minor|melodic minor), what quality is the ([1-7]) chord\?$/;
const degreeCards = DECK
  .map(card => ({ card, m: card.question.match(DEGREE_CARD) }))
  .filter((x): x is { card: typeof x.card; m: RegExpMatchArray } => x.m !== null);

describe('every scale, every degree', () => {
  it('asks each of the four scales on degrees 1 to 7, once each', () => {
    const asked = degreeCards.map(({ m }) => `${m[1]} ${m[2]}`).sort();
    const all = Object.keys(STEPS).flatMap(sc => [1, 2, 3, 4, 5, 6, 7].map(d => `${sc} ${d}`)).sort();
    expect(asked).toEqual(all);
  });

  it('answers with the seventh chord the scale builds there, word and symbol', () => {
    for (const { card, m } of degreeCards) {
      const q = quality(m[1], Number(m[2]));
      expect(card.correctAnswer, card.id).toBe(`${WORD[q]} (${q})`);
    }
  });

  it('matches the table in the decision of 13 Sep 2026', () => {
    const row = (sc: string) => [1, 2, 3, 4, 5, 6, 7].map(d => quality(sc, d));
    expect(row('natural minor')).toEqual(['m7', 'ø', 'maj7', 'm7', 'm7', 'maj7', '7']);
    expect(row('harmonic minor')).toEqual(['mMaj7', 'ø', '+maj7', 'm7', '7', 'maj7', '°7']);
    expect(row('melodic minor')).toEqual(['mMaj7', 'm7', '+maj7', '7', '7', 'ø', 'ø']);
  });

  it('writes every option the same way, so the answer is not the only one with a symbol', () => {
    for (const { card } of degreeCards) {
      for (const o of [card.correctAnswer, ...card.decoys]) {
        expect(o, card.id).toMatch(/^[a-z-]+( [a-z0-9]+)* \([^)]+\)$/);
      }
    }
  });
});

describe('no question gives its answer away', () => {
  it('asks by plain number, never by Roman numeral or symbol', () => {
    for (const card of DECK) {
      expect(card.question, card.id).not.toMatch(/\b[iIvV]+\b|[°ø+]/);
    }
  });

  it('never names the quality it is asking about', () => {
    for (const { card } of degreeCards) {
      const symbol = card.correctAnswer.match(/\(([^)]+)\)$/)![1];
      expect(card.question, card.id).not.toContain(WORD[symbol]);
      // A bare 7 is the dominant's symbol and also a degree; the degree
      // is the question, so only the written symbols are checked here.
      if (!/^\d+$/.test(symbol)) expect(card.question, card.id).not.toContain(symbol);
    }
    const scaleCard = DECK.find(c => c.id === 'dq-hm-5')!;
    expect(scaleCard.question).not.toContain('harmonic');
  });
});

describe('what was there stays there', () => {
  it('keeps every existing id, so ratings and history do not move', () => {
    const ids = new Set(DECK.map(c => c.id));
    const existing = [
      ...[1, 2, 3, 4, 5, 6, 7].map(n => `dq-maj-${n}`),
      ...[1, 2, 3, 4, 5, 6, 7].map(n => `dq-nm-${n}`),
      ...[1, 2, 3, 4, 5].map(n => `dq-hm-${n}`),
    ];
    for (const id of existing) expect(ids.has(id), id).toBe(true);
    // `dq-extra-1`, the triad card, was retired on 14 Sep 2026 and its
    // history folded into `dq-maj-4`.
    expect(ids.has('dq-extra-1')).toBe(false);
    expect(DECK).toHaveLength(29);
  });

  it('asks which scale gives a minor key a real dominant with no second right answer among the decoys', () => {
    // MELODIC MINOR RAISES THE 7 TOO, so it was a right answer wearing a
    // decoy's clothes (Silas, 14 Sep 2026).
    expect(DECK.find(c => c.id === 'dq-hm-5')!.decoys).toEqual(['natural minor', 'Dorian', 'Phrygian']);
  });

  it('puts Silas\'s own lines at the head of the explanation, verbatim', () => {
    const SILAS: Readonly<Record<string, string>> = {
      'dq-nm-5': 'the minor 5: the soft minor vamp (Am to Em7), no dominant pull',
      'dq-nm-2': 'the 2 half-diminished, borrowed into a major key; I Believe I Can Fly',
      'dq-nm-4': 'the 4 minor, borrowed into a major key: the sad 4',
      'dq-nm-7': 'the ♭7, borrowed into a major key: the gospel push',
      'dq-hm-2': 'the major or dominant 5 in a minor key: minor with a real dominant',
      'dq-hm-3': 'the diminished 7 a half step under the root: the pass into the 1',
      'dq-mm-4': 'the major 4 in a minor key: the bright 4',
    };
    for (const [id, line] of Object.entries(SILAS)) {
      expect(DECK.find(c => c.id === id)?.explanation?.startsWith(line), id).toBe(true);
    }
  });
});
