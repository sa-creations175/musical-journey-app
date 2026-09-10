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
import {
  EXTENDED_QUALITY_OF,
  extendedShape,
  type ExtendedPosition,
  type ExtendedQuality,
  type ExtendedShape,
} from '../../lib/extendedVoicings';
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
// Total cells: 69 per key × 12 keys = 828. Breakdown:
//   five-one          7 (2+3+2 — see below)
//   major-251         7 (2+3+2)
//   1-5-6-4           7 (2+3+2)
//   1-6-4-5           7 (2+3+2)
//   1-6-2-5           7 (2+3+2)
//   1-4-5             7 (2+3+2)
//   backdoor          7 (2+3+2)
//   minor-251         7 (2+3+2)
//   diatonic-cycle    3 (3 starting positions)
//   minor-aba         2 (2 positions)
//   dom7b9            4 (4 starting positions)
//   dim7              4 (4 starting positions)
//
// (9 Sep 2026: 34 → 69 per key. The five named progressions the
//  ear-training catalog kept were added as drill rows.)

/** Starting-position tag on the type-position patterns.
 *
 *  STORAGE TAG, NOT A DISPLAY STRING. These letters are segments of a
 *  spacingState itemRef — `vl:five-one:guide-tones:A:C` — so they are
 *  frozen by the data, and `C` is simply the next free one. What the
 *  reader sees is decided by `positionLabel`, and since 9 Sep 2026
 *  that is "Position 1/2/3" on every row of the page. */
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

/**
 * The five named progressions added on 9 Sep 2026. They are shaped
 * exactly like Major 2-5-1 — the same three types across the same
 * positions — and they share one variant rather than getting five
 * near-identical ones, because nothing about them differs but the
 * chords.
 */
export type ProgressionVLId =
  | '1-5-6-4' | '1-6-4-5' | '1-6-2-5' | '1-4-5' | 'backdoor';
/** Their types. The same three as the Minor 2-5-1; `full-voicing` is
 *  the canonical id for the Extended Voicings row (`aba-structure` is
 *  Major 2-5-1's legacy spelling of the same thing, kept only because
 *  reps are logged against it). */
export type ProgressionVLType = Minor251Type;

/**
 * One chord of a pattern, as data rather than as a sentence.
 *
 * =====================================================================
 * THE PAGE KNEW ITS CHORDS ONLY IN PROSE, AND THAT IS WHY THIS EXISTS.
 *
 * A pattern carried a `label` and a `description` and nothing else, so
 * "The foundational ii → V → I movement" was the only place the app
 * said which chords Major 2-5-1 moves through. Nothing could play the
 * row, nothing could draw it on a keyboard, and no flashcard could be
 * generated from it — every one of those would have had to parse
 * English.
 *
 * SPELLED THE WAY THE DECK SPELLS THEM. The degree is the deck's
 * degree string (`'1'`, `'b7'`) and the quality is the deck's quality
 * string (`''`, `'m7'`, `'maj7'`, `'7'`, `'m7b5'`), so a Harmonic
 * Fluency card and a pass are naming chords in one vocabulary.
 *
 * IT IS THE SEVENTH-CHORD READING, which is the row the ladder is
 * built around: Guide Tones takes two notes out of these chords and
 * Extended Voicings adds ninths to them (and thirteenths on the
 * dominant, which is what that row's hint says). One reading, three
 * types, rather than three lists that could disagree.
 * =====================================================================
 */
export interface VLChord {
  /** Degree of the key the chord is built on, as the deck writes it:
   *  '1', '2', '4', '5', '6', 'b7'. */
  degree: string;
  /** Quality, as the deck writes it: '' (major triad), 'm7', 'maj7',
   *  '7', 'm7b5', 'dim7', '7b9', '7#9#5'. THE SEVENTH-CHORD READING —
   *  see the header above. */
  quality: string;
  /**
   * The quality this chord takes on the EXTENDED VOICINGS row, when
   * that is a different chord in each position.
   *
   * =====================================================================
   * ONE ROW WHERE THE CHORD ITSELF CHANGES WITH THE POSITION, and it is
   * the minor 2 5 1's 5. Silas's notes voice it as a 7♯5 in the ABA run
   * and as a 7(♭9♯9♭13) in the BAB run — not two voicings of one chord
   * but two chords, each written for one run and neither given a second
   * position.
   *
   * OMITTED EVERYWHERE ELSE, and omitted is not a gap: every other
   * chord's extended reading follows from its seventh-chord quality
   * (`EXTENDED_QUALITY_OF`), so writing it out again would be a second
   * copy that could disagree. `voiceLeadingExtendedRun` is the one
   * place that reads either.
   * =====================================================================
   */
  extendedQuality?: Readonly<Record<ExtendedPosition, string>>;
}

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
      chords: ReadonlyArray<VLChord>;
      types: ReadonlyArray<VLTypeRow<FiveOneType>>;
    }
  | {
      id: 'major-251';
      kind: 'type-position';
      label: string;
      description?: string;
      chords: ReadonlyArray<VLChord>;
      types: ReadonlyArray<VLTypeRow<Major251Type>>;
    }
  | {
      id: 'minor-251';
      kind: 'type-position';
      label: string;
      description?: string;
      chords: ReadonlyArray<VLChord>;
      types: ReadonlyArray<VLTypeRow<Minor251Type>>;
    }
  | {
      id: ProgressionVLId;
      kind: 'type-position';
      label: string;
      description?: string;
      chords: ReadonlyArray<VLChord>;
      types: ReadonlyArray<VLTypeRow<ProgressionVLType>>;
    }
  | {
      id: 'diatonic-cycle';
      kind: 'diatonic-cycle';
      label: string;
      description?: string;
      chords: ReadonlyArray<VLChord>;
      startingPositions: ReadonlyArray<DiatonicCyclePosition>;
    }
  | {
      id: 'minor-aba';
      kind: 'minor-aba';
      label: string;
      description?: string;
      chords: ReadonlyArray<VLChord>;
      positions: ReadonlyArray<MinorAbaPosition>;
    }
  | {
      id: 'dom7b9' | 'dim7';
      kind: 'inversion-4';
      label: string;
      description?: string;
      chords: ReadonlyArray<VLChord>;
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
    chords: [
      { degree: '1', quality: 'maj7' },
      { degree: '4', quality: 'maj7' },
      { degree: '7', quality: 'm7b5' },
      { degree: '3', quality: 'm7' },
      { degree: '6', quality: 'm7' },
      { degree: '2', quality: 'm7' },
      { degree: '5', quality: '7' },
      { degree: '1', quality: 'maj7' },
    ],
    startingPositions: ['pos1', 'pos2', 'pos3'],
  },
  {
    id: 'five-one',
    kind: 'type-position',
    label: '5→1 Movement',
    description: 'The last two chords of a 2-5-1 — for when you want tension resolving home without the full turnaround, or to tonicise a chord.',
    chords: [
      { degree: '5', quality: '7' },
      { degree: '1', quality: 'maj7' },
    ],
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
    chords: [
      { degree: '2', quality: 'm7' },
      { degree: '5', quality: '7' },
      { degree: '1', quality: 'maj7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'aba-structure',  positions: ['A', 'B'] },
    ],
  },
  /**
   * =================================================================
   * THE FIVE NAMED PROGRESSIONS, ADDED 9 SEP 2026.
   *
   * Shaped exactly like Major 2-5-1 and placed straight after it, per
   * Silas's ruling. They are the progressions the ear-training
   * catalog kept, arriving on the page where they are PLAYED rather
   * than only heard.
   *
   * THE DESCRIPTIONS STATE THE CHORDS AND STOP. Every other
   * description on this page says what its pattern is for, and those
   * were written when the pattern was designed. These are new rows
   * for progressions the app already teaches elsewhere; a sentence
   * about how each one is used would be new copy about music, which
   * is Silas's to write and not this file's to guess.
   *
   * NO SEEDED REPS. Nothing here writes a spacing row. Every cell
   * starts unstarted and the cold-start, ordering and proficiency
   * logic reads them exactly as it reads any other zero-rep cell.
   * =================================================================
   */
  {
    id: '1-5-6-4',
    kind: 'type-position',
    label: '1 5 6 4',
    description: 'The 1, the 5, the 6 minor and the 4.',
    chords: [
      { degree: '1', quality: 'maj7' },
      { degree: '5', quality: '7' },
      { degree: '6', quality: 'm7' },
      { degree: '4', quality: 'maj7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: '1-6-4-5',
    kind: 'type-position',
    label: '1 6 4 5',
    description: 'The 1, the 6 minor, the 4 and the 5.',
    chords: [
      { degree: '1', quality: 'maj7' },
      { degree: '6', quality: 'm7' },
      { degree: '4', quality: 'maj7' },
      { degree: '5', quality: '7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: '1-6-2-5',
    kind: 'type-position',
    label: '1 6 2 5',
    description: 'The 1, the 6 minor, the 2 minor and the 5.',
    chords: [
      { degree: '1', quality: 'maj7' },
      { degree: '6', quality: 'm7' },
      { degree: '2', quality: 'm7' },
      { degree: '5', quality: '7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: '1-4-5',
    kind: 'type-position',
    label: '1 4 5',
    description: 'The 1, the 4 and the 5, back to the 1.',
    chords: [
      { degree: '1', quality: 'maj7' },
      { degree: '4', quality: 'maj7' },
      { degree: '5', quality: '7' },
      { degree: '1', quality: 'maj7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: 'backdoor',
    kind: 'type-position',
    /**
     * THE BACKDOOR IS 4 MINOR → ♭7(7) → 1. Verified with Silas on
     * 9 Sep 2026, replacing the 1 4 ♭7 1 this row shipped with.
     *
     * "4m and ♭7(7) are both part of the parallel minor chords" — the
     * progression is the two borrowed chords resolving home, and a 4
     * MAJOR in front of the ♭7 is the diatonic chord rather than the
     * borrowed one. The leading 1 went with it: what the row teaches
     * starts on the 4 minor.
     *
     * THE ROW, THE CELLS AND THE itemRefs DID NOT MOVE. `backdoor` is
     * the same pattern id across the same three types and the same
     * positions, so every rep logged against it still reads.
     */
    label: '4m ♭7 1 (backdoor)',
    description: 'The 4 minor, the flat 7 and the 1.',
    chords: [
      { degree: '4', quality: 'm7' },
      { degree: 'b7', quality: '7' },
      { degree: '1', quality: 'maj7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: 'minor-251',
    kind: 'type-position',
    label: 'Minor 2-5-1',
    description: 'The iiø → V → i movement. Guide tones and extended voicings across two starting positions; seventh chords across three.',
    chords: [
      { degree: '2', quality: 'm7b5' },
      // THE 5 IS TWO DIFFERENT CHORDS ON THE EXTENDED ROW. The plain 7
      // recorded on 9 Sep is the seventh-chord reading and stays that;
      // Silas's notes voice this chord as a 7♯5 in the ABA run and as a
      // 7(♭9♯9♭13) in the BAB run, and the extended row plays those.
      {
        degree: '5', quality: '7',
        extendedQuality: { A: '7#5', B: '7b9#9b13' },
      },
      { degree: '1', quality: 'm7' },
    ],
    types: [
      { type: 'guide-tones',    positions: ['A', 'B'] },
      { type: 'seventh-chords', positions: ['A', 'B', 'C'] },
      { type: 'full-voicing',   positions: ['A', 'B'] },
    ],
  },
  {
    id: 'minor-aba',
    kind: 'minor-aba',
    /**
     * THE ROW IS NAMED FOR WHAT IT MOVES THROUGH, NOT FOR A POSITION
     * PATTERN. Silas's ruling of 9 Sep 2026.
     *
     * It read "Minor ABA (dom7#9#5 → minor)". "ABA" is which SHAPE
     * each chord of a 2 5 1 takes — the A voicing, then the B, then
     * the A again — so it is a fact about positions and belongs on
     * the Extended Voicings row of a three-chord pattern. This row
     * has two chords and no third to alternate back to.
     *
     * What it actually is: the tail of the minor 2 5 1, with the
     * dominant altered — a 5 chord resolving to a minor 1.
     *
     * THE NAME SAYS THE CHORDS AND THE LANDING, which is the shape the
     * other two passes take: "5(7♭9) → 1m", "7(dim7) → 1m". It read
     * "Minor 5 → 1 (7♯9♯5)" between 9 and 10 Sep 2026, which put the
     * quality in a bracket after the movement instead of on the chord
     * it belongs to. Silas's signed-off shared-player prototype names
     * it this way and the other two the same way.
     *
     * THE ID AND THE `kind` DID NOT MOVE. `minor-aba` and `pos-A` /
     * `pos-B` are segments of spacingState itemRefs; renaming them
     * would orphan every rep already logged.
     */
    label: '5(7♯9♯5) → 1m',
    description: 'Dark altered dominant resolving a 5th down to minor. Two starting positions.',
    chords: [
      { degree: '5', quality: '7#9#5' },
      { degree: '1', quality: 'm9' },
    ],
    positions: ['pos-A', 'pos-B'],
  },
  {
    id: 'dom7b9',
    kind: 'inversion-4',
    label: 'dom7b9 → minor',
    description: 'Right-hand dim7 voicing over dominant bass, resolving to minor. Four starting positions for the right hand.',
    chords: [
      { degree: '5', quality: '7b9' },
      { degree: '1', quality: 'm9' },
    ],
    positions: ['pos1', 'pos2', 'pos3', 'pos4'],
  },
  {
    id: 'dim7',
    kind: 'inversion-4',
    label: 'dim7 → minor',
    description: 'Diminished passing chord resolving to minor. Four starting positions for the right hand.',
    // THE HALF-STEP-UP RESOLUTION, which is the one the submodule
    // design doc leads with (Bdim7 → Cm in the key of C). That doc
    // also gives a half-step-DOWN version, and the shipped catalog
    // has no dimension for the direction — so this records the up
    // resolution and the down one is not represented. Flagged to
    // Silas rather than invented in both directions.
    chords: [
      { degree: '7', quality: 'dim7' },
      { degree: '1', quality: 'm9' },
    ],
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
 *  fan-outs × number of keys. 828 today (69 sub-cells/key × 12). */
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
      patternId: ProgressionVLId;
      kind: 'type-position';
      type: ProgressionVLType;
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
/** The five named progressions carry the same three types. */
function isProgressionVLType(s: string): s is ProgressionVLType {
  return isMinor251Type(s);
}
function isProgressionVLId(s: string): s is ProgressionVLId {
  return s === '1-5-6-4' || s === '1-6-4-5' || s === '1-6-2-5'
    || s === '1-4-5' || s === 'backdoor';
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
    case '1-5-6-4':
    case '1-6-4-5':
    case '1-6-2-5':
    case '1-4-5':
    case 'backdoor': {
      if (parts.length !== 5) return null;
      const type = parts[2];
      const position = parts[3];
      if (!isProgressionVLId(patternId)) return null;
      if (!isProgressionVLType(type) || !isVLABPosition(position)) return null;
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
    // never a chord: ABA is which SHAPE each chord of a 2 5 1 takes —
    // A, then B, then A again — so it is a position pattern, and on
    // the 5→1 there is no third chord to alternate back to.
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
 * THE ONE PLACE A POSITION IS NAMED, and every row now says the same
 * word.
 *
 * =====================================================================
 * EVERY ROW ON THIS PAGE IS TWO-HANDED, SO EVERY ROW COUNTS THE SAME
 * THING.
 *
 * Bass in the left hand, rootless shape in the right. What changes
 * between one start and the next is the right-hand shape — which note
 * of it is on the bottom — and that is true of the guide tones, the
 * seventh chords, the extended voicings, the 5(7♯9♯5) → 1m, the Diatonic
 * Cycle and the two altered-dominant passes alike. So they are all
 * "Position n", numbered from the lowest start.
 *
 * The page used to say three different things for that one idea:
 *
 *   · "Position 1/2/3" on Guide Tones, Seventh Chords and the
 *     Diatonic Cycle.
 *   · "Pos A/B" on Extended Voicings and "Position A/B" on the minor
 *     5 → 1 (then called "Minor ABA"), because A and B were a
 *     convention in the source material.
 *   · "Root Position / 1st Inversion / 2nd Inversion / 3rd Inversion"
 *     on dom7b9 → minor and dim7 → minor.
 *
 * THE LAST OF THOSE WAS THE ONE THAT MATTERED. Naming an inversion
 * says the row is about which note of the CHORD is in the bass — and
 * on a two-handed voicing the bass note is the left hand's, which does
 * not move. What actually changes is the right hand's starting shape,
 * exactly as on every row above it. Silas's ruling of 9 Sep 2026.
 *
 * =====================================================================
 * THE STORAGE TAGS DID NOT MOVE, AND THAT IS DELIBERATE.
 *
 * `A`/`B`/`C`, `pos-A`/`pos-B` and `pos1`–`pos4` are segments of
 * spacingState itemRefs. Renaming them would orphan every rep already
 * logged. This function is display, and display is the whole of the
 * change: `VLAB_POSITION_NUMBER` and `positionNumber` turn a tag into
 * the number the reader sees.
 * =====================================================================
 */
function positionLabel(slot: VLPositionSlot): string {
  switch (slot.kind) {
    case 'type-position':
      return `Position ${VLAB_POSITION_NUMBER[slot.position]}`;
    case 'diatonic-cycle':
      return `Position ${positionNumber(slot.position)}`;
    case 'minor-aba':
      return `Position ${minorAbaNumber(slot.position)}`;
    case 'inversion-4':
      return `Position ${positionNumber(slot.position)}`;
  }
}

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

/** The number a 5(7♯9♯5) → 1m storage tag reads as. `pos-A` is the lower
 *  start, so it is Position 1 — the tag keeps its letter because it is
 *  in itemRefs already written. */
function minorAbaNumber(p: MinorAbaPosition): 1 | 2 {
  return p === 'pos-A' ? 1 : 2;
}

/** Human-friendly sub-cell label, suitable for display alongside the
 *  pattern label. Examples:
 *    "Guide Tones · Position 1"
 *    "Seventh Chords · Position 3"
 *    "Extended Voicings · Position 2"
 *    "Position 2"        (diatonic-cycle)
 *    "Position 1"        (minor-aba)
 *    "Position 3"        (dom7b9 / dim7)
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
 * One chord of an Extended Voicings run: which chord, which shape.
 */
export interface VLExtendedChord {
  /** Degree of the key, as `VLChord` writes it. */
  degree: string;
  /** The extended chord this degree becomes. */
  quality: ExtendedQuality;
  /** Which of Silas's two shapes it takes under the alternating rule. */
  position: ExtendedPosition;
  /** The shape itself — left hand, right hand, and his degree names. */
  shape: ExtendedShape;
  /**
   * Both of this chord's shapes, where it has both.
   *
   * A LOOP CHOOSES BY EAR AND NOT BY ALTERNATION, so the placer needs
   * the pair rather than the answer — see `voiceLeadingExtendedRule`.
   * A chord written for one run has only one entry here.
   */
  alternatives: Partial<Record<ExtendedPosition, ExtendedShape>>;
  /**
   * True where the letter is FIXED and the placer may not re-choose:
   * the first chord of the row, and any chord the notes give only one
   * shape for.
   */
  fixed: boolean;
}

/**
 * How a row picks each chord's shape after the first.
 *
 * =====================================================================
 * A CADENCE ALTERNATES; A LOOP GOES WHEREVER IS NEAREST.
 *
 * Silas's ruling of 10 Sep 2026. On a 2 5 1 or a pass the two shapes
 * trade off — that is what the ABA and BAB runs in his notes ARE, and
 * the alternation is the exercise. A loop is not a cadence: it goes
 * round, and what a hand actually does going round is take whichever
 * shape is the smaller move from the chord before.
 *
 * THE LIST IS HIS, NOT A DERIVATION. "1 5 6 4, 1 6 4 5, 1 6 2 5, 1 4 5,
 * 1 4 7 3 6 2 5 1" — named in the ruling. A rule inferred from the
 * chord count would have swept up the backdoor, which he did not name
 * and which is a cadence in his own words ("part of a larger backdoor
 * 251").
 *
 * The diatonic cycle is on the list and has no Extended Voicings row to
 * apply it to; it is here so the list is the ruling's list.
 * =====================================================================
 */
const EXTENDED_RUN_NEAREST: ReadonlySet<string> = new Set([
  '1-5-6-4', '1-6-4-5', '1-6-2-5', '1-4-5', 'diatonic-cycle',
]);

export function voiceLeadingExtendedRule(
  patternId: string,
): 'alternate' | 'nearest' {
  return EXTENDED_RUN_NEAREST.has(patternId) ? 'nearest' : 'alternate';
}

/**
 * The Extended Voicings row of a pattern, in one position.
 *
 * =====================================================================
 * POSITION 1 IS THE ABA RUN AND POSITION 2 IS THE BAB RUN.
 *
 * That is what the two positions of an Extended Voicings row have
 * always been; until now the row knew it only as a letter in an
 * itemRef. Silas's notes lay both runs out chord by chord for the
 * major and the minor 2 5 1, and `shapeInRun` is the one line those
 * two runs come down to — the dominant takes the opposite letter to
 * the chords either side of it. The 5 → 1 and the five named
 * progressions are derived by that same rule, per Silas's brief.
 *
 * THE STORAGE TAG IS THE RUN. `A` is the ABA run, `B` the BAB one, and
 * `positionLabel` is what turns either into the "Position 1" / "Position
 * 2" a reader sees. Nothing new is stored.
 *
 * RETURNS NULL rather than voicing something Silas did not write:
 * a pattern with no Extended Voicings row, a position that row does not
 * have, or a chord whose quality the notes do not cover. A silent
 * substitution here would be the app teaching a voicing off its own
 * bat, which is the one thing this data exists to prevent.
 * =====================================================================
 */
/** The one shape a quality has, or null when it has none or both. */
function soleShapePosition(q: ExtendedQuality): ExtendedPosition | null {
  const a = extendedShape(q, 'A') !== null;
  const b = extendedShape(q, 'B') !== null;
  if (a && !b) return 'A';
  if (b && !a) return 'B';
  return null;
}

export function voiceLeadingExtendedRun(
  pattern: VoiceLeadingPattern,
  position: ExtendedPosition,
  /**
   * The chords in the order they are PLAYED, where that differs from
   * the row's own order.
   *
   * A ROTATED LOOP IS THE ONLY CALLER. "6 4 1 5" is the 1 5 6 4 row
   * entered by a different door, and the position names ITS first
   * chord — the 6 — not the row's. Deriving from the row's order and
   * looking the answer up by degree would give the 6 whatever letter
   * it takes when the loop starts on the 1, which is a different
   * question.
   */
  played?: ReadonlyArray<VLChord>,
): VLExtendedChord[] | null {
  if (pattern.kind !== 'type-position') return null;
  const row = pattern.types.find(
    t => t.type === 'full-voicing' || t.type === 'aba-structure',
  );
  if (!row || !row.positions.includes(position)) return null;

  const out: VLExtendedChord[] = [];
  // THE FIRST CHORD IS WHAT THE POSITION NAMES, and everything else
  // follows from it. Position 1 is the row's first chord in its A shape
  // — the one that starts on the 3rd — and Position 2 the same chord in
  // its B. Silas's ruling of 10 Sep 2026, replacing "the dominant takes
  // B in Position 1", which was a derivation from the two 2 5 1 runs
  // and got the plain 5 → 1 backwards.
  let previous: ExtendedPosition | null = null;
  for (const chord of played ?? pattern.chords) {
    const named = chord.extendedQuality?.[position] ?? chord.quality;
    const quality = EXTENDED_QUALITY_OF[named] as ExtendedQuality | undefined;
    if (quality === undefined) return null;
    // A CHORD WRITTEN FOR ONE RUN KEEPS THE SHAPE IT WAS WRITTEN WITH.
    // The minor 2 5 1's 7♯5 exists only as the B of the ABA run and the
    // 7(♭9♯9♭13) only as the A of the BAB one — each is one chord in one
    // place, not a chord with two voicings — so a per-position quality
    // takes the single shape the notes give it.
    const sole = soleShapePosition(quality);
    const alternating: ExtendedPosition = previous === null
      ? position
      : (previous === 'A' ? 'B' : 'A');
    const shapePosition: ExtendedPosition = sole ?? alternating;
    const shape = extendedShape(quality, shapePosition);
    if (shape === null) return null;
    const alternatives: Partial<Record<ExtendedPosition, ExtendedShape>> = {};
    for (const letter of ['A', 'B'] as const) {
      const other = extendedShape(quality, letter);
      if (other !== null) alternatives[letter] = other;
    }
    out.push({
      degree: chord.degree,
      quality,
      position: shapePosition,
      shape,
      alternatives,
      // FIXED where there is nothing to choose between: the chord that
      // the position NAMES, and any chord the notes give one shape.
      fixed: previous === null || sole !== null,
    });
    previous = shapePosition;
  }
  return out;
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
