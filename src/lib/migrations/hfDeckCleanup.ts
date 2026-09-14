/**
 * Harmonic Fluency's four unreviewed decks, cleaned up. Silas's decision
 * of 13 Sep 2026, per card in `~/cc-scratch/hf-unreviewed-decks.html`:
 * Ear-Theory Crossover retires, and every card that asks a fact another
 * card already asks folds into it.
 *
 * =====================================================================
 * EAR-THEORY CROSSOVER (v45).
 *
 * Every card described a sound in adjectives and asked for the label,
 * with nothing to hear. Ten of the fifteen ask a fact another deck asks,
 * and the review page names which card; their history moves onto it.
 * `deckCleanupPairing.test.ts` proves each pair against the live deck,
 * because this file cannot read the deck.
 *
 * THE OTHER FIVE HAVE NO DESTINATION AND THEIR ROWS ARE NOT TOUCHED.
 * On 9 Sep a card retired without a successor had its rows deleted.
 * Since 10 Sep nothing in the app deletes on the rule alone, and deleting
 * a reader's attempts is the one step in this cleanup that cannot be
 * taken back. So the rows stay where they are, the orphan sweep names
 * them on start, and whether they go is Silas's call.
 * =====================================================================
 */
import type { MigrationTx } from './retire913';
import {
  foldHarmonicFluencyCards, type CardFoldCounts, type CardFolds,
} from './foldHarmonicFluencyCards';

/** Ear-Theory Crossover card → the card that already asks its fact. */
export const EAR_THEORY_FOLDS: CardFolds = {
  'et-1': 'fh-15',   // the 4 minor, borrowed from the parallel minor
  'et-3': 'fh-14',   // the ♭7 chord, borrowed from Mixolydian
  'et-4': 'fh-14',   // the same ♭7 chord, dressed as a feeling
  'et-6': 'fh-6',    // the deceptive cadence
  'et-7': 'cc-13',   // sus4
  'et-8': 'mo-15',   // maj7♯11, the Lydian chord
  'et-9': 'cc-15',   // minor-major 7
  'et-11': 'cc-9',   // 7♯9
  'et-14': 'mo-16',  // a dominant 7 as the tonic says Mixolydian
  'et-15': 'fh-4',   // the plagal (Amen) cadence
};

/** Retired with nothing to fold into. Their rows are left alone. */
export const EAR_THEORY_WITHOUT_DESTINATION: readonly string[] = [
  'et-2', 'et-5', 'et-10', 'et-12', 'et-13',
];

export function foldEarTheoryCrossover(tx: MigrationTx): Promise<CardFoldCounts> {
  return foldHarmonicFluencyCards(tx, EAR_THEORY_FOLDS);
}
