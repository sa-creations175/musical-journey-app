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
  BLIND_RULES, TOKENISERS, cardsGivenAway, chooseDecoys, findTells, rotate,
  type GuardedCard,
} from '../decoyGuard';

const CARDS: GuardedCard[] = FLASHCARDS.map(c => ({
  id: c.id, category: c.category, correctAnswer: c.correctAnswer, decoys: c.decoys,
}));
const CATEGORIES = [...new Set(CARDS.map(c => c.category))].sort();

// --- Allowlist 1: a rule picks the answer out of the four options ----

const BLIND_ALLOWLIST: ReadonlyArray<{ category: string; rule: string; cards: number }> = [
  { category: 'chord-construction', rule: 'only-bracket', cards: 1 },
  { category: 'chord-construction', rule: 'only-natural', cards: 4 },
  { category: 'ear-theory', rule: 'only-accidental', cards: 1 },
  { category: 'ear-theory', rule: 'only-bracket', cards: 3 },
  // enharmonic-equivalents / only-slash and / only-prose stood at 9
  // each — a three-way group answers with a pair ("b3 / #9") against
  // decoys that were single degrees, so the answer was the only option
  // with a slash and the only one with a space, on all nine. Decoys now
  // come from the other three-way groups: real pairs, correctly
  // written, wrong for this question.
  { category: 'functional-harmony', rule: 'only-accidental', cards: 1 },
  { category: 'functional-harmony', rule: 'only-bracket', cards: 2 },
  { category: 'functional-harmony', rule: 'only-comma', cards: 1 },
  { category: 'functional-harmony', rule: 'only-prose', cards: 1 },
  { category: 'key-signatures', rule: 'middle-of-3', cards: 6 },
  { category: 'key-signatures', rule: 'only-accidental', cards: 2 },
  { category: 'key-signatures', rule: 'only-bracket', cards: 2 },
  // key-signatures / only-natural stood at 1: the parallel minor of B
  // major is B minor, and a fixed 6/2/5 decoy list gave it G♯, C♯ and
  // F♯ for company — the answer was the only plain name on screen. Both
  // minor generators now choose from a wider degree list per key.
  { category: 'modes', rule: 'middle-of-3', cards: 4 },
  { category: 'modes', rule: 'only-accidental', cards: 1 },
  { category: 'modes', rule: 'only-bracket', cards: 2 },
  { category: 'modes', rule: 'only-natural', cards: 1 },
  { category: 'modes', rule: 'only-prose', cards: 1 },
  // named-notes stood at 1 and 1: a key's scale can hold a single
  // accidental (F major has only B♭), so an answer of B♭ was alone on
  // screen. The pool now falls through to notes just outside the key,
  // spelled the way the KEY spells them.
  { category: 'pentatonic-scales', rule: 'only-accidental', cards: 1 },
  { category: 'pentatonic-scales', rule: 'only-bracket', cards: 2 },
  { category: 'pentatonic-scales', rule: 'only-prose', cards: 1 },
  { category: 'progressions', rule: 'only-bracket', cards: 2 },
  // reverse-key-pivots stood at 3 and 4. Every option is "<key> major"
  // and eleven keys were available, so a flat answer can always be
  // given flat company — it just was not being asked for.
  // scale-degree-math / middle-of-3 stood at 52 and is now 0 — the
  // decoys were answer−1, answer+1 and an outlier, so three of four
  // options were consecutive and the answer was between them. The
  // offsets now come from the card's identity, so the answer's rank
  // cycles. Entry deleted rather than left at 0: an entry pinned at a
  // number nothing reaches is headroom.
  { category: 'slash-chords', rule: 'only-accidental', cards: 4 },
  { category: 'slash-chords', rule: 'only-slash', cards: 1 },
];

function blindCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of CARDS) {
    const options = [c.correctAnswer, ...c.decoys];
    for (const r of BLIND_RULES) {
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

// --- Allowlist 2: which decoys appear at all -------------------------

const TELL_ALLOWLIST: ReadonlyArray<{ category: string; tokeniser: string; cards: number }> = [
  { category: 'diatonic-qualities', tokeniser: 'whole', cards: 2 },
  { category: 'diatonic-qualities', tokeniser: 'without-key', cards: 2 },
  { category: 'functional-harmony', tokeniser: 'last-word', cards: 2 },
  { category: 'key-signatures', tokeniser: 'whole', cards: 4 },
  { category: 'key-signatures', tokeniser: 'without-key', cards: 4 },
  { category: 'key-signatures', tokeniser: 'last-word', cards: 4 },
  { category: 'key-signatures', tokeniser: 'first-word', cards: 4 },
  // Locrian on screen means Aeolian, in all twelve keys. Step (d).
  { category: 'modes', tokeniser: 'without-key', cards: 36 },
  { category: 'modes', tokeniser: 'last-word', cards: 36 },
  { category: 'pentatonic-scales', tokeniser: 'whole', cards: 12 },
  { category: 'pentatonic-scales', tokeniser: 'without-key', cards: 12 },
  { category: 'pentatonic-scales', tokeniser: 'last-word', cards: 12 },
  { category: 'pentatonic-scales', tokeniser: 'first-word', cards: 12 },
  { category: 'slash-chords', tokeniser: 'whole', cards: 2 },
  { category: 'slash-chords', tokeniser: 'without-key', cards: 2 },
  { category: 'slash-chords', tokeniser: 'last-word', cards: 5 },
  { category: 'slash-chords', tokeniser: 'first-word', cards: 2 },
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

  it('keeps the tell allowlist honest', () => {
    const stale = TELL_ALLOWLIST
      .filter(a => (counts.get(`${a.category}|${a.tokeniser}`) ?? 0) < a.cards)
      .map(a => `${a.category}|${a.tokeniser} pinned ${a.cards}, actually `
        + `${counts.get(`${a.category}|${a.tokeniser}`) ?? 0}`);
    expect(stale).toEqual([]);
  });

  it('catches the mode pool, which a raw string comparison cannot', () => {
    // The proof the tokenisers earn their keep. "A Locrian" appears
    // once in the whole deck, so the `whole` reading sees nothing.
    const modes = CARDS.filter(c => c.category === 'modes');
    expect(findTells(modes, TOKENISERS[0])).toEqual([]);
    const byMode = findTells(modes, TOKENISERS[1]);
    expect(byMode.map(t => `${t.token}→${t.implies}`)).toContain('Locrian→Aeolian');
    expect(byMode.map(t => `${t.token}→${t.implies}`)).toContain('Ionian→Mixolydian');
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
    for (const r of BLIND_RULES) {
      expect(r.pick(['Dorian', 'Aeolian', 'Lydian', 'Ionian'])).toBeNull();
    }
  });
});

// --- The chooser rejects rather than repairs -------------------------

describe('chooseDecoys', () => {
  it('refuses the leaky set and finds the clean one', () => {
    // 4 is the answer; 3 and 5 would make it the middle of three.
    const decoys = chooseDecoys('4', ['3', '5', '1', '7', '2'], {
      count: 3, seed: 'test-a', label: 'test-a',
    });
    expect(BLIND_RULES.find(r => r.id === 'middle-of-3')!.pick(['4', ...decoys]))
      .not.toBe('4');
  });

  it('gives an answer with a bracket a decoy with a bracket', () => {
    const decoys = chooseDecoys('C♭ (B)', ['A♭', 'F♭ (E)', 'C', 'B♯ (C)', 'G'], {
      count: 3, seed: 'test-b', label: 'test-b',
    });
    expect(decoys.filter(d => d.includes('(')).length).toBeGreaterThan(0);
  });

  it('throws rather than shipping a card it cannot make fair', () => {
    // Every candidate is a plain natural; the answer is the only note
    // with an accidental and no combination fixes that.
    expect(() => chooseDecoys('B♭', ['C', 'D', 'E', 'F', 'G'], {
      count: 3, seed: 'test-c', label: 'nn-999',
    })).toThrow(/nn-999/);
  });

  it('throws when the pool is too small to choose from', () => {
    expect(() => chooseDecoys('C', ['D', 'E'], {
      count: 3, seed: 'test-d', label: 'iv-999',
    })).toThrow(/pool has 2/);
  });

  it('is stable across calls — the same card gets the same decoys', () => {
    const once = chooseDecoys('4', ['3', '5', '1', '7', '2'], { count: 3, seed: 's', label: 'l' });
    const twice = chooseDecoys('4', ['3', '5', '1', '7', '2'], { count: 3, seed: 's', label: 'l' });
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
