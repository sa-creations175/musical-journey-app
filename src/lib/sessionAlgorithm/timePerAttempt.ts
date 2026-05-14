/**
 * Canonical time-per-attempt seeds — Phase B Step 1.
 *
 * Single source of truth for every "how long does one attempt /
 * rep / cell / session take" constant in the app. Before this
 * module the seeds were defined across four files —
 * weeklyAttempts.ts, shapesSplit.ts, sessionGenerator.ts, and
 * sessionAlgorithm/sessionNeed.ts — plus dailyGoalNeed.ts consuming
 * them, all kept in sync by hand. Phase B's goal-pace planner
 * derives time from attempts, so it needs one authoritative seed
 * table; without this consolidation Phase B would have become yet
 * another scattered copy.
 *
 * This is pure consolidation — every value here is lifted verbatim
 * from its previous home. No seed value changed. Reconciling the
 * seeds that currently disagree (see TIME_PER_ATTEMPT_MINUTES vs
 * TIME_PER_ATTEMPT_SECONDS below) and swapping seeds for rolling
 * averages from real practice data are later Phase B steps.
 *
 * See docs/PHASE_B_SESSION_PLANNING_DESIGN.md — "Time Per Attempt
 * Seeds" and Decision 6.
 */

import type { GoalFlowModuleId } from '../../modules/goals/goalVocabulary';
import type { ScaleKind } from '../../modules/shapes-and-patterns/scaleSkills';

// ---------------------------------------------------------------------
// Declarative + integration modules — minutes per attempt
// (was: lib/weeklyAttempts.ts)
// ---------------------------------------------------------------------

/** Time per attempt in minutes for modules with a single point
 *  estimate. Shapes lives in its own per-activity-area table (see
 *  SHAPES_TIME_PER_REP_MINUTES below) because its three activity
 *  areas have materially different per-rep costs; Production is in
 *  PRODUCTION_TIME_RANGE_MINUTES because lesson length varies enough
 *  to warrant a range.
 *
 *  NOTE: the HF/ET values here (20 s) DISAGREE with the Phase B
 *  per-second seeds (TIME_PER_ATTEMPT_SECONDS, 30 s) further down.
 *  Both are preserved exactly as they were — reconciling them is a
 *  later Phase B step, not this consolidation. */
export const TIME_PER_ATTEMPT_MINUTES: Record<
  Exclude<GoalFlowModuleId, 'production' | 'shapes-and-patterns'>,
  number
> = {
  'harmonic-fluency':     20 / 60,  // 20 seconds per flashcard
  'ear-training':         20 / 60,  // 20 seconds per quiz question
  'repertoire':           17.5,     // midpoint of 15–20 min per cell session
  'practice-consistency': 45,       // midpoint of 30–60 min per session
};

/** Shapes & Patterns activity-area discriminator. Mirrors the
 *  ShapesActivityArea union in GoalCreationFlow.tsx but redeclared
 *  here so this lib stays UI-independent. */
export type ShapesActivityArea =
  | 'chord_shape_drills'
  | 'scale_drills'
  | 'voice_leading';

/** Per-activity-area Shapes time-per-rep. The chord_shape_drills
 *  value is a weighted average across the post-inversion-redesign
 *  drill mix (90 s/rep for individual inversions, 120 s/rep for
 *  fluid + extensions/special voicings) — see Phase 4 inversion
 *  spec. Voice-leading reps are longer because the pattern itself
 *  is longer (a full ii–V–I cycle). Recalibrate alongside
 *  TIME_PER_ATTEMPT_MINUTES once there's enough real session data. */
export const SHAPES_TIME_PER_REP_MINUTES: Record<ShapesActivityArea, number> = {
  chord_shape_drills: 1.6,  // weighted avg: triads ~1.625, sevenths ~1.6
  scale_drills:       2,
  voice_leading:      3,
};

/** Weighted-average fallback used when a Shapes time estimate is
 *  requested without a specific activity area (e.g., the WeeklyPlan
 *  last-week review, which counts drill sessions across all three
 *  areas without joining through db.drillSkills). Weights come from
 *  catalog cardinality at time of writing (Phase 4 inversion model):
 *    chord_shape_drills = 852 acquisition-path items
 *      (triads 6×12×4=288, sevenths 6×12×5=360, extensions 14×12=168, special 3×12=36)
 *    scale_drills       = 4 scales × 12 keys = 48
 *    voice_leading      = 3 patterns × 12 keys = 36
 *  → (852×1.6 + 48×2 + 36×3) / 936 ≈ 1.67 min/rep.
 *  Hardcoded (rather than computed from moduleItemCounts) so this
 *  file stays dependency-free. Re-derive if the catalog shifts. */
export const SHAPES_DEFAULT_TIME_PER_REP_MINUTES = 1.67;

/** Default assumed length of a full Repertoire practice session
 *  (spotlight + maintenance combined), used by the WeeklyPlan when
 *  an hours- or days-based repertoire consistency goal needs a
 *  "~60 min · N sessions/week" cadence breakdown. The session
 *  breaks down as ~45 min Song of the Month + ~15 min maintenance
 *  in the session allocator; the WeeklyPlan surfaces both lines.
 *  Was 45 prior to the May 2026 rebalance — that value treated the
 *  full session as just the spotlight portion. Recalibrate after a
 *  few weeks of real song-cell run-through data inform what a
 *  typical repertoire session actually runs. */
export const REPERTOIRE_SESSION_DEFAULT_MINUTES = 60;

/** Production lesson time is highly variable — show as a range. */
export const PRODUCTION_TIME_RANGE_MINUTES = {
  minPerLesson: 30,
  maxPerLesson: 90,
} as const;

// ---------------------------------------------------------------------
// Phase B declarative seeds — seconds per attempt
// (was: lib/sessionAlgorithm/sessionNeed.ts)
// ---------------------------------------------------------------------

/**
 * Conservative per-attempt seconds for the Phase B goal-pace
 * planner. Phase B design table — replace with rolling averages
 * once ≥20 sessions of real per-attempt data exist per module (the
 * `targetSeconds` / block-timing capture landed May 2026;
 * calibration is weeks out).
 *
 * Only the in-scope modules are listed. Adding a module here is the
 * one-line change that brings it into Phase B planning — but only
 * after its attempt-counting path is verified clean.
 */
export const TIME_PER_ATTEMPT_SECONDS: Readonly<
  Record<'harmonic-fluency' | 'ear-training', number>
> = {
  'harmonic-fluency': 30,
  'ear-training':     30,
};

// ---------------------------------------------------------------------
// S&P chord-shape drill seeds — seconds per cell
// (was: modules/shapes-and-patterns/shapesSplit.ts)
// ---------------------------------------------------------------------

/** Per-cell drill time when an inversion state is null or one of
 *  root / inv1 / inv2 / inv3. */
export const CHORD_SHAPE_CELL_SECONDS = 90;

/** Per-cell drill time for the fluid inversion state — slightly
 *  longer because the all-inversion run is a synthesis exercise. */
export const CHORD_SHAPE_FLUID_CELL_SECONDS = 120;

// ---------------------------------------------------------------------
// S&P scale drill seeds — seconds per cell
// (was: shapesSplit.ts SCALE_KIND_SECONDS, and mirrored by
//  sessionGenerator.ts as PER_CELL_SECONDS_FALLBACK / _NAT_MIN)
// ---------------------------------------------------------------------

/** Per-cell drill seconds, sourced from SCALES_SUBMODULE_DESIGN.md
 *  Part 4: Time allocation. Maintenance scales (major) ride a fast
 *  30 s pass; drill scales (nat-min) get the 90 s drill window.
 *  Pent cells fan out to 3 starting points each — the warm-up
 *  surfaces ONE starting point per pent per key (the most-due,
 *  defaulting to the catalog's root position '1') to stay tight.
 *
 *  sessionGenerator.ts's loader previously kept its own mirror of
 *  this table (PER_CELL_SECONDS_FALLBACK / _NAT_MIN); it now reads
 *  this table directly. */
export const SCALE_KIND_SECONDS: Readonly<Record<ScaleKind, number>> = {
  'major':            30,
  'major-pentatonic': 30,
  'natural-minor':    90,
  'minor-pentatonic': 30,
};
