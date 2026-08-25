/**
 * The leak guard: rules that answer a card WITHOUT reading its question.
 *
 * =====================================================================
 * WHY THIS EXISTS, AND WHY IT IS ONE LIST.
 *
 * A blind solver — a function handed the four options and never the
 * question — should score 25%. Measured against this deck before the
 * guard, several rules did far better:
 *
 *     the only option with a slash   is the answer  10 of 13 times
 *     the only option with a bracket is the answer  14 of 15 times
 *     the middle of a sorted 3-run   is the answer  62 of 83 times
 *
 * A card answerable that way is scored, marked right, and its interval
 * pushed out by SM-2 — the tracker reports fluency the reader does not
 * have. That is the same class of defect as a bar whose width and
 * colour came from two different sources: the number is not wrong, it
 * is measuring something other than what it claims.
 *
 * THE RULES AND THE CHOOSER READ THE SAME LIST. `chooseDecoys` rejects
 * any set that trips a rule, and the deck test asserts no card trips
 * one. If those were two lists they would drift, and the drift would be
 * silent — a rule tightened in the test but not the chooser throws at
 * build time, which is loud; a rule tightened in the chooser but not
 * the test just stops being checked.
 * =====================================================================
 */

// The one import, and it is not the catalog. `renderedOptions` is how
// the flashcard shell actually orders the four buttons; a guard that
// re-derived that order would be checking its own copy rather than the
// screen, which is how the render order went eight rules unexamined.
import { renderedOptions } from '../../lib/flashcards/optionOrder';

/**
 * Every rule sees ONLY the options, in a fixed order, and returns the
 * one it would pick — or null when it does not fire.
 *
 * Returning null matters: a rule that fires on three cards and is right
 * on all three is noise, and a rule that fires on sixty-four and is
 * right on fifty-two is a defect. Coverage and accuracy have to be
 * counted separately, so "did not fire" cannot be folded into "was
 * wrong".
 */
export interface BlindRule {
  id: string;
  /** Read aloud in a failure message, so the report says what a reader
   *  would actually do rather than naming a regex. */
  name: string;
  pick: (options: readonly string[]) => string | null;
  /**
   * The categories this rule applies to. Absent means every category.
   *
   * =====================================================================
   * THE PRECEDENT, STATED SO THE NEXT PERSON DOES NOT "FIX" IT.
   *
   * A narrow rule looks like an oversight. It reads as though someone
   * meant to generalise it and never got round to it, and the natural
   * tidying instinct is to delete the scope and turn it on everywhere.
   *
   * So a scope carries `because`, and `because` carries the MEASURED
   * NUMBER that justified it. A rule is narrow when it is a real tell
   * in some categories and noise in others, and the only way to know
   * which is to have counted. Widening it without recounting turns a
   * guard into a nuisance: cards that are fine start failing the build,
   * the allowlist grows to hold them, and the allowlist stops meaning
   * "leaks we have not fixed yet".
   *
   * If the deck changes shape, re-measure and rewrite both fields
   * together. Never one without the other.
   * =====================================================================
   */
  scope?: {
    categories: readonly string[];
    /** Why these and not the rest — with the numbers. */
    because: string;
  };
  /**
   * This rule must be handed the options in the order they are
   * RENDERED, not `[correct, ...decoys]`.
   *
   * =====================================================================
   * WHY THE FLAG EXISTS, AND WHY THE CHOOSER MUST SKIP THESE.
   *
   * The other eight rules are order-invariant — they sort, or they
   * filter to a unique match — so it never mattered which order they
   * were given. `always-first` is the opposite: order is the ONLY thing
   * it reads. That is also why it went unnoticed for so long. Every
   * rule read the catalog, so no rule could see a defect that lives
   * purely in the render.
   *
   * `chooseDecoys` must not try to satisfy a rule carrying this flag,
   * and the reason is not taste. Under a seeded shuffle the answer's
   * rendered index is a function of the card's SEED and the option
   * COUNT — the permutation moves slot 0 somewhere regardless of what
   * strings are in the other slots. So swapping decoys cannot change
   * whether this rule fires: for a given card either every candidate
   * set trips it or none does. Letting the chooser see it would make it
   * throw "no clean decoy set" on roughly a quarter of the deck while
   * searching for something no search can find.
   *
   * The position is fixed by the shuffle. The guard's job is to CHECK
   * that, per category, not to have the chooser chase it.
   * =====================================================================
   */
  readsRenderedOrder?: true;
}

/** The only option carrying `char`, if exactly one does. */
function loneBy(
  options: readonly string[],
  has: (s: string) => boolean,
): string | null {
  const hits = options.filter(has);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Whether a label carries an accidental.
 *
 * Three shapes, because this deck writes accidentals three ways and a
 * single character class gets all three wrong:
 *   "B♭", "F♯"  — glyphs, anywhere in the string
 *   "Bb", "Gb"  — ASCII flat, only ever directly after a note letter
 *   "b3", "b13" — ASCII flat on a degree, at a word boundary
 *
 * A bare `/b/` would call "dominant 7" an accidental, and a bare
 * `/[#♯♭]/` would miss every ASCII flat in the named-notes category.
 */
export function hasAccidental(label: string): boolean {
  return /[#♯♭𝄪𝄫]/.test(label)
    || /(^|[\s(,/])[A-G]b/.test(label)
    || /(^|[\s(,/])b\d/.test(label);
}

const isNumeric = (s: string) => /^-?\d+$/.test(s);

/**
 * The rules, in the order a failure report lists them.
 *
 * ---------------------------------------------------------------
 * TWO CANDIDATES WERE MEASURED AND DROPPED, AND THE MEASUREMENT IS
 * WHY THEY ARE NOT HERE.
 *
 * "the uniquely longest option" fires on 231 cards and is right on 72
 * — 31%, against 25% chance. "the uniquely shortest" is right on 28 of
 * 167, which is 17%: BELOW chance, meaning the shortest option is mild
 * evidence you are wrong. Neither is a tell, and asserting them
 * deck-wide would have filled the allowlist with cards that are fine.
 *
 * Length still matters where the options are prose, so it survives as
 * a PREFERENCE inside `chooseDecoys` — it breaks ties between clean
 * candidate sets rather than rejecting any of them. A preference
 * cannot fail a build, which is the right weight for a 31% signal.
 * ---------------------------------------------------------------
 */
export const BLIND_RULES: ReadonlyArray<BlindRule> = [
  {
    id: 'middle-of-3',
    name: 'the middle of three consecutive numbers',
    pick: options => {
      if (!options.every(isNumeric)) return null;
      const sorted = [...options].map(Number).sort((a, b) => a - b);
      for (let i = 0; i + 2 < sorted.length; i++) {
        if (sorted[i + 1] === sorted[i] + 1 && sorted[i + 2] === sorted[i] + 2) {
          return String(sorted[i + 1]);
        }
      }
      return null;
    },
  },
  {
    id: 'only-bracket',
    name: 'the only option with a bracket',
    pick: o => loneBy(o, s => s.includes('(')),
  },
  {
    id: 'only-slash',
    name: 'the only option with a slash',
    pick: o => loneBy(o, s => s.includes('/')),
  },
  {
    id: 'only-comma',
    name: 'the only option with a comma',
    pick: o => loneBy(o, s => s.includes(',')),
  },
  {
    id: 'only-prose',
    name: 'the only option written as words',
    pick: o => loneBy(o, s => s.includes(' ')),
  },
  {
    id: 'only-accidental',
    name: 'the only option carrying an accidental',
    pick: o => loneBy(o, hasAccidental),
  },
  {
    id: 'only-natural',
    name: 'the only option with no accidental',
    pick: o => loneBy(o, s => !hasAccidental(s)),
  },
  {
    id: 'longest',
    name: 'the option that is longer than the other three',
    pick: options => {
      const lengths = options.map(o => o.length);
      const max = Math.max(...lengths);
      return lengths.filter(l => l === max).length === 1
        ? options[lengths.indexOf(max)]
        : null;
    },
    scope: {
      categories: ['intervals', 'ear-theory'],
      because:
        'Deck-wide this fires on 211 cards and is right on 53 — 25%, which '
        + 'is chance exactly, and asserting it everywhere would fail cards '
        + 'that are fine. In two categories it is a real tell: ear-theory '
        + '8 of 13 (62%) and intervals 9 of 18 (50%), because an answer '
        + 'that names a sound in words sits beside decoys that name it in '
        + 'symbols. Measured after the fourteen bracketed answers were '
        + 'stripped, which moved ear-theory from 9 of 14. Re-measure '
        + 'before widening this.',
    },
  },
  {
    id: 'shortest',
    name: 'the option that is shorter than the other three',
    pick: options => {
      const lengths = options.map(o => o.length);
      const min = Math.min(...lengths);
      return lengths.filter(l => l === min).length === 1
        ? options[lengths.indexOf(min)]
        : null;
    },
    scope: {
      categories: ['chord-construction'],
      because:
        'Deck-wide this is right on 15 of the 152 cards where there is a '
        + 'uniquely shortest option — 10%, BELOW the 25% chance line, which '
        + 'makes the shortest option mild evidence you are wrong rather '
        + 'than a tell. In chord-construction it is right on 5 of 12 (42%), '
        + 'because a correctly spelled chord is the one with nothing added '
        + 'to it while every decoy carries an alteration. Re-measure '
        + 'before widening this.',
    },
  },
  {
    // ---------------------------------------------------------------
    // THE NINTH RULE, AND THE ONLY ONE THAT READS THE SCREEN.
    //
    // The eight above read the catalog, which is why all eight were
    // blind to this: the answer sat in the FIRST rendered slot on 341
    // of 649 harmonic-fluency cards — 52.5% against a 25% baseline —
    // and no rule that reads `[correct, ...decoys]` can express that.
    //
    // The cause was in `FlashcardSession`, not in any generator. The
    // order came from a stable sort keyed on one character, so every
    // tie fell back to the input order and the input order began with
    // the answer. Categories whose options share a leading character
    // were near-total: progressions 24 of 26 (92.3%), slash-chords 53
    // of 60 (88.3%), modes 43 of 52 (82.7%). Production Vocabulary,
    // through the same shell, was 105 of 199 (52.8%).
    //
    // ONLY THE FIRST POSITION IS A RULE. Measured on the same deck the
    // other three were 14.0%, 19.3% and 14.2% — all at or below chance,
    // so "always second" and its siblings are not tells, and asserting
    // them would add three noisy rules to catch nothing.
    //
    // The per-category bound is NOT a flat percentage — see
    // `positionBound`. A flat one would make tritone-pairs, at twelve
    // cards, fail or pass on noise.
    // ---------------------------------------------------------------
    id: 'always-first',
    name: 'the option rendered in the first slot',
    pick: options => options[0] ?? null,
    readsRenderedOrder: true,
  },
];

/**
 * The largest count of first-slot answers a category of `n` cards may
 * show before it is evidence of a leak rather than of sampling.
 *
 * =====================================================================
 * A BINOMIAL BOUND, NOT A PERCENTAGE, AND SMALL CATEGORIES ARE WHY.
 *
 * A flat ceiling — "no category above 35%" — is wrong at both ends of
 * this deck. tritone-pairs has twelve cards, so a fair shuffle puts
 * four of them first about as often as not; 33% there is silence, not
 * signal, and a flat rule would either fail it for nothing or be set so
 * loose that scale-degree-math's 168 cards could hide a real skew
 * underneath it.
 *
 * So the bound is derived from the size of the category. Under a fair
 * shuffle each card's answer lands in the first of four slots with
 * probability 1/4 independently, so the count is Binomial(n, 1/4), and
 * this returns the smallest k with P(X > k) <= alpha. Small categories
 * get a proportionally wider bound because they genuinely deserve one,
 * and no separate "exempt anything under twenty" clause is needed —
 * which is the same rule stated twice, and the second copy is the one
 * that goes stale.
 *
 * EXACT, NOT A NORMAL APPROXIMATION. n·p is 3 for tritone-pairs, where
 * the normal approximation is at its worst — and the small categories
 * are the entire reason this function exists.
 * =====================================================================
 */
/**
 * Per category: how many cards there are, and on how many of them a
 * rendered-order rule picks the answer.
 *
 * ONE IMPLEMENTATION, TWO DECKS. Harmonic Fluency and Production
 * Vocabulary render through the same `FlashcardSession`, so they had
 * the same defect and are fixed by the same change. Two copies of this
 * loop would let one deck's guard be tightened and the other's quietly
 * left behind — which is the failure mode the whole file is about.
 */
export interface RenderedRuleCount {
  /** Cards in the category. */
  n: number;
  /** Rule id → how many of them it answered correctly. */
  hits: Map<string, number>;
  /**
   * What a fair shuffle would score, DERIVED from the option counts
   * rather than written as 0.25.
   *
   * Every card in both decks offers four options today, so this is a
   * quarter — but a five-option card would silently make a written
   * 0.25 the wrong baseline, and the bound built on it would be wrong
   * in the permissive direction. Deducing it costs one line.
   */
  chance: number;
}

export function renderedRuleCounts(
  cards: readonly GuardedCard[],
): Map<string, RenderedRuleCount> {
  const out = new Map<string, RenderedRuleCount>();
  const slotSum = new Map<string, number>();
  for (const c of cards) {
    const e = out.get(c.category)
      ?? { n: 0, hits: new Map<string, number>(), chance: 0 };
    e.n += 1;
    const options = renderedOptions(c.id, c.correctAnswer, c.decoys);
    slotSum.set(c.category, (slotSum.get(c.category) ?? 0) + 1 / options.length);
    for (const r of renderedRulesFor(c.category)) {
      if (r.pick(options) === c.correctAnswer) {
        e.hits.set(r.id, (e.hits.get(r.id) ?? 0) + 1);
      }
    }
    out.set(c.category, e);
  }
  for (const [cat, e] of out) e.chance = (slotSum.get(cat) ?? 0) / e.n;
  return out;
}

export function positionBound(n: number, p: number, alpha: number): number {
  if (n <= 0) return 0;
  // pmf(0) = (1-p)^n, then pmf(k+1) = pmf(k) · (n-k)/(k+1) · p/(1-p).
  let pmf = Math.pow(1 - p, n);
  let cdf = pmf;
  for (let k = 0; k < n; k++) {
    // P(X > k) = 1 - cdf(k). Return as soon as that is within alpha.
    if (1 - cdf <= alpha) return k;
    pmf = pmf * ((n - k) / (k + 1)) * (p / (1 - p));
    cdf += pmf;
  }
  return n;
}

/** The rules that apply to a card in `category`. */
export function rulesFor(category: string): BlindRule[] {
  return BLIND_RULES.filter(
    r => r.scope === undefined || r.scope.categories.includes(category),
  );
}

/**
 * Those of them that read `[correct, ...decoys]` — the catalog order.
 *
 * The chooser's set, and the set every count-pinned allowlist entry is
 * about. A rendered-order rule cannot be answered from a decoy set and
 * must not be mixed into these totals; see `readsRenderedOrder`.
 */
export function catalogRulesFor(category: string): BlindRule[] {
  return rulesFor(category).filter(r => r.readsRenderedOrder !== true);
}

/** Those of them that must be handed the rendered order instead. */
export function renderedRulesFor(category: string): BlindRule[] {
  return rulesFor(category).filter(r => r.readsRenderedOrder === true);
}

/**
 * The ids of every rule that would pick `correct` out of this set.
 *
 * `category` is REQUIRED rather than defaulted. A default would let a
 * caller that forgot it skip every scoped rule and still look correct
 * — the failure being silently narrower checking, which is exactly
 * what nobody notices.
 */
export function tripped(
  correct: string,
  decoys: readonly string[],
  category: string,
): string[] {
  const options = [correct, ...decoys];
  // Catalog order in, so rendered-order rules are not asked. They
  // cannot be answered from a decoy SET — see `readsRenderedOrder`.
  // The deck test checks those against the real render instead.
  return catalogRulesFor(category)
    .filter(r => r.pick(options) === correct)
    .map(r => r.id);
}

/**
 * A deterministic rotation of a candidate list, derived from the card's
 * own identity.
 *
 * =====================================================================
 * THIS REPLACES `Math.random()`, AND THE RANDOMNESS WAS NOT COSMETIC.
 *
 * Four generators shuffled their candidate pool with `Math.random()` at
 * module load. So the deck's decoys were different on every import, and
 * a leak test over them would have been measuring one draw — green on
 * Tuesday, red on Wednesday, with nothing in the diff.
 *
 * Deriving the offset from the card's id gives the same variety across
 * cards (which is what the shuffle was for — two cards drawing from one
 * pool should not show the same three decoys) while giving the SAME
 * answer every load, which is what makes a pinned count mean anything.
 * =====================================================================
 */
export function rotate<T>(items: readonly T[], seed: string): T[] {
  if (items.length === 0) return [];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const start = Math.abs(h) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** How far apart two labels are in length. Ties only. */
function lengthGap(a: string, b: string): number {
  return Math.abs(a.length - b.length);
}

/**
 * How many candidates the search will look at.
 *
 * C(28,3) is 3276 combinations, checked against seven rules — instant,
 * and every real pool here is under 25 long. The cap exists so a future
 * caller passing a hundred candidates degrades to a slower-but-finite
 * search rather than freezing the module import.
 */
const MAX_CANDIDATES = 28;

export interface ChooseOptions {
  /** How many decoys. Three everywhere in this deck. */
  count: number;
  /**
   * The card's identity — its id or skill tag. Drives the rotation, so
   * two cards drawing on one pool get different decoys.
   *
   * REQUIRED, not defaulted: a missed call site sharing one seed would
   * quietly give a whole category the same three decoys, and a default
   * would make that look deliberate.
   */
  seed: string;
  /** Named in the throw, so a failure says which card cannot be built. */
  label: string;
  /** Which category the card belongs to — decides which scoped rules
   *  apply. Required for the reason given on `tripped`. */
  category: string;
  /**
   * An extra condition the chosen set must meet.
   *
   * Exists for the one constraint a single card cannot see: where the
   * answer must sit once the options are sorted. "Not the middle of
   * three" is decidable here; "the middle a quarter of the time across
   * the category" is not, so the caller computes the rank it wants and
   * passes it down. The chooser stays the only place a set is accepted.
   */
  require?: (decoys: readonly string[]) => boolean;
}

/**
 * Pick decoys that no blind rule can use.
 *
 * =====================================================================
 * REJECTION, NOT REPAIR.
 *
 * The tempting fix for "the answer is the only bracketed option" is to
 * bracket the decoys. `catalogExpansions.ts` already documents why that
 * is wrong for the gloss: forcing a parenthetical onto a decoy yields
 * "A♭ (G♯)", which teaches something false — G♯ is a legitimate,
 * commonly-written spelling, and the gloss means "correct but never
 * spoken". Decorating an option changes what it CLAIMS.
 *
 * Choosing a differently-shaped decoy changes only which true thing is
 * on screen. So this searches for a clean set, and when it cannot find
 * one it throws rather than shipping the card. A generator that cannot
 * produce a fair question is a generator that needs a bigger pool, and
 * a build failure says so on the day it is written rather than after a
 * reader has been scored on it.
 * =====================================================================
 */
export function chooseDecoys(
  correct: string,
  candidates: readonly string[],
  opts: ChooseOptions,
): string[] {
  const pool = rotate(
    [...new Set(candidates)].filter(c => c !== correct),
    opts.seed,
  ).slice(0, MAX_CANDIDATES);

  if (pool.length < opts.count) {
    throw new Error(
      `[decoyGuard] ${opts.label}: needs ${opts.count} decoys, pool has ${pool.length}`,
    );
  }

  let best: { set: string[]; cost: number } | null = null;
  const combo: number[] = [];
  const walk = (start: number) => {
    if (combo.length === opts.count) {
      const set = combo.map(i => pool[i]);
      if (tripped(correct, set, opts.category).length > 0) return;
      if (opts.require !== undefined && !opts.require(set)) return;
      // Earliest candidates win — a caller orders its pool by musical
      // relevance, and that ordering should survive the guard. Length
      // similarity breaks ties, which is where the 31% longest-option
      // signal gets paid off without being able to fail a build.
      const cost = combo.reduce((a, b) => a + b, 0) * 100
        + set.reduce((a, s) => a + lengthGap(s, correct), 0);
      if (best === null || cost < best.cost) best = { set, cost };
      return;
    }
    for (let i = start; i < pool.length; i++) {
      combo.push(i);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);

  if (best === null) {
    throw new Error(
      `[decoyGuard] ${opts.label}: no clean decoy set for "${correct}" `
      + `from ${pool.length} candidates — every combination is answerable `
      + `without the question. Widen the pool.`,
    );
  }
  return (best as { set: string[] }).set;
}

// =====================================================================
// Which decoys appear at all — the tell a string comparison cannot see
// =====================================================================

/**
 * A card, reduced to what the leak tests need.
 *
 * Deliberately not `Flashcard`: this module must not import the catalog
 * it guards, or the catalog cannot import it.
 */
export interface GuardedCard {
  id: string;
  category: string;
  correctAnswer: string;
  decoys: readonly string[];
}

/**
 * Ways of reading an option, tried in turn.
 *
 * =====================================================================
 * WHY MORE THAN ONE, AND WHY THEY ARE GENERIC.
 *
 * The mode leak is the case that proves it. Every mode card's options
 * carry a key, so "A Locrian" appears exactly once in the whole deck
 * and a determinism test over raw strings reports the category clean.
 * It is not clean: the pool that produces an Aeolian answer is always
 * {Dorian, Locrian, Phrygian}, so Locrian on screen means Aeolian, in
 * all twelve keys, without reading the question. Thirty-six cards.
 *
 * Collapse the option to its mode word and the tell is obvious. So the
 * test runs determinism over several readings of an option, not one.
 *
 * THEY ARE GENERIC ON PURPOSE. A per-category tokeniser only finds
 * leaks in categories somebody already suspected, which is the same
 * failure as a test written after the bug. These four are blunt enough
 * to apply everywhere and to fire on a category nobody has looked at.
 * =====================================================================
 */
export const TOKENISERS: ReadonlyArray<{ id: string; of: (s: string) => string }> = [
  { id: 'whole', of: s => s },
  { id: 'without-key', of: s => s.replace(/^[A-G][#b♯♭]?\s+/, '') },
  { id: 'last-word', of: s => s.trim().split(/\s+/).at(-1) ?? s },
  { id: 'first-word', of: s => s.trim().split(/\s+/)[0] ?? s },
];

export interface Tell {
  tokeniser: string;
  /** The decoy token a reader would spot. */
  token: string;
  /** The answer token its presence guarantees. */
  implies: string;
  /** How many cards carry it. */
  cards: number;
}

/**
 * Decoy tokens that pin one answer, within one category.
 *
 * Three conditions, and each one removes a specific false positive:
 *
 *   seen on 2+ cards — a decoy used once pins its answer trivially.
 *     That is deck memorisation, which every finite deck permits; it is
 *     not a tell inside a single card.
 *
 *   pins exactly one answer token — if the same decoy sits beside two
 *     different answers, seeing it tells you nothing.
 *
 *   the token differs from the answer it implies — otherwise every
 *     category whose options share a suffix reports a tell. Under the
 *     last-word reading, every reverse-key-pivot option ends "major",
 *     so "major implies major" fires on all 27 cards and means nothing:
 *     a token every option carries cannot separate them.
 */
export function findTells(
  cards: readonly GuardedCard[],
  tokeniser: { id: string; of: (s: string) => string },
): Tell[] {
  const seen = new Map<string, { cards: Set<string>; answers: Set<string> }>();
  for (const c of cards) {
    for (const d of c.decoys) {
      const t = tokeniser.of(d);
      if (!seen.has(t)) seen.set(t, { cards: new Set(), answers: new Set() });
      const e = seen.get(t)!;
      e.cards.add(c.id);
      e.answers.add(tokeniser.of(c.correctAnswer));
    }
  }
  const out: Tell[] = [];
  for (const [token, e] of seen) {
    if (e.cards.size < 2 || e.answers.size !== 1) continue;
    const implies = [...e.answers][0];
    if (implies === token) continue;
    out.push({ tokeniser: tokeniser.id, token, implies, cards: e.cards.size });
  }
  return out.sort((a, b) => b.cards - a.cards || a.token.localeCompare(b.token));
}

/** Cards in `cards` carrying at least one of `tells`. */
export function cardsGivenAway(
  cards: readonly GuardedCard[],
  tells: readonly Tell[],
  tokeniser: { id: string; of: (s: string) => string },
): GuardedCard[] {
  const tokens = new Set(tells.map(t => t.token));
  return cards.filter(c => c.decoys.some(d => tokens.has(tokeniser.of(d))));
}

// =====================================================================
// Where the answer sits once the options are sorted
//
// ---------------------------------------------------------------------
// TWO DIFFERENT THINGS ARE CALLED "POSITION". READ THIS BEFORE
// TRUSTING A COMMIT MESSAGE ABOUT EITHER.
//
// This section is about RANK AMONG SORTED OPTION VALUES — is the answer
// the lowest number, the highest, one of the middle two. It is a
// property of the option VALUES and it is what commit 31152c7, "the
// answer's position is no longer the answer", fixed. That commit is
// accurate about what it did and says nothing about the other one.
//
// The other one is RENDERED INDEX — which of the four buttons the
// answer is drawn in. It is a property of the SHUFFLE, lives in
// `lib/flashcards/optionOrder.ts`, and was still broken long after
// 31152c7 shipped: 52.5% of the deck rendered its answer in the first
// slot. It is caught by the `always-first` rule above.
//
// They are independent. Fixing rank does nothing for index, and fixing
// index does nothing for rank. If you are here because a commit said
// "position" was handled, check WHICH — the name is the trap.
// ---------------------------------------------------------------------
// =====================================================================

/**
 * The answer's index in the sorted option list, 0-based.
 *
 * SORTED, not rendered — see the section header. `sortedRank` never
 * describes where a button appears on screen.
 *
 * Numeric sort when every option is a number, so 10 does not sort
 * between 1 and 2. Nothing in this deck mixes the two.
 */
export function sortedRank(correct: string, decoys: readonly string[]): number {
  const options = [correct, ...decoys];
  const numeric = options.every(o => /^-?\d+$/.test(o));
  const sorted = numeric
    ? [...options].sort((a, b) => Number(a) - Number(b))
    : [...options].sort();
  return sorted.indexOf(correct);
}

/**
 * Which rank this card should aim for.
 *
 * =====================================================================
 * THE FIX FOR THE MIDDLE-OF-THREE TELL IS A DISTRIBUTION, NOT A BAN.
 *
 * Scale-degree math picked answer−1, answer+1 and an outlier, so three
 * of four options were consecutive and the answer was the middle of
 * them on 52 of 84 cards. Banning that one shape is not enough: push
 * every answer to an end and "never the middle" becomes the new rule,
 * which is the same defect with a different tell.
 *
 * So the target rank is derived from the card's own identity and
 * cycles across the category. Derived, not random — the deck has to
 * build identically on every load or a pinned count means nothing.
 *
 * `low`/`high` are the ranks actually reachable. The 1 of a major
 * scale has nothing below it, so a card whose answer is 1 cannot put a
 * decoy underneath however much the rotation would like it to; the
 * caller computes the reachable window and this clamps into it rather
 * than asking for the impossible and throwing.
 * =====================================================================
 */
export function rankTarget(seed: string, low: number, high: number): number {
  if (high <= low) return low;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return low + (Math.abs(h) % (high - low + 1));
}
