// Pattern catalog for lead-sheet chord-progression detection
// (Chord Progression Detection Redesign, May 2026 —
// docs/CHORD_PROGRESSION_DETECTION_REDESIGN.md).
//
// Deliberately separate from the ear-training `catalog.ts`, which is
// the curriculum backbone for the Chord Progressions quiz, goal item
// counts, fluency tracking, etc. This file is consumed ONLY by
// progressionDetection.ts for the Repertoire lead-sheet view.
//
// Every pattern is ≥2 chords (no single-chord "progressions"). Numerals
// carry case to encode the expected diatonic quality (uppercase =
// major/dominant-ish, lowercase = minor); matching is on root motion,
// and a case mismatch only produces an informational deviation note.

export interface DetectionPattern {
  /** Stable id for the pattern. */
  id: string;
  /** Canonical numerals, used for display. Case encodes the expected
   *  quality of each slot. */
  numerals: string[];
  /** When true, the detector also matches every rotation of the cycle
   *  (a loop has no fixed entry point). */
  rotation?: boolean;
  /** Existing ear-training catalog progression id this pattern maps to,
   *  for the "Add to ET practice" affordance. Omitted when there is no
   *  ET equivalent — the detection UI then hides the + button. */
  etCatalogId?: string;
}

export const DETECTION_PATTERNS: DetectionPattern[] = [
  { id: 'ii-V-I', numerals: ['ii', 'V', 'I'], etCatalogId: '2-5-1' },
  { id: 'V-I', numerals: ['V', 'I'] },
  { id: 'V-I-IV', numerals: ['V', 'I', 'IV'] },
  { id: 'I-IV', numerals: ['I', 'IV'] },
  {
    id: 'I-V-vi-IV',
    numerals: ['I', 'V', 'vi', 'IV'],
    rotation: true,
    etCatalogId: '1-5-6-4',
  },
  // THE TWO WALKS LOST THEIR ET LINK ON 9 SEP 2026 and kept their
  // detection. `gospel-walk-up` and `gospel-walk-down` were among the
  // sixty-one progressions cut from the ear-training catalog, so there
  // is nothing to add them to and the + button hides — but the pattern
  // is still worth naming when it turns up in a song, which is what
  // this list is for.
  { id: 'walk-up', numerals: ['I', 'II', 'III', 'IV'] },
  { id: 'walk-down', numerals: ['I', 'VII', 'vi', 'V'] },
  { id: 'IV-V-I', numerals: ['IV', 'V', 'I'] },
  { id: 'I-vi-IV-V', numerals: ['I', 'vi', 'IV', 'V'], etCatalogId: '1-6-4-5' },
];
