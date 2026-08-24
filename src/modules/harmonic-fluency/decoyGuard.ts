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
];

/** The ids of every rule that would pick `correct` out of this set. */
export function tripped(correct: string, decoys: readonly string[]): string[] {
  const options = [correct, ...decoys];
  return BLIND_RULES.filter(r => r.pick(options) === correct).map(r => r.id);
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
      if (tripped(correct, set).length > 0) return;
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
// =====================================================================

/**
 * The answer's index in the sorted option list, 0-based.
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
