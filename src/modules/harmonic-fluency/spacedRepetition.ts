import { db } from '../../lib/db';
import { FLASHCARDS, type Flashcard, type FlashcardCategory } from './catalog';

// SM-2-inspired spaced repetition. The per-card schedule math
// (ease, interval, nextReviewDate, totals, flag toggle) is shared
// across modules and lives in src/lib/flashcards/spacedRepetition.ts.
// Re-exported here so existing HF callers keep their import paths.
//
// Module-specific session-building (which deck to draw from, which
// categories) stays in this file — Production Vocabulary owns its
// own building logic in modules/production/VocabularySession.tsx.
export {
  blankState,
  getState,
  recordAttempt,
  toggleFlag,
  updateState,
} from '../../lib/flashcards/spacedRepetition';

// --- Session building ------------------------------------------------

export interface SessionBuildOptions {
  categories: FlashcardCategory[];   // empty array = all categories
  target: number;                    // desired number of cards (default 20)
  /** When true, pull only the user's flagged cards (ignoring SM-2 due
      dates). Flag acts as an on-demand drill override. */
  flaggedOnly?: boolean;
  now?: number;
}

export interface BuiltSession {
  cards: Flashcard[];
  dueCount: number;
  newCount: number;
  allCaughtUp: boolean;
}

/**
 * Build a session queue — due cards first, then introduce new (unseen)
 * cards until reaching target. If there are no due or new cards within
 * the selected categories, the caller can show an "all caught up"
 * message and offer practice-ahead mode.
 */
export async function buildSession(opts: SessionBuildOptions): Promise<BuiltSession> {
  const now = opts.now ?? Date.now();
  const target = Math.max(1, opts.target);
  const categorySet = new Set(opts.categories);
  const inCategory = (c: Flashcard) =>
    categorySet.size === 0 || categorySet.has(c.category);

  const eligible = FLASHCARDS.filter(inCategory);
  const states = await db.flashcardStates.bulkGet(eligible.map(c => c.id));

  // Flagged-only short-circuit: user is explicitly drilling flagged
  // cards, so we ignore SM-2 timing and just return every flagged card
  // in the selected categories, shuffled.
  if (opts.flaggedOnly) {
    const flagged: Flashcard[] = [];
    eligible.forEach((card, i) => {
      if (states[i]?.isFlagged) flagged.push(card);
    });
    shuffleInPlace(flagged);
    const cards = flagged.slice(0, target);
    return {
      cards,
      dueCount: 0,
      newCount: 0,
      allCaughtUp: cards.length === 0,
    };
  }

  const due: Flashcard[] = [];
  const untouched: Flashcard[] = [];
  eligible.forEach((card, i) => {
    const state = states[i];
    if (!state) {
      untouched.push(card);
      return;
    }
    if (state.nextReviewDate <= now) due.push(card);
  });

  // Shuffle both pools so repeat sessions don't feel deterministic.
  shuffleInPlace(due);
  shuffleInPlace(untouched);

  const dueSlice = due.slice(0, target);
  const remaining = Math.max(0, target - dueSlice.length);
  const newSlice = untouched.slice(0, remaining);
  const queue = [...dueSlice, ...newSlice];

  return {
    cards: queue,
    dueCount: due.length,
    newCount: untouched.length,
    allCaughtUp: queue.length === 0,
  };
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
