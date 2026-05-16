/**
 * SESSION DESIGN — single source of truth for session-structure
 * constants.
 *
 * Every proportion, split, threshold, time limit, weight, and max
 * count that defines how a practice session is shaped lives here.
 * Consumers (shapesSplit.ts, timeAllocation.ts, contextWeighting.ts,
 * repertoireSplit.ts, sessionGenerator.ts) import from this file
 * rather than declaring locally.
 *
 * When session behavior feels wrong, read docs/SESSION_DESIGN.md
 * first, then look here for the corresponding constant.
 *
 * Add a constant here when it answers any of:
 *   · "What proportion of the session goes to X?"
 *   · "What's the minimum block duration for Y?"
 *   · "Which modules surface in context Z?"
 *   · "What order do non-keyboard modules appear in?"
 *
 * Do NOT add constants here for:
 *   · Per-module musical content (catalog data — lives in catalog.ts files)
 *   · Per-attempt timing seeds (lives in timePerAttempt.ts)
 *   · Type-narrowed enums (lives with the type it discriminates)
 */

import type { MemoryType } from '../db';
import type { PracticeSessionContext } from '../db';
import {
  HF_MODULE_REF,
  PRODUCTION_MODULE_REF,
  REPERTOIRE_MODULE_REF,
  SHAPES_MODULE_REF,
} from '../../modules/goals/progress';

const SECONDS_PER_MINUTE = 60;

// ─── S&P / Repertoire split ───────────────────────────────────────────────
//
// How a keyboard session's total time divides between Shapes & Patterns
// drilling and Repertoire (song) practice. Currently a fixed split;
// graduated lookup-by-session-length lands in a later commit per
// SESSION_DESIGN.md § "S&P / Repertoire split — graduated by session
// length".

// ─── S&P internal split ───────────────────────────────────────────────────
//
// Within the S&P block, how time divides across Scales warm-up,
// Chord shapes walk, and Voice Leading. The three-way split fires
// when the block contains VL items AND meets the VL minimum block
// floor; otherwise the two-way path runs and Scales takes its
// fixed/proportional budget off the top.

/** Three-way split fraction: Scales warm-up share. Per
 *  SESSION_DESIGN.md the design target is 15 % but the legacy code
 *  shipped at 25 %; this commit migrates the constant unchanged and
 *  Commit 2 of the SESSION_DESIGN build updates it to the design value. */
export const VL_SPLIT_SCALES_FRACTION = 0.25;

/** Three-way split fraction: Chord shapes walk share. */
export const VL_SPLIT_WALK_FRACTION = 0.50;

// ─── Scales warm-up ───────────────────────────────────────────────────────

/** Minimum S&P block length (seconds) at which the Scales warm-up
 *  segment surfaces. Sub-15-min blocks stay chord-shape-only. */
export const SCALES_SEGMENT_MIN_BLOCK_SECONDS = 15 * SECONDS_PER_MINUTE;

/** Time allocated to the Scales segment inside a 15–30 min S&P
 *  block (no active Scales goal — fixed-fallback path). */
export const SCALES_SEGMENT_SHORT_SECONDS = 5 * SECONDS_PER_MINUTE;

/** Time allocated to the Scales segment inside a 30+ min S&P block
 *  (no active Scales goal — fixed-fallback path). */
export const SCALES_SEGMENT_LONG_SECONDS = 8 * SECONDS_PER_MINUTE;

/** Threshold (seconds) above which the longer Scales allocation
 *  kicks in. */
export const SCALES_SEGMENT_LONG_BLOCK_SECONDS = 30 * SECONDS_PER_MINUTE;

/** Hard cap on how many keys the Scales segment covers. Per
 *  SESSION_DESIGN.md the design target is 2 (currently 3); Commit 2
 *  of the SESSION_DESIGN build updates it. */
export const SCALES_SEGMENT_MAX_KEYS = 3;

/** Hard ceiling for the goal-aware proportional budget: warm-up
 *  won't exceed this fraction of the S&P block. */
export const SCALES_SEGMENT_PROPORTIONAL_BLOCK_FRACTION = 0.20;

/** Absolute cap for the goal-aware proportional budget. */
export const SCALES_SEGMENT_PROPORTIONAL_MAX_SECONDS = 20 * SECONDS_PER_MINUTE;

// ─── Voice leading ────────────────────────────────────────────────────────

/** Minimum block length (seconds) at which the VL segment can
 *  surface in the three-way S&P split. Mirrors
 *  SCALES_SEGMENT_MIN_BLOCK_SECONDS — tiny blocks stay
 *  chord-shape-only. */
export const VL_SEGMENT_MIN_BLOCK_SECONDS = 15 * SECONDS_PER_MINUTE;

// ─── Repertoire ───────────────────────────────────────────────────────────

/** Minimum spotlight block duration (seconds) — when a Repertoire
 *  allocation comes in under this floor, spotlight absorbs the
 *  whole allocation and the maintenance slot drops. */
export const MIN_SPOTLIGHT_SECONDS = 15 * SECONDS_PER_MINUTE;

/** Spotlight share of a two-slot repertoire allocation. 3/4 hits
 *  the design intent: ~45 min spotlight + ~15 min maintenance on a
 *  60-min repertoire block. */
export const SPOTLIGHT_RATIO = 3 / 4;

/** Floor for the maintenance share AFTER the split. When the
 *  computed maintenance share falls below this, the slot is dropped
 *  and spotlight absorbs the whole allocation — a sub-5-min
 *  maintenance turn isn't worth the context switch. */
export const MIN_MAINTENANCE_SECONDS = 5 * SECONDS_PER_MINUTE;

/** Chord-quiz warm-up duration that prepends Repertoire practice
 *  in keys sessions (or stands alone in laptop/phone sessions). */
export const CHORD_QUIZ_SECONDS = 3 * SECONDS_PER_MINUTE;

/** Per-key scale-prep block duration in seconds — two scale types
 *  × ~45 s each. Lives between chord-quiz and the song block in
 *  the proposal. */
export const SCALE_PREP_SECONDS = 90;

/** Minimum song-block allocation that earns a scale-prep block.
 *  Below this floor the prep would dominate the playback window
 *  and produce a worse experience than a single longer practice
 *  block. */
export const SCALE_PREP_MIN_SONG_SECONDS = 4 * SECONDS_PER_MINUTE;

// ─── Context weights ──────────────────────────────────────────────────────
//
// Per-(context, module) weight tables. Modules excluded by the
// hard filter still get a factor here so manual "+ Add module"
// injections inherit the context-appropriate weighting.

/** Default multiplier for modules absent from a context's factor
 *  table. */
export const CONTEXT_FACTOR_NEUTRAL = 1.0;

/** Allowlist for the keys-context hard filter — these modules can
 *  surface in a default keys-session proposal. */
export const KEYS_DEFAULT_ALLOWED_MODULES: ReadonlySet<string> = new Set([
  SHAPES_MODULE_REF,
  REPERTOIRE_MODULE_REF,
]);

/** Placeholder reserved for the chord-progression-quiz module that
 *  isn't yet built. Weight 0 (excluded) on phone + laptop until the
 *  feature ships. */
const CHORD_PROGRESSION_QUIZ_MODULE_REF = 'chord-progression-quiz';
export const CHORD_PROGRESSION_QUIZ_PHONE_LAPTOP_FACTOR = 0;

export const KEYS_FACTORS: Readonly<Record<string, number>> = {
  [SHAPES_MODULE_REF]:                      CONTEXT_FACTOR_NEUTRAL,
  [REPERTOIRE_MODULE_REF]:                  CONTEXT_FACTOR_NEUTRAL,
};

/** Laptop context: chord-progressions review boosted, Production
 *  dominant per SESSION_DESIGN.md non-keyboard intent. */
export const LAPTOP_FACTORS: Readonly<Record<string, number>> = {
  [HF_MODULE_REF]:                          1.2,
  'intervals':                              1.0,
  'chord-recognition':                      1.0,
  'chord-progressions':                     1.6,
  'scales-modes':                           1.0,
  [REPERTOIRE_MODULE_REF]:                  CONTEXT_FACTOR_NEUTRAL,
  [PRODUCTION_MODULE_REF]:                  1.5,
  [CHORD_PROGRESSION_QUIZ_MODULE_REF]:      CHORD_PROGRESSION_QUIZ_PHONE_LAPTOP_FACTOR,
};

/** Phone context: HF + every ET sub at 1.4 (compact + commute-
 *  friendly), Production lower than laptop. */
export const PHONE_FACTORS: Readonly<Record<string, number>> = {
  [HF_MODULE_REF]:                          1.4,
  'intervals':                              1.4,
  'chord-recognition':                      1.4,
  'chord-progressions':                     1.4,
  'scales-modes':                           1.4,
  [REPERTOIRE_MODULE_REF]:                  CONTEXT_FACTOR_NEUTRAL,
  [PRODUCTION_MODULE_REF]:                  1.0,
  [CHORD_PROGRESSION_QUIZ_MODULE_REF]:      CHORD_PROGRESSION_QUIZ_PHONE_LAPTOP_FACTOR,
};

/** Full context: keyboard modules at neutral keys-weight; cognitive
 *  modules carry their laptop weights. Block ordering puts
 *  keyboard-required blocks first regardless of weight. */
export const FULL_FACTORS: Readonly<Record<string, number>> = {
  [SHAPES_MODULE_REF]:                      CONTEXT_FACTOR_NEUTRAL,
  [REPERTOIRE_MODULE_REF]:                  CONTEXT_FACTOR_NEUTRAL,
  [HF_MODULE_REF]:                          1.2,
  'intervals':                              1.0,
  'chord-recognition':                      1.0,
  'chord-progressions':                     1.6,
  'scales-modes':                           1.0,
  [PRODUCTION_MODULE_REF]:                  1.5,
  [CHORD_PROGRESSION_QUIZ_MODULE_REF]:      CHORD_PROGRESSION_QUIZ_PHONE_LAPTOP_FACTOR,
};

/** Capability rank per context — a higher-rank context can do
 *  anything a lower-rank context can do plus more. 'full' tops
 *  the ladder (keyboard + device available at once). */
export const CONTEXT_RANK: Record<PracticeSessionContext, number> = {
  full: 4,
  keys: 3,
  laptop: 2,
  phone: 1,
};

// ─── Non-keyboard session order ───────────────────────────────────────────
//
// Designed module sequence for laptop / phone / non-keyboard phase
// of full sessions per SESSION_DESIGN.md § "Non-keyboard session —
// Block order". Defined here as the canonical ordering; enforcement
// in sequenceBlocks lands in a later commit. Module refs at the
// same index are parallel — neither outranks the other; their
// surfacing order is decided by per-block weight.

export const NON_KEYBOARD_MODULE_ORDER: ReadonlyArray<string> = [
  'shapes-and-patterns',  // mental-viz block rides under the S&P module ref
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
  HF_MODULE_REF,
  PRODUCTION_MODULE_REF,
];

// ─── Production vocab ─────────────────────────────────────────────────────
//
// Vocab block is sized proportionally to the user's requested
// session length (15 %, clamped to [3 min, 10 min]) and prepended
// to laptop / phone session proposals. Carved out of the user's
// requested time so the displayed total stays at what the user
// asked for.

export const PRODUCTION_VOCAB_MIN_SECONDS = 3 * SECONDS_PER_MINUTE;
export const PRODUCTION_VOCAB_MAX_SECONDS = 10 * SECONDS_PER_MINUTE;
export const PRODUCTION_VOCAB_FRACTION = 0.15;

/** Floor on practice time AFTER the Production Vocab carve-out.
 *  When subtracting vocab would leave less than this for practice,
 *  the vocab block is dropped and the full requested time flows
 *  to practice. Anything below 5 min of practice is mostly vocab —
 *  not a real session. */
export const MIN_VIABLE_PRACTICE_SECONDS = 5 * SECONDS_PER_MINUTE;

// ─── Timing thresholds ────────────────────────────────────────────────────

/** Maximum number of items inside any single algorithm block.
 *  Caps the per-block enumeration so a single hot module can't
 *  swamp the proposal. */
export const MAX_ITEMS_PER_BLOCK = 20;

/** Synthetic-block weight for the Repertoire cold-start injection.
 *  Sized to dominate the goal-driven blocks for first-time / sparse
 *  spacingState users so Repertoire surfaces even before song
 *  practice has accumulated history. */
export const COLD_START_REPERTOIRE_WEIGHT = 5;

// ─── Per-memory-type duration tiers ───────────────────────────────────────
//
// Block-duration tier per memory type — drives the time-allocation
// math in timeAllocation.ts. Repertoire (integration) overrides
// its typical-high so the spotlight + maintenance split has room
// for the design intent (~45 min spotlight + ~15 min maintenance
// on a 60-min repertoire block).

export interface DurationTier {
  /** Minimum block duration in seconds — never go below this. */
  minSeconds: number;
  /** Typical low end (default block size). */
  typicalLowSeconds: number;
  /** Typical high end. */
  typicalHighSeconds: number;
}

export const MEMORY_TYPE_DURATIONS: Record<MemoryType, DurationTier> = {
  declarative: {
    minSeconds:         3 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  5 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 10 * SECONDS_PER_MINUTE,
  },
  procedural: {
    minSeconds:         5 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  10 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 15 * SECONDS_PER_MINUTE,
  },
  integration: {
    minSeconds:         10 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  15 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 20 * SECONDS_PER_MINUTE,
  },
  expression: {
    minSeconds:         5 * SECONDS_PER_MINUTE,
    typicalLowSeconds:  10 * SECONDS_PER_MINUTE,
    typicalHighSeconds: 20 * SECONDS_PER_MINUTE,
  },
};

export const MODULE_DURATION_OVERRIDES: Readonly<Record<string, Partial<DurationTier>>> = {
  [REPERTOIRE_MODULE_REF]: {
    typicalHighSeconds: 60 * SECONDS_PER_MINUTE,
  },
};

// ─── Block phase ordering ─────────────────────────────────────────────────
//
// Within a session, blocks sequence acquisition → review →
// expression so fresh attention lands on the work that needs it
// most. Consumed by timeAllocation.ts sequenceBlocks.

export type BlockPhase = 'acquisition' | 'review' | 'expression';

export const PHASE_ORDER: Record<BlockPhase, number> = {
  acquisition: 0,
  review:      1,
  expression:  2,
};
