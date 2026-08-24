/**
 * Interval inversion cards, and the two-source guard.
 *
 * ---------------------------------------------------------------
 * ONE RELATIONSHIP, COUNTED TWO WAYS, AND BOTH ARE NEEDED.
 *
 * The card list is derived from SEMITONES, because that is what
 * distinguishes a minor 3rd from a major 3rd — the distinction the
 * merged design exists for. `iv-inv-sum` teaches the ORDINAL rule,
 * because 3 + 6 = 9 is what a player counts on their fingers.
 *
 * Neither can be dropped, so the risk is that they drift. The guard
 * below asserts they agree card by card: for every pair the generator
 * built from semitones, the ordinals in the card's own text must sum
 * to INTERVAL_PAIR_SUM.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import {
  INTERVAL_NAMES, INTERVAL_PAIR_SUM, SEMITONES_PER_OCTAVE, intervalNameAt,
  inversionPairs, invertedSemitones, ordinalOfName,
} from '../intervalInversion';
import { intervalInversionCards } from '../intervalInversionCards';

const CARDS = intervalInversionCards();
const OF_CARDS = CARDS.filter(c => c.id.startsWith('iv-inv-of-'));

describe('the count is derived, not written', () => {
  it('is six reciprocal pairs plus one self-inverse', () => {
    // Bare ordinals give four pairs — 1↔8, 2↔7, 3↔6, 4↔5. Carrying
    // quality splits them: a minor 2nd and a major 2nd invert to
    // different partners. That is what makes it six.
    const { pairs, selfInverse } = inversionPairs();
    expect(pairs).toHaveLength(6);
    expect(selfInverse.map(i => i.name)).toEqual(['Tritone']);
  });

  it('produces one card per interval, plus the two rule cards', () => {
    expect(OF_CARDS).toHaveLength(INTERVAL_NAMES.length);
    expect(CARDS).toHaveLength(INTERVAL_NAMES.length + 2);
  });

  it('covers every interval in the table exactly once', () => {
    const covered = OF_CARDS.map(c => c.question.match(/^An? (.+) inverted/)![1]);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...INTERVAL_NAMES.map(i => i.name)].sort());
  });
});

describe('the two-source guard', () => {
  it('agrees between semitones and ordinals, card by card', () => {
    // THE ASSERTION THIS FILE EXISTS FOR. The generator counts
    // semitones; the card text counts ordinals. If either moves alone,
    // this fails.
    for (const card of OF_CARDS) {
      const own = card.question.match(/^An? (.+) inverted/)![1];
      const ownOrdinal = ordinalOfName(own);
      const answerOrdinal = ordinalOfName(card.correctAnswer);
      if (ownOrdinal === undefined || answerOrdinal === undefined) continue;
      expect(ownOrdinal + answerOrdinal, card.id).toBe(INTERVAL_PAIR_SUM);
    }
  });

  it('agrees on semitones too', () => {
    const bySem = new Map(INTERVAL_NAMES.map(i => [i.name, i.semitones]));
    for (const card of OF_CARDS) {
      const own = card.question.match(/^An? (.+) inverted/)![1];
      expect(bySem.get(own)! + bySem.get(card.correctAnswer)!, card.id)
        .toBe(SEMITONES_PER_OCTAVE);
    }
  });

  it('skips the tritone, which has no single ordinal', () => {
    // An augmented 4th or a diminished 5th depending on spelling.
    // Asserting one would be wrong, so the sum sentence is omitted.
    expect(ordinalOfName('Tritone')).toBeUndefined();
    const t = CARDS.find(c => c.id === 'iv-inv-of-tritone')!;
    expect(t.explanation).not.toContain(`= ${INTERVAL_PAIR_SUM}`);
    expect(t.correctAnswer).toBe('Tritone');
  });
});

describe('quality flips with the number', () => {
  it('inverts minor to major and major to minor', () => {
    for (const card of OF_CARDS) {
      const own = card.question.match(/^An? (.+) inverted/)![1];
      if (/^minor/.test(own)) expect(card.correctAnswer, card.id).toMatch(/^Major/);
      if (/^Major/.test(own)) expect(card.correctAnswer, card.id).toMatch(/^minor/);
    }
  });

  it('keeps perfect perfect', () => {
    // A perfect interval has no opposite quality, so its inversion is
    // perfect too — and the explanation says which half of the rule
    // that is. An earlier version of this test also tried to assert no
    // decoy invented "Major 4th"; that was vacuous, because a name
    // absent from the table cannot be produced at all — the
    // draws-from-the-table assertion above already covers it.
    const PERFECT = ['Unison', 'Octave', 'Perfect 4th', 'Perfect 5th'];
    for (const name of PERFECT) {
      const card = OF_CARDS.find(c => c.question.includes(`${name} inverted`))!;
      expect(card.explanation, name).toContain('Perfect stays perfect');
      expect(PERFECT, name).toContain(card.correctAnswer);
    }
  });

  it('never claims a quality flip on a perfect interval', () => {
    for (const name of ['Unison', 'Octave', 'Perfect 4th', 'Perfect 5th']) {
      const card = OF_CARDS.find(c => c.question.includes(`${name} inverted`))!;
      expect(card.explanation, name).not.toContain('flip together');
    }
  });
});

describe('decoys are derived, three per card', () => {
  it('gives every card exactly three, none of them the answer', () => {
    for (const card of CARDS) {
      expect(card.decoys, card.id).toHaveLength(3);
      expect(card.decoys, card.id).not.toContain(card.correctAnswer);
      expect(new Set(card.decoys).size, card.id).toBe(3);
    }
  });

  it('always offers the un-inverted interval — the not-done-it miss', () => {
    for (const card of OF_CARDS) {
      const own = card.question.match(/^An? (.+) inverted/)![1];
      // Except the tritone, where the un-inverted interval IS the
      // answer and offering it would make a decoy correct.
      if (own === 'Tritone') continue;
      expect(card.decoys, card.id).toContain(own);
    }
  });

  it('draws every decoy from the interval table', () => {
    const names = new Set(INTERVAL_NAMES.map(i => i.name));
    for (const card of OF_CARDS) {
      for (const d of card.decoys) expect(names.has(d), d).toBe(true);
    }
  });
});

describe('these do not duplicate the tritone-pairs cards', () => {
  // tt-* asks WHICH NOTE — "Tritone of A?" → D#. iv-inv-* asks WHICH
  // INTERVAL. Same fact from two sides; the assertions pin each to its
  // own side so they stay complementary.
  /**
   * A note name, accidental optional.
   *
   * The accidental has to be OPTIONAL or a bare "A" or "C" walks
   * straight past — which an earlier version of this test did, and a
   * reversal that injected "(from A)" into every question stayed green.
   * The cost is that the leading article collides with it, so the
   * article is stripped before the question is tested rather than the
   * pattern being weakened to avoid it.
   */
  const NOTE_NAME = /\b[A-G](?:#|b|♯|♭)?\b/;
  const withoutArticle = (q: string) => q.replace(/^An? /, '');

  it('never puts a note name in an inversion question or answer', () => {
    for (const card of CARDS) {
      expect(withoutArticle(card.question), card.id).not.toMatch(NOTE_NAME);
      expect(card.correctAnswer, card.id).not.toMatch(NOTE_NAME);
      for (const d of card.decoys) expect(d, card.id).not.toMatch(NOTE_NAME);
    }
  });

  it('never puts the word "inverted" in a tritone-pairs card', () => {
    const tt = FLASHCARDS.filter(c => c.category === 'tritone-pairs');
    expect(tt.length).toBeGreaterThan(0);
    for (const card of tt) {
      expect(card.question.toLowerCase(), card.id).not.toContain('inverted');
      expect(card.correctAnswer.toLowerCase(), card.id).not.toContain('inverted');
    }
  });

  it('says the self-inverse fact on the interval side', () => {
    // What tt-* cannot say: WHY direction does not matter.
    expect(CARDS.find(c => c.id === 'iv-inv-of-tritone')!.explanation)
      .toContain('only interval that inverts to itself');
  });
});

describe('ids and placement', () => {
  it('is content-suffixed, never positional', () => {
    for (const card of CARDS) {
      expect(card.id, card.id).not.toMatch(/-\d+$/);
      expect(card.id).toMatch(/^iv-inv-/);
    }
  });

  it('collides with no existing iv-* id', () => {
    const ids = FLASHCARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The originals are untouched.
    expect(FLASHCARDS.find(c => c.id === 'iv-1')?.question)
      .toBe('The interval from C to G ascending = ?');
  });

  it('lands in Interval Identification, not Scale Degree Math', () => {
    // Scale-degree-math teaches the rule; these test it.
    for (const card of CARDS) expect(card.category).toBe('intervals');
  });
});

describe('the moved table still matches the ear-training seed list', () => {
  it('holds the same thirteen intervals', async () => {
    // seed.ts keeps its own copy because it carries per-direction
    // anchors this table does not. Membership must still agree.
    const { INTERVAL_SEEDS } = await import('../../ear-training/intervals/seed');
    expect(INTERVAL_NAMES.map(i => i.semitones).sort((a, b) => a - b))
      .toEqual(INTERVAL_SEEDS.map(i => i.semitones).sort((a, b) => a - b));
  });

  it('inverts by the same octave both tables assume', () => {
    for (const iv of INTERVAL_NAMES) {
      expect(intervalNameAt(invertedSemitones(iv.semitones)), iv.name)
        .toBeDefined();
    }
  });
});
