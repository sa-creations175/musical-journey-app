// Lead-sheet chord-progression detection (Chord Progression Detection
// Redesign, May 2026 — docs/CHORD_PROGRESSION_DETECTION_REDESIGN.md).
//
// Matches the section's chord sequence against a small catalog of
// structural patterns (detectionPatterns.ts) using flexible root-motion
// matching:
//
//  · A chord matches a pattern slot on SCALE DEGREE (root motion), not
//    strict quality. A quality/case mismatch (e.g. a minor v where the
//    pattern expects a major V) produces an informational deviation
//    note rather than blocking the match.
//
//  · The exception is harmonic function: a chord whose EFFECTIVE
//    harmonic tag is 'secondary_dominant' is not acting as a structural
//    tonic/subdominant, so it cannot fill a tonic/subdominant slot
//    (I, ii, IV, vi — degrees 1, 2, 4, 6). The caller resolves the
//    effective tag (manual override wins over auto-detection), so
//    clearing the tag on a gospel 1dom7 lets it function as a tonic I.
//
// Loop patterns flagged `rotation` match at any entry point.

import { DETECTION_PATTERNS } from '../modules/repertoire/detectionPatterns';

/** One chord in the section's ordered sequence, reduced to what the
 *  detector needs. */
export interface DetectChord {
  /** Scale-degree label: accidental + number, e.g. "1", "b7", "#4".
   *  No case — quality lives in the flags below. */
  degree: string;
  /** True when the chord's quality is minor-ish (m, m7, m9 … but not
   *  maj). */
  isMinor: boolean;
  /** True when the chord's quality is dominant. */
  isDominant: boolean;
  /** Effective harmonic tag (manual override resolved over auto). When
   *  'secondary_dominant', the chord is excluded from tonic/subdominant
   *  pattern slots. */
  effectiveTag?: string;
  /** 0-based bar index this chord sits in, for position display. */
  barIndex: number;
}

export interface PatternMatch {
  patternId: string;
  /** Display numerals for this match (the rotation as it appears). */
  numerals: string[];
  /** 0-based index in the input where the match starts. */
  matchIndex: number;
  /** How many chords the match covers. */
  matchLength: number;
  /** Bar of the first / last matched chord (0-based). */
  startBar: number;
  endBar: number;
  /** Informational quality-deviation notes, e.g. "V is minor". */
  deviations: string[];
  /** ET catalog id for the Add-to-ET affordance, when one exists. */
  etCatalogId?: string;
}

const ROMAN_TO_NUM: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7,
};

// Tonic / subdominant degrees. A secondary-dominant chord can't fill
// one of these slots (it's tonicizing, not functioning structurally).
const TONIC_SUBDOMINANT_DEGREES = new Set(['1', '2', '4', '6']);

interface Slot {
  degree: string;
  expectMinor: boolean;
  numeral: string;
}

function parseNumeral(numeral: string): Slot | null {
  const m = numeral.match(/^([b#]?)([IVXivx]+)$/);
  if (!m) return null;
  const accidental = m[1];
  const roman = m[2];
  const expectMinor = roman === roman.toLowerCase();
  const num = ROMAN_TO_NUM[roman.toUpperCase()];
  if (!num) return null;
  return { degree: accidental + String(num), expectMinor, numeral };
}

function rotations<T>(arr: T[]): T[][] {
  return arr.map((_, i) => [...arr.slice(i), ...arr.slice(0, i)]);
}

function matchesAt(input: DetectChord[], slots: Slot[], offset: number): boolean {
  for (let k = 0; k < slots.length; k++) {
    const chord = input[offset + k];
    const slot = slots[k];
    if (chord.degree !== slot.degree) return false;
    // Secondary dominants don't act as structural tonic/subdominant.
    if (
      chord.effectiveTag === 'secondary_dominant' &&
      TONIC_SUBDOMINANT_DEGREES.has(slot.degree)
    ) {
      return false;
    }
  }
  return true;
}

function deviationsAt(input: DetectChord[], slots: Slot[], offset: number): string[] {
  const notes: string[] = [];
  for (let k = 0; k < slots.length; k++) {
    const chord = input[offset + k];
    const slot = slots[k];
    // A deviation is a major/minor case mismatch vs the slot's expected
    // quality. Describe it by the chord's actual quality.
    if (slot.expectMinor !== chord.isMinor) {
      const actual = chord.isDominant ? 'dominant' : chord.isMinor ? 'minor' : 'major';
      notes.push(`${slot.numeral} is ${actual}`);
    }
  }
  return notes;
}

/**
 * Returns every pattern match in the input sequence. Patterns are all
 * ≥2 chords; matches are emitted at every offset (nested matches like
 * V-I inside V-I-IV are intentionally both reported). Loop patterns
 * match at any rotation.
 */
export function detectPatterns(input: DetectChord[]): PatternMatch[] {
  if (input.length < 2) return [];
  const out: PatternMatch[] = [];
  const seen = new Set<string>();

  for (const pattern of DETECTION_PATTERNS) {
    const variants = pattern.rotation
      ? rotations(pattern.numerals)
      : [pattern.numerals];

    for (const numerals of variants) {
      const slots = numerals.map(parseNumeral);
      if (slots.some(s => s === null)) continue;
      const target = slots as Slot[];
      const tLen = target.length;
      if (tLen < 2 || tLen > input.length) continue;

      for (let i = 0; i <= input.length - tLen; i++) {
        if (!matchesAt(input, target, i)) continue;
        const dedupeKey = `${pattern.id}|${i}|${tLen}|${numerals.join(',')}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({
          patternId: pattern.id,
          numerals,
          matchIndex: i,
          matchLength: tLen,
          startBar: input[i].barIndex,
          endBar: input[i + tLen - 1].barIndex,
          deviations: deviationsAt(input, target, i),
          etCatalogId: pattern.etCatalogId,
        });
      }
    }
  }

  // Stable ordering: by start position, then longer matches first.
  out.sort((a, b) => a.matchIndex - b.matchIndex || b.matchLength - a.matchLength);
  return out;
}
