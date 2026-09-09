/**
 * The twelve-key expansions.
 *
 * What matters here is not that the cards exist — it is that a
 * theoretical spelling teaches without giving the answer away, and that
 * no key produces a note that cannot be written.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, generateReversePivotCards } from '../catalog';
import {
  FLAT_TWELVE, degreeAscii, degreeLabel, degreeLabelGlossed, expansionCards,
  generatePivotTopUps, keyboardNote, needsPracticalName, noteLabelGlossed,
  SLASH_SHAPES,
} from '../catalogExpansions';
import { article, intervalNameAt, invertedSemitones } from '../intervalInversion';

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
    // THE CARD THIS WAS WRITTEN AGAINST IS GONE. `sc-6-b7-Db` — the
    // ♭7 of D♭ is C♭ — left the deck with 6/♭7 under ruling 30. The
    // claim it was making is about the RULE, not about that card, so
    // it is made on the card that reaches C♭ now: the 4 of G♭. Its id
    // spells the key as written since ruling 40 — F♯ major is a
    // different card with a different answer.
    const card = FLASHCARDS.find(c => c.id === 'sc-slash-1-4-Gb')!;
    expect(card.correctAnswer).toBe('G♭/C♭');
    expect(card.explanation).toContain('C♭ is B on the keyboard');
  });

  it('keeps a question-side gloss, which cannot give anything away', () => {
    // The answer here is a KEY NAME, so a glossed note in the question
    // is pure teaching.
    // The id is the IDENTITY now (F#), while every word in the card
    // still reads the flat side — which is exactly what the two
    // assertions below check.
    //
    // READ OFF THE GENERATOR, because the card left the deck on 3 Sep
    // 2026 when Reverse Key Pivots folded into `degree-notes`. It is
    // still pinned: `retiredCategoryMigration` reads this generator to
    // prove which new card each retired one became, and `rkp-F#-4` is
    // the one whose stored answer carries a display glyph.
    const card = generatePivotTopUps().find(c => c.id === 'rkp-F#-4')!;
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

describe('every interval reveal names the flip, and no half steps', () => {
  const GRID = () => expansionCards().filter(c => /^iv-[^-]+-up-\d+$/.test(c.id));

  it('says the same two notes the other way up, on 143 of the 156', () => {
    // Derived from the card, not from a table written here: the two
    // note names come out of the question and the two interval names
    // out of the answer and its flip. A generator that printed the
    // right sentence about the wrong pair would pass a spot check.
    const cards = GRID();
    expect(cards).toHaveLength(156);
    let said = 0;
    for (const c of cards) {
      const m = c.question.match(/^The interval from (.+) to (.+?)(?: \(.+\))? ascending/)!;
      const [, low, high] = m;
      const span = Number(c.id.match(/-up-(\d+)$/)![1]);
      const flipped = intervalNameAt(invertedSemitones(span))!;
      if (low === high) continue;
      said += 1;
      expect(c.explanation ?? '', c.id)
        .toContain(`Flipped, ${high} up to ${low} is ${article(flipped)} ${flipped}.`);
    }
    expect(said).toBe(143);
  });

  it('leaves the octave alone, because its two notes have one name', () => {
    // The only card where "the same two notes turned over" cannot be
    // told apart from the sentence before it.
    const octaves = GRID().filter(c => /-up-12$/.test(c.id));
    expect(octaves).toHaveLength(13);
    for (const c of octaves) {
      expect(c.explanation ?? '', c.id).not.toContain('Flipped');
      expect(c.explanation ?? '', c.id).not.toContain('Unison');
    }
  });

  it('counts no half steps anywhere in the family', () => {
    // The 8 Sep ruling: distance reads in words, never in half-step
    // counts. This was the last place in the deck saying "spans 6
    // semitones" out loud.
    for (const c of GRID()) {
      expect(c.explanation ?? '', c.id).not.toMatch(/semitones?/);
    }
  });

  it('still says what to press for a double-accidental note', () => {
    const doubles = GRID().filter(c => /𝄫/.test(c.question));
    expect(doubles).toHaveLength(6);
    for (const c of doubles) {
      expect(c.explanation ?? '', c.id)
        .toMatch(/𝄫 is [A-G][♯♭]? on the keyboard/);
    }
  });
});

describe("the tritone's other names are in the reveal, not the option", () => {
  const TRITONES = () => expansionCards().filter(c => /^iv-.+-up-6$/.test(c.id));

  it('answers with the one word the interval-name table uses', () => {
    // A LONGER ANSWER CANNOT SHIP, and this is not a preference. The
    // other twelve names are short and plain, so any second name on the
    // tritone makes it the uniquely longest option — `chooseDecoys`
    // refuses the set and throws at import, which is the guard doing
    // its job. See `OTHER_READINGS`.
    const cards = TRITONES();
    expect(cards).toHaveLength(13);
    for (const c of cards) {
      expect(c.correctAnswer, c.id).toBe('Tritone');
      for (const option of [c.correctAnswer, ...(c.decoys ?? [])]) {
        expect(option, `${c.id}: ${option}`).not.toContain('(');
        expect(option, `${c.id}: ${option}`).not.toContain('/');
      }
    }
  });

  it('names the augmented 4th and the ♭5 in every tritone explanation', () => {
    for (const c of TRITONES()) {
      expect(c.explanation ?? '', c.id)
        .toContain('also called the augmented 4th or ♭5');
    }
  });

  it('and says it on no other card', () => {
    // The clause is keyed to the answer name, so an interval that
    // acquires a second reading gets it and nothing else does.
    for (const c of expansionCards()) {
      if (/^iv-.+-up-6$/.test(c.id)) continue;
      expect(c.explanation ?? '', c.id).not.toContain('also called the');
    }
  });
});

describe('a double accidental is allowed where it is the only honest spelling', () => {
  const DOUBLE = /𝄪|𝄫|##|bb/;

  /**
   * =====================================================================
   * THE RULE NARROWED; IT DID NOT GO.
   *
   * It used to be "no double accidental in any family", and six interval
   * cards were skipped to keep it — the minor 2nd above D♭ is E𝄫 and
   * there is no other spelling of it that is still a minor 2nd. Ruling 1
   * of the follow-up brief says a card is never skipped over spelling.
   *
   * So the rule is now: a double may appear ONLY in the interval grid,
   * only in question text and explanation, never in an option, and never
   * without the plain name in brackets beside it. Everything else in the
   * deck must still be free of one, which is what the second half asserts
   * — this narrows the guard rather than turning it off.
   * =====================================================================
   */
  const INTERVAL_GRID = /^iv-[^-]+-up-\d+$/;

  it('across every generated card that is not an interval', () => {
    for (const card of expansionCards()) {
      if (INTERVAL_GRID.test(card.id)) continue;
      const all = [card.question, card.correctAnswer, ...(card.decoys ?? []),
        card.explanation ?? ''].join(' ');
      expect(all, card.id).not.toMatch(DOUBLE);
    }
  });

  it('never in an interval card\'s options, only in what it says', () => {
    // An option is an identity string and a bracket on one option is a
    // tell. The gloss lives in the question and the explanation, where
    // every reader sees it and no reader can pick by it.
    for (const card of expansionCards()) {
      if (!INTERVAL_GRID.test(card.id)) continue;
      expect(card.correctAnswer, card.id).not.toMatch(DOUBLE);
      for (const d of card.decoys ?? []) expect(d, card.id).not.toMatch(DOUBLE);
    }
  });

  it('and never without the plain name beside it', () => {
    // `E𝄫` alone is a note a reader cannot act on. Six cards reach one
    // and all six say what to press, in the question and again in the
    // explanation.
    let seen = 0;
    for (const card of expansionCards()) {
      if (!INTERVAL_GRID.test(card.id)) continue;
      if (!DOUBLE.test(card.question)) continue;
      seen += 1;
      expect(card.question, card.id).toMatch(/[A-G]𝄫 \([A-G][♯♭]?\)/);
      expect(card.explanation ?? '', card.id).toMatch(/𝄫 is [A-G][♯♭]? on the keyboard/);
    }
    // D♭ and G♭ reach two each, G♭ a third, A♭ one.
    expect(seen).toBe(6);
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
    // ONLY FUNCTIONAL HARMONY IS LEFT. Every slash card went (rulings
    // 30 and 37) and `mo-11` to `mo-13` went with ruling 42, which
    // generates every key including C. Functional harmony is the last
    // family whose C card is hand-written and whose generator skips it.
    for (const id of ['fh-3', 'fh-11', 'fh-12']) {
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

  it('mode-of-major in all thirteen', () => {
    // THIRTEEN, not twelve (ruling 40). F♯ major and G♭ major are two
    // keys with two answers, so the regex counts both.
    expect(keysIn('modes', new RegExp(`mode of (${N}) major starting`), 'q').size).toBe(13);
  });

  it('every slash shape in all thirteen', () => {
    // Read off the shape list rather than written again beside it, so
    // a shape added or removed by a ruling is covered without being
    // remembered here. Ruling 30 dropped 6/♭7 and added four.
    for (const shape of SLASH_SHAPES.map(sh => sh.label)) {
      const s = keysIn('slash-chords',
        new RegExp(`${shape.replace('/', '\\/')} in (${N}) major`), 'q');
      expect(s.size, shape).toBe(13);
    }
  });

  it('the retired reverse key pivots answered all twelve keys', () => {
    // The claim the top-ups existed to make, held on the generator now
    // that the category is out of the deck. Its successor covers all
    // twelve by construction — twelve keys x thirteen degrees — which
    // `degreeNoteCards.test.ts` pins.
    const answers = new Set(generatePivotTopUps()
      .concat(generateReversePivotCards())
      .map(c => c.correctAnswer));
    expect(answers.size).toBe(12);
  });

  it('progressions reach all thirteen', () => {
    // TWELVE UNTIL COMMIT 8. Ruling 40 again: the 1-5-6-4 of G♭ ends on
    // C♭ and the 1-5-6-4 of F♯ ends on B, so both are asked.
    expect(keysIn('progressions', new RegExp(`in (${N})(?: major| minor)?`), 'q').size)
      .toBe(13);
  });

  it('intervals start on all thirteen', () => {
    // Thirteen, not twelve (rulings 40 and 43): F♯ and G♭ are two start
    // notes with two sets of answers.
    expect(keysIn('intervals', new RegExp(`interval from (${N}) to`), 'q').size).toBe(13);
  });

  it('relative minor reaches all thirteen; parallel still twelve', () => {
    // The relative set was regenerated in commit 8 and covers F♯ major
    // and G♭ major as two keys. The parallel set was NOT — Silas has
    // not ruled on it — so it still covers twelve, and the asymmetry is
    // stated here rather than left for someone to find on the grid.
    expect(keysIn('key-signatures', new RegExp(`relative minor of (${N}) major`), 'q').size)
      .toBe(13);
    expect(keysIn('key-signatures', new RegExp(`parallel minor of (${N}) major`), 'q').size)
      .toBe(12);
  });
});
