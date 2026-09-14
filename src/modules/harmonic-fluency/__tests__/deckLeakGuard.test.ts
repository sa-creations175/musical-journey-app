/**
 * No card may be answerable without its question.
 *
 * =====================================================================
 * AN ALLOWLIST THAT ONLY SHRINKS, AND WHY IT IS COUNTS NOT IDS.
 *
 * 124 cards trip a blind rule today. Failing the build on all of them
 * would mean either deleting live cards or turning the guard off, and
 * both are worse than the leak: a working surface stays until its
 * replacement exists. So the current damage is PINNED, and the build
 * fails if a number grows or a new (category, rule) pair appears. No
 * new leaky card can ship; the old ones come down as their generators
 * are fixed.
 *
 * PINNED AS COUNTS RATHER THAN CARD IDS on purpose. An id list stays
 * green when the ids are repointed at different content — the same
 * defect that made `generatedCardPairing.ts` pin question strings
 * beside ids rather than ids alone. A count cannot be satisfied by
 * swapping one leaky card for another, only by having fewer of them.
 *
 * WHEN A NUMBER DROPS, LOWER IT HERE IN THE SAME COMMIT. A stale
 * allowlist entry is headroom for a leak to come back unnoticed.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import {
  BLIND_RULES, TOKENISERS, cardsGivenAway, catalogRulesFor, chooseDecoys,
  findTells, positionBound, renderedRuleCounts, renderedRulesFor, rotate,
  rulesFor,
  type GuardedCard,
} from '../decoyGuard';
import { renderedOptions } from '../../../lib/flashcards/optionOrder';

const CARDS: GuardedCard[] = FLASHCARDS.map(c => ({
  id: c.id, category: c.category, correctAnswer: c.correctAnswer, decoys: c.decoys,
}));
const CATEGORIES = [...new Set(CARDS.map(c => c.category))].sort();

// --- Allowlist 1: a rule picks the answer out of the four options ----

const BLIND_ALLOWLIST: ReadonlyArray<{ category: string; rule: string; cards: number }> = [
  // TEN `only-bracket` / `only-prose` / `only-accidental` entries were
  // deleted together when fourteen answers gave up the parenthetical
  // they were explaining themselves with. See
  // __tests__/strippedParentheticals.test.ts, which holds the removed
  // text and asserts it survived into the explanations.
  // chord-construction / only-natural stood at 4 and / shortest at 5: the
  // key-of-C "contains the notes" cards, whose plain spelling sat beside
  // three altered ones. They retired into Spell the chord in a key on
  // 14 Sep 2026, whose decoys the chooser picks, and both went to 0. The
  // `shortest` scope stays on the rule, so a new card cannot bring it back.
  // ear-theory / only-accidental stood at 1 and / longest at 8: its
  // answers named a feeling in words against decoys that named it in
  // shorthand. The category retired on 14 Sep 2026 and both went with it.
  // enharmonic-equivalents / only-slash and / only-prose stood at 9
  // each — a three-way group answers with a pair ("b3 / #9") against
  // decoys that were single degrees, so the answer was the only option
  // with a slash and the only one with a space, on all nine. Decoys now
  // come from the other three-way groups: real pairs, correctly
  // written, wrong for this question.
  { category: 'functional-harmony', rule: 'only-accidental', cards: 1 },
  // functional-harmony / only-comma stood at 1: `fh-16`, whose answer was
  // "a bright, hopeful resolution". It retired on 14 Sep 2026.
  // key-signatures / middle-of-3 stood at 6, and the four tell entries
  // at 4 apiece — both came from the same twelve hand-written
  // "how many sharps" cards, whose decoys were counted by hand. They
  // now derive their decoys the way scale-degree math does.
  // key-signatures / only-accidental stood at 2 and is 1: commit 8
  // regenerated the count and relative sets, and a generated card
  // draws its decoys from the thirteen key names rather than from a
  // hand-picked three.
  { category: 'key-signatures', rule: 'only-accidental', cards: 1 },
  // `intervals / longest` WAS HERE, AT ONE CARD, AND THE ALLOWLIST
  // SHRANK. It was `iv-inv-quality-rule`, hand-written and
  // prose-answered where the rest of the category names intervals:
  // "flips major↔minor; perfect stays perfect" against three short
  // rules. That card and its fourteen siblings left the deck on
  // 9 Sep 2026, so the entry goes with them.
  // key-signatures / only-natural stood at 1: the parallel minor of B
  // major is B minor, and a fixed 6/2/5 decoy list gave it G♯, C♯ and
  // F♯ for company — the answer was the only plain name on screen. Both
  // minor generators now choose from a wider degree list per key.
  // modes / middle-of-3 stood at 4: `mo-1` to `mo-6` answered with a
  // degree number between two neighbours. They folded into the generated
  // mode cards on 14 Sep 2026.
  { category: 'modes', rule: 'only-accidental', cards: 1 },
  { category: 'modes', rule: 'only-natural', cards: 1 },
  // modes / only-prose stood at 1: `mo-15` answered "I maj7#11" against
  // three options with no space. It and `mo-16` were written as matching
  // prose on 14 Sep 2026, "the 1 as a maj7♯11 chord".
  // named-notes stood at 1 and 1: a key's scale can hold a single
  // accidental (F major has only B♭), so an answer of B♭ was alone on
  // screen. The pool now falls through to notes just outside the key,
  // spelled the way the KEY spells them.
  // reverse-key-pivots stood at 3 and 4. Every option is "<key> major"
  // and eleven keys were available, so a flat answer can always be
  // given flat company — it just was not being asked for.
  // scale-degree-math / middle-of-3 stood at 52 and is now 0 — the
  // decoys were answer−1, answer+1 and an outlier, so three of four
  // options were consecutive and the answer was between them. The
  // offsets now come from the card's identity, so the answer's rank
  // cycles. Entry deleted rather than left at 0: an entry pinned at a
  // number nothing reaches is headroom.
  // slash-chords / only-accidental stood at 4. Ruling 30 rebuilt the
  // deck: the bass-degree pool now runs past the diatonic seven, so a
  // sharp-key answer can be given company that is also sharp, and the
  // whole generated family went to 0. `only-slash` is one hand-written
  // prose card, `sc-13`, whose answer is the only one carrying a slash.
  { category: 'slash-chords', rule: 'only-slash', cards: 1 },
];

function blindCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of CARDS) {
    const options = [c.correctAnswer, ...c.decoys];
    // `catalogRulesFor`, not BLIND_RULES: a scoped rule is a tell in
    // its own categories and noise elsewhere, and running it everywhere
    // would fill the allowlist with cards that are fine.
    //
    // CATALOG rules only. This allowlist pins COUNTS, and a
    // rendered-order rule has no count worth pinning — it fires on
    // every card by construction and what matters is the proportion.
    // It is asserted against a derived bound below instead.
    for (const r of catalogRulesFor(c.category)) {
      if (r.pick(options) === c.correctAnswer) {
        const k = `${c.category}|${r.id}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  return counts;
}

describe('a blind solver cannot beat the deck', () => {
  const counts = blindCounts();
  const allowed = new Map(BLIND_ALLOWLIST.map(a => [`${a.category}|${a.rule}`, a.cards]));

  it('has no leak the allowlist does not already know about', () => {
    const surprises = [...counts]
      .filter(([k]) => !allowed.has(k))
      .map(([k, n]) => `${k} → ${n} cards`);
    expect(surprises).toEqual([]);
  });

  for (const { category, rule, cards } of BLIND_ALLOWLIST) {
    it(`${category} / ${rule}: at most ${cards} cards`, () => {
      expect(counts.get(`${category}|${rule}`) ?? 0).toBeLessThanOrEqual(cards);
    });
  }

  it('keeps the allowlist honest — no entry is larger than the truth', () => {
    // Headroom is how a leak comes back unnoticed. An entry pinned at 9
    // against 4 actual cards would silently permit five new ones.
    const stale = BLIND_ALLOWLIST
      .filter(a => (counts.get(`${a.category}|${a.rule}`) ?? 0) < a.cards)
      .map(a => `${a.category}|${a.rule} pinned ${a.cards}, actually `
        + `${counts.get(`${a.category}|${a.rule}`) ?? 0}`);
    expect(stale).toEqual([]);
  });
});

// --- The ninth rule: where the answer is DRAWN -----------------------

/**
 * How unlikely a category's first-slot count has to be before the build
 * calls it a leak.
 *
 * =====================================================================
 * THE ONE AUTHORED NUMBER HERE, SO IT IS ON ITS OWN LINE.
 *
 * Everything else about this bound is derived: the baseline comes from
 * the option count, the ceiling from the category size. This is the
 * false-alarm rate we are willing to run, and it is a judgement, not a
 * measurement.
 *
 * It is set tight because seventeen categories are checked on every
 * run. At alpha = 0.05 each has a 1-in-20 chance of tripping on nothing
 * — across seventeen that is closer to a coin flip per build than to a
 * rare event, and a guard that goes red on noise is a guard that gets
 * switched off. Production Vocabulary's `microphones` sits at exactly
 * the 0.05 ceiling today (4 of 7), so one new card there would have
 * failed the build for no reason at all.
 *
 * At 0.001 the same category's ceiling is 6, and every category in both
 * decks clears its bound with room. The cost is sensitivity: a skew has
 * to be substantial before this fires. That is the right trade for a
 * BUILD GATE, whose job is to catch a mechanism breaking rather than to
 * detect a subtle bias — and the mechanism breaking looks like 52.5%,
 * not like 30%.
 * =====================================================================
 */
const POSITION_ALPHA = 0.001;

describe('the answer is not drawn in a predictable slot', () => {
  const counts = renderedRuleCounts(CARDS);

  // Every category, every rendered-order rule — no allowlist to opt out
  // of. A category that cannot meet the bound is a bug in the shuffle,
  // and the shuffle is one function shared by the whole deck, so there
  // is no such thing as "this category is a known exception".
  for (const category of CATEGORIES) {
    const e = counts.get(category)!;
    for (const rule of renderedRulesFor(category)) {
      const bound = positionBound(e.n, e.chance, POSITION_ALPHA);
      it(`${category} / ${rule.id}: at most ${bound} of ${e.n}`, () => {
        expect(e.hits.get(rule.id) ?? 0).toBeLessThanOrEqual(bound);
      });
    }
  }

  it('holds deck-wide, where the bound is tightest', () => {
    // =================================================================
    // THE CATEGORY TESTS ABOVE CANNOT REPLACE THIS ONE.
    //
    // A bound scales with the square root of n, so fifteen small
    // ceilings are collectively far looser than one ceiling over the
    // whole deck. A uniform 30% skew would clear every category above
    // and still be a tell — it is the deck a reader practises, not a
    // category.
    // =================================================================
    const all = renderedRuleCounts(
      CARDS.map(c => ({ ...c, category: 'deck' })),
    ).get('deck')!;
    const failures = renderedRulesFor('deck').map(r => {
      const bound = positionBound(all.n, all.chance, POSITION_ALPHA);
      const hits = all.hits.get(r.id) ?? 0;
      return { rule: r.id, hits, bound, of: all.n };
    }).filter(f => f.hits > f.bound);
    expect(failures).toEqual([]);
  });

  it('measures the RENDERED order, which is the whole point', () => {
    // =================================================================
    // THE REVERSAL, PINNED.
    //
    // This rule exists because eight rules read `[correct, ...decoys]`
    // and were therefore structurally unable to see a defect that lives
    // in the shuffle. If a later refactor ever feeds it catalog order
    // instead, every one of its assertions would pass trivially —
    // `[correct, ...decoys]` puts the answer first 100% of the time, so
    // the rule would be perfectly wrong and perfectly green.
    //
    // So: assert that catalog order FAILS the rule outright. This is
    // the one shape that proves the rule is reading the screen.
    // =================================================================
    const rule = BLIND_RULES.find(r => r.id === 'always-first')!;
    const onCatalogOrder = CARDS.filter(
      c => rule.pick([c.correctAnswer, ...c.decoys]) === c.correctAnswer,
    ).length;
    expect(onCatalogOrder).toBe(CARDS.length);

    const onRendered = CARDS.filter(
      c => rule.pick(renderedOptions(c.id, c.correctAnswer, c.decoys)) === c.correctAnswer,
    ).length;
    expect(onRendered).toBeLessThan(CARDS.length);
  });

  it('would have failed on the order this replaced', () => {
    // =================================================================
    // A GUARD THAT PASSES ON THE NUMBERS THAT MOTIVATED IT PROVES
    // NOTHING.
    //
    // The old order sorted the four options by `(firstCharCode +
    // cardHash) % 97`. The key reads ONE character, and `sort` is
    // stable, so every tie fell back to the input order — which begins
    // with the answer. The rule has to go red on that, or it is not a
    // guard, it is decoration.
    //
    // The old comparator is reproduced here rather than imported: it is
    // deleted code, and the point is that THIS rule catches THAT shape,
    // not that some helper still exists.
    // =================================================================
    const oldOrder = (c: GuardedCard): string[] => {
      const opts = [c.correctAnswer, ...c.decoys];
      let h = 0;
      for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0;
      return [...opts].sort((a, b) =>
        (((a.charCodeAt(0) || 0) + h) % 97) - (((b.charCodeAt(0) || 0) + h) % 97));
    };
    const firstUnder = (order: (c: GuardedCard) => string[]) =>
      CARDS.filter(c => order(c)[0] === c.correctAnswer).length;

    const before = firstUnder(oldOrder);
    const after = firstUnder(c => renderedOptions(c.id, c.correctAnswer, c.decoys));
    const bound = positionBound(CARDS.length, 0.25, POSITION_ALPHA);

    // 341 of 649 — 52.5% — when this was written, against a 197
    // ceiling. The deck has more than doubled since; the number moves
    // with it and the claim does not. What is pinned is that the old
    // comparator is still WELL over the bound and the new one is under
    // it, which is the whole content of the test.
    expect(before).toBeGreaterThan(CARDS.length * 0.4);
    expect(before).toBeGreaterThan(bound);
    // And the replacement clears it.
    expect(after).toBeLessThanOrEqual(bound);
  });
});

// --- Allowlist 2: which decoys appear at all -------------------------

const TELL_ALLOWLIST: ReadonlyArray<{ category: string; tokeniser: string; cards: number }> = [
  // diatonic-qualities / whole and / without-key stood at 2. "diminished 7"
  // sat as a decoy only beside a half-diminished answer, on two cards,
  // so it named the answer. The minors of 13 Sep 2026 put it beside a
  // minor 7 as well, and it points at nothing now.
  { category: 'functional-harmony', tokeniser: 'last-word', cards: 2 },
  // pentatonic-scales stood at 12 on all four readings and is now 0.
  // Those twelve were the "share the same _____" cards: every one
  // answered "5 notes (identical pitch set)" against the same three
  // hand-written decoys, so any decoy on screen named the answer.
  // Commit 8 replaced the question, and the card that replaced it
  // draws its options from the thirteen minor-pentatonic names.
  // slash-chords stood at 2 / 2 / 5 / 2. Three of the four entries are
  // gone and the fourth is down to three: 6/♭7 left the deck with
  // ruling 30, and the generated family no longer repeats a wrong
  // answer against a right one two shapes can both produce — see
  // `spentOn` in `generateSlashCards`. What is left is `sc-12` to
  // `sc-14`, three hand-written prose cards where "…position" among
  // the decoys means the answer ends "inversion".
  { category: 'slash-chords', tokeniser: 'last-word', cards: 3 },
];

function tellCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const category of CATEGORIES) {
    const cards = CARDS.filter(c => c.category === category);
    for (const t of TOKENISERS) {
      const tells = findTells(cards, t);
      if (tells.length === 0) continue;
      counts.set(`${category}|${t.id}`, cardsGivenAway(cards, tells, t).length);
    }
  }
  return counts;
}

describe('no decoy pins its answer', () => {
  const counts = tellCounts();
  const allowed = new Map(TELL_ALLOWLIST.map(a => [`${a.category}|${a.tokeniser}`, a.cards]));

  it('has no tell the allowlist does not already know about', () => {
    const surprises = [...counts]
      .filter(([k]) => !allowed.has(k))
      .map(([k, n]) => `${k} → ${n} cards`);
    expect(surprises).toEqual([]);
  });

  for (const { category, tokeniser, cards } of TELL_ALLOWLIST) {
    it(`${category} / ${tokeniser}: at most ${cards} cards`, () => {
      expect(counts.get(`${category}|${tokeniser}`) ?? 0).toBeLessThanOrEqual(cards);
    });
  }

  it('counts the remaining damage as DISTINCT cards', () => {
    // =================================================================
    // SUMMING THE ALLOWLIST IS NOT THE NUMBER OF LEAKY CARDS.
    //
    // Both allowlists are keyed per rule and per reading, so a card
    // tripping two rules is counted twice and a pentatonic card seen
    // under four tokenisers is counted four times. Adding the columns
    // adds up to more than the deck can supply. The real figures are
    // 24 and 7, overlapping on nothing, for 31 in all — against 124
    // and 36 before the guard existed. It ROSE from 41 to 50 when
    // `longest` was scoped in: nine cards that were always answerable
    // started being counted, which is a guard getting sharper rather
    // than a deck getting worse. Ruling 30's rebuilt slash deck took
    // it back down by six.
    //
    // So the honest aggregate is derived here rather than written into
    // a commit message, where nobody can check it.
    // =================================================================
    // Catalog rules only, for the same reason `blindCounts` uses them:
    // `always-first` fires on every card and is right on a quarter of
    // them BY DESIGN, so folding it in here would report a sixth of the
    // deck as leaky and make this aggregate meaningless.
    const leaky = new Set<string>();
    for (const c of CARDS) {
      const options = [c.correctAnswer, ...c.decoys];
      if (catalogRulesFor(c.category).some(r => r.pick(options) === c.correctAnswer)) {
        leaky.add(c.id);
      }
    }
    const told = new Set<string>();
    for (const category of CATEGORIES) {
      const cards = CARDS.filter(c => c.category === category);
      for (const t of TOKENISERS) {
        for (const c of cardsGivenAway(cards, findTells(cards, t), t)) told.add(c.id);
      }
    }
    const both = new Set([...leaky, ...told]);
    // 23 blind, 28 in all, until Ear-Theory Crossover retired on 14 Sep
    // 2026: eight of its cards were picked out by the longest option, and
    // they went with the category. 15 and 20 until the duplicates went the
    // same day, taking five more with them. 10 and 15 until the key-of-C
    // "contains the notes" cards retired into Spell the chord in a key,
    // taking the five whose plain spelling gave them away.
    expect({ blind: leaky.size, tell: told.size, distinct: both.size })
      .toEqual({ blind: 5, tell: 5, distinct: 10 });
  });

  it('keeps the tell allowlist honest', () => {
    const stale = TELL_ALLOWLIST
      .filter(a => (counts.get(`${a.category}|${a.tokeniser}`) ?? 0) < a.cards)
      .map(a => `${a.category}|${a.tokeniser} pinned ${a.cards}, actually `
        + `${counts.get(`${a.category}|${a.tokeniser}`) ?? 0}`);
    expect(stale).toEqual([]);
  });

  it('catches a mode pool, which a raw string comparison cannot', () => {
    // The proof the tokenisers earn their keep, against the shape the
    // modes category actually had: a fixed `others` list per degree,
    // so Locrian on screen meant Aeolian in every key.
    //
    // A FIXTURE, NOT THE LIVE DECK. Asserting the leak against real
    // cards was fine while it was there and would have had to be
    // deleted the moment it was fixed — taking the proof with it. This
    // keeps proving the detector works after the deck stops tripping it.
    const leaky: GuardedCard[] = ['D', 'E♭', 'F', 'G'].flatMap(k => [
      { id: `x-${k}-6`, category: 'x', correctAnswer: `${k} Aeolian`,
        decoys: [`${k} Dorian`, `${k} Phrygian`, `${k} Locrian`] },
      { id: `x-${k}-5`, category: 'x', correctAnswer: `${k} Mixolydian`,
        decoys: [`${k} Lydian`, `${k} Dorian`, `${k} Ionian`] },
    ]);
    // Every option string is unique, so the `whole` reading is blind.
    expect(findTells(leaky, TOKENISERS[0])).toEqual([]);
    const byMode = findTells(leaky, TOKENISERS[1]).map(t => `${t.token}→${t.implies}`);
    expect(byMode).toContain('Locrian→Aeolian');
    expect(byMode).toContain('Ionian→Mixolydian');
  });

  it('finds nothing in the modes category as it now stands', () => {
    const modes = CARDS.filter(c => c.category === 'modes');
    for (const t of TOKENISERS) expect(findTells(modes, t)).toEqual([]);
  });
});

// --- The guard itself must be able to fail ---------------------------

describe('the rules fire on a card built to be answerable', () => {
  it('spots the middle of three', () => {
    const options = ['4', '3', '5', '1'];
    expect(BLIND_RULES.find(r => r.id === 'middle-of-3')!.pick(options)).toBe('4');
  });

  it('spots the lone bracket, slash, comma and prose', () => {
    const pick = (id: string, o: string[]) => BLIND_RULES.find(r => r.id === id)!.pick(o);
    expect(pick('only-bracket', ['C♭ (B)', 'A♭', 'F', 'C'])).toBe('C♭ (B)');
    expect(pick('only-slash', ['G/B', 'Am', 'F', 'C'])).toBe('G/B');
    expect(pick('only-comma', ['1, 2, 3', 'root', 'fifth', 'third'])).toBe('1, 2, 3');
    expect(pick('only-prose', ['the starting point', 'key', 'tempo', 'meter'])).toBe('the starting point');
  });

  it('spots the lone accidental in both directions', () => {
    const pick = (id: string, o: string[]) => BLIND_RULES.find(r => r.id === id)!.pick(o);
    expect(pick('only-accidental', ['Bb', 'C', 'D', 'E'])).toBe('Bb');
    expect(pick('only-accidental', ['b3', 'C', 'D', 'E'])).toBe('b3');
    expect(pick('only-natural', ['C', 'Bb', 'F#', 'Eb'])).toBe('C');
  });

  it('does not call an ordinary word an accidental', () => {
    // A bare /b/ would flag "dominant 7" and "major 7b5" alike, and
    // then every prose category would report a leak it does not have.
    const pick = BLIND_RULES.find(r => r.id === 'only-accidental')!.pick;
    expect(pick(['dominant 7', 'major 7', 'minor 7', 'diminished 7'])).toBeNull();
  });

  it('stays silent when nothing separates the options', () => {
    // Four mode names, same shape, no accidentals, no punctuation.
    // `longest` is excluded because "Aeolian" IS one letter longer —
    // it fires correctly here, and it is asserted on its own below.
    //
    // RENDERED-ORDER RULES ARE EXCLUDED FOR A DIFFERENT REASON, and it
    // is not an exemption. This test asks "does the rule go quiet when
    // the option VALUES give nothing away". `always-first` never reads
    // the values at all — there is always a first slot, so it always
    // fires, and whether it is a leak is a fact about the PROPORTION it
    // gets right across a category rather than about any single card.
    // Its silence is not a meaningful property and asserting it would
    // be asserting the wrong thing about the right rule.
    const catalogRules = BLIND_RULES.filter(
      r => r.id !== 'longest' && r.readsRenderedOrder !== true,
    );
    for (const r of catalogRules) {
      expect(r.pick(['Dorian', 'Aeolian', 'Lydian', 'Ionian'])).toBeNull();
    }
    // The exclusion is not an escape hatch: this is what it excludes.
    // If a rendered-order rule ever DID go silent on a real four-option
    // card, it would be firing on nothing and its bound would be
    // meaningless — so pin the opposite.
    for (const r of BLIND_RULES.filter(r => r.readsRenderedOrder === true)) {
      expect(r.pick(['Dorian', 'Aeolian', 'Lydian', 'Ionian'])).not.toBeNull();
    }
  });

  it('scopes `longest` to the category that measured as a tell', () => {
    const rule = BLIND_RULES.find(r => r.id === 'longest')!;
    expect(rule.pick(['suspension-and-release tension', 'modal ambiguity',
      'chromatic descent', 'pedal point'])).toBe('suspension-and-release tension');
    expect(rule.pick(['Minor 3rd', 'Major 3rd', 'Minor 6th', 'Major 6th']))
      .toBeNull();
    expect(rulesFor('intervals').map(r => r.id)).toContain('longest');
    expect(rulesFor('slash-chords').map(r => r.id)).not.toContain('longest');
    // `shortest` is narrower still — one category, and BELOW chance
    // everywhere else, so a card whose answer is the short option is
    // usually wrong rather than right.
    expect(rulesFor('chord-construction').map(r => r.id)).toContain('shortest');
    expect(rulesFor('intervals').map(r => r.id)).not.toContain('shortest');
    expect(BLIND_RULES.find(r => r.id === 'shortest')!.scope?.because)
      .toMatch(/\d+%/);
    // The scope has to say why, with the number that justified it, or
    // the next reader deletes it as an oversight.
    expect(rule.scope?.because).toMatch(/\d+%/);
  });
});

// --- The chooser rejects rather than repairs -------------------------

describe('chooseDecoys', () => {
  it('refuses the leaky set and finds the clean one', () => {
    // 4 is the answer; 3 and 5 would make it the middle of three.
    const decoys = chooseDecoys('4', ['3', '5', '1', '7', '2'], {
      count: 3, seed: 'test-a', label: 'test-a', category: 'test',
    });
    expect(BLIND_RULES.find(r => r.id === 'middle-of-3')!.pick(['4', ...decoys]))
      .not.toBe('4');
  });

  it('gives an answer with a bracket a decoy with a bracket', () => {
    const decoys = chooseDecoys('C♭ (B)', ['A♭', 'F♭ (E)', 'C', 'B♯ (C)', 'G'], {
      count: 3, seed: 'test-b', label: 'test-b', category: 'test',
    });
    expect(decoys.filter(d => d.includes('(')).length).toBeGreaterThan(0);
  });

  it('throws rather than shipping a card it cannot make fair', () => {
    // Every candidate is a plain natural; the answer is the only note
    // with an accidental and no combination fixes that.
    expect(() => chooseDecoys('B♭', ['C', 'D', 'E', 'F', 'G'], {
      count: 3, seed: 'test-c', label: 'nn-999', category: 'test',
    })).toThrow(/nn-999/);
  });

  it('throws when the pool is too small to choose from', () => {
    expect(() => chooseDecoys('C', ['D', 'E'], {
      count: 3, seed: 'test-d', label: 'iv-999', category: 'test',
    })).toThrow(/pool has 2/);
  });

  it('is stable across calls — the same card gets the same decoys', () => {
    const once = chooseDecoys('4', ['3', '5', '1', '7', '2'], { count: 3, seed: 's', label: 'l', category: 'test' });
    const twice = chooseDecoys('4', ['3', '5', '1', '7', '2'], { count: 3, seed: 's', label: 'l', category: 'test' });
    expect(once).toEqual(twice);
  });

  it('gives two cards drawing on one pool different decoys', () => {
    // What the Math.random() shuffle was for, kept without the flake.
    const a = rotate(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'card-1');
    const b = rotate(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'card-2');
    expect(a).not.toEqual(b);
  });
});

describe('the deck is the same on every load', () => {
  it('builds identical decoys twice running', async () => {
    // Four generators shuffled with Math.random() at module load, so
    // the decoys differed on every import and any count pinned above
    // would have been one draw. Re-importing must produce byte-identical
    // decoys or the allowlist means nothing.
    const again = await import('../catalog?fresh=1' as string) as { FLASHCARDS: typeof FLASHCARDS };
    const fingerprint = (cards: typeof FLASHCARDS) =>
      cards.map(c => `${c.id}:${c.decoys.join(',')}`).join('|');
    expect(fingerprint(again.FLASHCARDS)).toBe(fingerprint(FLASHCARDS));
  });
});
