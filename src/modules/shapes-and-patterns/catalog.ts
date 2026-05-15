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

export const KEYS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;
export type KeyName = typeof KEYS[number];

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
// The VL catalog defines five passing-chord patterns drilled across
// all 12 keys. Each pattern fans out into multiple sub-cells per key
// — different voicing levels, starting positions, resolution targets,
// or directions — so the spacing system can surface the right level
// of detail.
//
// itemRef shape: `vl:{patternId}:{seg1}:{seg2?}:{keyName}` where the
// sub-segments depend on the pattern's `kind`. See
// `parseVoiceLeadingItemRef` for the canonical parse + the dimensions
// per pattern. Total cells: 27 per key × 12 keys = 324.
//
// See src/docs/VOICE_LEADING_SUBMODULE_DESIGN.md for the full spec.

export type VLLevel = 'level1' | 'level2' | 'level3';
export type VLPosition = 'A' | 'B';
export type VLCyclePos = 'pos1' | 'pos2' | 'pos3';
export type VLMinTarget = 'min7' | 'min9' | 'min11';
export type VLDim7Direction = 'up' | 'down';
export type VLDim7Target = 'mintriad' | 'min7' | 'min9';

/** Discriminated catalog entry for each VL pattern. The `kind` field
 *  drives enumeration and parsing — adding a new pattern shape
 *  involves adding a new variant here plus its parse + enumerate
 *  branches below. No call site should switch on `id` directly. */
export type VoiceLeadingPattern =
  | {
      id: 'aba-251';
      kind: 'aba-251';
      label: string;
      description?: string;
      levels: ReadonlyArray<VLLevel>;
      positions: ReadonlyArray<VLPosition>;
    }
  | {
      id: 'diatonic-cycle';
      kind: 'diatonic-cycle';
      label: string;
      description?: string;
      startingPositions: ReadonlyArray<VLCyclePos>;
    }
  | {
      id: 'dom-sharp9sharp5' | 'dom7b9';
      kind: 'dom-altered';
      label: string;
      description?: string;
      positions: ReadonlyArray<VLPosition>;
      targets: ReadonlyArray<VLMinTarget>;
    }
  | {
      id: 'dim7';
      kind: 'dim7-passing';
      label: string;
      description?: string;
      directions: ReadonlyArray<VLDim7Direction>;
      targets: ReadonlyArray<VLDim7Target>;
    };

export const VOICE_LEADING_PATTERNS: ReadonlyArray<VoiceLeadingPattern> = [
  {
    id: 'aba-251',
    kind: 'aba-251',
    label: 'ABA / BAB 2-5-1',
    description: 'Foundational ii → V → I voice leading. Three voicing levels (guide tones → 7ths → full color) and two starting positions (ABA / BAB).',
    levels: ['level1', 'level2', 'level3'],
    positions: ['A', 'B'],
  },
  {
    id: 'diatonic-cycle',
    kind: 'diatonic-cycle',
    label: '1-4-7-3-6-2-5-1 diatonic cycle',
    description: 'Full diatonic cycle in 7th chords across three starting inversions.',
    startingPositions: ['pos1', 'pos2', 'pos3'],
  },
  {
    id: 'dom-sharp9sharp5',
    kind: 'dom-altered',
    label: 'dom7♯9♯5 → minor',
    description: 'Dark altered dominant resolving a 5th down to minor. Three resolution targets per position.',
    positions: ['A', 'B'],
    targets: ['min7', 'min9', 'min11'],
  },
  {
    id: 'dom7b9',
    kind: 'dom-altered',
    label: 'dom7♭9 → minor',
    description: 'Right-hand dim7 voicing over dominant bass, resolving a 5th down to minor.',
    positions: ['A', 'B'],
    targets: ['min7', 'min9', 'min11'],
  },
  {
    id: 'dim7',
    kind: 'dim7-passing',
    label: 'dim7 → minor (passing)',
    description: 'Diminished passing chord resolving a half step up or down to minor.',
    directions: ['up', 'down'],
    targets: ['mintriad', 'min7', 'min9'],
  },
];

/** Index for parse-by-patternId. */
export const VOICE_LEADING_PATTERN_BY_ID = new Map<string, VoiceLeadingPattern>(
  VOICE_LEADING_PATTERNS.map(p => [p.id, p]),
);

/**
 * Enumerate every sub-cell itemRef for `pattern` in `keyName`. The
 * cardinality depends on the pattern's kind (3, 6, or up to 9 cells
 * per key — see design doc § Pattern Definitions). Pure.
 */
/** Count of sub-cells for `pattern` (key-invariant — every key
 *  fans out into the same dimension product). */
export function voiceLeadingCellsPerKey(pattern: VoiceLeadingPattern): number {
  switch (pattern.kind) {
    case 'aba-251':       return pattern.levels.length * pattern.positions.length;
    case 'diatonic-cycle': return pattern.startingPositions.length;
    case 'dom-altered':   return pattern.positions.length * pattern.targets.length;
    case 'dim7-passing':  return pattern.directions.length * pattern.targets.length;
  }
}

/** Total VL cell count across the whole catalog: sum of per-pattern
 *  fan-outs × number of keys. 324 today (27 sub-cells/key × 12). */
export function voiceLeadingTotalCellCount(): number {
  return VOICE_LEADING_PATTERNS.reduce(
    (sum, p) => sum + voiceLeadingCellsPerKey(p), 0,
  ) * KEYS.length;
}

export function enumerateVoiceLeadingCells(
  pattern: VoiceLeadingPattern,
  keyName: string,
): string[] {
  switch (pattern.kind) {
    case 'aba-251': {
      const out: string[] = [];
      for (const level of pattern.levels) {
        for (const position of pattern.positions) {
          out.push(`vl:${pattern.id}:${level}:${position}:${keyName}`);
        }
      }
      return out;
    }
    case 'diatonic-cycle':
      return pattern.startingPositions.map(p => `vl:${pattern.id}:${p}:${keyName}`);
    case 'dom-altered': {
      const out: string[] = [];
      for (const position of pattern.positions) {
        for (const target of pattern.targets) {
          out.push(`vl:${pattern.id}:${position}:${target}:${keyName}`);
        }
      }
      return out;
    }
    case 'dim7-passing': {
      const out: string[] = [];
      for (const direction of pattern.directions) {
        for (const target of pattern.targets) {
          out.push(`vl:${pattern.id}:${direction}:${target}:${keyName}`);
        }
      }
      return out;
    }
  }
}

/** Discriminated parse result. Carries the patternId for downstream
 *  switching and the full sub-cell dimensions so callers don't need
 *  to re-parse the segments. */
export type VoiceLeadingItemRefDescriptor =
  | {
      patternId: 'aba-251';
      kind: 'aba-251';
      level: VLLevel;
      position: VLPosition;
      keyName: string;
    }
  | {
      patternId: 'diatonic-cycle';
      kind: 'diatonic-cycle';
      startingPosition: VLCyclePos;
      keyName: string;
    }
  | {
      patternId: 'dom-sharp9sharp5' | 'dom7b9';
      kind: 'dom-altered';
      position: VLPosition;
      target: VLMinTarget;
      keyName: string;
    }
  | {
      patternId: 'dim7';
      kind: 'dim7-passing';
      direction: VLDim7Direction;
      target: VLDim7Target;
      keyName: string;
    };

const KEY_SET: ReadonlySet<string> = new Set(KEYS);

function isVLLevel(s: string): s is VLLevel {
  return s === 'level1' || s === 'level2' || s === 'level3';
}
function isVLPosition(s: string): s is VLPosition {
  return s === 'A' || s === 'B';
}
function isVLCyclePos(s: string): s is VLCyclePos {
  return s === 'pos1' || s === 'pos2' || s === 'pos3';
}
function isVLMinTarget(s: string): s is VLMinTarget {
  return s === 'min7' || s === 'min9' || s === 'min11';
}
function isVLDim7Direction(s: string): s is VLDim7Direction {
  return s === 'up' || s === 'down';
}
function isVLDim7Target(s: string): s is VLDim7Target {
  return s === 'mintriad' || s === 'min7' || s === 'min9';
}

/**
 * Parse a `vl:` itemRef into a sub-cell descriptor. Dispatches on
 * the patternId in segment 1; downstream segments are validated
 * against the pattern's expected dimensions. Returns null for
 * anything that doesn't match a known pattern shape — including the
 * legacy 3-part `vl:{patternId}:{keyName}` form, which is no longer
 * a valid sub-cell (callers that need legacy-tolerant parsing for
 * label purposes should use `parseShapesItemRef` instead).
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
    case 'aba-251': {
      if (parts.length !== 5) return null;
      const level = parts[2];
      const position = parts[3];
      if (!isVLLevel(level) || !isVLPosition(position)) return null;
      return { patternId, kind: 'aba-251', level, position, keyName };
    }
    case 'diatonic-cycle': {
      if (parts.length !== 4) return null;
      const startingPosition = parts[2];
      if (!isVLCyclePos(startingPosition)) return null;
      return { patternId, kind: 'diatonic-cycle', startingPosition, keyName };
    }
    case 'dom-sharp9sharp5':
    case 'dom7b9': {
      if (parts.length !== 5) return null;
      const position = parts[2];
      const target = parts[3];
      if (!isVLPosition(position) || !isVLMinTarget(target)) return null;
      return { patternId, kind: 'dom-altered', position, target, keyName };
    }
    case 'dim7': {
      if (parts.length !== 5) return null;
      const direction = parts[2];
      const target = parts[3];
      if (!isVLDim7Direction(direction) || !isVLDim7Target(target)) return null;
      return { patternId, kind: 'dim7-passing', direction, target, keyName };
    }
    default:
      return null;
  }
}

/** Human-friendly sub-cell label, suitable for display alongside the
 *  pattern label. e.g. "Level 1, Position A" / "Starting position 1"
 *  / "Position A → min9" / "Half step up → min9". */
export function voiceLeadingSubCellLabel(
  desc: VoiceLeadingItemRefDescriptor,
): string {
  switch (desc.kind) {
    case 'aba-251': {
      const levelText =
        desc.level === 'level1' ? 'Level 1'
          : desc.level === 'level2' ? 'Level 2'
            : 'Level 3';
      return `${levelText}, Position ${desc.position}`;
    }
    case 'diatonic-cycle': {
      const n = desc.startingPosition === 'pos1' ? 1
        : desc.startingPosition === 'pos2' ? 2 : 3;
      return `Starting position ${n}`;
    }
    case 'dom-altered': {
      const t = desc.target === 'min7' ? 'min7'
        : desc.target === 'min9' ? 'min9' : 'min11';
      return `Position ${desc.position} → ${t}`;
    }
    case 'dim7-passing': {
      const dir = desc.direction === 'up' ? 'Half step up' : 'Half step down';
      const t = desc.target === 'mintriad' ? 'min triad'
        : desc.target === 'min7' ? 'min7' : 'min9';
      return `${dir} → ${t}`;
    }
  }
}

export function defaultDrillTypesForVoiceLeading(): DefaultDrill[] {
  return [
    { name: 'Slow and clean',                    suggestedSeconds: 120 },
    { name: 'At target tempo',                   suggestedSeconds: 120 },
    { name: 'Connecting voicings smoothly',      suggestedSeconds: 180 },
  ];
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
