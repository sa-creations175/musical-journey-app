import type { PerformanceRating } from './types';

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
 * Colours ride the canonical proficiency ramp (needswork → developing
 * → fluent → mastered), identical to FEEL_CARD_OPTIONS in drillModel.
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

export const BLOCK_RATING_FEEL_OPTIONS: ReadonlyArray<BlockRatingFeelOption> = [
  {
    feel: 1,
    label: 'Struggled',
    rating: 'crawling',
    activeClass: 'bg-needswork text-white border-needswork',
    inactiveClass: 'border-needswork/40 text-needswork hover:bg-needswork/10',
  },
  {
    feel: 2,
    label: 'Working on it',
    rating: 'crawling',
    activeClass: 'bg-developing text-white border-developing',
    inactiveClass: 'border-developing/40 text-developing hover:bg-developing/10',
  },
  {
    feel: 3,
    label: 'Clean',
    rating: 'cruising',
    activeClass: 'bg-fluent text-white border-fluent',
    inactiveClass: 'border-fluent/40 text-fluent hover:bg-fluent/10',
  },
  {
    feel: 4,
    label: 'In flow',
    rating: 'flying',
    activeClass: 'bg-mastered text-white border-mastered',
    inactiveClass: 'border-mastered/40 text-mastered hover:bg-mastered/10',
  },
];

/** Collapsed 3-value rating for a 4-level feel selection, or null. */
export function ratingForFeel(feel: 1 | 2 | 3 | 4 | null): PerformanceRating | null {
  return BLOCK_RATING_FEEL_OPTIONS.find(o => o.feel === feel)?.rating ?? null;
}
