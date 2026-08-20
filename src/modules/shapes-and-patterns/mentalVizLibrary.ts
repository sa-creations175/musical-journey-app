// Enumerated mental-visualisation chord library — the 504 items the
// drill walks via SM-2. Each item carries a stable itemRef, a prompt
// label, and the PianoKeyboard reveal data (rootPc + octave-aware
// offsets-from-root). Spacing rows for these items use the dedicated
// 'mental-viz' moduleRef (NOT 'shapes-and-patterns'), so they never
// count toward keyboard S&P coverage or blocks.
//
//   Triads:    6 qualities × 3 inversions × 12 keys = 216
//   Sevenths:  6 qualities × 4 inversions × 12 keys = 288
//                                              total  = 504
//
// WAS 600. The 96 extended dominant voicings (8 × 12 keys) were cut on
// 20 Aug 2026 — same generated-to-fill-a-grid pattern as the chord-shape
// extensions, and they carry no inversion axis, so `quality → inversion
// → key` never had a shelf for them. See
// docs/DASHBOARD_REDESIGN_DESIGN.md § Catalog cuts.
//
// EXTENDED_DOM_VOICINGS itself deliberately STAYS in mentalVizVoicing.ts.
// It is voicing-engine data that the lead-sheet carousel reads via
// seedVoicingPatterns; only the enumeration into MENTAL_VIZ_ITEMS is
// removed here.

import { KEYS } from './catalog';
import type { VoicingEntry } from '../../lib/db';
import {
  chordShapeOffsets,
  preferFlatsFor,
  rootPcOf,
} from './mentalVizVoicing';

/** Spacing-state moduleRef for every mental-viz item. */
export const MENTAL_VIZ_MODULE_REF = 'mental-viz';

export interface MentalVizItem {
  /** e.g. "mv:triad:maj:root:C", "mv:seventh:min7:inv2:Eb". */
  itemRef: string;
  /** "[Key] [Quality] — [Inversion/Position]". */
  prompt: string;
  /** Alternate chord name shown on the reveal card. Unset by every
   *  current item — the only producer was the extended-dominant set,
   *  cut 20 Aug 2026. Kept because MentalVizChordDrill renders it and
   *  the planned "show notes, ask which chord" redesign will want it
   *  again (C-E-G-A is C6 *and* arguably rootless Am7). */
  altName?: string;
  rootPc: number;
  voicing: Array<number | VoicingEntry>;
  preferFlats: boolean;
}

const TRIADS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'maj', label: 'Major' },
  { id: 'min', label: 'Minor' },
  { id: 'dim', label: 'Diminished' },
  { id: 'aug', label: 'Augmented' },
  { id: 'sus2', label: 'Sus2' },
  { id: 'sus4', label: 'Sus4' },
];

const SEVENTHS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'maj7', label: 'Major 7' },
  { id: 'min7', label: 'Minor 7' },
  { id: 'dom7', label: 'Dominant 7' },
  { id: 'mmaj7', label: 'MinMaj7' },
  { id: 'm7b5', label: 'Half-dim' },
  { id: 'dim7', label: 'Dim7' },
];

const INVERSION_TAG = ['root', 'inv1', 'inv2', 'inv3'];
const INVERSION_LABEL = ['Root Position', '1st Inversion', '2nd Inversion', '3rd Inversion'];

function buildShapeItems(
  section: 'triad' | 'seventh',
  qualities: ReadonlyArray<{ id: string; label: string }>,
  inversionCount: number,
): MentalVizItem[] {
  const items: MentalVizItem[] = [];
  for (const q of qualities) {
    for (let inv = 0; inv < inversionCount; inv++) {
      for (const key of KEYS) {
        items.push({
          itemRef: `mv:${section}:${q.id}:${INVERSION_TAG[inv]}:${key}`,
          prompt: `${key} ${q.label} — ${INVERSION_LABEL[inv]}`,
          rootPc: rootPcOf(key),
          voicing: chordShapeOffsets(q.id, inv),
          preferFlats: preferFlatsFor(key),
        });
      }
    }
  }
  return items;
}

export const MENTAL_VIZ_ITEMS: MentalVizItem[] = [
  ...buildShapeItems('triad', TRIADS, 3),
  ...buildShapeItems('seventh', SEVENTHS, 4),
];

export const MENTAL_VIZ_ITEM_BY_REF: ReadonlyMap<string, MentalVizItem> = new Map(
  MENTAL_VIZ_ITEMS.map(i => [i.itemRef, i]),
);
