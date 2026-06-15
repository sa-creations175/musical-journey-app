// Catalog data for the Shapes & Patterns module.
//
//   · KEYS                        — 12 pitch names used as grid columns
//   · CHORD_QUALITIES             — 29 qualities grouped by "kind"
//                                   (triad / seventh / extension / special).
//                                   The kind drives the default drill-type
//                                   set materialised for a fresh cell.
//   · SCALES                      — scales the user practises on the
//                                   scale heat-grid (major + natural
//                                   minor in v1).
//   · VOICE_LEADING_PATTERNS      — voice-leading drills spread across
//                                   all 12 keys.
//   · MENTAL_VIZ_DRILLS           — away-from-keyboard mental drills.
//
// None of these are stored in Dexie — they're the static "universe"
// the module draws from. Practice activity materialises DrillSkill +
// DrillType rows lazily per interaction.

import type { InversionState } from '../../lib/db';
import { CIRCLE_OF_FOURTHS, canonicaliseKey } from '../repertoire/circleOfFourths';

export const KEYS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;
export type KeyName = typeof KEYS[number];

/**
 * The catalog's 12 keys reordered by circle-of-fourths position
 * (C → F → Bb → … → G). Used as the column order for every S&P matrix
 * (chord shapes, scales, voice leading) so the grids read consistently.
 *
 * Spellings are the catalog's own — e.g. the tritone stays 'F#' (its
 * canonical CIRCLE_OF_FOURTHS slot is 'Gb') — so grid lookups against
 * data keyed by KeyName still resolve. This is purely a display order;
 * KEYS itself stays in chromatic order because other code (shapesSplit)
 * depends on that ordering.
 */
export const KEYS_CIRCLE_OF_FOURTHS: ReadonlyArray<KeyName> = [...KEYS].sort(
  (a, b) =>
    CIRCLE_OF_FOURTHS.indexOf(canonicaliseKey(a) ?? a)
    - CIRCLE_OF_FOURTHS.indexOf(canonicaliseKey(b) ?? b),
);

/** True when this key name prefers flat spellings in display (kept
 *  consistent with the rest of the app). */
export function keyPrefersFlats(k: string): boolean {
  return /b$/.test(k) || k === 'F';
}

// --- Chord qualities ------------------------------------------------

export type QualityKind = 'triad' | 'seventh' | 'extension' | 'special';

export interface ChordQualityEntry {
  id: string;          // stable id used in DrillSkill.quality
  label: string;       // human-facing name
  suffix: string;      // rendered next to a root note ("" / "m" / "maj7" / "m7b5" / …)
  kind: QualityKind;
}

/**
 * 29 chord qualities covering the vocabulary most gospel / R&B / jazz
 * players practise. Ordering mirrors pedagogical progression —
 * triads first, seventh chords, then extensions, then special
 * voicings — so the heat grid's row order matches how users think
 * about their vocabulary.
 */
export const CHORD_QUALITIES: ChordQualityEntry[] = [
  // Triads (6)
  { id: 'maj',       label: 'Major',          suffix: '',       kind: 'triad' },
  { id: 'min',       label: 'Minor',          suffix: 'm',      kind: 'triad' },
  { id: 'dim',       label: 'Diminished',     suffix: '°',      kind: 'triad' },
  { id: 'aug',       label: 'Augmented',      suffix: '+',      kind: 'triad' },
  { id: 'sus2',      label: 'Sus2',           suffix: 'sus2',   kind: 'triad' },
  { id: 'sus4',      label: 'Sus4',           suffix: 'sus4',   kind: 'triad' },
  // Seventh chords (6)
  { id: 'maj7',      label: 'Major 7',        suffix: 'maj7',   kind: 'seventh' },
  { id: 'min7',      label: 'Minor 7',        suffix: 'm7',     kind: 'seventh' },
  { id: 'dom7',      label: 'Dominant 7',     suffix: '7',      kind: 'seventh' },
  { id: 'm7b5',      label: 'Half-diminished', suffix: 'm7b5',  kind: 'seventh' },
  { id: 'dim7',      label: 'Diminished 7',   suffix: '°7',     kind: 'seventh' },
  { id: 'mmaj7',     label: 'Minor-major 7',  suffix: 'm(maj7)',kind: 'seventh' },
  // Extensions (14)
  { id: 'maj9',      label: 'Major 9',        suffix: 'maj9',   kind: 'extension' },
  { id: 'min9',      label: 'Minor 9',        suffix: 'm9',     kind: 'extension' },
  { id: 'dom9',      label: 'Dominant 9',     suffix: '9',      kind: 'extension' },
  { id: 'maj11',     label: 'Major 11',       suffix: 'maj11',  kind: 'extension' },
  { id: 'min11',     label: 'Minor 11',       suffix: 'm11',    kind: 'extension' },
  { id: 'dom11',     label: 'Dominant 11',    suffix: '11',     kind: 'extension' },
  { id: 'maj13',     label: 'Major 13',       suffix: 'maj13',  kind: 'extension' },
  { id: 'min13',     label: 'Minor 13',       suffix: 'm13',    kind: 'extension' },
  { id: 'dom13',     label: 'Dominant 13',    suffix: '13',     kind: 'extension' },
  { id: 'add9',      label: 'Add 9',          suffix: 'add9',   kind: 'extension' },
  { id: 'maj7s11',   label: 'Maj 7 #11',      suffix: 'maj7#11',kind: 'extension' },
  { id: 'dom7b9',    label: '7 ♭9',            suffix: '7b9',   kind: 'extension' },
  { id: 'dom7s9',    label: '7 #9',           suffix: '7#9',    kind: 'extension' },
  { id: 'dom7b13',   label: '7 ♭13',           suffix: '7b13',  kind: 'extension' },
  // Special / sixth (3)
  { id: 'maj6',      label: 'Major 6',        suffix: '6',      kind: 'special' },
  { id: 'min6',      label: 'Minor 6',        suffix: 'm6',     kind: 'special' },
  { id: 'maj6_9',    label: '6/9',            suffix: '6/9',    kind: 'special' },
];

export const CHORD_QUALITY_BY_ID = new Map<string, ChordQualityEntry>(
  CHORD_QUALITIES.map(q => [q.id, q]),
);

// --- Default drill types per quality kind ---------------------------

interface DefaultDrill {
  name: string;
  suggestedSeconds: number;
}

/**
 * Returns the seed drill types for a freshly-created DrillSkill of
 * the given quality kind. Users can rename/delete/add.
 */
export function defaultDrillTypesForQuality(kind: QualityKind): DefaultDrill[] {
  switch (kind) {
    case 'triad':
      return [
        { name: 'Root position (up & down)',           suggestedSeconds: 120 },
        { name: '1st inversion (up & down)',           suggestedSeconds: 120 },
        { name: '2nd inversion (up & down)',           suggestedSeconds: 120 },
        { name: 'All inversions fluid',                suggestedSeconds: 180 },
      ];
    case 'seventh':
      return [
        { name: 'One-handed root position',            suggestedSeconds: 120 },
        { name: 'One-handed 1st inversion',            suggestedSeconds: 120 },
        { name: 'One-handed 2nd inversion',            suggestedSeconds: 120 },
        { name: 'One-handed 3rd inversion',            suggestedSeconds: 120 },
        { name: 'One-handed all inversions fluid',     suggestedSeconds: 180 },
        { name: 'Two-handed: LH root + RH triad root', suggestedSeconds: 120 },
        { name: 'Two-handed: LH root + RH triad 1st',  suggestedSeconds: 120 },
        { name: 'Two-handed: LH root + RH triad 2nd',  suggestedSeconds: 120 },
        { name: 'Two-handed all inversions fluid',     suggestedSeconds: 180 },
      ];
    case 'extension':
      return [
        { name: 'Voicing in root position',            suggestedSeconds: 120 },
        { name: 'Skip-a-note voicings',                suggestedSeconds: 120 },
        { name: 'Rootless voicing (3-7 or 7-3)',       suggestedSeconds: 120 },
        { name: 'Two-handed voicing',                  suggestedSeconds: 180 },
        { name: 'Flowing between voicings',            suggestedSeconds: 180 },
      ];
    case 'special':
      return [
        { name: 'Root position (up & down)',           suggestedSeconds: 120 },
        { name: 'Commonly used voicing',               suggestedSeconds: 120 },
        { name: 'Flowing inversions',                  suggestedSeconds: 180 },
      ];
  }
}

// --- Chord-shape inversion catalog (Phase 4 inversion redesign) ----

/**
 * Ordered list of inversion-state skill rows to materialise per
 * (quality × key) cell, keyed by QualityKind. Drives
 * findOrCreateSkill's per-cell materialisation: opening a triad
 * cell creates 4 skill rows (root / inv1 / inv2 / fluid); opening
 * a seventh-chord cell creates 6 rows (root / inv1 / inv2 / inv3 /
 * fluid / supplementary). Extensions + special/sixth produce one
 * row with no inversion suffix on the itemRef.
 *
 * The 'supplementary' state for sevenths hosts the two-handed
 * drills as its own skill row — kept out of the acquisition path
 * (its itemRef is filtered out of coverage / progress counts) but
 * still log-able. Decision A in the Step-0 plan.
 *
 * For acquisition counting, see `gatesAcquisition` below.
 */
export const INVERSION_STATES_FOR_CHORD_SHAPE_KIND: Record<
  QualityKind,
  ReadonlyArray<InversionState | null>
> = {
  triad:     ['root', 'inv1', 'inv2', 'fluid'],
  seventh:   ['root', 'inv1', 'inv2', 'inv3', 'fluid', 'supplementary'],
  extension: [null],
  special:   [null],
};

/**
 * Whether a (kind, state) skill row counts toward acquisition
 * (i.e., shows up in coverage denominators and goal progress).
 * Supplementary rows for sevenths are excluded — they're practice
 * tools, not acquisition requirements.
 */
export function gatesAcquisition(
  kind: QualityKind,
  inversionState: InversionState | null | undefined,
): boolean {
  if (kind === 'extension' || kind === 'special') return true;
  return inversionState !== 'supplementary';
}

/**
 * Display label for the inversion state — shown in skill labels
 * (e.g. "Cmaj7 — 2nd inversion") and in the breakdown panel.
 * `null` and `undefined` return the empty string so callers can
 * concatenate without a guard.
 */
export function inversionStateLabel(
  state: InversionState | null | undefined,
): string {
  switch (state) {
    case 'root':          return 'Root position';
    case 'inv1':          return '1st inversion';
    case 'inv2':          return '2nd inversion';
    case 'inv3':          return '3rd inversion';
    case 'fluid':         return 'All inversions fluid';
    case 'supplementary': return 'Two-handed drills';
    default:              return '';
  }
}

/**
 * Per-(kind, state) drill seed for chord-shape skills.
 *
 *   Triads + sevenths: one drill per inversion state at 90 s/rep;
 *   fluid at 120 s/rep (per Phase 4 inversion-redesign time
 *   constants).
 *
 *   Seventh supplementary: the four two-handed drills, all on the
 *   single supplementary skill row.
 *
 *   Extensions + special: unchanged — delegate to the legacy
 *   `defaultDrillTypesForQuality` so their voicing-based drill
 *   lists keep working.
 */
export function defaultDrillForChordShape(
  kind: QualityKind,
  inversionState: InversionState | null | undefined,
): DefaultDrill[] {
  if (kind === 'extension' || kind === 'special') {
    return defaultDrillTypesForQuality(kind);
  }
  if (kind === 'seventh' && inversionState === 'supplementary') {
    return [
      { name: 'Two-handed: LH root + RH triad root', suggestedSeconds: 120 },
      { name: 'Two-handed: LH root + RH triad 1st',  suggestedSeconds: 120 },
      { name: 'Two-handed: LH root + RH triad 2nd',  suggestedSeconds: 120 },
      { name: 'Two-handed all inversions fluid',     suggestedSeconds: 180 },
    ];
  }
  if (kind === 'triad') {
    switch (inversionState) {
      case 'root':  return [{ name: 'Root position (up & down)', suggestedSeconds: 90 }];
      case 'inv1':  return [{ name: '1st inversion (up & down)', suggestedSeconds: 90 }];
      case 'inv2':  return [{ name: '2nd inversion (up & down)', suggestedSeconds: 90 }];
      case 'fluid': return [{ name: 'All inversions fluid',      suggestedSeconds: 120 }];
      default:      return [];
    }
  }
  if (kind === 'seventh') {
    switch (inversionState) {
      case 'root':  return [{ name: 'One-handed root position',        suggestedSeconds: 90 }];
      case 'inv1':  return [{ name: 'One-handed 1st inversion',        suggestedSeconds: 90 }];
      case 'inv2':  return [{ name: 'One-handed 2nd inversion',        suggestedSeconds: 90 }];
      case 'inv3':  return [{ name: 'One-handed 3rd inversion',        suggestedSeconds: 90 }];
      case 'fluid': return [{ name: 'One-handed all inversions fluid', suggestedSeconds: 120 }];
      default:      return [];
    }
  }
  return [];
}

// --- Scales ---------------------------------------------------------

export interface ScaleEntry {
  id: string;
  label: string;
}

export const SCALES: ScaleEntry[] = [
  { id: 'major',           label: 'Major' },
  { id: 'natural-minor',   label: 'Natural Minor' },
  { id: 'major-pentatonic', label: 'Major Pentatonic' },
  { id: 'minor-pentatonic', label: 'Minor Pentatonic' },
];

export function defaultDrillTypesForScale(): DefaultDrill[] {
  return [
    { name: 'Scale drill', suggestedSeconds: 120 },
  ];
}

// --- Voice-leading patterns -----------------------------------------
//
// The VL catalog defines seven passing-chord patterns drilled across
// all 12 keys. Each pattern fans out into multiple sub-cells per key
// — different voicing types, starting positions, or inversions — so
// the spacing system can surface the right level of detail.
//
// itemRef shape: `vl:{patternId}:{seg1}:{seg2?}:{keyName}` where the
// sub-segments depend on the pattern's `kind`. See
// `parseVoiceLeadingItemRef` for the canonical parse + the dimensions
// per pattern.
//
// Total cells: 31 per key × 12 keys = 372. Breakdown:
//   five-one          6 (3 types × 2 positions)
//   major-251         6 (3 types × 2 positions)
//   minor-251         6 (3 types × 2 positions)
//   diatonic-cycle    3 (3 starting positions)
//   minor-aba         2 (2 positions)
//   dom7b9            4 (4 inversions of the dominant)
//   dim7              4 (4 inversions of the diminished)

/** Shared position tag on the type-position patterns. */
export type VLABPosition = 'A' | 'B';

/** Types for the 5→1 movement pattern. */
export type FiveOneType = 'guide-tones' | 'seventh-chords' | 'full-voicing';
/** Types for the Major 2-5-1 pattern. ABA structure is the "long"
 *  capstone type — the pattern's namesake voice-leading exercise. */
export type Major251Type = 'guide-tones' | 'seventh-chords' | 'aba-structure';
/** Types for the Minor 2-5-1 pattern. */
export type Minor251Type = 'guide-tones' | 'seventh-chords' | 'full-voicing';

/** Diatonic-cycle starting position — three voicings of the 1 chord. */
export type DiatonicCyclePosition = 'pos1' | 'pos2' | 'pos3';
/** Minor-ABA position — A or B starting voicing. Hyphenated tags
 *  keep these distinct from the `A`/`B` positions used by the
 *  type-position patterns. */
export type MinorAbaPosition = 'pos-A' | 'pos-B';
/** Dominant-flat-9 / diminished-7 starting inversion — root + three
 *  inversions = four cells per key. */
export type InversionPosition = 'pos1' | 'pos2' | 'pos3' | 'pos4';

/** Discriminated catalog entry per VL pattern. The `kind` field
 *  drives enumeration and parsing — adding a new pattern shape
 *  involves adding a new variant here plus its parse + enumerate
 *  branches below. No call site should switch on `id` directly. */
export type VoiceLeadingPattern =
  | {
      id: 'five-one';
      kind: 'type-position';
      label: string;
      description?: string;
      types: ReadonlyArray<FiveOneType>;
      positions: ReadonlyArray<VLABPosition>;
    }
  | {
      id: 'major-251';
      kind: 'type-position';
      label: string;
      description?: string;
      types: ReadonlyArray<Major251Type>;
      positions: ReadonlyArray<VLABPosition>;
    }
  | {
      id: 'minor-251';
      kind: 'type-position';
      label: string;
      description?: string;
      types: ReadonlyArray<Minor251Type>;
      positions: ReadonlyArray<VLABPosition>;
    }
  | {
      id: 'diatonic-cycle';
      kind: 'diatonic-cycle';
      label: string;
      description?: string;
      startingPositions: ReadonlyArray<DiatonicCyclePosition>;
    }
  | {
      id: 'minor-aba';
      kind: 'minor-aba';
      label: string;
      description?: string;
      positions: ReadonlyArray<MinorAbaPosition>;
    }
  | {
      id: 'dom7b9' | 'dim7';
      kind: 'inversion-4';
      label: string;
      description?: string;
      positions: ReadonlyArray<InversionPosition>;
    };

// Array order IS the session-surfacing priority. The session
// algorithm uses the catalog index as a soft deprioritization
// factor for the unstarted-cell tier in buildVoiceLeadingSegment
// — earlier patterns surface before later patterns when nothing
// is due. Don't reorder without updating that ordering rule.
export const VOICE_LEADING_PATTERNS: ReadonlyArray<VoiceLeadingPattern> = [
  {
    id: 'diatonic-cycle',
    kind: 'diatonic-cycle',
    label: 'Diatonic Cycle (1-4-7-3-6-2-5-1)',
    description: 'Full diatonic cycle in 7th chords across three starting inversions of the 1 chord.',
    startingPositions: ['pos1', 'pos2', 'pos3'],
  },
  {
    id: 'five-one',
    kind: 'type-position',
    label: '5→1 Movement',
    description: 'Dominant to tonic resolution. Three skill types (guide tones, seventh chords, full voicing) across two starting positions.',
    types: ['guide-tones', 'seventh-chords', 'full-voicing'],
    positions: ['A', 'B'],
  },
  {
    id: 'major-251',
    kind: 'type-position',
    label: 'Major 2-5-1',
    description: 'Foundational ii → V → I voice leading. Three skill types (guide tones, seventh chords, ABA structure) across two starting positions.',
    types: ['guide-tones', 'seventh-chords', 'aba-structure'],
    positions: ['A', 'B'],
  },
  {
    id: 'minor-251',
    kind: 'type-position',
    label: 'Minor 2-5-1',
    description: 'iiø → V → i voice leading. Three skill types (guide tones, seventh chords, full voicing) across two starting positions.',
    types: ['guide-tones', 'seventh-chords', 'full-voicing'],
    positions: ['A', 'B'],
  },
  {
    id: 'minor-aba',
    kind: 'minor-aba',
    label: 'Minor ABA (dom7#9#5 → minor)',
    description: 'Dark altered dominant resolving a 5th down to minor. Two starting positions.',
    positions: ['pos-A', 'pos-B'],
  },
  {
    id: 'dom7b9',
    kind: 'inversion-4',
    label: 'dom7b9 → minor',
    description: 'Right-hand dim7 voicing over dominant bass, resolving to minor. Four starting positions — root plus three inversions of the dominant.',
    positions: ['pos1', 'pos2', 'pos3', 'pos4'],
  },
  {
    id: 'dim7',
    kind: 'inversion-4',
    label: 'dim7 → minor',
    description: 'Diminished passing chord resolving to minor. Four starting positions — root plus three inversions of the dim7.',
    positions: ['pos1', 'pos2', 'pos3', 'pos4'],
  },
];

/** Map of patternId → catalog index. Used by the session algorithm
 *  to deprioritize later patterns within the unstarted-cell tier. */
export const VOICE_LEADING_PATTERN_INDEX: ReadonlyMap<string, number> = new Map(
  VOICE_LEADING_PATTERNS.map((p, i) => [p.id, i]),
);

/** Index for parse-by-patternId. */
export const VOICE_LEADING_PATTERN_BY_ID = new Map<string, VoiceLeadingPattern>(
  VOICE_LEADING_PATTERNS.map(p => [p.id, p]),
);

/** Count of sub-cells for `pattern` (key-invariant — every key
 *  fans out into the same dimension product). */
export function voiceLeadingCellsPerKey(pattern: VoiceLeadingPattern): number {
  switch (pattern.kind) {
    case 'type-position':  return pattern.types.length * pattern.positions.length;
    case 'diatonic-cycle': return pattern.startingPositions.length;
    case 'minor-aba':      return pattern.positions.length;
    case 'inversion-4':    return pattern.positions.length;
  }
}

/** Total VL cell count across the whole catalog: sum of per-pattern
 *  fan-outs × number of keys. 372 today (31 sub-cells/key × 12). */
export function voiceLeadingTotalCellCount(): number {
  return VOICE_LEADING_PATTERNS.reduce(
    (sum, p) => sum + voiceLeadingCellsPerKey(p), 0,
  ) * KEYS.length;
}

/**
 * Enumerate every sub-cell itemRef for `pattern` in `keyName`. The
 * cardinality depends on the pattern's kind (2, 3, 4, or 6 cells
 * per key — see catalog header). Pure.
 */
export function enumerateVoiceLeadingCells(
  pattern: VoiceLeadingPattern,
  keyName: string,
): string[] {
  switch (pattern.kind) {
    case 'type-position': {
      const out: string[] = [];
      for (const type of pattern.types) {
        for (const position of pattern.positions) {
          out.push(`vl:${pattern.id}:${type}:${position}:${keyName}`);
        }
      }
      return out;
    }
    case 'diatonic-cycle':
      return pattern.startingPositions.map(p => `vl:${pattern.id}:${p}:${keyName}`);
    case 'minor-aba':
      return pattern.positions.map(p => `vl:${pattern.id}:${p}:${keyName}`);
    case 'inversion-4':
      return pattern.positions.map(p => `vl:${pattern.id}:${p}:${keyName}`);
  }
}

/** Discriminated parse result. Carries the patternId for downstream
 *  switching and the full sub-cell dimensions so callers don't need
 *  to re-parse the segments. */
export type VoiceLeadingItemRefDescriptor =
  | {
      patternId: 'five-one';
      kind: 'type-position';
      type: FiveOneType;
      position: VLABPosition;
      keyName: string;
    }
  | {
      patternId: 'major-251';
      kind: 'type-position';
      type: Major251Type;
      position: VLABPosition;
      keyName: string;
    }
  | {
      patternId: 'minor-251';
      kind: 'type-position';
      type: Minor251Type;
      position: VLABPosition;
      keyName: string;
    }
  | {
      patternId: 'diatonic-cycle';
      kind: 'diatonic-cycle';
      startingPosition: DiatonicCyclePosition;
      keyName: string;
    }
  | {
      patternId: 'minor-aba';
      kind: 'minor-aba';
      position: MinorAbaPosition;
      keyName: string;
    }
  | {
      patternId: 'dom7b9' | 'dim7';
      kind: 'inversion-4';
      position: InversionPosition;
      keyName: string;
    };

const KEY_SET: ReadonlySet<string> = new Set(KEYS);

function isVLABPosition(s: string): s is VLABPosition {
  return s === 'A' || s === 'B';
}
function isFiveOneType(s: string): s is FiveOneType {
  return s === 'guide-tones' || s === 'seventh-chords' || s === 'full-voicing';
}
function isMajor251Type(s: string): s is Major251Type {
  return s === 'guide-tones' || s === 'seventh-chords' || s === 'aba-structure';
}
function isMinor251Type(s: string): s is Minor251Type {
  return s === 'guide-tones' || s === 'seventh-chords' || s === 'full-voicing';
}
function isDiatonicCyclePosition(s: string): s is DiatonicCyclePosition {
  return s === 'pos1' || s === 'pos2' || s === 'pos3';
}
function isMinorAbaPosition(s: string): s is MinorAbaPosition {
  return s === 'pos-A' || s === 'pos-B';
}
function isInversionPosition(s: string): s is InversionPosition {
  return s === 'pos1' || s === 'pos2' || s === 'pos3' || s === 'pos4';
}

/**
 * Parse a `vl:` itemRef into a sub-cell descriptor. Dispatches on
 * the patternId in segment 1; downstream segments are validated
 * against the pattern's expected dimensions. Returns null for any
 * shape that doesn't match a known pattern — no back-compat for the
 * earlier `aba-251` / `level1` schema or the pre-Phase-1 3-part
 * shape; no VL spacingState rows pre-date this catalog.
 */
export function parseVoiceLeadingItemRef(
  itemRef: string,
): VoiceLeadingItemRefDescriptor | null {
  const parts = itemRef.split(':');
  if (parts.length < 4 || parts[0] !== 'vl') return null;
  const patternId = parts[1];
  const keyName = parts[parts.length - 1];
  if (!KEY_SET.has(keyName)) return null;

  switch (patternId) {
    case 'five-one': {
      if (parts.length !== 5) return null;
      const type = parts[2];
      const position = parts[3];
      if (!isFiveOneType(type) || !isVLABPosition(position)) return null;
      return { patternId, kind: 'type-position', type, position, keyName };
    }
    case 'major-251': {
      if (parts.length !== 5) return null;
      const type = parts[2];
      const position = parts[3];
      if (!isMajor251Type(type) || !isVLABPosition(position)) return null;
      return { patternId, kind: 'type-position', type, position, keyName };
    }
    case 'minor-251': {
      if (parts.length !== 5) return null;
      const type = parts[2];
      const position = parts[3];
      if (!isMinor251Type(type) || !isVLABPosition(position)) return null;
      return { patternId, kind: 'type-position', type, position, keyName };
    }
    case 'diatonic-cycle': {
      if (parts.length !== 4) return null;
      const startingPosition = parts[2];
      if (!isDiatonicCyclePosition(startingPosition)) return null;
      return { patternId, kind: 'diatonic-cycle', startingPosition, keyName };
    }
    case 'minor-aba': {
      if (parts.length !== 4) return null;
      const position = parts[2];
      if (!isMinorAbaPosition(position)) return null;
      return { patternId, kind: 'minor-aba', position, keyName };
    }
    case 'dom7b9':
    case 'dim7': {
      if (parts.length !== 4) return null;
      const position = parts[2];
      if (!isInversionPosition(position)) return null;
      return { patternId, kind: 'inversion-4', position, keyName };
    }
    default:
      return null;
  }
}

/** Human-friendly type label used in row gutters + modal headers. */
function typeLabel(type: FiveOneType | Major251Type | Minor251Type): string {
  switch (type) {
    case 'guide-tones':    return 'Guide tones';
    case 'seventh-chords': return 'Seventh chords';
    case 'full-voicing':   return 'Full voicing';
    case 'aba-structure':  return 'ABA structure';
  }
}

/** Number for the diatonic-cycle / inversion positions. */
function positionNumber(p: DiatonicCyclePosition | InversionPosition): number {
  switch (p) {
    case 'pos1': return 1;
    case 'pos2': return 2;
    case 'pos3': return 3;
    case 'pos4': return 4;
  }
}

/** Strip the `pos-` prefix from minor-aba positions. */
function minorAbaLetter(p: MinorAbaPosition): 'A' | 'B' {
  return p === 'pos-A' ? 'A' : 'B';
}

/** Human-friendly sub-cell label, suitable for display alongside the
 *  pattern label. Examples:
 *    "Guide tones · Pos A"
 *    "ABA structure · Pos B"
 *    "Starting position 2"
 *    "Position A"        (minor-aba)
 *    "Position 3"        (dom7b9 / dim7)
 */
export function voiceLeadingSubCellLabel(
  desc: VoiceLeadingItemRefDescriptor,
): string {
  switch (desc.kind) {
    case 'type-position':
      return `${typeLabel(desc.type)} · Pos ${desc.position}`;
    case 'diatonic-cycle':
      return `Starting position ${positionNumber(desc.startingPosition)}`;
    case 'minor-aba':
      return `Position ${minorAbaLetter(desc.position)}`;
    case 'inversion-4':
      return `Position ${positionNumber(desc.position)}`;
  }
}

/** One row in the per-sub-dimension heat-grid for a pattern. Each
 *  row corresponds to a unique combination of the pattern's
 *  non-key dimensions; the row's cells are the 12 sub-cells one
 *  per key. */
export interface VoiceLeadingGridRow {
  /** Stable id, unique within the pattern. e.g. "guide-tones:A"
   *  for a type-position pattern, "pos1" for a single-dimension
   *  pattern. */
  rowId: string;
  /** Display label for the row gutter. */
  label: string;
  /** Build the canonical sub-cell itemRef for this row × key. */
  itemRefForKey: (keyName: string) => string;
}

/**
 * Build the per-sub-dimension row list for a pattern. Each row is
 * one drillable sub-cell template across the 12 keys. Pure — no
 * spacingState dependency; the caller layers stage colors on top.
 *
 * Row ordering mirrors the catalog enumeration order so the grid
 * surfaces the simpler types / earlier positions at the top.
 */
export function voiceLeadingGridRows(
  pattern: VoiceLeadingPattern,
): VoiceLeadingGridRow[] {
  switch (pattern.kind) {
    case 'type-position': {
      const out: VoiceLeadingGridRow[] = [];
      for (const type of pattern.types) {
        for (const position of pattern.positions) {
          out.push({
            rowId: `${type}:${position}`,
            label: `${typeLabel(type)} · Pos ${position}`,
            itemRefForKey: (k) => `vl:${pattern.id}:${type}:${position}:${k}`,
          });
        }
      }
      return out;
    }
    case 'diatonic-cycle':
      return pattern.startingPositions.map(p => ({
        rowId: p,
        label: `Starting position ${positionNumber(p)}`,
        itemRefForKey: (k) => `vl:${pattern.id}:${p}:${k}`,
      }));
    case 'minor-aba':
      return pattern.positions.map(p => ({
        rowId: p,
        label: `Position ${minorAbaLetter(p)}`,
        itemRefForKey: (k) => `vl:${pattern.id}:${p}:${k}`,
      }));
    case 'inversion-4':
      return pattern.positions.map(p => ({
        rowId: p,
        label: `Position ${positionNumber(p)}`,
        itemRefForKey: (k) => `vl:${pattern.id}:${p}:${k}`,
      }));
  }
}

export function defaultDrillTypesForVoiceLeading(): DefaultDrill[] {
  return [
    { name: 'Slow and clean',                    suggestedSeconds: 120 },
    { name: 'At target tempo',                   suggestedSeconds: 120 },
    { name: 'Connecting voicings smoothly',      suggestedSeconds: 180 },
  ];
}

/** Minimal spacing-state shape the sub-cell picker needs. Decoupled
 *  from `SpacingState` itself so this module stays free of any
 *  database type imports. */
export interface VoiceLeadingPickerRow {
  itemRef: string;
  nextDueAt: number | null;
}

/**
 * Pick the most-due sub-cell for a given pattern × key. Priority:
 *   1. Sub-cells with no spacingState row (never practised → most due).
 *   2. Sub-cells whose row has `nextDueAt === null` (unscheduled).
 *   3. Sub-cells whose row has the earliest `nextDueAt`.
 *
 * Returns null when the patternId isn't in the catalog (custom
 * patterns); callers fall back to a legacy whole-pattern drill or
 * surface a "no sub-cell catalog" affordance. Pure — tests pass
 * fixture rows directly.
 */
export function pickMostDueVoiceLeadingSubCell(
  patternId: string,
  keyName: string,
  rows: ReadonlyArray<VoiceLeadingPickerRow>,
): string | null {
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);
  if (!pattern) return null;
  const candidates = enumerateVoiceLeadingCells(pattern, keyName);
  if (candidates.length === 0) return null;
  const rowByRef = new Map<string, VoiceLeadingPickerRow>();
  for (const r of rows) rowByRef.set(r.itemRef, r);
  type Tier = 0 | 1 | 2;
  const scored: Array<{ itemRef: string; tier: Tier; nextDueAt: number; idx: number }> = [];
  candidates.forEach((itemRef, idx) => {
    const row = rowByRef.get(itemRef);
    if (!row) {
      scored.push({ itemRef, tier: 0, nextDueAt: 0, idx });
    } else if (row.nextDueAt === null) {
      scored.push({ itemRef, tier: 1, nextDueAt: 0, idx });
    } else {
      scored.push({ itemRef, tier: 2, nextDueAt: row.nextDueAt, idx });
    }
  });
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 2 && a.nextDueAt !== b.nextDueAt) return a.nextDueAt - b.nextDueAt;
    // Stable: catalog enumeration order (idx) breaks ties so the
    // pick stays deterministic across renders.
    return a.idx - b.idx;
  });
  return scored[0].itemRef;
}

// --- Mental visualisation drills -----------------------------------

export interface MentalVizVariant {
  id: string;
  label: string;
  description: string;
}

export const MENTAL_VIZ_VARIANTS: MentalVizVariant[] = [
  {
    id: 'shape-viz',
    label: 'Chord shape visualisation',
    description:
      'The app names a chord and voicing ("Abmaj7 in root position"). Picture the shape, then reveal and self-assess.',
  },
  {
    id: 'mental-transposition',
    label: 'Mental transposition',
    description:
      '"Dm7 in root position is D-F-A-C. Now imagine 1st inversion." Answer from the mental model, then reveal.',
  },
];

// Mental-viz drill types use a card count, NOT a timer. The name
// carries the intent ("5-card set" → 5 flashcards) and the modal
// parses the leading digit. `suggestedSeconds` is left as a rough
// time estimate so heat-grid totals stay meaningful.
export function defaultDrillTypesForMentalViz(): DefaultDrill[] {
  return [
    { name: '5-card set',    suggestedSeconds: 90 },
    { name: '10-card set',   suggestedSeconds: 180 },
    { name: '20-card set',   suggestedSeconds: 360 },
  ];
}

/**
 * Intervals above the root for each chord quality, in root position.
 * Used by the Mental Visualisation flashcards to render the correct
 * notes on the keyboard. Covers the full quality catalog — extensions
 * render as a full stack (9th = 14, 11th = 17, 13th = 21), which is
 * pedagogically a little big but truthful to the label.
 */
export const QUALITY_INTERVALS: Record<string, number[]> = {
  // Triads
  maj:       [0, 4, 7],
  min:       [0, 3, 7],
  dim:       [0, 3, 6],
  aug:       [0, 4, 8],
  sus2:      [0, 2, 7],
  sus4:      [0, 5, 7],
  // Sevenths
  maj7:      [0, 4, 7, 11],
  min7:      [0, 3, 7, 10],
  dom7:      [0, 4, 7, 10],
  m7b5:      [0, 3, 6, 10],
  dim7:      [0, 3, 6, 9],
  mmaj7:     [0, 3, 7, 11],
  // Extensions
  maj9:      [0, 4, 7, 11, 14],
  min9:      [0, 3, 7, 10, 14],
  dom9:      [0, 4, 7, 10, 14],
  maj11:     [0, 4, 7, 11, 14, 17],
  min11:     [0, 3, 7, 10, 14, 17],
  dom11:     [0, 4, 7, 10, 14, 17],
  maj13:     [0, 4, 7, 11, 14, 17, 21],
  min13:     [0, 3, 7, 10, 14, 17, 21],
  dom13:     [0, 4, 7, 10, 14, 17, 21],
  add9:      [0, 4, 7, 14],
  maj7s11:   [0, 4, 7, 11, 18],
  dom7b9:    [0, 4, 7, 10, 13],
  dom7s9:    [0, 4, 7, 10, 15],
  dom7b13:   [0, 4, 7, 10, 20],
  // Special
  maj6:      [0, 4, 7, 9],
  min6:      [0, 3, 7, 9],
  maj6_9:    [0, 4, 7, 9, 14],
};
