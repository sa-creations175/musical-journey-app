/**
 * Generic SM-2-inspired spaced repetition for flashcards.
 *
 * Lifted from harmonic-fluency/spacedRepetition.ts since the math is
 * module-agnostic — every flashcard module (HF, Production
 * Vocabulary, future modules) shares the same per-card schedule
 * structure: ease factor, interval (days), nextReviewDate, plus
 * attempt counters. Module-specific session-building (which deck to
 * pull from, which categories) stays in each module.
 *
 * Card ids are namespaced per module (HF uses category-derived ids
 * like `scale-degree-math-...`; Production uses `prod-vocab:...`)
 * so the shared db.flashcardStates table holds both without
 * collision. No migration needed.
 */

import { db, type FlashcardState } from '../db';

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

export async function getState(cardId: string): Promise<FlashcardState> {
  const row = await db.flashcardStates.get(cardId);
  return row ?? blankState(cardId);
}

export function updateState(
  prev: FlashcardState,
  correct: boolean,
  at = Date.now(),
): FlashcardState {
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

export async function recordAttempt(
  cardId: string,
  correct: boolean,
  at = Date.now(),
): Promise<FlashcardState> {
  const current = await getState(cardId);
  const next = updateState(current, correct, at);
  await db.flashcardStates.put(next);
  return next;
}

export async function toggleFlag(cardId: string): Promise<boolean> {
  const state = await getState(cardId);
  const next: FlashcardState = { ...state, isFlagged: !state.isFlagged };
  await db.flashcardStates.put(next);
  return next.isFlagged ?? false;
}

/** Set the review-meta flag on a card. Distinct from `isFlagged`
 *  (study-later toggle): `flagged` parks a card in a meta-review pile
 *  the user can later sweep, optionally with a free-text note
 *  explaining why. Passing `flagged: false` clears the flag and drops
 *  any prior note. */
export async function setReviewFlag(
  cardId: string,
  flagged: boolean,
  note?: string,
): Promise<void> {
  const state = await getState(cardId);
  const next: FlashcardState = flagged
    ? { ...state, flagged: true, flagNote: note?.trim() ? note.trim() : undefined }
    : { ...state, flagged: false, flagNote: undefined };
  await db.flashcardStates.put(next);
}

/** Returns all cards the user has review-flagged, newest-first by
 *  lastReviewed. Used by the dedicated "Flagged" view. */
export async function listFlaggedCards(): Promise<FlashcardState[]> {
  const rows = await db.flashcardStates
    .filter(s => s.flagged === true)
    .toArray();
  return rows.sort((a, b) => b.lastReviewed - a.lastReviewed);
}
