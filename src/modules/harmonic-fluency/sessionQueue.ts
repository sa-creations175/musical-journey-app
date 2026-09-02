import { FLASHCARDS, type Flashcard, type FlashcardCategory } from './catalog';
import { filterByFacets, type FacetFilter } from './facetFilter';
import {
  dueSortKey,
  getCardSpacingMany,
  isCardDue,
  isCardSeen,
} from '../../lib/flashcards/cardSpacing';

// Harmonic fluency's session queue: which cards a drill draws, in
// what order.
//
// IT WAS CALLED `spacedRepetition.ts`, and by the end that name named
// nothing it did. The SM-2 maths lived in `lib/flashcards/
// spacedRepetition.ts`, this file re-exported it, and the two were
// easy to confuse. That file is retired and its maths with it; what
// was left here is queue-building, so the file is named for that.
//
// THE QUEUE READS THE ONE ENGINE. It used to read the SM-2 table this
// module kept alongside the spacing row it also wrote on every answer,
// so "due" here and "due" everywhere else were two different questions
// with two different answers. Everything below asks `spacingState`.
//
// Module-specific session-building (which deck to draw from, which
// categories) stays in this file — Production Vocabulary owns its
// own building logic in modules/production/VocabularySession.tsx.

// --- Session building ------------------------------------------------

export interface SessionBuildOptions {
  categories: FlashcardCategory[];   // empty array = all categories
  target: number;                    // desired number of cards (default 20)
  /** When true, pull only the user's flagged cards (ignoring due
      dates entirely). Flag acts as an on-demand drill override. */
  flaggedOnly?: boolean;
  /**
   * Narrow the pool below the category — "just the tritones", "just in
   * E♭". Absent or empty means the whole of whatever the categories
   * selected.
   *
   * APPLIED WITH the category filter, never instead of it: the chip row
   * says which categories are in play and this says which of their
   * cards are. See `facetFilter`.
   */
  facets?: FacetFilter;
  /**
   * An explicit list of cards to serve, named one by one.
   *
   * NOT THE SAME THING AS A FACET FILTER, and they are kept apart on
   * purpose. A facet is a CLAIM — "the tritones" — and it holds however
   * the deck grows. This is a POOL a caller already resolved, which is
   * what a dashboard row tap hands over: those cards, that row, now.
   * Collapsing them would mean either a claim that cannot be sent over
   * a URL or a pool that silently grows when a generator does.
   *
   * Empty or absent means no restriction, which is the same reading
   * `categories` gets.
   */
  cardIds?: readonly string[];
  now?: number;
}

export interface BuiltSession {
  cards: Flashcard[];
  dueCount: number;
  newCount: number;
  /**
   * There is nothing at all to serve for this selection.
   *
   * NARROWER THAN IT USED TO BE, and that is the fix. It meant "nothing
   * DUE and nothing NEW", which a finished category satisfies for weeks
   * — so the one category you had just completed was the one you could
   * not open. It now means the queue is empty, which for a real
   * category only happens if it holds no cards at all.
   */
  allCaughtUp: boolean;
  /**
   * The queue is ahead-of-schedule practice: nothing in it was due.
   *
   * The caller says so on screen. It does NOT change how the reps are
   * recorded — an answer given early is an answer, and the engine
   * treats it exactly like any other.
   */
  practiceAhead: boolean;
  /**
   * Cards due RIGHT NOW in categories OUTSIDE this selection, or `null`
   * when it was not counted.
   *
   * COUNTED ONLY FOR A PRACTICE-AHEAD QUEUE, which is the only session
   * that shows it. Every other session would be paying a second read of
   * the whole catalog's states for a number nothing displays — and it
   * did, briefly: doing this eagerly made the ordinary start path slow
   * enough to cross a task boundary and broke a page test that had
   * always passed.
   *
   * `null` is not zero. Zero is "nothing else is due", which suppresses
   * the second sentence of the notice; null is "nobody asked".
   */
  dueElsewhere: number | null;
}

/**
 * Build a session queue — due cards first, then new (unseen) cards up
 * to target.
 *
 * =====================================================================
 * A FINISHED CATEGORY IS STILL DRILLABLE.
 *
 * When the selection has nothing due and nothing new, this used to
 * return an empty queue and let the caller bail. That is exactly the
 * state a category reaches by being COMPLETED — every card seen, every
 * one scheduled into the future — so finishing a category took it away
 * from you, and "drill category" on a 12/12 card did nothing.
 *
 * So emptiness is handled HERE, at the one place it can occur, rather
 * than at each caller: the queue falls back to the seen cards ordered
 * by how soon they are due, nearest first. That is the same priority
 * the due path uses, just without the cutoff.
 *
 * The fallback is reported (`practiceAhead`), never disguised — the
 * reader is told they are ahead of schedule and where the due work
 * actually is.
 * =====================================================================
 */
export async function buildSession(opts: SessionBuildOptions): Promise<BuiltSession> {
  const now = opts.now ?? Date.now();
  const target = Math.max(1, opts.target);
  const categorySet = new Set(opts.categories);
  const inCategory = (c: Flashcard) =>
    categorySet.size === 0 || categorySet.has(c.category);

  /**
   * THE POOL, NARROWED TWICE.
   *
   * By category, which is what the chip row chooses, and then by facet,
   * which is what the filter row chooses. A card with no facets fails
   * any active filter — it never made the claim being asked about —
   * and every card passes when nothing is filtered, which is what makes
   * the second call safe to make unconditionally.
   */
  const named = new Set(opts.cardIds ?? []);
  const inPool = (c: Flashcard) => named.size === 0 || named.has(c.id);
  const eligible = filterByFacets(
    FLASHCARDS.filter(c => inCategory(c) && inPool(c)),
    opts.facets ?? {},
  );
  const rows = await getCardSpacingMany(eligible.map(c => c.id));

  // Flagged-only short-circuit: user is explicitly drilling flagged
  // cards, so we ignore the schedule and just return every flagged
  // card in the selected categories, shuffled.
  if (opts.flaggedOnly) {
    const flagged: Flashcard[] = [];
    eligible.forEach(card => {
      if (rows.get(card.id)?.studyLater) flagged.push(card);
    });
    shuffleInPlace(flagged);
    const cards = flagged.slice(0, target);
    // NO PRACTICE-AHEAD FALLBACK HERE, deliberately. The reader asked
    // for their flagged cards by name; serving unflagged ones because
    // the flag set was empty would answer a different question.
    return {
      cards,
      dueCount: 0,
      newCount: 0,
      allCaughtUp: cards.length === 0,
      practiceAhead: false,
      dueElsewhere: null,
    };
  }

  const due: Flashcard[] = [];
  const untouched: Flashcard[] = [];
  eligible.forEach(card => {
    const row = rows.get(card.id);
    // UNSEEN IS A STAGE, NOT AN ABSENT ROW. A card can hold a spacing
    // row carrying nothing but a flag — see `blankCardSpacing` — and
    // that is still a card the reader has never answered.
    if (!isCardSeen(row)) {
      untouched.push(card);
      return;
    }
    if (isCardDue(row, now)) due.push(card);
  });

  // Shuffle both pools so repeat sessions don't feel deterministic.
  shuffleInPlace(due);
  shuffleInPlace(untouched);

  const dueSlice = due.slice(0, target);
  const remaining = Math.max(0, target - dueSlice.length);
  const newSlice = untouched.slice(0, remaining);
  const queue = [...dueSlice, ...newSlice];

  if (queue.length > 0) {
    return {
      cards: queue,
      dueCount: due.length,
      newCount: untouched.length,
      allCaughtUp: false,
      practiceAhead: false,
      dueElsewhere: null,
    };
  }

  // Nothing due, nothing new — the shape of a FINISHED category. Drill
  // it anyway, nearest-due first: that is the same ordering the due
  // path applies, with the cutoff removed rather than a different rule
  // substituted. Shuffled at the end so a repeat run is not identical.
  const ahead = eligible
    .filter(card => isCardSeen(rows.get(card.id)))
    .sort((a, b) => dueSortKey(rows.get(a.id)) - dueSortKey(rows.get(b.id)))
    .slice(0, target);
  shuffleInPlace(ahead);

  return {
    cards: ahead,
    dueCount: 0,
    newCount: 0,
    // Only when the selection genuinely holds nothing — an empty
    // category, not a completed one.
    allCaughtUp: ahead.length === 0,
    practiceAhead: ahead.length > 0,
    // Counted HERE, on the one path that displays it. See the field.
    dueElsewhere: await countDueOutside(opts.categories, now),
  };
}

/**
 * How many cards are due right now OUTSIDE these categories.
 *
 * Zero when there is no outside: selecting every category means the
 * whole catalog is the selection, and "0 cards are due in other
 * categories" is a true sentence about a question nobody asked — the
 * notice drops it either way.
 */
async function countDueOutside(
  categories: FlashcardCategory[],
  now: number,
): Promise<number> {
  if (categories.length === 0) return 0;
  const categorySet = new Set(categories);
  const outside = FLASHCARDS.filter(c => !categorySet.has(c.category));
  if (outside.length === 0) return 0;
  const rows = await getCardSpacingMany(outside.map(c => c.id));
  let n = 0;
  for (const card of outside) {
    if (isCardDue(rows.get(card.id), now)) n += 1;
  }
  return n;
}

/**
 * What a practice-ahead session says about itself.
 *
 * TWO SENTENCES, THE SECOND CONDITIONAL. "0 cards are due in other
 * categories" is a sentence whose only content is a zero, so it is not
 * shortened — it is removed. The first sentence stands alone perfectly
 * well, which is the test of whether the second was ever load-bearing.
 */
export function practiceAheadNotice(dueElsewhere: number): string {
  const first = "Nothing due here — you just finished these.";
  if (dueElsewhere <= 0) return first;
  const cards = dueElsewhere === 1 ? '1 card is' : `${dueElsewhere} cards are`;
  return `${first} ${cards} due in other categories.`;
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
