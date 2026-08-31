import type { PerformanceRating } from './types';
import { FEEL_OPTIONS } from '../fluencyScale';
import { feelColour } from '../spacing/statusColour';

/**
 * Shared 4-level feel scale for the block wrap-up "How did it go?"
 * screens (the off-route overlay, the in-session active screen, and the
 * end-of-session batch rater). Matches the four cards the S&P drill
 * modals use — Struggled / Working on it / Clean / In flow — so the
 * whole app rates on one vocabulary.
 *
 * The persisted per-block rating (`PerformanceRating`) stays a 3-value
 * field, so each card collapses to one of its values via `rating`,
 * mirroring the drill modals' feelToRating mapping:
 *   · In flow      → flying
 *   · Clean        → cruising
 *   · Working on it → crawling
 *   · Struggled    → crawling
 *
 * Because two cards collapse to `crawling`, callers must track the
 * selected card by `feel` (1–4) for the active-highlight, NOT by the
 * collapsed rating value — otherwise both crawling cards light up.
 *
 * Colours ride the canonical proficiency ramp, from `statusColour` —
 * the same call `FEEL_CARD_OPTIONS` and the feel picker make, so the
 * three cannot drift.
 */
export interface BlockRatingFeelOption {
  /** 1–4 selection key (worst → best). Drives the active-highlight. */
  feel: 1 | 2 | 3 | 4;
  label: string;
  /** Collapsed 3-value rating persisted + fed to the spacing engine. */
  rating: PerformanceRating;
  activeClass: string;
  inactiveClass: string;
}

/**
 * THE STYLING IS NOT LOCAL ANY MORE, and the note that said it was is
 * why three files carried the same four colours. A rating IS aligned to
 * a status — Struggled to Needs Work, In flow to Mastered — so the
 * colour is part of the vocabulary after all, and `statusColour` owns
 * it once.
 */
const feelClasses = (feel: 1 | 2 | 3 | 4) => {
  const c = feelColour(feel);
  return { activeClass: c.fill, inactiveClass: c.outline };
};

/**
 * THE WORDS AND THE COLLAPSE BOTH COME FROM `fluencyScale`.
 *
 * This file used to hold its own copy of the four labels, which is how
 * "Clean" here and "comfortable" there survived side by side over one
 * identical stored 3.
 */
export const BLOCK_RATING_FEEL_OPTIONS: ReadonlyArray<BlockRatingFeelOption> =
  FEEL_OPTIONS.map(opt => ({
    feel: opt.feel,
    label: opt.label,
    rating: opt.rating as PerformanceRating,
    ...feelClasses(opt.feel),
  }));

/** Collapsed 3-value rating for a 4-level feel selection, or null. */
export function ratingForFeel(feel: 1 | 2 | 3 | 4 | null): PerformanceRating | null {
  return BLOCK_RATING_FEEL_OPTIONS.find(o => o.feel === feel)?.rating ?? null;
}
