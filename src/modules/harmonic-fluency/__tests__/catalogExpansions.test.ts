/**
 * The twelve-key expansions.
 *
 * What matters here is not that the cards exist — it is that a
 * theoretical spelling teaches without giving the answer away, and that
 * no key produces a note that cannot be written.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import {
  FLAT_TWELVE, degreeAscii, degreeLabel, degreeLabelGlossed, expansionCards,
  keyboardNote, needsPracticalName, noteLabelGlossed,
} from '../catalogExpansions';

/** The four spellings that are correct and never said out loud. */
const THEORETICAL = /C♭|F♭|B♯|E♯/;
/** A gloss: a note, then a bracketed practical name. */
const GLOSS = /[A-G][♭♯]\s*\(/;

describe('the gloss never reaches an answer option', () => {
  it('appears in NO correct answer, anywhere in the catalog', () => {
    // THE LEAK GUARD. The first build glossed everything, so
    // "B♭m/C♭ (B)" sat against three bracket-free decoys and was
    // answerable by picking the odd one out — the same defect as a
    // decoy that is the only flat on screen.
    const leaks = FLASHCARDS.filter(c => GLOSS.test(c.correctAnswer));
    expect(leaks.map(c => c.id)).toEqual([]);
  });

  it('appears in NO decoy, anywhere in the catalog', () => {
    // Glossing the decoys is not the fix: a decoy earns a gloss only
    // if its own notes need one, and forcing it yields "A♭ (G♯)",
    // which is false — G♯ is a spelling people actually write.
    const leaks = FLASHCARDS.filter(
      c => (c.decoys ?? []).some(d => GLOSS.test(d)),
    );
    expect(leaks.map(c => c.id)).toEqual([]);
  });

  it('leaves ordinary prose parentheses alone', () => {
    // Guards the guard: the assertion above must not be so broad that
    // it would flag "(a minor third)" in a hand-written card, or it
    // would be passing for the wrong reason.
    const prose = FLASHCARDS.find(c => c.id === 'ksc-15');
    expect(prose?.correctAnswer).toContain('(');
    expect(GLOSS.test(prose!.correctAnswer)).toBe(false);
  });
});

describe('but the teaching survives the move', () => {
  it('still glosses every theoretical spelling it uses', () => {
    // A test that only checks answers are clean passes on code that
    // dropped the gloss entirely. Every generated card that NAMES a
    // theoretical spelling must still say where the hand goes.
    //
    // Scoped to the generated cards, and one hand-written card is the
    // reason: `ks-22` recites the order of flats — B♭ E♭ A♭ D♭ G♭ C♭
    // F♭ — where C♭ and F♭ are the sixth and seventh FLATS IN A
    // SIGNATURE, not pitches to go and find. Glossing them there would
    // be wrong, and a catalog-wide assertion would demand it.
    const teaching = expansionCards().filter(
      c => THEORETICAL.test(`${c.question} ${c.explanation ?? ''}`),
    );
    expect(teaching.length).toBeGreaterThan(0);
    for (const c of teaching) {
      const text = `${c.question} ${c.explanation ?? ''}`;
      // Either a bracketed gloss in the question, or a keyboard note
      // in the explanation. One or the other, always.
      expect(GLOSS.test(text) || /on the keyboard/.test(text), c.id).toBe(true);
    }
  });

  it('says where the hand goes for the card this rule was built for', () => {
    const card = FLASHCARDS.find(c => c.id === 'sc-6-b7-Db')!;
    expect(card.correctAnswer).toBe('B♭m/C♭');
    expect(card.explanation).toContain('C♭ is B on the keyboard');
  });

  it('keeps a question-side gloss, which cannot give anything away', () => {
    // The answer here is a KEY NAME, so a glossed note in the question
    // is pure teaching.
    const card = FLASHCARDS.find(c => c.id === 'rkp-Gb-4')!;
    expect(card.question).toContain('C♭ (B)');
    expect(card.correctAnswer).toBe('G♭ major');
  });
});

describe('the gloss is derived, not typed', () => {
  it('follows the speller for every theoretical spelling', () => {
    expect(noteLabelGlossed('Cb')).toBe('C♭ (B)');
    expect(noteLabelGlossed('Fb')).toBe('F♭ (E)');
    expect(noteLabelGlossed('B#')).toBe('B♯ (C)');
    expect(noteLabelGlossed('E#')).toBe('E♯ (F)');
  });

  it('adds nothing to a note that does not need one', () => {
    // A test that only checks C♭ carries "(B)" passes on code that
    // parenthesises everything.
    for (const n of ['C', 'Db', 'F#', 'Ab', 'Bb', 'G', 'E']) {
      expect(noteLabelGlossed(n)).not.toContain('(');
      expect(needsPracticalName(n)).toBe(false);
    }
    expect(needsPracticalName('Cb')).toBe(true);
  });

  it('derives the keyboard sentence from the same table', () => {
    expect(keyboardNote('Cb')).toBe(' C♭ is B on the keyboard.');
    expect(keyboardNote('Db', 'Ab')).toBe('');
    // Two at once, deduplicated, in one sentence.
    expect(keyboardNote('Cb', 'Fb', 'Cb'))
      .toBe(' C♭ is B on the keyboard; F♭ is E on the keyboard.');
  });

  it('reads the degree through the speller, not a lookup', () => {
    expect(degreeAscii('Gb', '4')).toBe('Cb');
    expect(degreeLabel('Gb', '4')).toBe('C♭');
    expect(degreeLabelGlossed('Gb', '4')).toBe('C♭ (B)');
    expect(degreeAscii('Db', 'b7')).toBe('Cb');
    expect(degreeAscii('Gb', 'b7')).toBe('Fb');
  });
});

describe('no double accidentals, in any key of any family', () => {
  const DOUBLE = /𝄪|𝄫|##|bb/;

  it('across every generated card', () => {
    for (const card of expansionCards()) {
      const all = [card.question, card.correctAnswer, ...(card.decoys ?? []),
        card.explanation ?? ''].join(' ');
      expect(all).not.toMatch(DOUBLE);
    }
  });

  it('across every degree of every key, directly', () => {
    // Not a spot check — the cross product the families draw from.
    for (const root of FLAT_TWELVE) {
      for (const d of ['1', '2', '3', '4', '5', '6', '7', 'b7']) {
        expect(degreeAscii(root, d)).not.toMatch(DOUBLE);
      }
    }
  });
});

describe('decoys are derived, and never the answer', () => {
  it('gives every generated card exactly three', () => {
    for (const card of expansionCards()) {
      expect(card.decoys).toHaveLength(3);
    }
  });

  it('never offers the correct answer as a decoy', () => {
    for (const card of expansionCards()) {
      expect(card.decoys).not.toContain(card.correctAnswer);
    }
  });

  it('keeps the chord and moves the bass, on every slash card', () => {
    // The question is always which BASS. A decoy that changed the
    // chord would be answerable without reading the notation.
    const slash = expansionCards().filter(c => c.id.startsWith('sc-'));
    expect(slash.length).toBeGreaterThan(0);
    for (const card of slash) {
      const chord = card.correctAnswer.split('/')[0];
      for (const d of card.decoys) expect(d.split('/')[0]).toBe(chord);
    }
  });
});

describe('ids are root-suffixed, never positional', () => {
  it('carries its root IN the id', () => {
    // The property that makes an id reorder-proof: the root is part of
    // the string, so moving a root within FLAT_TWELVE cannot repoint
    // anything. Asserting "no trailing digit" would be wrong — the
    // mode cards end in a DEGREE (`mo-mode-of-Db-2`), which is as
    // stable as the root.
    for (const card of expansionCards()) {
      const hasRoot = FLAT_TWELVE.some(r => card.id.includes(`-${r}`));
      expect(hasRoot, card.id).toBe(true);
    }
  });

  it('generates the same ids twice running', () => {
    // No index, no clock, no randomness in an id.
    const a = expansionCards().map(c => `${c.id}|${c.question}`);
    const b = expansionCards().map(c => `${c.id}|${c.question}`);
    expect(a).toEqual(b);
  });

  it('collides with no existing id', () => {
    const ids = FLASHCARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves every hand-written C card exactly where it was', () => {
    // The originals keep their ids AND their hand-written decoys; only
    // the other eleven keys are generated.
    for (const id of ['fh-3', 'fh-11', 'fh-12', 'mo-11', 'mo-12', 'mo-13',
      'sc-8', 'sc-9', 'sc-10', 'sc-11']) {
      expect(FLASHCARDS.find(c => c.id === id)?.question).toContain('C');
    }
  });
});

describe('coverage reaches twelve', () => {
  const keysIn = (cat: string, re: RegExp, from: 'q' | 'a') => {
    const s = new Set<string>();
    for (const c of FLASHCARDS.filter(x => x.category === cat)) {
      const m = (from === 'q' ? c.question : c.correctAnswer).match(re);
      if (m) s.add(m[1]);
    }
    return s;
  };
  const N = '[A-G](?:♯|♭|#|b)?';

  it('ii-V-I in all twelve', () => {
    expect(keysIn('functional-harmony', new RegExp(`ii-V-I cadence in (${N}) major`), 'q').size)
      .toBe(12);
  });

  it('mode-of-major in all twelve', () => {
    expect(keysIn('modes', new RegExp(`mode of (${N}) major starting`), 'q').size).toBe(12);
  });

  it('every slash shape in all twelve', () => {
    for (const shape of ['1/3', '5/7', '4/5', '6/b7']) {
      const s = keysIn('slash-chords',
        new RegExp(`${shape.replace('/', '\\/')} in (${N}) major`), 'q');
      expect(s.size, shape).toBe(12);
    }
  });

  it('reverse key pivots answer all twelve keys', () => {
    expect(keysIn('reverse-key-pivots', new RegExp(`^(${N}) major`), 'a').size).toBe(12);
  });

  it('progressions reach all twelve', () => {
    expect(keysIn('progressions', new RegExp(`in (${N})(?: major| minor)?`), 'q').size)
      .toBe(12);
  });

  it('intervals start on all twelve', () => {
    expect(keysIn('intervals', new RegExp(`interval from (${N}) to`), 'q').size).toBe(12);
  });

  it('relative and parallel minor each reach all twelve', () => {
    expect(keysIn('key-signatures', new RegExp(`relative minor of (${N}) major`), 'q').size)
      .toBe(12);
    expect(keysIn('key-signatures', new RegExp(`parallel minor of (${N}) major`), 'q').size)
      .toBe(12);
  });
});
