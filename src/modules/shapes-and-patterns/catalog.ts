// Catalog data for the Shapes & Patterns module.
//
//   · KEYS                        — 12 pitch names used as grid columns
//   · CHORD_QUALITIES             — the DRILL catalog: 12 qualities
//                                   (6 triads + 6 sevenths). The kind
//                                   drives the default drill-type set
//                                   materialised for a fresh cell.
//                                   NOT the same list as the voicing
//                                   vocabulary — see QUALITY_INTERVALS
//                                   and VOICING_QUALITY_SUFFIX below.
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
import { sortByCircleOfFourths } from '../repertoire/circleOfFourths';

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
export const KEYS_CIRCLE_OF_FOURTHS: ReadonlyArray<KeyName> =
  sortByCircleOfFourths(KEYS) as ReadonlyArray<KeyName>;

/** True when this key name prefers flat spellings in display (kept
 *  consistent with the rest of the app). */
export function keyPrefersFlats(k: string): boolean {
  return /b$/.test(k) || k === 'F';
}

// --- Chord qualities ------------------------------------------------

/**
 * `extension` and `special` are LEGACY-ONLY as of the 20 Aug 2026 cut.
 * No `CHORD_QUALITIES` entry carries them any more, but stored
 * `drillSkills` rows for cut qualities do, and `findOrCreateSkill`'s
 * `?? 'special'` fallback relies on them to give an unknown quality a
 * single no-inversion row — which is exactly how those rows were
 * created. Removing the variants would break that degradation path.
 */
export type QualityKind = 'triad' | 'seventh' | 'extension' | 'special';

export interface ChordQualityEntry {
  id: string;          // stable id used in DrillSkill.quality
  label: string;       // human-facing name
  suffix: string;      // rendered next to a root note ("" / "m" / "maj7" / "m7b5" / …)
  kind: QualityKind;
}

/**
 * The DRILL catalog — 12 qualities, 6 triads and 6 sevenths.
 *
 * Cut from 29 on 20 Aug 2026 (see docs/DASHBOARD_REDESIGN_DESIGN.md
 * § Catalog cuts). The 14 extensions and 3 sixth-family qualities came
 * out for two reasons:
 *
 *   1. Nine of the fourteen extensions were a {maj,min,dom} × {9,11,13}
 *      grid filled completely rather than chosen. Two independently
 *      authored catalogs — this module's own SP_TIERS ladder and ET's
 *      chord-recognition seed list — omit exactly the same six.
 *   2. Extensions carry a five-way VOICING axis (root / skip-a-note /
 *      rootless / two-handed / flowing) that all shares ONE cell, while
 *      a triad's four inversions each get their own. Cmaj13 held five
 *      times the practice of Cmaj root position and counted a quarter
 *      as much. Rather than build that axis for shapes not yet chosen,
 *      the shapes come out until specific ones are wanted.
 *
 * Adding one back is a one-line edit here — itemRefs are
 * `chord-shape:{quality}:{key}:{state}`, catalog-independent strings,
 * so an old quality's spacing state, rep counts and session history all
 * come back live at the stage they were left.
 *
 * This list is NOT what the app can voice. A player can still write
 * Cmaj13 on a lead sheet and get real voicings — that vocabulary lives
 * in QUALITY_INTERVALS / VOICING_QUALITY_SUFFIX and moves independently.
 *
 * Ordering mirrors pedagogical progression so the heat grid's row order
 * matches how players think about their vocabulary.
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
 * `gatesAcquisition()` USED TO LIVE HERE, and it is gone.
 *
 * Its one rule was that `supplementary` rows did not count toward
 * acquisition: they were treated as practice tools rather than shapes
 * to own, and 72 rows — 6 sevenths × 12 keys — sat outside every
 * coverage denominator.
 *
 * REVERSED 20 August 2026. The supplementary row seeds four two-handed
 * drills — LH root with RH triad in root position, 1st and 2nd, plus
 * the fluid drill moving between them — and that is how a seventh chord
 * actually gets played. It is the most realistic voicing of the six,
 * not a tool for practising the others, so it belongs in the number.
 * The chord-shape catalog is 720, and every inversion state gates.
 *
 * The function is deleted rather than left returning `true`, because a
 * guard that always passes is a rule nobody can find and nobody can
 * remove. Every call site now has one fewer thing to remember.
 *
 * =====================================================================
 * REVERSED AGAIN, 31 August 2026, AND THIS TIME ON WHAT THE SHAPE IS
 * RATHER THAN ON HOW IT IS PLAYED.
 *
 * The left-hand root under a right-hand triad is not a distinct shape
 * to own. The triad is already drilled on its own, and the left hand is
 * ONE NOTE — the supplementary state is a combination of two things
 * already counted, not a new hand skill. Owning it is owning the triad,
 * twice.
 *
 * A real voicing — root, third and flat seven in the left hand — IS a
 * different thing. It is not this, and it belongs with voice leading
 * rather than here.
 *
 * So supplementary leaves the score. It is out of `chordCellTargets`
 * (where it always was), out of `countsTowardShapesCoverage`, and out
 * of every denominator, because those are one enumeration now — see
 * `cellTargets.ts`. The chord-shape catalog is 1944: the 72
 * supplementary rows leave, and the hand axis they never had arrives.
 *
 * THE ROWS ARE NOT DELETED. Anyone who drilled the supplementary
 * voicing keeps that history, exactly as the cut qualities do, and it
 * would come back into the count if this were ever reversed a third
 * time.
 *
 * WHAT THIS LEAVES WITH NOWHERE TO LIVE, stated so it is not lost: the
 * same shape under a different root is a different chord — a Cmaj7
 * shape over C is a Cmaj7, over A it is an Am9. That relationship is
 * worth practising and is nobody's module yet. It is not this one.
 * =====================================================================
 *
 * Consequences of the 20 August ruling, since reversed with it: a
 * seventh quality needed six rows covered rather than five, and
 * `tierTotalCells(2)` went 360 → 432. Both go back.
 */

/**
 * True when `quality` is in the current DRILL catalog.
 *
 * The load-bearing use is coverage: practice data for cut qualities is
 * deliberately KEPT (so adding a quality back restores its history),
 * which means `spacingState` still holds rows the denominator no longer
 * counts. Without this filter on the numerator a coverage percentage
 * can exceed 100%.
 */
export function isCatalogQuality(quality: string): boolean {
  return CHORD_QUALITY_BY_ID.has(quality);
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
    // NAMED FOR WHAT YOU PLAY, like the five above it, rather than for
    // how you practise it. It read "Two-handed drills" until 20 Aug
    // 2026, which framed the row as a practice tool — the exact framing
    // reversed when supplementary rows started gating acquisition.
    case 'supplementary': return 'Two-handed voicing';
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
  // Per-inversion drills seed at 60 s: each is now drilled as its own
  // hand × style skill (LH/RH/Both × solid/arpeggiated), so a single
  // standalone pass is ~1 min. Fluid stays longer (synthesis exercise).
  if (kind === 'triad') {
    switch (inversionState) {
      case 'root':  return [{ name: 'Root position (up & down)', suggestedSeconds: 60 }];
      case 'inv1':  return [{ name: '1st inversion (up & down)', suggestedSeconds: 60 }];
      case 'inv2':  return [{ name: '2nd inversion (up & down)', suggestedSeconds: 60 }];
      case 'fluid': return [{ name: 'All inversions fluid',      suggestedSeconds: 120 }];
      default:      return [];
    }
  }
  if (kind === 'seventh') {
    switch (inversionState) {
      case 'root':  return [{ name: 'One-handed root position',        suggestedSeconds: 60 }];
      case 'inv1':  return [{ name: 'One-handed 1st inversion',        suggestedSeconds: 60 }];
      case 'inv2':  return [{ name: 'One-handed 2nd inversion',        suggestedSeconds: 60 }];
      case 'inv3':  return [{ name: 'One-handed 3rd inversion',        suggestedSeconds: 60 }];
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
// Total cells: 34 per key × 12 keys = 408. Breakdown:
//   five-one          7 (2+3+2 — see below)
//   major-251         7 (2+3+2)
//   minor-251         7 (2+3+2)
//   diatonic-cycle    3 (3 starting positions)
//   minor-aba         2 (2 positions)
//   dom7b9            4 (4 inversions of the dominant)
//   dim7              4 (4 inversions of the diminished)

/** Starting-position tag on the type-position patterns.
 *
 *  STORAGE TAG, NOT A DISPLAY STRING. These letters are segments of a
 *  spacingState itemRef — `vl:five-one:guide-tones:A:C` — so they are
 *  frozen by the data, and `C` is simply the next free one. What the
 *  reader sees is decided by `positionLabel`: the numbered types read
 *  "Position 1/2/3", Extended Voicings reads "Pos A/B". */
export type VLABPosition = 'A' | 'B' | 'C';

/** Display number for a storage tag. A is the lowest starting note. */
const VLAB_POSITION_NUMBER: Readonly<Record<VLABPosition, number>> = {
  A: 1, B: 2, C: 3,
};

/**
 * One row group in a type-position pattern: a skill type together
 * with the starting positions THAT TYPE has.
 *
 * POSITIONS ARE PER-TYPE, and that is the whole point of this shape.
 * A rootless seventh chord in the right hand is 3-5-7 — three notes,
 * so three inversions, so three places the hand can start. Guide
 * tones (two notes) and the extended voicing have two. The catalog
 * used to hang one position list off the pattern and hand the same
 * two to all three types, which is how Seventh Chords ended up a
 * position short everywhere except the Diatonic Cycle.
 */
export interface VLTypeRow<T extends string> {
  type: T;
  positions: ReadonlyArray<VLABPosition>;
}

/** Types for the 5→1 movement pattern. */
export type FiveOneType = 'guide-tones' | 'seventh-chords' | 'full-voicing';
/** Types for the Major 2-5-1 pattern.
 *
 *  `aba-structure` and `five-one`/`minor-251`'s `full-voicing` are ONE
 *  ROW UNDER TWO IDS — both display as "Extended Voicings". The ids
 *  are kept apart because they are spacingState keys: collapsing them
 *  would orphan every rep already logged against `aba-structure`.
 *  Merging the ids needs a migration and is deliberately not done
 *  here. */
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
      types: ReadonlyArray<VLTypeRow<FiveOneType>>;
    }
  | {
      id: 'major-251';
      kind: 'type-position';
      label: string;
      description?: string;
      types: ReadonlyArray<VLTypeRow<Major251Type>>;
    }
  | {
      id: 'minor-251';
      kind: 'type-position';
      label: string;
      description?: string;
      types: ReadonlyArray<VLTypeRow<Minor251Type>>;
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
    description: 'The last two chords of a 2-5-1 — for when you want tension resolving home without the full turnaround, or to tonicise a chord.',
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: 'major-251',
    kind: 'type-position',
    label: 'Major 2-5-1',
    description: 'The foundational ii → V → I movement. Guide tones and extended voicings across two starting positions; seventh chords across three.',
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'aba-structure',  positions: ['A', 'B'] },
    ],
  },
  {
    id: 'minor-251',
    kind: 'type-position',
    label: 'Minor 2-5-1',
    description: 'The iiø → V → i movement. Guide tones and extended voicings across two starting positions; seventh chords across three.',
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
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
    case 'type-position':
      return pattern.types.reduce((n, t) => n + t.positions.length, 0);
    case 'diatonic-cycle': return pattern.startingPositions.length;
    case 'minor-aba':      return pattern.positions.length;
    case 'inversion-4':    return pattern.positions.length;
  }
}

/** Total VL cell count across the whole catalog: sum of per-pattern
 *  fan-outs × number of keys. 408 today (34 sub-cells/key × 12). */
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
      for (const { type, positions } of pattern.types) {
        for (const position of positions) {
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
  return s === 'A' || s === 'B' || s === 'C';
}

/** True when `position` is one the pattern actually gives that type.
 *  Positions are per-type now, so a global letter check would accept
 *  `guide-tones:C`, which no grid draws and no drill can run. */
function typeHasPosition(
  patternId: string,
  type: string,
  position: VLABPosition,
): boolean {
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);
  if (!pattern || pattern.kind !== 'type-position') return false;
  const row = pattern.types.find(t => t.type === type);
  return row ? row.positions.includes(position) : false;
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
      if (!typeHasPosition(patternId, type, position)) return null;
      return { patternId, kind: 'type-position', type, position, keyName };
    }
    case 'major-251': {
      if (parts.length !== 5) return null;
      const type = parts[2];
      const position = parts[3];
      if (!isMajor251Type(type) || !isVLABPosition(position)) return null;
      if (!typeHasPosition(patternId, type, position)) return null;
      return { patternId, kind: 'type-position', type, position, keyName };
    }
    case 'minor-251': {
      if (parts.length !== 5) return null;
      const type = parts[2];
      const position = parts[3];
      if (!isMinor251Type(type) || !isVLABPosition(position)) return null;
      if (!typeHasPosition(patternId, type, position)) return null;
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
    case 'guide-tones':    return 'Guide Tones';
    case 'seventh-chords': return 'Seventh Chords';
    // ONE NAME FOR ONE THING. These are the same row, and the old
    // names disagreed about what it was. "ABA structure" was also
    // simply wrong on the 5→1: it names a three-chord alternation
    // and that pattern has two chords.
    case 'full-voicing':   return 'Extended Voicings';
    case 'aba-structure':  return 'Extended Voicings';
  }
}

/** Everything a position label needs, and nothing else. Both the grid
 *  gutter and the modal header build their labels through
 *  `positionLabel` with one of these, so the page cannot say two
 *  things about one cell. */
export type VLPositionSlot =
  | {
      kind: 'type-position';
      type: FiveOneType | Major251Type | Minor251Type;
      position: VLABPosition;
    }
  | { kind: 'diatonic-cycle'; position: DiatonicCyclePosition }
  | { kind: 'minor-aba';      position: MinorAbaPosition }
  | { kind: 'inversion-4';    position: InversionPosition };

/**
 * THE ONE PLACE A POSITION IS NAMED, for all seven patterns.
 *
 * Five of the six row families count the same thing — which note the
 * right hand starts on — so they share one format, "Position <token>",
 * and differ only in whether the token is a number or a letter:
 *
 *   · Guide Tones, Seventh Chords, Diatonic Cycle — numbers. The
 *     position is just where the hand starts: 1 on the 3rd, 2 on the
 *     5th, 3 on the 7th. The Diatonic Cycle used to say "Starting
 *     position 1" for this, which was a second name for one idea and
 *     the only label on the page that was not Title Case.
 *   · Extended Voicings and Minor ABA — letters, because A and B are
 *     a real convention there rather than an ordinal: the A voicing
 *     starts the ii from its 3rd, the B voicing from its 7th. They
 *     used to disagree about the format anyway ("Pos A" against
 *     "Position A") while meaning the same thing.
 *
 * dom7b9 AND dim7 ARE THE EXCEPTION, AND THEY STAY DIFFERENT ON
 * PURPOSE. Those rows count inversions of the dominant (or of the
 * dim7), not where the right hand starts, so "Position 2" there meant
 * something else entirely from "Position 2" on the Seventh Chords row
 * directly above. A shared format is the goal; a shared lie is not.
 * They now name the inversion — and the first of them is root
 * position, which is not an inversion at all, which is exactly the
 * fact the old numbering hid.
 */
function positionLabel(slot: VLPositionSlot): string {
  switch (slot.kind) {
    case 'type-position':
      switch (slot.type) {
        case 'full-voicing':
        case 'aba-structure':
          return `Position ${slot.position}`;
        case 'guide-tones':
        case 'seventh-chords':
          return `Position ${VLAB_POSITION_NUMBER[slot.position]}`;
      }
      break;
    case 'diatonic-cycle':
      return `Position ${positionNumber(slot.position)}`;
    case 'minor-aba':
      return `Position ${minorAbaLetter(slot.position)}`;
    case 'inversion-4':
      return INVERSION_LABEL[slot.position];
  }
}

/** What the dom7b9 / dim7 rows actually count. `pos1` is the chord in
 *  root position — the reason these cannot borrow "Position N". */
const INVERSION_LABEL: Readonly<Record<InversionPosition, string>> = {
  pos1: 'Root Position',
  pos2: '1st Inversion',
  pos3: '2nd Inversion',
  pos4: '3rd Inversion',
};

/** What "extended" means here, for the two ids that share the name.
 *  Shown beside the row label — the name says which row, the hint
 *  says what you actually play. */
function typeHint(type: FiveOneType | Major251Type | Minor251Type): string | undefined {
  switch (type) {
    case 'full-voicing':
    case 'aba-structure':
      return '9ths added, 13ths on the dominant';
    case 'guide-tones':
    case 'seventh-chords':
      return undefined;
  }
}

/** Number for the diatonic-cycle positions. The inversion
 *  patterns name their inversion instead — see INVERSION_LABEL. */
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
 *    "Guide Tones · Position 1"
 *    "Seventh Chords · Position 3"
 *    "Extended Voicings · Position B"
 *    "Position 2"        (diatonic-cycle)
 *    "Position A"        (minor-aba)
 *    "2nd Inversion"     (dom7b9 / dim7 — they count inversions)
 */
export function voiceLeadingSubCellLabel(
  desc: VoiceLeadingItemRefDescriptor,
): string {
  switch (desc.kind) {
    case 'type-position':
      return `${typeLabel(desc.type)} · ${positionLabel(desc)}`;
    case 'diatonic-cycle':
      return positionLabel({ kind: 'diatonic-cycle', position: desc.startingPosition });
    case 'minor-aba':
      return positionLabel(desc);
    case 'inversion-4':
      return positionLabel(desc);
  }
}

/**
 * The row a sub-cell belongs to, from its descriptor.
 *
 * ONE CONSTRUCTION, USED BY BOTH SIDES. `voiceLeadingGridRows` builds
 * these ids when it draws the grid; anything filing something against
 * a row — the reader's notes, for one — has to arrive at the same
 * string from an itemRef, and a second copy of the rule is how a note
 * written on a cell comes to be filed under a row that does not exist.
 */
export function voiceLeadingRowId(desc: VoiceLeadingItemRefDescriptor): string {
  switch (desc.kind) {
    case 'type-position':  return `${desc.type}:${desc.position}`;
    case 'diatonic-cycle': return desc.startingPosition;
    case 'minor-aba':      return desc.position;
    case 'inversion-4':    return desc.position;
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
  /** Muted second line under the label, when the name alone does not
   *  say what the row is. Only Extended Voicings has one today. */
  hint?: string;
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
      for (const { type, positions } of pattern.types) {
        for (const position of positions) {
          out.push({
            rowId: voiceLeadingRowId({ kind: 'type-position', type, position } as VoiceLeadingItemRefDescriptor),
            label: `${typeLabel(type)} · ${positionLabel({ kind: 'type-position', type, position })}`,
            hint: typeHint(type),
            itemRefForKey: (k) => `vl:${pattern.id}:${type}:${position}:${k}`,
          });
        }
      }
      return out;
    }
    case 'diatonic-cycle':
      return pattern.startingPositions.map(p => ({
        rowId: p,
        label: positionLabel({ kind: 'diatonic-cycle', position: p }),
        itemRefForKey: (k) => `vl:${pattern.id}:${p}:${k}`,
      }));
    case 'minor-aba':
      return pattern.positions.map(p => ({
        rowId: p,
        label: positionLabel({ kind: 'minor-aba', position: p }),
        itemRefForKey: (k) => `vl:${pattern.id}:${p}:${k}`,
      }));
    case 'inversion-4':
      return pattern.positions.map(p => ({
        rowId: p,
        label: positionLabel({ kind: 'inversion-4', position: p }),
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

// --- Voicing-engine vocabulary (independent of the drill catalog) ---

/**
 * WHY THIS IS SEPARATE FROM `CHORD_QUALITIES`
 *
 * `CHORD_QUALITIES` used to do two unrelated jobs: name what the
 * player *drills*, and name what the app can *voice*. Cutting the
 * drill catalog to triads + sevenths (20 Aug 2026, see
 * docs/DASHBOARD_REDESIGN_DESIGN.md § Catalog cuts) silently broke the
 * second job — the lead-sheet voicing carousel derives its system
 * patterns from the catalog and auto-prunes rows that fall out of it,
 * and `voicingQualityMap` built its suffix table from it, so a `C6/9`
 * on a chart resolved to a dominant-7 voicing.
 *
 * The two are now independent. `QUALITY_INTERVALS` above and the
 * groupings below are the voicing engine's vocabulary: every chord the
 * app can spell, render and offer as a carousel candidate. They change
 * only when the app learns a new chord — never because the drill
 * catalog grew or shrank.
 *
 * Ordering is the historical `CHORD_QUALITIES` order so seeded
 * voicing-pattern ids and sort orders stay byte-identical across the
 * split (no spurious prune-and-reseed on upgrade).
 */

/** Triads — the carousel gives each a full 3-inversion set. */
export const VOICING_TRIAD_IDS: ReadonlyArray<string> = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
];

/** Seventh chords — the carousel gives each a full 4-inversion set. */
export const VOICING_SEVENTH_IDS: ReadonlyArray<string> = [
  'maj7', 'min7', 'dom7', 'm7b5', 'dim7', 'mmaj7',
];

/** Extensions — one root-position stack each in the carousel. These
 *  are NOT in the drill catalog; they exist so a chart can spell them
 *  and the mental-viz answer set can offer them as distractors. */
export const VOICING_EXTENSION_IDS: ReadonlyArray<string> = [
  'maj9', 'min9', 'dom9', 'maj11', 'min11', 'dom11',
  'maj13', 'min13', 'dom13', 'add9', 'maj7s11',
  'dom7b9', 'dom7s9', 'dom7b13',
];

/** Sixth-family voicings — one root-position stack each. Same
 *  rationale as extensions. */
export const VOICING_SPECIAL_IDS: ReadonlyArray<string> = [
  'maj6', 'min6', 'maj6_9',
];

/**
 * Canonical display suffix for every voicing-engine quality id — the
 * form a player types on a lead sheet. Alternate spellings are folded
 * to these in `voicingQualityMap.ALTERNATE_TO_CANONICAL`.
 *
 * Every key here must exist in `QUALITY_INTERVALS`; the unit test
 * pins both directions so the two can never drift.
 */
export const VOICING_QUALITY_SUFFIX: Readonly<Record<string, string>> = {
  // Triads — the bare root is the standard notation for major.
  maj: '',        min: 'm',       dim: '°',       aug: '+',
  sus2: 'sus2',   sus4: 'sus4',
  // Sevenths
  maj7: 'maj7',   min7: 'm7',     dom7: '7',      m7b5: 'm7b5',
  dim7: '°7',     mmaj7: 'm(maj7)',
  // Extensions
  maj9: 'maj9',   min9: 'm9',     dom9: '9',
  maj11: 'maj11', min11: 'm11',   dom11: '11',
  maj13: 'maj13', min13: 'm13',   dom13: '13',
  add9: 'add9',   maj7s11: 'maj7#11',
  dom7b9: '7b9',  dom7s9: '7#9',  dom7b13: '7b13',
  // Special / sixth
  maj6: '6',      min6: 'm6',     maj6_9: '6/9',
};
