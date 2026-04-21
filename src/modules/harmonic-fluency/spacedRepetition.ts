import { db, type FlashcardState } from '../../lib/db';
import { FLASHCARDS, type Flashcard, type FlashcardCategory } from './catalog';

// SM-2-inspired spaced repetition. Each card stores: ease factor,
// interval (days), nextReviewDate, plus attempt counters. When answered
// correctly the interval grows; when wrong it resets to 1 day.

const EASE_INITIAL = 2.5;
const EASE_MIN = 1.3;
const EASE_MAX = 2.8;
const INTERVAL_CAP_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export function blankState(cardId: string): FlashcardState {
  const now = Date.now();
  return {
    cardId,
    easeFactor: EASE_INITIAL,
    interval: 0,
    nextReviewDate: now,
    lastReviewed: 0,
    consecutiveCorrect: 0,
    totalAttempts: 0,
    totalCorrect: 0,
    isFlagged: false,
  };
}

export async function toggleFlag(cardId: string): Promise<boolean> {
  const state = await getState(cardId);
  const next: FlashcardState = { ...state, isFlagged: !state.isFlagged };
  await db.flashcardStates.put(next);
  return next.isFlagged ?? false;
}

export function updateState(prev: FlashcardState, correct: boolean, at = Date.now()): FlashcardState {
  const totalAttempts = prev.totalAttempts + 1;
  const totalCorrect = prev.totalCorrect + (correct ? 1 : 0);

  if (!correct) {
    return {
      ...prev,
      easeFactor: Math.max(EASE_MIN, prev.easeFactor - 0.2),
      interval: 1,
      nextReviewDate: at + DAY_MS,
      lastReviewed: at,
      consecutiveCorrect: 0,
      totalAttempts,
      totalCorrect,
    };
  }

  // Correct answer — grow the interval.
  const consecutive = prev.consecutiveCorrect + 1;
  let nextInterval: number;
  if (consecutive === 1) nextInterval = 1;
  else if (consecutive === 2) nextInterval = 6;
  else nextInterval = Math.min(INTERVAL_CAP_DAYS, Math.round(prev.interval * prev.easeFactor));
  const nextEase = Math.min(EASE_MAX, prev.easeFactor + 0.1);

  return {
    ...prev,
    easeFactor: nextEase,
    interval: nextInterval,
    nextReviewDate: at + nextInterval * DAY_MS,
    lastReviewed: at,
    consecutiveCorrect: consecutive,
    totalAttempts,
    totalCorrect,
  };
}

export async function getState(cardId: string): Promise<FlashcardState> {
  const row = await db.flashcardStates.get(cardId);
  return row ?? blankState(cardId);
}

export async function recordAttempt(cardId: string, correct: boolean, at = Date.now()): Promise<FlashcardState> {
  const current = await getState(cardId);
  const next = updateState(current, correct, at);
  await db.flashcardStates.put(next);
  return next;
}

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
