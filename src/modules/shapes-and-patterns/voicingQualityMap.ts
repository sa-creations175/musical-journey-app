// Bridge a stored chord quality to the voicing engine's quality id.
//
// `ChordFunction.quality` (what chordPlacements store, see
// repertoire/chordFunction.ts) is the user-typed SUFFIX, lightly
// normalized — '', 'm', 'maj7', 'm7', '7', 'm7b5', 'dim', 'aug', '9',
// 'add9', etc. The voicing engine (QUALITY_INTERVALS / chordShapeOffsets in
// catalog.ts + mentalVizVoicing.ts) is keyed by catalog ID — 'maj', 'min',
// 'dom7', 'min7', 'm7b5', … . These diverge for the common cases
// (''→maj, 'm'→min, '7'→dom7, 'm7'→min7), so the voicing carousel maps
// suffix → id explicitly here.
//
// Contract: NEVER throws, and ALWAYS returns an id that exists in
// QUALITY_INTERVALS — unrecognized input falls back to the nearest base
// triad/seventh with `exact: false`, so the carousel shows sensible
// candidates rather than nothing (it must never silently drop voicings).

import { CHORD_QUALITIES, QUALITY_INTERVALS } from './catalog';

export interface QualityIdResult {
  /** A key of QUALITY_INTERVALS — always valid. */
  id: string;
  /** true = matched a known quality (directly or via a known alternate);
   *  false = best-effort base fallback. */
  exact: boolean;
}

// Canonical suffix (as stored in CHORD_QUALITIES) → catalog id.
// The empty suffix '' maps to the major triad.
const SUFFIX_TO_ID = new Map<string, string>(
  CHORD_QUALITIES.map(q => [q.suffix, q.id]),
);

// Common alternate spellings the parser can emit or a user can type, folded
// to the CANONICAL suffix used in CHORD_QUALITIES. Case-sensitive where it
// matters ('M7' major vs 'm7' minor). Only genuinely-alternate forms live
// here; exact canonical suffixes are matched directly by SUFFIX_TO_ID.
const ALTERNATE_TO_CANONICAL: Record<string, string> = {
  // Major triad
  M: '', maj: '', major: '', Maj: '',
  // Minor triad ('-' = jazz minus, 'min' long form)
  min: 'm', '-': 'm', minor: 'm',
  // Diminished / augmented (catalog uses ° and +)
  dim: '°', o: '°', O: '°', diminished: '°',
  aug: '+', augmented: '+',
  // Sevenths
  M7: 'maj7', Maj7: 'maj7', MAJ7: 'maj7', MA7: 'maj7', ma7: 'maj7',
  'Δ': 'maj7', 'Δ7': 'maj7', major7: 'maj7',
  min7: 'm7', '-7': 'm7', minor7: 'm7',
  dom7: '7', dom: '7', dominant7: '7',
  dim7: '°7', o7: '°7', diminished7: '°7',
  'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'm7(b5)': 'm7b5',
  min7b5: 'm7b5', halfdim: 'm7b5', 'half-dim': 'm7b5',
  mmaj7: 'm(maj7)', minmaj7: 'm(maj7)', mM7: 'm(maj7)', 'm#7': 'm(maj7)',
  // Ninths
  M9: 'maj9', major9: 'maj9', min9: 'm9', '-9': 'm9', minor9: 'm9',
  // Elevenths / thirteenths
  M11: 'maj11', min11: 'm11', M13: 'maj13', min13: 'm13',
  // Sixths
  min6: 'm6', '-6': 'm6',
  '69': '6/9', '6add9': '6/9',
  // Suspended (bare 'sus' conventionally = sus4)
  sus: 'sus4',
};

/** Best-effort base id when nothing matches. Never throws; always in-catalog. */
function fallbackId(raw: string): string {
  const s = raw.trim();
  const lower = s.toLowerCase();
  const hasExtToken = /(?:^|[^a-z])(?:7|9|11|13)/.test(lower);

  if (s.includes('°') || lower.includes('dim') || /^o7?$/.test(lower)) {
    return lower.includes('7') ? 'dim7' : 'dim';
  }
  if (s.includes('+') || lower.includes('aug')) return 'aug';
  if (s.includes('ø') || lower.includes('m7b5') || lower.includes('m7-5')) {
    return 'm7b5';
  }
  // Minor: leading lowercase 'm' (not 'maj'), leading '-', or 'min…'.
  const isMinor =
    (s.startsWith('m') && !lower.startsWith('maj')) ||
    s.startsWith('-') ||
    lower.startsWith('min');
  if (isMinor) return hasExtToken ? 'min7' : 'min';
  // A 7/9/11/13 token with no major marker → dominant family.
  if (hasExtToken && !lower.includes('maj') && !s.startsWith('M')) return 'dom7';
  // Default: major triad.
  return 'maj';
}

/**
 * Map a stored chord quality suffix to a voicing-engine quality id.
 * Pure; never throws; the returned id is always a key of QUALITY_INTERVALS.
 */
export function qualityIdFromSuffix(suffix: string | undefined): QualityIdResult {
  const raw = (suffix ?? '').trim();

  // 1. Exact canonical suffix (incl. '' → maj).
  const direct = SUFFIX_TO_ID.get(raw);
  if (direct !== undefined) return { id: direct, exact: true };

  // 2. Known alternate → canonical suffix → id.
  const canonical = ALTERNATE_TO_CANONICAL[raw];
  if (canonical !== undefined) {
    const id = SUFFIX_TO_ID.get(canonical);
    if (id !== undefined) return { id, exact: true };
  }

  // 3. Best-effort base fallback (guaranteed in-catalog).
  const id = fallbackId(raw);
  return { id: id in QUALITY_INTERVALS ? id : 'maj', exact: false };
}
