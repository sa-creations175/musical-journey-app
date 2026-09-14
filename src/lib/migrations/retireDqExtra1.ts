/**
 * `dq-extra-1` folds into `dq-maj-4`. Silas's answer of 14 Sep 2026 to
 * the Diatonic Chord Qualities report (`~/cc-scratch/
 * ANSWERS_TAB1_MINOR_QUALITIES.md`): "retire it. Fold its history the way
 * retired cards are folded."
 *
 * =====================================================================
 * WHY `dq-maj-4`.
 *
 * `dq-extra-1` asked for major's 4 as a triad — the triad-only card the
 * 13 Sep decision ruled out. `dq-maj-4` asks for the same chord on the
 * same degree of the same scale, as the seventh chord the deck is built
 * on, and its reveal opens the chart on the very cell `dq-extra-1`'s did.
 * A reader who answered one has practised the other. That choice is
 * Claude's, and the report says so.
 *
 * =====================================================================
 * THE FOLD ITSELF IS `foldHarmonicFluencyCards.ts`. It was written here
 * for one card and moved there when the Ear-Theory Crossover retirement
 * needed it for ten, so this is a map of one. The ids are written out
 * rather than read from the catalog: a migration has to keep working
 * against the data it was written for.
 * =====================================================================
 */
import type { MigrationTx } from './retire913';
import {
  foldHarmonicFluencyCards, type CardFoldCounts,
} from './foldHarmonicFluencyCards';

export type { CardFoldCounts };

export const RETIRED_CARD = 'dq-extra-1';
export const TARGET_CARD = 'dq-maj-4';

/**
 * Move everything filed under `dq-extra-1` onto `dq-maj-4`. Idempotent:
 * a second run finds nothing under the retired id and changes nothing.
 */
export function foldRetiredDiatonicCard(tx: MigrationTx): Promise<CardFoldCounts> {
  return foldHarmonicFluencyCards(tx, { [RETIRED_CARD]: TARGET_CARD });
}
