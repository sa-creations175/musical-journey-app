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
// drilling and Repertoire (song) practice. Graduated by total session
// length per SESSION_DESIGN.md § "S&P / Repertoire split". Shorter
// sessions skew toward Repertoire; longer ones balance toward S&P.

interface SPRepSplit {
  /** Share of session time allocated to S&P (chord shapes, scales,
   *  VL). The remainder goes to Repertoire. */
  spFraction: number;
  /** Repertoire's share — kept as a separate field rather than
   *  derived so the table reads at a glance. spFraction +
   *  repertoireFraction === 1.0 by construction. */
  repertoireFraction: number;
}

/** Graduated S&P/Repertoire split lookup keyed on the total session
 *  duration (seconds). Each entry's `minSeconds` is the inclusive
 *  lower bound for that bucket; the lookup returns the LAST entry
 *  whose minSeconds is ≤ the session length. Per SESSION_DESIGN.md:
 *
 *    < 30 min: 25 % / 75 %   (small session — Repertoire dominant)
 *    30–44:    25 % / 75 %
 *    45–59:    35 % / 65 %
 *    60+:      40 % / 60 %   (full session — balanced)
 */
const SP_REP_SPLIT_TABLE: ReadonlyArray<{ minSeconds: number; split: SPRepSplit }> = [
  { minSeconds: 0,            split: { spFraction: 0.25, repertoireFraction: 0.75 } },
  { minSeconds: 45 * 60,      split: { spFraction: 0.35, repertoireFraction: 0.65 } },
  { minSeconds: 60 * 60,      split: { spFraction: 0.40, repertoireFraction: 0.60 } },
];

/** Look up the S&P / Repertoire split for a session of
 *  `sessionSeconds` total. Returns the highest-minSeconds entry
 *  whose threshold the session meets. Cold-path / edge: a zero-
 *  length session returns the 0-bucket entry (defensive). */
export function sPRepSplitForSession(sessionSeconds: number): SPRepSplit {
  let chosen = SP_REP_SPLIT_TABLE[0].split;
  for (const row of SP_REP_SPLIT_TABLE) {
    if (sessionSeconds >= row.minSeconds) chosen = row.split;
  }
  return chosen;
}

// ─── S&P internal split ───────────────────────────────────────────────────
//
// Within the S&P block, how time divides across Scales warm-up,
// Chord shapes walk, and Voice Leading. The three-way split fires
// when the block contains VL items AND meets the VL minimum block
// floor; otherwise the two-way path runs and Scales takes its
// fixed/proportional budget off the top.

/** Three-way split fraction (VL active): Scales warm-up share.
 *  Per SESSION_DESIGN.md design table § "S&P internal split". */
export const VL_SPLIT_SCALES_FRACTION = 0.15;

/** Three-way split fraction (VL active): Chord shapes walk share.
 *  VL share = 1 - scales - walk by construction (0.40). */
export const VL_SPLIT_WALK_FRACTION = 0.45;

/** Two-way split fraction (no VL): Scales warm-up share.
 *  Chord shapes get the remainder (0.80). Per SESSION_DESIGN.md
 *  § "Two-way fallback (no VL)". */
export const TWO_WAY_SCALES_FRACTION = 0.20;

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

/** Hard cap on how many keys the Scales warm-up covers per session.
 *  Per SESSION_DESIGN.md § "Scales warm-up rules" — 1 key default,
 *  2 keys max. */
export const SCALES_SEGMENT_MAX_KEYS = 2;

/** Number of scale TYPES drilled per key in the warm-up. The picker
 *  selects the most-due pair for each key from the four-scale
 *  catalog. Per SESSION_DESIGN.md:
 *    Major-tonality keys: major + major pentatonic
 *    Minor-tonality keys: natural minor + minor pentatonic */
export const SCALES_TYPES_PER_KEY = 2;

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
// Block order". Map keys are spacingState moduleRefs; values are
// the sort index (lower surfaces first). Modules at the SAME index
// are parallel tracks — their relative order is decided by weight
// (chord-progressions ∥ scales-modes share index 3 per the design
// rationale that the two are different ear-training dimensions
// without a strong sequential dependency on each other).
//
// Mental viz rides under the shapes-and-patterns moduleRef but is
// distinguishable by isKeyboardRequired === false; the non-keyboard
// sequencer in sequenceBlocks only applies this map within the
// non-keyboard bucket, so the S&P moduleRef at index 0 unambiguously
// resolves to mental viz when it surfaces.

export const NON_KEYBOARD_MODULE_ORDER: ReadonlyMap<string, number> = new Map([
  [SHAPES_MODULE_REF,     0],  // mental viz (only non-keyboard S&P block)
  ['intervals',           1],
  ['chord-recognition',   2],
  ['chord-progressions',  3],  // parallel with scales-modes
  ['scales-modes',        3],  // parallel with chord-progressions
  [HF_MODULE_REF,         4],
  [PRODUCTION_MODULE_REF, 5],
]);

// ─── Mental visualization ─────────────────────────────────────────────────
//
// Mental viz is a fixed-time prepended block in laptop / phone /
// full-session non-keyboard contexts. NO SpacingState — duration is
// the planned seconds scaled by the per-context weight. Phone is
// primary (1.4 ×) because it's the most cognitively-suited surface
// for away-from-keyboard mental drills; laptop is secondary (0.8 ×)
// since the laptop also has piano-less affordances competing for
// attention (DAW work, ET quizzes, HF flashcards).

export const MENTAL_VIZ_PLANNED_SECONDS = 5 * SECONDS_PER_MINUTE;
export const MENTAL_VIZ_WEIGHT_PHONE = 1.4;
export const MENTAL_VIZ_WEIGHT_LAPTOP = 0.8;
/** Full sessions get the laptop-style secondary weight on the
 *  non-keyboard arc — the keyboard work is already the primary
 *  cognitive load for the session. */
export const MENTAL_VIZ_WEIGHT_FULL = 0.8;

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
