// Shared piano-voicing rendering primitives — the interval coloring
// system used by the lead-sheet PianoKeyboard and the mental-viz chord
// library reveal. Extracted from repertoire/voicingHelpers so the
// keyboard renderer (src/components/PianoKeyboard) can live in the
// shared layer and both features import the colors from one place.
//
// A chord tone is colored by its semitone distance from the chord root,
// normalized to 0–11, so octave/enharmonic equivalents share a color
// (b2≡b9, #4≡b5, #5≡b6, #9≡m3, 4≡11, 6≡13).

import type { VoicingEntry } from './db';

export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const INTERVAL_COLOR: Record<number, string> = {
  0: '#0F6E56',  // root — deep green
  1: '#E24B4A',  // b2 / b9 — red (dissonant tension)
  2: '#D4537E',  // maj 2nd / 9th — pink
  3: '#5DCAA5',  // min 3rd / #9 — teal green
  4: '#97C459',  // maj 3rd — light green
  5: '#534AB7',  // perfect 4th / 11th — purple
  6: '#E24B4A',  // #4 / b5 / tritone — red (max tension)
  7: '#888780',  // perfect 5th — gray (structural)
  8: '#185FA5',  // #5 / b6 — deep blue
  9: '#378ADD',  // maj 6th / 13th — bright blue
  10: '#BA7517', // min 7th / dom 7th — deep amber
  11: '#FAC775', // maj 7th — light amber
};

/** Highlight color for a chord tone by its interval (in semitones) from
 *  the chord root. Input is normalized into 0–11, so any octave or
 *  enharmonic spelling maps to the same color. */
export function intervalColor(semitones: number): string {
  const s = ((semitones % 12) + 12) % 12;
  return INTERVAL_COLOR[s];
}

/** Absolute keyboard position for a voicing offset, treating the offset
 *  as true semitones above the chord root (NOT a mod-12 interval). The
 *  root sits at absolute semitone `rootPc`; a tone `offset` semitones
 *  above it lands at semitone `rootPc + offset`, whose pitch class and
 *  rendered octave are returned. Because the absolute semitone increases
 *  monotonically with `offset`, an ascending offset list always renders
 *  left-to-right regardless of root — fixing the octave-wrap that put the
 *  5th of F (pitch class C, below F) to the LEFT of the root.
 *
 *  Contrast the legacy mod-12 mapping `(pc - rootPc + 12) % 12 + 12*oct`
 *  used by the editable bar-grid keyboard, which anchors octaves to C and
 *  wraps any tone whose pitch class is below the root. */
export function voicingKeyPosition(
  offset: number,
  rootPc: number,
): { pc: number; octave: number; semitone: number } {
  const semitone = rootPc + offset;
  return {
    pc: ((semitone % 12) + 12) % 12,
    octave: Math.floor(semitone / 12),
    semitone,
  };
}

/** Normalize a stored voicing (which may hold legacy plain-number
 *  offsets) to `VoicingEntry[]`. Legacy numbers are read as right-hand
 *  tones. */
export function normalizeVoicing(
  voicing: ReadonlyArray<number | VoicingEntry> | undefined,
): VoicingEntry[] {
  if (!voicing) return [];
  return voicing.map(v =>
    typeof v === 'number' ? { offset: v, hand: 'R' } : v,
  );
}

/**
 * Canonical-form sanitize for a voicing: normalize legacy plain-number
 * entries, drop exact (offset+hand) duplicates, and sort ascending by
 * offset. Idempotent. Applied when a voicing is SAVED so stored data stays
 * clean going forward.
 *
 * Deliberately NOT a register rewrite (see VOICING_CAROUSEL_DESIGN.md §5,
 * O1): existing offsets are already canonical absolute semitones-from-root,
 * so this only de-dupes and orders — running it over already-clean data is a
 * no-op, which is why we apply it at write-time rather than as a bulk
 * migration that would only churn sync for zero change.
 */
export function sanitizeVoicing(
  voicing: ReadonlyArray<number | VoicingEntry> | undefined,
): VoicingEntry[] {
  const seen = new Set<string>();
  const out: VoicingEntry[] = [];
  for (const e of normalizeVoicing(voicing)) {
    const key = `${e.offset}:${e.hand}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => a.offset - b.offset);
  return out;
}
