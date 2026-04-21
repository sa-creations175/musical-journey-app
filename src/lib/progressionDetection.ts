// Shared between Ear Training and (future) Repertoire. Given a chord
// sequence in Roman numerals, this module finds every occurrence of a
// named progression from the catalog — exact matches, embedded matches
// inside a longer sequence, and partial prefixes that set up a catalog
// progression without completing it. The Repertoire module will use this
// to auto-tag song sections; the Chord Progressions module can use it
// for analytical views over practice history.

import { PROGRESSIONS, TIER_NAMES, type Progression } from '../modules/ear-training/chord-progressions/catalog';

export type MatchType = 'exact' | 'contains' | 'partial';

export interface ProgressionMatch {
  progressionId: string;
  progressionName: string;
  tier: number;
  tierName: string;
  isMustKnow: boolean;
  /**
   * How the input aligned with the catalog progression.
   *  - `exact`    — input is the same length as the progression and every
   *                 numeral matches in order.
   *  - `contains` — the progression appears as a contiguous subsequence
   *                 somewhere inside the input (input is longer).
   *  - `partial`  — input is a prefix of the progression (input is
   *                 shorter, first N ≥ 2 numerals match).
   */
  matchType: MatchType;
  /** 0-based index in the input where the match starts. */
  matchIndex: number;
  /** How many input chords are covered by this match. */
  matchLength: number;
}

// Strip chord-quality suffixes ("7", "maj7", "m7b5", "ø7", …) so that
// "Imaj7" and "I" both reduce to the functional root. Flat/sharp prefix
// + Roman numeral preserved as-is (case-sensitive — upper/lower carries
// major-vs-minor meaning).
function functionalRoot(numeral: string): string {
  const m = numeral.match(/^([#b]*)([IVXivx]+)/);
  return m ? m[1] + m[2] : numeral;
}

function matchesAt(input: string[], target: string[], offset: number): boolean {
  for (let i = 0; i < target.length; i++) {
    if (functionalRoot(input[offset + i]) !== functionalRoot(target[i])) return false;
  }
  return true;
}

function buildMatch(
  p: Progression,
  matchType: MatchType,
  matchIndex: number,
  matchLength: number,
): ProgressionMatch {
  return {
    progressionId: p.id,
    progressionName: p.name,
    tier: p.tier,
    tierName: TIER_NAMES[p.tier] ?? p.tierName,
    isMustKnow: p.isMustKnow,
    matchType,
    matchIndex,
    matchLength,
  };
}

// Minimum chord count for a "partial" match. Two is the smallest window
// that can meaningfully distinguish one progression from another.
const MIN_PARTIAL_LENGTH = 2;

/**
 * Returns every catalog progression that aligns with the input sequence.
 *
 * Multiple matches are emitted for the same progression if it appears at
 * different offsets (e.g. a 16-bar verse might contain the 1-5-6-4 twice).
 * Exact matches are emitted instead of (not in addition to) contains
 * matches at the same offset.
 */
export function detectProgressions(chordSequence: string[]): ProgressionMatch[] {
  const input = chordSequence;
  const inLen = input.length;
  if (inLen === 0) return [];
  const out: ProgressionMatch[] = [];

  for (const p of PROGRESSIONS) {
    const target = p.numerals;
    const tLen = target.length;
    if (tLen === 0) continue;

    // Exact — same length + all match at offset 0.
    if (inLen === tLen && matchesAt(input, target, 0)) {
      out.push(buildMatch(p, 'exact', 0, tLen));
      continue;
    }

    // Contains — progression is a contiguous subsequence inside a longer input.
    if (tLen < inLen) {
      for (let i = 0; i <= inLen - tLen; i++) {
        if (matchesAt(input, target, i)) {
          out.push(buildMatch(p, 'contains', i, tLen));
        }
      }
      continue; // contains is strictly disjoint from partial
    }

    // Partial — input is shorter than the progression and matches its prefix.
    if (tLen > inLen && inLen >= MIN_PARTIAL_LENGTH) {
      let ok = true;
      for (let i = 0; i < inLen; i++) {
        if (functionalRoot(input[i]) !== functionalRoot(target[i])) { ok = false; break; }
      }
      if (ok) out.push(buildMatch(p, 'partial', 0, inLen));
    }
  }

  return out;
}
