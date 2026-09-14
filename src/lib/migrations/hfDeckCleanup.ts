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
 * them on start, and whether they go was Silas's call. He ruled on
 * 14 Sep 2026: v47, at the bottom of this file, deletes them.
 * =====================================================================
 */
import type { MigrationTx } from './retire913';
import {
  deleteHarmonicFluencyCardRows, foldHarmonicFluencyCards,
  type CardDeleteCounts, type CardFoldCounts, type CardFolds,
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

/** Retired with nothing to fold into. v47 deletes their rows. */
export const EAR_THEORY_WITHOUT_DESTINATION: readonly string[] = [
  'et-2', 'et-5', 'et-10', 'et-12', 'et-13',
];

export function foldEarTheoryCrossover(tx: MigrationTx): Promise<CardFoldCounts> {
  return foldHarmonicFluencyCards(tx, EAR_THEORY_FOLDS);
}

/**
 * =====================================================================
 * THE DUPLICATES (v46).
 *
 * `mo-1` to `mo-6` asked which degree a mode starts on. The generated mode
 * cards ask the same in every key, and the key of C's card for each degree
 * takes the history. `fh-11` and `fh-12` were the key of C's secondary
 * dominants, which the generators skipped while they existed; the
 * generated C cards now ask them word for word.
 *
 * `fh-16` answered with an adjective and `fh-19` with a claim true of
 * several chords. Nothing else asks what they asked, so, like the five
 * Ear-Theory cards above, their rows stayed where they were until v47.
 * =====================================================================
 */
export const DUPLICATE_FOLDS: CardFolds = {
  'mo-1': 'mo-mode-C-2',   // Dorian starts on the 2
  'mo-2': 'mo-mode-C-3',   // Phrygian on the 3
  'mo-3': 'mo-mode-C-4',   // Lydian on the 4
  'mo-4': 'mo-mode-C-5',   // Mixolydian on the 5
  'mo-5': 'mo-mode-C-6',   // Aeolian on the 6
  'mo-6': 'mo-mode-C-7',   // Locrian on the 7
  'fh-11': 'fh-v-of-v-C',  // V/V in the key of C, word for word
  'fh-12': 'fh-v-of-vi-C', // V/vi in the key of C, word for word
};

/** Retired with nothing to fold into. v47 deletes their rows. */
export const DUPLICATES_WITHOUT_DESTINATION: readonly string[] = ['fh-16', 'fh-19'];

export function foldDuplicateCards(tx: MigrationTx): Promise<CardFoldCounts> {
  return foldHarmonicFluencyCards(tx, DUPLICATE_FOLDS);
}

/**
 * =====================================================================
 * THE SEVEN WITH NOWHERE TO GO, DELETED (v47).
 *
 * Silas, 14 Sep 2026: delete the answer rows of `et-2`, `et-5`, `et-10`,
 * `et-12`, `et-13`, `fh-16` and `fh-19`. v45 and v46 left them where they
 * were because deleting a reader's history cannot be undone and was his to
 * rule on. Attempts, spacing rows, diary entries and annotations go, and
 * the ids leave goal scopes and past practice blocks.
 * =====================================================================
 */
export const RETIRED_WITHOUT_DESTINATION: readonly string[] = [
  ...EAR_THEORY_WITHOUT_DESTINATION, ...DUPLICATES_WITHOUT_DESTINATION,
];

export function deleteRetiredCardRows(tx: MigrationTx): Promise<CardDeleteCounts> {
  return deleteHarmonicFluencyCardRows(tx, RETIRED_WITHOUT_DESTINATION);
}

/**
 * =====================================================================
 * THE "CONTAINS THE NOTES" CARDS RETIRE INTO SPELL THE CHORD (v48).
 *
 * Silas, 14 Sep 2026. The eight key-of-C cards asked which notes a chord
 * holds; Spell the chord in a key asks it in every key, on the keyboard.
 * The four that are diatonic sevenths of C fold into the new card for
 * that chord (`deckCleanupPairing.test.ts` proves each pair against the
 * deck). The four that are not — Cadd9, C6/9, Am(maj7), C9 — have no
 * destination, and on Silas's word their rows are deleted.
 * =====================================================================
 */
export const SPELL_FOLDS: CardFolds = {
  'cc-5': 'cc-spell-major-C-1',   // Cmaj7, the 1 of C
  'cc-6': 'cc-spell-major-C-5',   // G7, the 5 of C
  'cc-7': 'cc-spell-major-C-2',   // Dm7, the 2 of C
  'cc-14': 'cc-spell-major-C-4',  // Fmaj7, the 4 of C
};

/** Not diatonic sevenths, so nowhere to go: rows deleted. */
export const SPELL_RETIRED_WITHOUT_DESTINATION: readonly string[] = [
  'cc-10', 'cc-11', 'cc-15', 'cc-17',
];

export async function retireContainsTheNotes(
  tx: MigrationTx,
): Promise<{ folded: CardFoldCounts; deleted: CardDeleteCounts }> {
  const folded = await foldHarmonicFluencyCards(tx, SPELL_FOLDS);
  const deleted = await deleteHarmonicFluencyCardRows(tx, SPELL_RETIRED_WITHOUT_DESTINATION);
  return { folded, deleted };
}
