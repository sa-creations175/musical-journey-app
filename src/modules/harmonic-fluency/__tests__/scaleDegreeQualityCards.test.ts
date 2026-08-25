/**
 * The 168, and the 84 sitting inside them.
 *
 * =====================================================================
 * THE ONE-FOR-ONE CLAIM IS WHAT MAKES COMMIT 3 A REPLACEMENT.
 *
 * "Retire the old cards" and "delete the old cards and add different
 * ones" look identical in a diff. The difference is whether every
 * question the old set asked is still asked, and that is asserted here
 * rather than argued: the 84 alteration-zero cards match the original
 * 84 on (start degree, interval ordinal, direction), exactly.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { catalogRulesFor } from '../decoyGuard';
import { scaleDegreeQualityCards } from '../scaleDegreeQualityCards';
import { LEGACY_TO_QUALITY } from '../sdmQualityMigration';
import {
  INTERVAL_QUALITIES, degreeAnswer, degreeMathExplanation, degreeResult,
  groundedLine, parseNote, type Direction,
} from '../scaleDegreeQuality';
import { degreeSemitones, landingDegree } from '../degreeAudio';

const CARDS = scaleDegreeQualityCards();
const TWELVE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const isAltered = (label: string) => !/^\d+$/.test(label);
const degreeNumber = (label: string) => Number(label.replace(/[^0-9]/g, ''));

describe('the set', () => {
  it('is 7 degrees × 12 qualities × 2 directions', () => {
    expect(CARDS.length).toBe(7 * 12 * 2);
    expect(CARDS.length).toBe(168);
    expect(new Set(CARDS.map(c => c.id)).size).toBe(168);
  });

  it('names twelve qualities, and the tritone as two of them', () => {
    // An augmented 4th moves THREE letter-steps, a diminished 5th
    // FOUR. Same key on the piano, different degree, different answer
    // — collapsing them into "TT" makes one answer unreachable.
    expect(INTERVAL_QUALITIES.length).toBe(12);
    const a4 = INTERVAL_QUALITIES.find(q => q.id === 'A4')!;
    const d5 = INTERVAL_QUALITIES.find(q => q.id === 'd5')!;
    expect(a4.semitones).toBe(d5.semitones);
    expect(a4.letterSteps).not.toBe(d5.letterSteps);
    expect(degreeAnswer(degreeResult(1, a4, 'up'))).toBe('♯4');
    expect(degreeAnswer(degreeResult(1, d5, 'up'))).toBe('♭5');
  });

  it('carries the old 84 as its alteration-zero subset, one for one', () => {
    // The old cards are deleted, so the claim is asserted against the
    // migration map — which is derived from these same cards, and
    // pinned card-by-card in sdmQualityMigration.test.ts.
    const unaltered = CARDS.filter(c => c.facts.alteration === 0);
    expect(unaltered.length).toBe(84);
    expect(LEGACY_TO_QUALITY.size).toBe(84);
    expect(new Set(LEGACY_TO_QUALITY.values()))
      .toEqual(new Set(unaltered.map(c => c.id)));
  });

  it('has no positional scale-degree ids left in the deck', () => {
    // The shape that renumbered. Nothing may reintroduce it.
    const positional = FLASHCARDS.filter(
      c => /^sdm-\d-(up|down)-\d(nd|rd|th)$/.test(c.id),
    );
    expect(positional.map(c => c.id)).toEqual([]);
  });

  it('answers the question the old cards could not ask', () => {
    // The card the whole rebuild is for.
    const card = CARDS.find(c => c.id === 'sdm-2-down-m6')!;
    expect(card.question).toBe('In any major key, 2 down a minor 6th = ?');
    expect(card.correctAnswer).toBe('♯4');
    expect(card.facts.alteration).toBe(1);
  });

  it('never needs a double accidental in an answer', () => {
    const alterations = new Set(CARDS.map(c => c.facts.alteration));
    expect([...alterations].sort()).toEqual([-1, 0, 1]);
  });

  it('uses content-suffixed ids that cannot renumber', () => {
    for (const c of CARDS) {
      expect(c.id).toMatch(/^sdm-\d-(up|down)-[mMPAd]\d$/);
    }
  });
});

describe('the answer is derived, never typed', () => {
  it('matches the arithmetic on every card', () => {
    for (const c of CARDS) {
      const quality = INTERVAL_QUALITIES.find(
        q => q.intervalId === c.facts.intervalId && q.qualityId === c.facts.qualityId,
      )!;
      const result = degreeResult(c.facts.startDegree, quality, c.facts.direction);
      expect(c.correctAnswer, c.id).toBe(degreeAnswer(result));
      expect(c.facts.resultDegree, c.id).toBe(result.resultDegree);
      expect(c.facts.alteration, c.id).toBe(result.alteration);
    }
  });

  it('carries its facts as fields, not only inside the question', () => {
    // The detail grid is 7 × 24 and has to be buildable from data.
    for (const c of CARDS) {
      expect(Object.hasOwn(c, 'facts')).toBe(true);
      expect(c.question).toContain(`, ${c.facts.startDegree} ${c.facts.direction} `);
      expect(degreeNumber(c.correctAnswer)).toBe(c.facts.resultDegree);
    }
  });
});

describe('decoys', () => {
  it('trip no rule the guard runs on this category', () => {
    // `catalogRulesFor`, because this hands the rules `[correct,
    // ...decoys]`. A rendered-order rule asked that question answers
    // "first slot" every time and would fail every card here while
    // saying nothing about the decoys, which is what this test is
    // about. Where the answer is DRAWN is asserted per category, over
    // the real render, in deckLeakGuard.test.ts.
    for (const c of CARDS) {
      expect(catalogRulesFor('scale-degree-math')
        .filter(r => r.pick([c.correctAnswer, ...c.decoys]) === c.correctAnswer)
        .map(r => r.id), c.id).toEqual([]);
    }
  });

  it('always shows the diatonic answer on an altered card', () => {
    // The decoy that catches the habit the old 84 trained: count the
    // letters, ignore the quality, answer 4 where the answer is ♯4.
    for (const c of CARDS.filter(x => x.facts.alteration !== 0)) {
      expect(c.decoys, c.id).toContain(String(c.facts.resultDegree));
    }
  });

  it('always shows the same degree number twice', () => {
    // So the reader has to decide the ALTERATION, not just the count.
    for (const c of CARDS) {
      expect(
        c.decoys.some(d => degreeNumber(d) === c.facts.resultDegree),
        c.id,
      ).toBe(true);
    }
  });

  it('splits altered and plain two-and-two', () => {
    // An option alone in its class is crossable off for free — an
    // elimination tell, which `chooseDecoys` cannot see because it only
    // rejects rules that PICK the answer.
    for (const c of CARDS) {
      const altered = [c.correctAnswer, ...c.decoys].filter(isAltered).length;
      expect(altered, c.id).toBe(2);
    }
  });

  it('names only real scale degrees', () => {
    for (const c of CARDS) {
      for (const d of c.decoys) {
        expect(degreeNumber(d)).toBeGreaterThanOrEqual(1);
        expect(degreeNumber(d)).toBeLessThanOrEqual(7);
      }
      expect(new Set(c.decoys).size).toBe(3);
      expect(c.decoys).not.toContain(c.correctAnswer);
    }
  });

  it('lets no decoy pin one answer across the set', () => {
    const seen = new Map<string, Set<string>>();
    for (const c of CARDS) {
      for (const d of c.decoys) {
        if (!seen.has(d)) seen.set(d, new Set());
        seen.get(d)!.add(c.correctAnswer);
      }
    }
    const tells = [...seen]
      .filter(([d, answers]) => answers.size === 1 && [...answers][0] !== d)
      .map(([d, a]) => `${d} always means ${[...a][0]}`);
    expect(tells).toEqual([]);
  });
});

describe('the grounded line', () => {
  it('spells by letter in all twelve keys, on all 168', () => {
    for (const c of CARDS) {
      const quality = INTERVAL_QUALITIES.find(
        q => q.intervalId === c.facts.intervalId && q.qualityId === c.facts.qualityId,
      )!;
      for (const key of TWELVE) {
        const line = groundedLine(key, c.facts.startDegree, quality, c.facts.direction);
        expect(line, `${c.id} in ${key}`).not.toBeNull();
      }
    }
  });

  it('gives "2 down a minor 6th" F♯ in C, not G♭', () => {
    // The case a pitch-class table gets wrong. G♭ over a C tonic is a
    // lowered 5th — a different degree, and a different answer.
    const m6 = INTERVAL_QUALITIES.find(q => q.id === 'm6')!;
    const line = groundedLine('C', 2, m6, 'down')!;
    expect(line.startNote).toBe('D');
    expect(line.endNote).toBe('F♯');
  });

  it('marks an unplayable spelling with the key you press, in bold', () => {
    // THE FOURTH PARENTHETICAL RULE. In E♭, 1 up a diminished 5th is
    // B𝄫 — no keyboard has one, so the parenthetical is the
    // instruction rather than a footnote, and the bold says so.
    const d5 = INTERVAL_QUALITIES.find(q => q.id === 'd5')!;
    const line = groundedLine('Eb', 1, d5, 'up')!;
    expect(line.endNote).toBe('B𝄫 (**A**)');
    expect(line.hasDouble).toBe(true);
  });

  it('marks a theoretical spelling WITHOUT bold — a different rule', () => {
    // E♯ (F) is correct-but-unspoken: a reader could reason their way
    // to it. B𝄫 (**A**) cannot be played as written at all. Same
    // shape on screen, two different claims, and they do not merge.
    const m6 = INTERVAL_QUALITIES.find(q => q.id === 'm6')!;
    const line = groundedLine('B', 2, m6, 'down')!;
    expect(line.endNote).toBe('E♯ (F)');
    expect(line.endNote).not.toContain('**');
  });

  it('leaves ordinary notes unmarked', () => {
    const p5 = INTERVAL_QUALITIES.find(q => q.id === 'P5')!;
    const line = groundedLine('C', 2, p5, 'up')!;
    expect(line.startNote).toBe('D');
    expect(line.endNote).toBe('A');
  });

  it('reads a key name as a pitch without rounding it', () => {
    expect(parseNote('Db').letter).toBe('D');
    expect(parseNote('Db').accidental).toBe('b');
  });
});

describe('the explanation', () => {
  it('states the answer it belongs to, on every card', () => {
    for (const c of CARDS) {
      const quality = INTERVAL_QUALITIES.find(
        q => q.intervalId === c.facts.intervalId && q.qualityId === c.facts.qualityId,
      )!;
      const text = degreeMathExplanation(
        c.facts.startDegree, quality, c.facts.direction,
      );
      expect(text.split('\n')[0], c.id).toContain(`= ${c.correctAnswer}`);
    }
  });

  it('works both steps, and the second only claims an alteration when there is one', () => {
    for (const c of CARDS) {
      const quality = INTERVAL_QUALITIES.find(
        q => q.intervalId === c.facts.intervalId && q.qualityId === c.facts.qualityId,
      )!;
      const text = degreeMathExplanation(
        c.facts.startDegree, quality, c.facts.direction,
      );
      expect(text, c.id).toContain('THE NUMBER GIVES THE DEGREE');
      expect(text, c.id).toContain(`THE QUALITY SAYS WHICH ${c.facts.resultDegree}`);
      if (c.facts.alteration === 0) {
        expect(text, c.id).toContain('the one the key already contains');
      } else {
        expect(text, c.id).toMatch(/lands one (higher|lower)/);
      }
    }
  });

  it('derives the step count as n − 1 rather than stating it', () => {
    const m6 = INTERVAL_QUALITIES.find(q => q.id === 'm6')!;
    expect(degreeMathExplanation(2, m6, 'down')).toContain('a 6th = 5 steps (6 − 1)');
  });

  it('prints a negative with the same minus sign the operators use', () => {
    // U+2212, not an ASCII hyphen — one line carrying two characters
    // for one idea reads as two different operations.
    const m6 = INTERVAL_QUALITIES.find(q => q.id === 'm6')!;
    const text = degreeMathExplanation(2, m6, 'down');
    expect(text).toContain('2 − 5 = −3');
    expect(text).not.toContain('-3');
  });

  it('says "an augmented 4th", never "a augmented 4th"', () => {
    const a4 = INTERVAL_QUALITIES.find(q => q.id === 'A4')!;
    expect(degreeMathExplanation(1, a4, 'up')).toContain('an augmented 4th');
    for (const c of CARDS) expect(c.question, c.id).not.toMatch(/\ba [aeiou]/i);
  });
});

describe('the audio', () => {
  it('plays the tonic first, then the start degree, then the landing', () => {
    // Two notes alone teach an INTERVAL — D then F♯ is a major third
    // in any key. The tonic in front is what makes them a POSITION,
    // which is the only reason these cards exist.
    const m6 = INTERVAL_QUALITIES.find(q => q.id === 'm6')!;
    const heard = degreeSemitones(2, m6, 'down');
    expect(heard.tonic).toBe(0);
    expect(heard.start).toBe(2);      // the 2 of a major scale
    expect(heard.land).toBe(2 - 8);   // a minor 6th below it
  });

  it('lands where the answer says it lands, on every card', () => {
    for (const c of CARDS) {
      const quality = INTERVAL_QUALITIES.find(
        q => q.intervalId === c.facts.intervalId && q.qualityId === c.facts.qualityId,
      )!;
      expect(
        landingDegree(c.facts.startDegree, quality, c.facts.direction),
        c.id,
      ).toBe(c.facts.resultDegree);
    }
  });

  it('descends when the card descends', () => {
    const p5 = INTERVAL_QUALITIES.find(q => q.id === 'P5')!;
    const up = degreeSemitones(1, p5, 'up' as Direction);
    const down = degreeSemitones(1, p5, 'down' as Direction);
    expect(up.land).toBeGreaterThan(up.start);
    expect(down.land).toBeLessThan(down.start);
  });
});
