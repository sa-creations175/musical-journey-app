import { useState } from 'react';
import Modal from '../../components/Modal';
import { db, type Goal } from '../../lib/db';
import { earTrainingCounts, harmonicFluencyCounts, productionCounts, shapesCounts } from '../../lib/moduleItemCounts';
import { DASHBOARD_META, PRACTICE_SESSIONS_META, moduleMetaById } from '../../lib/moduleMeta';
import {
  AccuracySlider,
  BreadthYesNoPicker,
  ConsistencyControl,
  CountInput,
  DimensionSection,
  pruneMasteryToBreadth,
  useFocusDimension,
  type BreadthGroupOption,
  type BreadthState,
  type ConsistencyCadence,
} from './yearlyAnchorDimensions';
import {
  defaultAnchorName,
  dimensionRowsFor,
  summarizeAnchor,
} from './yearlyAnchorReview';
import { CategoryPillButton } from './GoalCreationFlow';
import { inputClass } from './formStyles';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
} from './coverageMetrics';
import {
  MASTERY_OVERALL_METRIC,
  MASTERY_SPECIFIC_METRIC,
} from './yearlyAnchorMetrics';
import { SONG_METRIC } from './songTarget';

/**
 * Phase 2 step 5b — YearlyAnchorFlow shell.
 *
 * A yearly anchor expresses the user's complete intention for ONE
 * module across one calendar year. It is *not* one goal — it is a
 * small goal cluster (umbrella + up to 4 dimension records) all
 * feeding one yearly umbrella, together expressing four dimensions:
 *
 *   Breadth  → what do you want to cover?
 *   Mastery  → what do you want to truly own?
 *   Depth    → how well do you want to know it?
 *   Consistency → how often will you show up?
 *
 * (Production runs 3 questions — depth/mastery merged. Practice
 * consistency is a meta-habit with its own 3 questions: weekly floor /
 * monthly floor / aspiration. See PRACTICE_SESSIONS_DESIGN_3.md
 * "Yearly Anchor Flow" section for the full per-module spec.)
 *
 * This shell ships:
 *   - Modal lifecycle (open / Esc / backdrop / X close)
 *   - Two-screen navigation (intent → review)
 *   - 2-dot indicator
 *   - Back / Next / Save buttons in the right positions
 *   - Per-screen title + module-aware copy
 *
 * Still to land:
 *   - 5c — Screen 1 dimension components per module
 *   - 5d — Screen 2 review (auto-name, per-dimension Edit links,
 *          natural-language summary)
 *   - 5e — Save logic (transactional umbrella + N dimension records)
 *   - 5f — Trigger interstitial wired into goal-creation entry points
 *   - 5g — Tests
 *
 * Edit mode (`initialAnchor` prop) is wired but the decoder is a 5d
 * concern; for 5b the prop is plumbed through and the title flips to
 * "Review your yearly anchor" without round-tripping data.
 *
 * Why a separate component (not a branch inside GoalCreationFlow):
 * the two flows answer different questions. GoalCreationFlow is
 * "create one goal at any scope"; YearlyAnchorFlow is "express the
 * full year's intention for a module as an umbrella + cluster."
 * They share Modal + StepDots styling and reuse `moduleItemCounts`
 * for live denominators, but their drafts, validation, and save
 * shape are distinct enough that interleaving them would cost
 * clarity. Per the design doc, YearlyAnchorFlow bypasses Step 3.5
 * entirely — no parent picker, the flow IS the umbrella creation.
 */

// ---- Module identity (local, will sync with GoalCreationFlow in 5f) ----

/**
 * Module identifiers used by this flow. Mirrors `ModuleCardId` in
 * GoalCreationFlow.tsx — kept local for 5b so the shell change is
 * self-contained. Step 5f will extract a shared type when the
 * trigger interstitial needs to hand identifiers between both flows;
 * if a third consumer appears, promote to a shared module then.
 */
export type AnchorModuleId =
  | 'ear-training'
  | 'harmonic-fluency'
  | 'repertoire'
  | 'shapes-and-patterns'
  | 'production'
  | 'practice-consistency';

export const MODULE_DISPLAY_NAME: Record<AnchorModuleId, string> = {
  'ear-training':         'Ear Training',
  'harmonic-fluency':     'Harmonic Fluency',
  'repertoire':           'Song Repertoire',
  'shapes-and-patterns':  'Shapes & Patterns',
  'production':           'Production',
  'practice-consistency': 'Practice consistency',
};

// ---- Screens ----------------------------------------------------------

type ScreenId = 'intent' | 'review';

const SCREENS: ReadonlyArray<{ id: ScreenId }> = [
  { id: 'intent' },
  { id: 'review' },
];

/**
 * Dimensions expressed on Screen 1, in the on-screen order specified
 * by the design doc. Screen 2's per-dimension Edit links take one
 * of these as a `focusDimension` prop so navigation back lands on
 * the right scrolled-into-view section.
 *
 * Production omits 'mastery' (depth/mastery merged). Practice
 * consistency uses its own three: weeklyFloor / monthlyFloor /
 * aspiration — they're widened into this union so the focus
 * machinery is uniform across all six modules.
 */
export type AnchorDimension =
  | 'breadth'
  | 'mastery'
  | 'depth'
  | 'consistency'
  | 'weeklyFloor'
  | 'monthlyFloor'
  | 'aspiration';

// ---- Draft state -----------------------------------------------------

/**
 * Working state for the in-flight anchor. 5b ships only the module +
 * editable umbrella name; per-dimension state lands in 5c. The shape
 * is intentionally permissive (each dimension's slot is optional)
 * because dimensions are independent and a user might leave one or
 * more empty.
 */
export interface AnchorDraft {
  moduleId: AnchorModuleId;
  /** Auto-generated default ("[Module] [Year]"); editable inline on
   *  Screen 2. Null until 5d wires the editable input — the resolved
   *  name at save time falls back to the auto default. */
  name: string | null;
  /** Per-module dimension state. Sparse object — only the slot
   *  matching `moduleId` is populated. Mirrors GoalCreationFlow's
   *  module-keyed sub-target pattern. 5c.1–5c.6 ship all six
   *  modules' slots. */
  earTraining?:         EarTrainingAnchor;
  harmonicFluency?:     HarmonicFluencyAnchor;
  shapesPatterns?:      ShapesPatternsAnchor;
  songRepertoire?:      SongRepertoireAnchor;
  production?:          ProductionAnchor;
  practiceConsistency?: PracticeConsistencyAnchor;
}

// =====================================================================
// Ear Training dimension state
// =====================================================================

/** Group identifiers for ET coverage / mastery. Match the spacingState
 *  moduleRefs (intervals, chord-recognition, chord-progressions,
 *  scales-modes) so progress reads route cleanly through Step 4's
 *  `getCoverageCount(metric, subArea)` — see comments in
 *  `progress.ts` for the moduleRef ↔ sub-area equivalence. */
export type EarTrainingGroupId =
  | 'intervals'
  | 'chord-recognition'
  | 'chord-progressions'
  | 'scales-modes';

export interface EarTrainingAnchor {
  breadth: BreadthState;
  /** Mastery's groupIds are always pruned to Breadth's scope by the
   *  coordinated `setBreadth` updater in Screen1EarTraining. State
   *  invariant: if breadth.kind === 'subset', every mastery groupId
   *  appears in breadth.groupIds. */
  mastery: { groupIds: EarTrainingGroupId[] };
  depth: { accuracyPercent: number };
  consistency: { count: number; cadence: ConsistencyCadence };
}

export const ET_GROUP_LABELS: Record<EarTrainingGroupId, string> = {
  'intervals':          'intervals',
  'chord-recognition':  'chord recognition',
  'chord-progressions': 'chord progressions',
  'scales-modes':       'scales & modes',
};

const ET_GROUP_IDS: ReadonlyArray<EarTrainingGroupId> = [
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
];

function defaultEarTraining(): EarTrainingAnchor {
  return {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };
}

/**
 * True when the ET anchor has at least one populated dimension —
 * enough to advance to Screen 2 and save. "Populated" means the
 * user has expressed a non-default intention; defaults that the
 * user never touched do not count as populated. We treat the
 * default Depth (80%) and Consistency (4 / week) as the user's
 * accepted defaults — they signal "yes, ship these." Empty subset
 * Breadth (the user toggled to "No" but hasn't picked any group
 * yet) does NOT count as populated and the upstream gate blocks
 * advance until they pick one.
 *
 * Spec call: at least one dimension populated. With defaults pre-
 * filled for Depth and Consistency, the user is always "ready" once
 * the file mounts unless they actively toggled to a Breadth subset
 * with no picks. That's the desired ergonomics — empty defaults
 * commit the user to "yes, the defaults are fine."
 */
function isEarTrainingValid(et: EarTrainingAnchor): boolean {
  // Block: user toggled Breadth to subset but hasn't picked any group.
  if (et.breadth.kind === 'subset' && et.breadth.groupIds.length === 0) return false;
  return true;
}

// =====================================================================
// Harmonic Fluency dimension state
// =====================================================================

/** Group identifiers for HF coverage / mastery. Mirror the four
 *  groups GoalCreationFlow already exposes via the
 *  HARMONIC_FLUENCY_COVERAGE_GROUPS constant — same kebab-case ids
 *  stored in `targetUnit` for HF coverage_specific goals — so any
 *  future progress read can treat the two surfaces interchangeably.
 *  Keys also match `HF_GROUP_CATEGORIES` in `progress.ts` so the
 *  Step 4 progress router resolves them with no translation. */
export type HarmonicFluencyGroupId =
  | 'foundational'
  | 'chord-knowledge'
  | 'functional-applied'
  | 'ear-recognition';

export interface HarmonicFluencyAnchor {
  breadth: BreadthState;
  /** Mastery's groupIds are pruned to Breadth's scope by the
   *  coordinated `setBreadth` updater. Same invariant as ET. */
  mastery: { groupIds: HarmonicFluencyGroupId[] };
  depth: { accuracyPercent: number };
  consistency: { count: number; cadence: ConsistencyCadence };
}

export const HF_GROUP_LABELS: Record<HarmonicFluencyGroupId, string> = {
  'foundational':       'foundational / math',
  'chord-knowledge':    'chord knowledge',
  'functional-applied': 'functional / applied',
  'ear-recognition':    'ear & recognition',
};

const HF_GROUP_IDS: ReadonlyArray<HarmonicFluencyGroupId> = [
  'foundational',
  'chord-knowledge',
  'functional-applied',
  'ear-recognition',
];

function defaultHarmonicFluency(): HarmonicFluencyAnchor {
  return {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };
}

function isHarmonicFluencyValid(hf: HarmonicFluencyAnchor): boolean {
  if (hf.breadth.kind === 'subset' && hf.breadth.groupIds.length === 0) return false;
  return true;
}

// =====================================================================
// Shapes & Patterns dimension state
// =====================================================================

/** Activity area identifiers for S&P coverage / depth / mastery.
 *  Snake_case to match the existing convention in `coverageMetrics.ts`,
 *  `progress.ts`, and `goal.targetUnit` storage on existing S&P
 *  coverage_specific goals. Mental Visualization is intentionally
 *  not represented — per the April 27 design call, it counts toward
 *  consistency only, not breadth/depth/mastery. Step 1e wires this
 *  into `itemRefForSkill` returning null. */
export type ShapesAreaId = 'chord_shape_drills' | 'scale_drills' | 'voice_leading';

export interface ShapesPatternsAnchor {
  breadth: BreadthState;
  /** Areas the user wants to reach Solid in across all 12 keys.
   *  Pre-filtered to Breadth scope. Empty is a valid resting state
   *  ("no Depth ambition declared this year"). */
  depth: { areaIds: ShapesAreaId[] };
  /** Areas the user wants to truly own at the `mastered` stage.
   *  v1 ships area-level multi-select per the locked design call —
   *  the design doc's item-level picker is filed as a Step 5b
   *  follow-up. Pre-filtered to Breadth scope, same coupling rule
   *  as Depth. Independent of Depth — a user can declare Mastery
   *  ambition on areas they did not target for Depth (uncommon but
   *  coherent: "I want to truly own chord shapes; voice-leading
   *  doesn't need Solid first"). */
  mastery: { areaIds: ShapesAreaId[] };
  /** Consistency unit for S&P is minutes per cadence (vs. ET / HF's
   *  sessions). Mental Visualization activity DOES count toward this
   *  even though it's excluded from the breadth/depth/mastery shape
   *  — its sessions still write to drillSessions and the consistency
   *  reader (Step 4b+) sums all S&P drill time. */
  consistency: { count: number; cadence: ConsistencyCadence };
}

export const SHAPES_AREA_LABELS: Record<ShapesAreaId, string> = {
  'chord_shape_drills': 'chord shape drills',
  'scale_drills':       'scale drills',
  'voice_leading':      'voice-leading',
};

const SHAPES_AREA_IDS: ReadonlyArray<ShapesAreaId> = [
  'chord_shape_drills',
  'scale_drills',
  'voice_leading',
];

function defaultShapesPatterns(): ShapesPatternsAnchor {
  return {
    breadth: { kind: 'all' },
    depth: { areaIds: [] },
    mastery: { areaIds: [] },
    // 30 min/week as a "casual but real" entry point — roughly 5 min
    // per session over 6 days. Crank-up via the input.
    consistency: { count: 30, cadence: 'week' },
  };
}

function isShapesPatternsValid(sp: ShapesPatternsAnchor): boolean {
  if (sp.breadth.kind === 'subset' && sp.breadth.groupIds.length === 0) return false;
  return true;
}

// =====================================================================
// Song Repertoire dimension state
// =====================================================================

/**
 * Songs is the biggest divergence so far. No group multi-pick — the
 * three dimensions are independent count inputs that map to the
 * canonical proficiency levels in escalating order:
 *
 *   Breadth  (Comfortable)  — "How many songs do you want to know
 *                              how to play by year end?"
 *   Depth    (Solid)        — "How many songs do you want to be
 *                              performance-ready?"
 *   Mastery  (Internalized) — "How many songs do you want to own so
 *                              deeply you could make someone cry,
 *                              yourself included?"
 *   Consistency             — sessions per cadence, same shape as
 *                              every other module.
 *
 * Cumulative validation: levels are nested — every Internalized
 * song is also Solid, and every Solid song is also Comfortable. The
 * design call is a **gentle non-blocking nudge** if the numbers
 * violate that ordering. Fires when masteryCount > depthCount or
 * depthCount > breadthCount; surfaces as an amber tip below the
 * count inputs. Save is never blocked.
 */
export interface SongRepertoireAnchor {
  /** Songs at Comfortable. */
  breadthCount: number;
  /** Songs at Solid. */
  depthCount: number;
  /** Songs at Internalized. */
  masteryCount: number;
  consistency: { count: number; cadence: ConsistencyCadence };
}

function defaultSongRepertoire(): SongRepertoireAnchor {
  return {
    breadthCount: 0,
    depthCount: 0,
    masteryCount: 0,
    consistency: { count: 4, cadence: 'week' },
  };
}

/**
 * Songs has no hard validation gate. CountInput clamps negatives.
 * Defaults pre-fill Consistency at 4/week so the user is always
 * "ready" to advance — even with all-zero counts the user can
 * commit to "this year is consistency-only, no specific song
 * targets." The cumulative-ordering check is a separate non-
 * blocking nudge (`songCumulativeNudge`) surfaced inline in the
 * UI; it does NOT participate in `canAdvance`.
 */
function isSongRepertoireValid(_sr: SongRepertoireAnchor): boolean {
  return true;
}

/**
 * Returns a non-blocking nudge string when the cumulative ordering
 * (Internalized ≤ Solid ≤ Comfortable) is violated, or null when
 * the numbers are coherent. Pure function; testable without React.
 *
 * Edge cases that are NOT a violation:
 *   - All zeros (user hasn't filled in)
 *   - Equal values (5/5/5 means "all 5 songs at every level" —
 *     unusual but coherent; the user is committing to a single set
 *     they want to bring to Internalized)
 *   - Partial fills with zeros at the deeper levels (5/3/0 — three
 *     of the five comfortable songs targeted for Solid, none for
 *     Internalized this year)
 *
 * Single combined message rather than per-violation — the design
 * call ("gentle non-blocking nudge") wants one tip, not a stack of
 * scolding lines.
 */
// =====================================================================
// Production dimension state
// =====================================================================

/** Path identifiers for Production coverage / depth. Match the
 *  PRODUCTION_PATHS const in `src/modules/production/content/paths.ts`
 *  AND the kebab-case `targetUnit` storage on existing Production
 *  coverage_specific goals. Keeps the yearly anchor surface
 *  interchangeable with the standalone coverage goal at the wire-
 *  format level. */
export type ProductionPathId =
  | 'workflow-foundations'
  | 'language-of-production'
  | 'vocal-production'
  | 'genre-productions'
  | 'arrangement'
  | 'business';

/**
 * Production runs **3 questions only** — Breadth / Depth /
 * Consistency. Mastery is deliberately omitted: the depth/mastery
 * distinction is deferred until more firsthand experience with the
 * lesson material exists (per the April 27 design call). The
 * yearlyAnchorMetrics.ts vocabulary mirrors this — there is no
 * production_mastery_at_mastered metric.
 */
export interface ProductionAnchor {
  breadth: BreadthState;
  /** Paths the user wants to go deepest on. Pre-filtered to Breadth
   *  scope, same coupling rule as S&P's areas. Empty is a valid
   *  resting state. */
  depth: { pathIds: ProductionPathId[] };
  /** Consistency unit for Production is hours per cadence (vs. ET /
   *  HF's sessions, S&P's minutes). Production sessions are
   *  meaningfully longer-form than ET/HF/S&P — a Genre Production
   *  arc lesson is ~25–40 minutes, multiple sessions chain. Hours
   *  reads more honestly than counting "sessions." */
  consistency: { count: number; cadence: ConsistencyCadence };
}

export const PRODUCTION_PATH_LABELS: Record<ProductionPathId, string> = {
  'workflow-foundations':    'workflow foundations',
  'language-of-production':  'the language of production',
  'vocal-production':        'vocal production',
  'genre-productions':       'genre productions',
  'arrangement':             'arrangement & song structure',
  'business':                'the business of music',
};

const PRODUCTION_PATH_IDS: ReadonlyArray<ProductionPathId> = [
  'workflow-foundations',
  'language-of-production',
  'vocal-production',
  'genre-productions',
  'arrangement',
  'business',
];

function defaultProduction(): ProductionAnchor {
  return {
    breadth: { kind: 'all' },
    depth: { pathIds: [] },
    // 2 hours/week as a "real but accessible" entry point — the
    // lesson material is dense enough that 1 hour rarely covers a
    // single deep-dive lesson, and 2 hours per week sustains a
    // single arc per month.
    consistency: { count: 2, cadence: 'week' },
  };
}

function isProductionValid(p: ProductionAnchor): boolean {
  if (p.breadth.kind === 'subset' && p.breadth.groupIds.length === 0) return false;
  return true;
}

// =====================================================================
// Practice Consistency dimension state (meta-habit)
// =====================================================================

/**
 * Practice consistency is a **meta-habit** — it doesn't anchor a
 * specific learning module, it anchors the rhythm of practice
 * itself across all modules. Three independent questions, no
 * breadth/depth/mastery shape:
 *
 *   Weekly floor  — minimum days per week the user wants to practice
 *   Monthly floor — minimum days per month (safety net for bad
 *                   weeks and vacations)
 *   Aspiration    — ideal days per week
 *
 * The floor feeds the consistency goal threshold and the algorithm's
 * behind-schedule detection. Aspiration feeds session-recommendation
 * ambition. Monthly floor is the safety net for bad weeks and
 * vacations — the user might miss two weeks but still hit their
 * monthly target.
 */
export interface PracticeConsistencyAnchor {
  weeklyFloor: number;   // days per week
  monthlyFloor: number;  // days per month
  aspiration: number;    // ideal days per week
}

function defaultPracticeConsistency(): PracticeConsistencyAnchor {
  // Defaults from the design doc spec:
  //   weekly floor   = 4 days/week
  //   monthly floor  = 18 days/month (4 weeks × 4 days + buffer)
  //   aspiration     = 5 days/week (within the spec's 5–7 range)
  return {
    weeklyFloor: 4,
    monthlyFloor: 18,
    aspiration: 5,
  };
}

/**
 * Practice consistency has no hard validation gate. Defaults pre-
 * fill all three floors and the aspiration so the user is always
 * "ready" to advance. CountInput clamps negatives. The cumulative-
 * ordering check (aspiration ≥ weeklyFloor recommended) is a
 * separate non-blocking nudge surfaced inline in the UI; it does
 * NOT participate in canAdvance.
 */
function isPracticeConsistencyValid(_pc: PracticeConsistencyAnchor): boolean {
  return true;
}

/**
 * Returns a non-blocking nudge string when the floors and
 * aspiration are inconsistent, or null when they're coherent.
 * Pure function; testable without React. Two violation classes:
 *
 *   1. aspiration < weeklyFloor — the user's "ideal" is below their
 *      "minimum"; the floor IS the aspiration in that case, which
 *      probably isn't what the user meant.
 *
 *   2. monthlyFloor < weeklyFloor × 4 — the monthly floor wouldn't
 *      survive even four weeks of hitting the weekly floor exactly.
 *      Almost certainly off by accident; the safety-net framing
 *      breaks down here.
 *
 * Single combined message rather than per-violation, mirroring
 * songCumulativeNudge's design call.
 */
export function practiceConsistencyNudge(
  pc: PracticeConsistencyAnchor,
): string | null {
  const aspirationBelowFloor = pc.aspiration < pc.weeklyFloor;
  const monthlyFloorTooLow   = pc.monthlyFloor < pc.weeklyFloor * 4;
  if (!aspirationBelowFloor && !monthlyFloorTooLow) return null;

  const issues: string[] = [];
  if (aspirationBelowFloor) {
    issues.push(
      `your aspiration (${pc.aspiration}/week) is below your weekly floor (${pc.weeklyFloor}/week)`,
    );
  }
  if (monthlyFloorTooLow) {
    issues.push(
      `your monthly floor (${pc.monthlyFloor}/month) is below ` +
      `${pc.weeklyFloor} × 4 = ${pc.weeklyFloor * 4} days`,
    );
  }
  return `Heads up — ${issues.join(' and ')}. Floor is a safety net, aspiration is the ideal — usually aspiration ≥ floor.`;
}

export function songCumulativeNudge(
  sr: SongRepertoireAnchor,
): string | null {
  const { breadthCount: c, depthCount: s, masteryCount: i } = sr;
  const violated = i > s || s > c;
  if (!violated) return null;
  return (
    `Heads up — Internalized songs are usually a subset of Solid, ` +
    `which are a subset of Comfortable. Your numbers ` +
    `(${c} comfortable / ${s} solid / ${i} internalized) suggest ` +
    `otherwise.`
  );
}

function buildInitialDraft(
  moduleId: AnchorModuleId,
  initialAnchor: Goal | null | undefined,
): AnchorDraft {
  // Edit mode (5d will flesh out): pull the umbrella's existing
  // name (its description, since umbrellas store the user-visible
  // name there). Create mode: name stays null and the auto default
  // resolves at save time.
  const draft: AnchorDraft = {
    moduleId,
    name: initialAnchor?.description ?? null,
  };
  // Seed the per-module slot for the chosen module.
  if (moduleId === 'ear-training') {
    draft.earTraining = defaultEarTraining();
  } else if (moduleId === 'harmonic-fluency') {
    draft.harmonicFluency = defaultHarmonicFluency();
  } else if (moduleId === 'shapes-and-patterns') {
    draft.shapesPatterns = defaultShapesPatterns();
  } else if (moduleId === 'repertoire') {
    draft.songRepertoire = defaultSongRepertoire();
  } else if (moduleId === 'production') {
    draft.production = defaultProduction();
  } else if (moduleId === 'practice-consistency') {
    draft.practiceConsistency = defaultPracticeConsistency();
  }
  return draft;
}

// =====================================================================
// Save: encoder + metric IDs
// =====================================================================

/**
 * New metric ids that YearlyAnchorFlow introduces alongside the
 * existing coverage / accuracy / proficiency vocabulary. Declared
 * here rather than in a separate vocabulary file because they're
 * consumed only by this flow's encoder; promote to a shared module
 * if a third consumer (Step 6 goal-row UI is the natural candidate)
 * needs them.
 *
 * `goalVocabulary.moduleForMetric` is extended in this commit to
 * route both prefixes (`practice_*`, `repertoire_*`) so the
 * existing entry-point selector keeps working without per-id
 * tweaks.
 */
const PRACTICE_WEEKLY_FLOOR_DAYS           = 'practice_weekly_floor_days';
const PRACTICE_MONTHLY_FLOOR_DAYS          = 'practice_monthly_floor_days';
const PRACTICE_ASPIRATION_DAYS_PER_WEEK    = 'practice_aspiration_days_per_week';

/**
 * Goal-record fields the encoder produces per dimension. The save
 * loop layers in shared fields (id, scope, parentGoalId, dates,
 * status, etc.) so this spec stays focused on what's dimension-
 * specific.
 */
export interface DimensionRecordSpec {
  description: string;
  targetMetric: string;
  targetValue: number | null;
  targetUnit: string | null;
  /** Multi-pick groups / areas / paths landing in `goal.relatedItems`.
   *  Per the locked design call: one row per dimension, multi-pick
   *  ids live in relatedItems[] rather than splitting into N sibling
   *  records. */
  relatedItems: string[];
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/** End of `year` in local time (Dec 31 23:59:59.999). The save uses
 *  this as the umbrella's targetDate so the anchor expires on the
 *  last moment of the calendar year. */
export function endOfYearMs(year: number): number {
  return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
}

/** Returns true when the user picked every group in the module's
 *  full set — used to decide between the `_overall` and
 *  `_specific` metric variants for Mastery dimensions whose
 *  membership signal is "all groupIds present" rather than an
 *  explicit kind discriminator. */
function arrayCoversFullSet<T extends string>(
  picked: ReadonlyArray<T>,
  full:   ReadonlyArray<T>,
): boolean {
  if (picked.length !== full.length) return false;
  const set = new Set(picked);
  for (const id of full) if (!set.has(id)) return false;
  return true;
}

// =====================================================================
// Encoder per module
// =====================================================================

function encodeEarTrainingDimensions(et: EarTrainingAnchor): DimensionRecordSpec[] {
  const records: DimensionRecordSpec[] = [];
  const counts = earTrainingCounts();
  const groupCount = (id: EarTrainingGroupId): number => {
    if (id === 'intervals')          return counts.intervals;
    if (id === 'chord-recognition')  return counts.chordRecognition;
    if (id === 'chord-progressions') return counts.chordProgressions;
    return counts.scalesModes;
  };

  // ---- Breadth ----
  if (et.breadth.kind === 'all') {
    records.push({
      description: `Cover all ${counts.total} ear training items by year-end`,
      targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING,
      targetValue: counts.total,
      targetUnit: 'items',
      relatedItems: [],
    });
  } else if (et.breadth.groupIds.length > 0) {
    const ids = et.breadth.groupIds as EarTrainingGroupId[];
    const sum = ids.reduce((s, id) => s + groupCount(id), 0);
    const labels = ids.map(id => ET_GROUP_LABELS[id]).join(' + ');
    records.push({
      description: `Cover ${sum} items in ${labels} by year-end`,
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetValue: sum,
      targetUnit: ids[0],
      relatedItems: ids,
    });
  }

  // ---- Mastery ----
  if (et.mastery.groupIds.length > 0) {
    const isAll = arrayCoversFullSet(et.mastery.groupIds, ET_GROUP_IDS);
    const sum = et.mastery.groupIds.reduce((s, id) => s + groupCount(id), 0);
    const labels = et.mastery.groupIds.map(id => ET_GROUP_LABELS[id]).join(' + ');
    records.push({
      description: isAll
        ? `Master all ${counts.total} ear training items by year-end`
        : `Master ${sum} items in ${labels} by year-end`,
      targetMetric: isAll ? MASTERY_OVERALL_METRIC.EAR_TRAINING : MASTERY_SPECIFIC_METRIC.EAR_TRAINING,
      targetValue: isAll ? counts.total : sum,
      targetUnit: isAll ? 'items' : et.mastery.groupIds[0],
      relatedItems: isAll ? [] : et.mastery.groupIds,
    });
  }

  // ---- Depth ----
  records.push({
    description: `Reach ${et.depth.accuracyPercent}% overall accuracy across Ear Training by year-end`,
    targetMetric: 'ear_training_accuracy_overall',
    targetValue: et.depth.accuracyPercent,
    targetUnit: '%',
    relatedItems: [],
  });

  // ---- Consistency: intentionally NOT a child goal record ----
  // Consistency is a recurring habit, not a cumulative target.
  // You can't make up missed sessions, and evaluating it
  // year-to-date produces misleading feasibility (4 months of
  // 0 sessions = unrecoverable, even if the user is just
  // starting). Tracking lives in weekly consistency goals,
  // not the yearly anchor. The umbrella's subtitle still
  // surfaces "Consistency" as a framework dimension so the
  // ambition stays visible.
  void et.consistency;

  return records;
}

function encodeHarmonicFluencyDimensions(hf: HarmonicFluencyAnchor): DimensionRecordSpec[] {
  const records: DimensionRecordSpec[] = [];
  const counts = harmonicFluencyCounts();
  const groupCount = (id: HarmonicFluencyGroupId): number => counts.byGroup[id as keyof typeof counts.byGroup] ?? 0;

  if (hf.breadth.kind === 'all') {
    records.push({
      description: `Cover all ${counts.total} harmonic fluency cards by year-end`,
      targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
      targetValue: counts.total,
      targetUnit: 'cards',
      relatedItems: [],
    });
  } else if (hf.breadth.groupIds.length > 0) {
    const ids = hf.breadth.groupIds as HarmonicFluencyGroupId[];
    const sum = ids.reduce((s, id) => s + groupCount(id), 0);
    const labels = ids.map(id => HF_GROUP_LABELS[id]).join(' + ');
    records.push({
      description: `Cover ${sum} cards in ${labels} by year-end`,
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetValue: sum,
      targetUnit: ids[0],
      relatedItems: ids,
    });
  }

  if (hf.mastery.groupIds.length > 0) {
    const isAll = arrayCoversFullSet(hf.mastery.groupIds, HF_GROUP_IDS);
    const sum = hf.mastery.groupIds.reduce((s, id) => s + groupCount(id), 0);
    const labels = hf.mastery.groupIds.map(id => HF_GROUP_LABELS[id]).join(' + ');
    records.push({
      description: isAll
        ? `Master all ${counts.total} harmonic fluency cards by year-end`
        : `Master ${sum} cards in ${labels} by year-end`,
      targetMetric: isAll ? MASTERY_OVERALL_METRIC.HARMONIC_FLUENCY : MASTERY_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetValue: isAll ? counts.total : sum,
      targetUnit: isAll ? 'cards' : hf.mastery.groupIds[0],
      relatedItems: isAll ? [] : hf.mastery.groupIds,
    });
  }

  records.push({
    description: `Reach ${hf.depth.accuracyPercent}% overall accuracy across Harmonic Fluency by year-end`,
    targetMetric: 'harmonic_fluency_accuracy_overall',
    targetValue: hf.depth.accuracyPercent,
    targetUnit: '%',
    relatedItems: [],
  });

  // Consistency dimension intentionally not a child record —
  // see encodeEarTrainingDimensions for the rationale.
  void hf.consistency;

  return records;
}

function encodeShapesDimensions(sp: ShapesPatternsAnchor): DimensionRecordSpec[] {
  const records: DimensionRecordSpec[] = [];
  const counts = shapesCounts();
  const areaCount = (id: ShapesAreaId): number => {
    if (id === 'chord_shape_drills') return counts.chordShapeDrills;
    if (id === 'scale_drills')        return counts.scaleDrills;
    return counts.voiceLeading;
  };

  if (sp.breadth.kind === 'all') {
    records.push({
      description: `Cover all ${counts.total} shapes by year-end`,
      targetMetric: COVERAGE_OVERALL_METRIC.SHAPES,
      targetValue: counts.total,
      targetUnit: 'shapes',
      relatedItems: [],
    });
  } else if (sp.breadth.groupIds.length > 0) {
    const ids = sp.breadth.groupIds as ShapesAreaId[];
    const sum = ids.reduce((s, id) => s + areaCount(id), 0);
    const labels = ids.map(id => SHAPES_AREA_LABELS[id]).join(' + ');
    records.push({
      description: `Cover ${sum} shapes in ${labels} by year-end`,
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetValue: sum,
      targetUnit: ids[0],
      relatedItems: ids,
    });
  }

  // S&P Depth: "Reach Solid in {areas}". Encoded with the existing
  // shapes_proficiency_overall metric, targetUnit carrying the
  // area:level pair. Multi-area picks ride in relatedItems[] per
  // the locked one-row-per-dimension design call.
  if (sp.depth.areaIds.length > 0) {
    const labels = sp.depth.areaIds.map(id => SHAPES_AREA_LABELS[id]).join(' + ');
    records.push({
      description: `Reach Solid in ${labels} across all 12 keys by year-end`,
      targetMetric: 'shapes_proficiency_overall',
      targetValue: null,
      targetUnit: `${sp.depth.areaIds[0]}:solid`,
      relatedItems: sp.depth.areaIds,
    });
  }

  if (sp.mastery.areaIds.length > 0) {
    const isAll = arrayCoversFullSet(sp.mastery.areaIds, SHAPES_AREA_IDS);
    const sum = sp.mastery.areaIds.reduce((s, id) => s + areaCount(id), 0);
    const labels = sp.mastery.areaIds.map(id => SHAPES_AREA_LABELS[id]).join(' + ');
    records.push({
      description: isAll
        ? `Truly own all ${counts.total} shapes by year-end`
        : `Truly own ${sum} shapes in ${labels} by year-end`,
      targetMetric: isAll ? MASTERY_OVERALL_METRIC.SHAPES : MASTERY_SPECIFIC_METRIC.SHAPES,
      targetValue: isAll ? counts.total : sum,
      targetUnit: isAll ? 'shapes' : sp.mastery.areaIds[0],
      relatedItems: isAll ? [] : sp.mastery.areaIds,
    });
  }

  // Consistency dimension intentionally not a child record —
  // see encodeEarTrainingDimensions for the rationale.
  void sp.consistency;

  return records;
}

function encodeSongRepertoireDimensions(sr: SongRepertoireAnchor): DimensionRecordSpec[] {
  const records: DimensionRecordSpec[] = [];

  if (sr.breadthCount > 0) {
    records.push({
      description: `Reach Comfortable on ${sr.breadthCount} song${sr.breadthCount === 1 ? '' : 's'} by year-end`,
      targetMetric: SONG_METRIC.WHOLE,
      targetValue: sr.breadthCount,
      targetUnit: 'comfortable',
      relatedItems: [],
    });
  }
  if (sr.depthCount > 0) {
    records.push({
      description: `Reach Solid on ${sr.depthCount} song${sr.depthCount === 1 ? '' : 's'} by year-end`,
      targetMetric: SONG_METRIC.WHOLE,
      targetValue: sr.depthCount,
      targetUnit: 'solid',
      relatedItems: [],
    });
  }
  if (sr.masteryCount > 0) {
    records.push({
      description: `Reach Internalized on ${sr.masteryCount} song${sr.masteryCount === 1 ? '' : 's'} by year-end`,
      targetMetric: SONG_METRIC.WHOLE,
      targetValue: sr.masteryCount,
      targetUnit: 'internalized',
      relatedItems: [],
    });
  }
  // Consistency dimension intentionally not a child record —
  // see encodeEarTrainingDimensions for the rationale.
  void sr.consistency;

  return records;
}

function encodeProductionDimensions(p: ProductionAnchor): DimensionRecordSpec[] {
  const records: DimensionRecordSpec[] = [];
  const counts = productionCounts();
  const pathCount = (id: ProductionPathId): number => counts.byPath[id] ?? 0;

  if (p.breadth.kind === 'all') {
    records.push({
      description: `Work through all ${counts.total} production lessons by year-end`,
      targetMetric: COVERAGE_OVERALL_METRIC.PRODUCTION,
      targetValue: counts.total,
      targetUnit: 'lessons',
      relatedItems: [],
    });
  } else if (p.breadth.groupIds.length > 0) {
    const ids = p.breadth.groupIds as ProductionPathId[];
    const sum = ids.reduce((s, id) => s + pathCount(id), 0);
    const labels = ids.map(id => PRODUCTION_PATH_LABELS[id]).join(' + ');
    records.push({
      description: `Work through ${sum} lessons in ${labels} by year-end`,
      targetMetric: COVERAGE_SPECIFIC_METRIC.PRODUCTION,
      targetValue: sum,
      targetUnit: ids[0],
      relatedItems: ids,
    });
  }

  // Production Depth: "Go deepest on {paths}". Reuses
  // production_path_completion (existing metric for path-level
  // depth goals) with relatedItems carrying multi-pick paths per
  // the one-row-per-dimension design call.
  if (p.depth.pathIds.length > 0) {
    const sum = p.depth.pathIds.reduce((s, id) => s + pathCount(id), 0);
    const labels = p.depth.pathIds.map(id => PRODUCTION_PATH_LABELS[id]).join(' + ');
    records.push({
      description: `Go deepest on ${labels} (${sum} lessons) by year-end`,
      targetMetric: 'production_path_completion',
      targetValue: sum,
      targetUnit: p.depth.pathIds[0],
      relatedItems: p.depth.pathIds,
    });
  }

  // Consistency dimension intentionally not a child record —
  // see encodeEarTrainingDimensions for the rationale.
  void p.consistency;

  return records;
}

function encodePracticeConsistencyDimensions(pc: PracticeConsistencyAnchor): DimensionRecordSpec[] {
  return [
    {
      description: `Hold a weekly floor of ${pc.weeklyFloor} day${pc.weeklyFloor === 1 ? '' : 's'} per week`,
      targetMetric: PRACTICE_WEEKLY_FLOOR_DAYS,
      targetValue: pc.weeklyFloor,
      targetUnit: 'days/week',
      relatedItems: [],
    },
    {
      description: `Hold a monthly floor of ${pc.monthlyFloor} day${pc.monthlyFloor === 1 ? '' : 's'} per month`,
      targetMetric: PRACTICE_MONTHLY_FLOOR_DAYS,
      targetValue: pc.monthlyFloor,
      targetUnit: 'days/month',
      relatedItems: [],
    },
    {
      description: `Aspire to ${pc.aspiration} day${pc.aspiration === 1 ? '' : 's'} per week`,
      targetMetric: PRACTICE_ASPIRATION_DAYS_PER_WEEK,
      targetValue: pc.aspiration,
      targetUnit: 'days/week',
      relatedItems: [],
    },
  ];
}

/**
 * Options for `saveAnchor` — exposed so deterministic tests can
 * pin timestamps + ids without monkey-patching `Date.now` or
 * `Math.random`. Production callers (the React component's
 * `handleSave`) pass only `initialAnchor`.
 */
export interface SaveAnchorOpts {
  /** When set, save is in edit-mode: umbrella id is reused,
   *  startDate / status / lastEngagedAt / currentValue carry over,
   *  and existing children of this umbrella are deleted before
   *  the new dimension records are written. */
  initialAnchor?: Goal | null;
  /** Override "now" timestamp. Default `Date.now()`. */
  now?: number;
  /** Override the year for `targetDate` and the auto-generated
   *  default name. Default `new Date().getFullYear()`. */
  year?: number;
  /** Override id generation for deterministic test ids. Default
   *  uses the file-local `uid` helper. */
  uidFactory?: (prefix: string) => string;
}

/** Returned by `saveAnchor` so callers (and tests) can inspect the
 *  exact rows that landed in `db.goals`. */
export interface SaveAnchorResult {
  umbrella: Goal;
  children: Goal[];
}

/**
 * Pure-ish save: encodes the draft, opens a transaction, writes the
 * umbrella + children, and (in edit mode) deletes the previous
 * children. Returns the written rows.
 *
 * Returns `null` when the draft produces zero dimension records
 * (e.g. an entirely-empty Practice consistency anchor with no
 * questions answered, or a draft whose module slot is missing).
 * The caller should treat null as "nothing to save"; the React
 * `handleSave` warn-and-aborts on null so the user doesn't see a
 * false "saved" toast.
 */
export async function saveAnchor(
  draft: AnchorDraft,
  opts: SaveAnchorOpts = {},
): Promise<SaveAnchorResult | null> {
  const year = opts.year ?? new Date().getFullYear();
  const now = opts.now ?? Date.now();
  const idFor = opts.uidFactory ?? uid;
  const targetDate = endOfYearMs(year);
  const initialAnchor = opts.initialAnchor ?? null;
  const isEditing = !!initialAnchor;

  const specs = encodeDimensionRecords(draft);
  if (specs.length === 0) return null;

  const umbrellaId = isEditing ? initialAnchor!.id : idFor('goal');
  const resolvedName = (draft.name?.trim()) || defaultAnchorName(draft.moduleId, year);
  const startDate = isEditing ? initialAnchor!.startDate : now;

  const umbrella: Goal = {
    id: umbrellaId,
    scope: 'yearly',
    description: resolvedName,
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: isEditing ? initialAnchor!.currentValue : 0,
    contextTag: null,
    relatedModules: [draft.moduleId],
    relatedItems: [],
    startDate,
    targetDate,
    status: isEditing ? initialAnchor!.status : 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: true,
    lastEngagedAt: isEditing ? initialAnchor!.lastEngagedAt : now,
  };

  const children: Goal[] = specs.map(spec => ({
    id: idFor('goal'),
    scope: 'yearly',
    description: spec.description,
    targetMetric: spec.targetMetric,
    targetValue: spec.targetValue,
    targetUnit: spec.targetUnit,
    currentValue: 0,
    contextTag: null,
    relatedModules: [draft.moduleId],
    relatedItems: spec.relatedItems,
    startDate,
    targetDate,
    status: 'active',
    parentGoalId: umbrellaId,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
  }));

  // Read existing child ids OUTSIDE the transaction so the read
  // isn't gated by the rw-lock. The result is small (≤ 4 typically)
  // and we re-confirm via parentGoalId equality on delete inside
  // the transaction.
  const existingChildIds: string[] = isEditing
    ? (await db.goals.where('parentGoalId').equals(umbrellaId).toArray())
        .map(c => c.id)
    : [];

  await db.transaction('rw', db.goals, async () => {
    for (const id of existingChildIds) {
      await db.goals.delete(id);
    }
    await db.goals.put(umbrella);
    for (const child of children) {
      await db.goals.put(child);
    }
  });

  return { umbrella, children };
}

/**
 * Top-level dispatcher. Returns the per-dimension record specs for
 * the active module slot on the draft. Save logic layers shared
 * fields (id, parentGoalId, dates, status) over each spec.
 */
export function encodeDimensionRecords(draft: AnchorDraft): DimensionRecordSpec[] {
  if (draft.moduleId === 'ear-training' && draft.earTraining) {
    return encodeEarTrainingDimensions(draft.earTraining);
  }
  if (draft.moduleId === 'harmonic-fluency' && draft.harmonicFluency) {
    return encodeHarmonicFluencyDimensions(draft.harmonicFluency);
  }
  if (draft.moduleId === 'shapes-and-patterns' && draft.shapesPatterns) {
    return encodeShapesDimensions(draft.shapesPatterns);
  }
  if (draft.moduleId === 'repertoire' && draft.songRepertoire) {
    return encodeSongRepertoireDimensions(draft.songRepertoire);
  }
  if (draft.moduleId === 'production' && draft.production) {
    return encodeProductionDimensions(draft.production);
  }
  if (draft.moduleId === 'practice-consistency' && draft.practiceConsistency) {
    return encodePracticeConsistencyDimensions(draft.practiceConsistency);
  }
  return [];
}

// ---- Props -----------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which module this anchor is for. Required — yearly anchors are
   *  per-module by design. Step 5f's trigger interstitial passes
   *  this through from the user's module-card selection. */
  moduleId: AnchorModuleId;
  /** When set, opens in edit mode pre-filled from this umbrella
   *  goal. Decoder is a 5d concern; 5b plumbs the prop through and
   *  reuses the umbrella's `description` as the initial name. */
  initialAnchor?: Goal | null;
  /** Optional initial focused dimension. Used when Screen 2's
   *  per-dimension Edit link routes back to Screen 1; the dimension
   *  is scrolled into view. Wired in 5d. */
  focusDimension?: AnchorDimension | null;
}

// =====================================================================
// Component
// =====================================================================

export default function YearlyAnchorFlow({
  open,
  onClose,
  moduleId,
  initialAnchor,
  focusDimension: initialFocusDimension,
}: Props) {
  const [screenIndex, setScreenIndex] = useState(0);
  const [draft, setDraft] = useState<AnchorDraft>(() =>
    buildInitialDraft(moduleId, initialAnchor),
  );
  const [saving, setSaving] = useState(false);
  /** Active focus target for Screen 1's scroll-into-view behavior.
   *  Set by Screen 2's per-dimension Edit links, and seeded from the
   *  optional `focusDimension` prop on first mount. Cleared when the
   *  user advances Screen 1 → Screen 2 (so a subsequent Back doesn't
   *  re-trigger the scroll). */
  const [focusDim, setFocusDim] = useState<AnchorDimension | null>(
    initialFocusDimension ?? null,
  );

  /**
   * Wrap the parent's onClose so every close path resets the flow
   * to Screen 1 with a freshly-rebuilt initial draft. Routed to:
   * Modal's Esc/backdrop/X (via the onClose prop below), Back on
   * Screen 1 (via goBack), and Save (via goNext on the last screen).
   * Re-opening always lands on Screen 1.
   */
  const handleClose = () => {
    setScreenIndex(0);
    setDraft(buildInitialDraft(moduleId, initialAnchor));
    setSaving(false);
    setFocusDim(null);
    onClose();
  };

  /**
   * Save the anchor: one umbrella + N dimension records, written in
   * a single transaction so a partial failure leaves no orphaned
   * children and no half-anchored umbrella.
   *
   * Create mode (no `initialAnchor`):
   *   - umbrella id is freshly generated
   *   - dimension records all get fresh ids and parentGoalId =
   *     umbrella id
   *
   * Edit mode (`initialAnchor` is the existing umbrella):
   *   - umbrella id is REUSED (preserves any cross-app references)
   *   - currentValue / startDate / lastEngagedAt carry over
   *   - existing children are deleted and recreated from the current
   *     draft. Destructive on edit, but simpler than diff-and-patch
   *     and robust to dimension-shape changes (e.g. user adds a
   *     Mastery row that didn't exist before, or removes one). The
   *     children's currentValue resets to 0 — Phase 5's auto-progress
   *     will recompute from spacingState on next render.
   *
   * The umbrella name (`draft.name`) is preserved as typed; an empty
   * value falls back to `defaultAnchorName(moduleId, year)`.
   */
  const handleSave = async () => {
    if (saving) return;
    if (!canAdvance) return;
    setSaving(true);
    try {
      const result = await saveAnchor(draft, { initialAnchor });
      if (!result) {
        console.warn('[yearly-anchor] no dimension records produced; aborting save');
        setSaving(false);
        return;
      }
      handleClose();
    } catch (err) {
      console.warn('[yearly-anchor] save failed', err);
      setSaving(false);
    }
  };

  const screen = SCREENS[screenIndex];
  const isFirst = screenIndex === 0;
  const isLast = screenIndex === SCREENS.length - 1;
  /** Per-screen advance gate. Screen 1's gate routes through the
   *  active module's validator; Screen 2's Save shares the gate.
   *  When a module's slot isn't yet populated (5c.5–5c.6 land the
   *  rest), we let the user advance so the shell is reachable end-
   *  to-end during the build. */
  const canAdvance = (() => {
    if (moduleId === 'ear-training' && draft.earTraining) {
      return isEarTrainingValid(draft.earTraining);
    }
    if (moduleId === 'harmonic-fluency' && draft.harmonicFluency) {
      return isHarmonicFluencyValid(draft.harmonicFluency);
    }
    if (moduleId === 'shapes-and-patterns' && draft.shapesPatterns) {
      return isShapesPatternsValid(draft.shapesPatterns);
    }
    if (moduleId === 'repertoire' && draft.songRepertoire) {
      return isSongRepertoireValid(draft.songRepertoire);
    }
    if (moduleId === 'production' && draft.production) {
      return isProductionValid(draft.production);
    }
    if (moduleId === 'practice-consistency' && draft.practiceConsistency) {
      return isPracticeConsistencyValid(draft.practiceConsistency);
    }
    return true;
  })();

  const goBack = () => {
    if (isFirst) handleClose();
    else setScreenIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canAdvance || saving) return;
    if (isLast) {
      void handleSave();
      return;
    }
    // Clear focus on Screen 1 → Screen 2 advance so the next Back
    // navigation (or the next Edit-link click) starts from a clean
    // state rather than re-triggering the previous scroll.
    setFocusDim(null);
    setScreenIndex(i => Math.min(SCREENS.length - 1, i + 1));
  };

  /** Edit-link handler from Screen 2: focus a dimension and route
   *  back to Screen 1. The useFocusDimension hook on the active
   *  Screen 1 component reacts to focusDim and scrolls the matching
   *  DimensionSection into view. */
  const goToDimension = (dim: AnchorDimension) => {
    setFocusDim(dim);
    setScreenIndex(0);
  };

  const updateDraft = (patch: Partial<AnchorDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
  };

  // ---- Title ----------------------------------------------------------

  const moduleName = MODULE_DISPLAY_NAME[moduleId];
  const title = screen.id === 'intent'
    ? `Set your yearly intention for ${moduleName}`
    : 'Review your yearly anchor';

  // ---- Footer ---------------------------------------------------------

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={goBack}
        className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Back
      </button>
      <ScreenDots currentIndex={screenIndex} total={SCREENS.length} />
      <button
        type="button"
        onClick={goNext}
        disabled={!canAdvance || saving}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLast ? (saving ? 'Saving…' : 'Save anchor') : 'Next'}
      </button>
    </div>
  );

  // ---- Render ---------------------------------------------------------

  return (
    <Modal open={open} onClose={handleClose} title={title} footer={footer}>
      {screen.id === 'intent' ? (
        <ScreenIntent draft={draft} onUpdate={updateDraft} focusDimension={focusDim} />
      ) : (
        <ScreenReview draft={draft} onUpdate={updateDraft} onEditDimension={goToDimension} />
      )}
    </Modal>
  );
}

// =====================================================================
// Screen 1 — Set your intention
// =====================================================================

/**
 * Per-module router. Each module's dimension surface is its own
 * component below; this wrapper picks the right one and renders the
 * shared intro paragraph above it. All six modules now have surfaces
 * (5c.1–5c.6 complete) so the placeholder fall-through is gone.
 *
 * Dimension order on Screen 1 matches the design call:
 *   Breadth → Mastery → Depth → Consistency
 * (Production omits Mastery; Songs swaps to count-based dimensions;
 *  Practice consistency uses a different 3-question shape entirely.)
 */
function ScreenIntent({
  draft,
  onUpdate,
  focusDimension,
}: {
  draft: AnchorDraft;
  onUpdate: (patch: Partial<AnchorDraft>) => void;
  focusDimension: AnchorDimension | null;
}) {
  const moduleName = MODULE_DISPLAY_NAME[draft.moduleId];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        A yearly anchor sets your full intention for {moduleName}. It's a small
        cluster of goals that together describe what you want to cover, how
        deeply, and how often.
      </p>
      {draft.moduleId === 'ear-training' && draft.earTraining && (
        <Screen1EarTraining
          state={draft.earTraining}
          onChange={next => onUpdate({ earTraining: next })}
          focusDimension={focusDimension}
        />
      )}
      {draft.moduleId === 'harmonic-fluency' && draft.harmonicFluency && (
        <Screen1HarmonicFluency
          state={draft.harmonicFluency}
          onChange={next => onUpdate({ harmonicFluency: next })}
          focusDimension={focusDimension}
        />
      )}
      {draft.moduleId === 'shapes-and-patterns' && draft.shapesPatterns && (
        <Screen1ShapesPatterns
          state={draft.shapesPatterns}
          onChange={next => onUpdate({ shapesPatterns: next })}
          focusDimension={focusDimension}
        />
      )}
      {draft.moduleId === 'repertoire' && draft.songRepertoire && (
        <Screen1SongRepertoire
          state={draft.songRepertoire}
          onChange={next => onUpdate({ songRepertoire: next })}
          focusDimension={focusDimension}
        />
      )}
      {draft.moduleId === 'production' && draft.production && (
        <Screen1Production
          state={draft.production}
          onChange={next => onUpdate({ production: next })}
          focusDimension={focusDimension}
        />
      )}
      {draft.moduleId === 'practice-consistency' && draft.practiceConsistency && (
        <Screen1PracticeConsistency
          state={draft.practiceConsistency}
          onChange={next => onUpdate({ practiceConsistency: next })}
          focusDimension={focusDimension}
        />
      )}
    </div>
  );
}

// =====================================================================
// Ear Training — dimension surface
// =====================================================================

/**
 * Ear Training dimension surface. Four sections in
 * Breadth → Mastery → Depth → Consistency order. Mastery's group
 * options are pre-filtered to the Breadth selection; the
 * coordinated `setBreadth` updater also prunes Mastery's selected
 * groupIds when Breadth narrows so state stays truthful at all
 * times (per the locked design — pruning is destructive; widening
 * Breadth back to "all" does not restore previously-pruned
 * selections).
 *
 * Live denominators come from `earTrainingCounts()` (Step 3) so the
 * Breadth question's "all 143 items" wording flows from the catalog
 * rather than hardcoded copy. Mastery, Depth, and Consistency all
 * use shared primitives from `yearlyAnchorDimensions.tsx`.
 */
function Screen1EarTraining({
  state,
  onChange,
  focusDimension,
}: {
  state: EarTrainingAnchor;
  onChange: (next: EarTrainingAnchor) => void;
  focusDimension: AnchorDimension | null;
}) {
  useFocusDimension(focusDimension);
  const counts = earTrainingCounts();
  // Single ET module accent for the breadth pills. ET groups don't
  // have pre-existing per-group accent definitions (unlike HF, which
  // maps each of the 4 groups to a borrowed module color); single-
  // accent reads cleanly at 4-pill scale.
  const etAccent = moduleMetaById('ear-training')?.accentHex ?? '#5a8752';

  const breadthGroupOptions: BreadthGroupOption[] = ET_GROUP_IDS.map(id => ({
    id,
    label: ET_GROUP_LABELS[id],
    accentHex: etAccent,
  }));

  // Coordinated updater: when Breadth changes, Mastery's selected
  // groupIds are pruned to the new Breadth scope in the same call.
  // pruneMasteryToBreadth is unit-tested in
  // yearlyAnchorDimensions.test.ts.
  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedMasteryIds = pruneMasteryToBreadth(
      nextBreadth,
      state.mastery.groupIds,
    ) as EarTrainingGroupId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      mastery: { groupIds: prunedMasteryIds },
    });
  };

  // Mastery's visible options are filtered to Breadth's scope.
  const visibleMasteryGroups: ReadonlyArray<EarTrainingGroupId> =
    state.breadth.kind === 'all'
      ? ET_GROUP_IDS
      : ET_GROUP_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleMasteryGroup = (id: EarTrainingGroupId) => {
    const has = state.mastery.groupIds.includes(id);
    const next = has
      ? state.mastery.groupIds.filter(g => g !== id)
      : [...state.mastery.groupIds, id];
    onChange({ ...state, mastery: { groupIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        id="breadth"
        question={`Do you want to work through all ${counts.total} ear training items this year?`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work through all ${counts.total} items`}
          noLabel="No — just specific groups"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Mastery"
        id="mastery"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one group above to choose what to master.'
            : 'Are there specific groups you want to truly master?'
        }
      >
        {visibleMasteryGroups.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No groups available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleMasteryGroups.map(id => (
              <CategoryPillButton
                key={id}
                label={ET_GROUP_LABELS[id]}
                accentHex={etAccent}
                active={state.mastery.groupIds.includes(id)}
                onClick={() => toggleMasteryGroup(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Depth"
        id="depth"
        question="What overall accuracy level do you want to reach across all of Ear Training by year end?"
      >
        <AccuracySlider
          value={state.depth.accuracyPercent}
          onChange={p => onChange({ ...state, depth: { accuracyPercent: p } })}
        />
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        id="consistency"
        question="How many times per week do you want to practice Ear Training?"
      >
        <ConsistencyControl
          unit="sessions"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Harmonic Fluency — dimension surface
// =====================================================================

/**
 * Harmonic Fluency dimension surface. Same four-section shape as
 * Ear Training (Breadth → Mastery → Depth → Consistency) but with
 * HF's four groups (Foundational / Math, Chord Knowledge,
 * Functional / Applied, Ear & Recognition) and per-group accent
 * colors so the picker reads the same as GoalCreationFlow's
 * existing accuracy-specific HF picker. Slate-blue / deep-rose /
 * teal / forest-green — borrowed from sibling modules so each group
 * carries its own visual identity at 4-pill scale.
 *
 * Coordinated breadth/mastery pruning, validation, and live
 * denominator from harmonicFluencyCounts() (Step 3) all mirror the
 * ET surface — only the group set + accents differ.
 *
 * Note: the design doc lists per-group descriptions
 * ("Foundational / Math — The building blocks…"). Those are not
 * surfaced on Screen 1 today (4 pills with clear labels read
 * cleanly without expanded copy); filed as Phase 7 polish if
 * onboarding signals the need.
 */
function Screen1HarmonicFluency({
  state,
  onChange,
  focusDimension,
}: {
  state: HarmonicFluencyAnchor;
  onChange: (next: HarmonicFluencyAnchor) => void;
  focusDimension: AnchorDimension | null;
}) {
  useFocusDimension(focusDimension);
  const counts = harmonicFluencyCounts();

  // Per-group accent palette — mirrors the existing
  // HARMONIC_FLUENCY_COVERAGE_GROUPS in GoalCreationFlow.tsx so the
  // two surfaces stay in lockstep visually. If a hex is ever retuned
  // in moduleMeta the change flows through here.
  const HF_GROUP_ACCENTS: Record<HarmonicFluencyGroupId, string> = {
    'foundational':       DASHBOARD_META.accentHex,                                        // slate-blue
    'chord-knowledge':    moduleMetaById('repertoire')?.accentHex      ?? '#a8556b',        // deep rose
    'functional-applied': PRACTICE_SESSIONS_META.accentHex,                                // teal
    'ear-recognition':    moduleMetaById('ear-training')?.accentHex    ?? '#5a8752',        // forest green
  };

  const breadthGroupOptions: BreadthGroupOption[] = HF_GROUP_IDS.map(id => ({
    id,
    label: HF_GROUP_LABELS[id],
    accentHex: HF_GROUP_ACCENTS[id],
  }));

  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedMasteryIds = pruneMasteryToBreadth(
      nextBreadth,
      state.mastery.groupIds,
    ) as HarmonicFluencyGroupId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      mastery: { groupIds: prunedMasteryIds },
    });
  };

  const visibleMasteryGroups: ReadonlyArray<HarmonicFluencyGroupId> =
    state.breadth.kind === 'all'
      ? HF_GROUP_IDS
      : HF_GROUP_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleMasteryGroup = (id: HarmonicFluencyGroupId) => {
    const has = state.mastery.groupIds.includes(id);
    const next = has
      ? state.mastery.groupIds.filter(g => g !== id)
      : [...state.mastery.groupIds, id];
    onChange({ ...state, mastery: { groupIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        id="breadth"
        question={`Do you want to work through all ${counts.total} harmonic fluency cards this year?`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work through all ${counts.total} cards`}
          noLabel="No — just specific groups"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Mastery"
        id="mastery"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one group above to choose what to master.'
            : 'Are there specific areas you want to truly master?'
        }
      >
        {visibleMasteryGroups.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No groups available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleMasteryGroups.map(id => (
              <CategoryPillButton
                key={id}
                label={HF_GROUP_LABELS[id]}
                accentHex={HF_GROUP_ACCENTS[id]}
                active={state.mastery.groupIds.includes(id)}
                onClick={() => toggleMasteryGroup(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Depth"
        id="depth"
        question="What overall accuracy level do you want to reach across all of Harmonic Fluency by year end?"
      >
        <AccuracySlider
          value={state.depth.accuracyPercent}
          onChange={p => onChange({ ...state, depth: { accuracyPercent: p } })}
        />
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        id="consistency"
        question="How many times per week do you want to practice Harmonic Fluency?"
      >
        <ConsistencyControl
          unit="sessions"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Shapes & Patterns — dimension surface
// =====================================================================

/**
 * Shapes & Patterns dimension surface. First divergence from the
 * ET / HF pattern:
 *
 *   - **Depth is a multi-pick area selector**, not an accuracy
 *     slider. The question is "Which areas do you want to reach
 *     Solid in across all 12 keys?" — area-level, not module-wide
 *     percent.
 *
 *   - **Mastery is also area-level for v1** (per the locked Q5
 *     answer). The design doc's item-level "specific shapes you
 *     want to truly own" picker is filed as a Step 5b follow-up.
 *
 *   - **Both Depth and Mastery are pre-filtered to Breadth**, using
 *     the same `pruneMasteryToBreadth` helper as ET / HF. The
 *     coordinated `setBreadth` updater prunes both in the same
 *     state update so neither dimension can hold area ids that fell
 *     outside the active Breadth scope.
 *
 *   - **Consistency unit is minutes/week**, not sessions, mirroring
 *     S&P's session-time tracking (drillSessions write durations).
 *     Mental Visualization activity DOES count toward this even
 *     though it's excluded from breadth/depth/mastery.
 *
 * Single S&P module accent for all three pills — same call as
 * GoalCreationFlow's S&P coverage picker (3 pills with clear
 * labels read cleanly without per-pill differentiation).
 */
function Screen1ShapesPatterns({
  state,
  onChange,
  focusDimension,
}: {
  state: ShapesPatternsAnchor;
  onChange: (next: ShapesPatternsAnchor) => void;
  focusDimension: AnchorDimension | null;
}) {
  useFocusDimension(focusDimension);
  const counts = shapesCounts();
  const spAccent = moduleMetaById('shapes-and-patterns')?.accentHex ?? '#d4885a';

  const breadthGroupOptions: BreadthGroupOption[] = SHAPES_AREA_IDS.map(id => ({
    id,
    label: SHAPES_AREA_LABELS[id],
    accentHex: spAccent,
  }));

  // Coordinated updater: prune BOTH Depth and Mastery when Breadth
  // changes. Re-uses pruneMasteryToBreadth — its name is a leftover
  // from the ET/HF case but its behavior is generic over any string-
  // id list. If a fourth coupled-prune consumer appears, rename to
  // pruneIdsToBreadth across all callers.
  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedDepth = pruneMasteryToBreadth(
      nextBreadth,
      state.depth.areaIds,
    ) as ShapesAreaId[];
    const prunedMastery = pruneMasteryToBreadth(
      nextBreadth,
      state.mastery.areaIds,
    ) as ShapesAreaId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      depth: { areaIds: prunedDepth },
      mastery: { areaIds: prunedMastery },
    });
  };

  const visibleAreas: ReadonlyArray<ShapesAreaId> =
    state.breadth.kind === 'all'
      ? SHAPES_AREA_IDS
      : SHAPES_AREA_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleDepthArea = (id: ShapesAreaId) => {
    const has = state.depth.areaIds.includes(id);
    const next = has
      ? state.depth.areaIds.filter(g => g !== id)
      : [...state.depth.areaIds, id];
    onChange({ ...state, depth: { areaIds: next } });
  };

  const toggleMasteryArea = (id: ShapesAreaId) => {
    const has = state.mastery.areaIds.includes(id);
    const next = has
      ? state.mastery.areaIds.filter(g => g !== id)
      : [...state.mastery.areaIds, id];
    onChange({ ...state, mastery: { areaIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        id="breadth"
        question={`Do you want to work toward Comfortable across all ${counts.total} shapes this year? (Mental Visualization is excluded — it counts toward consistency only.)`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work toward Comfortable across all ${counts.total} shapes`}
          noLabel="No — just specific areas"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Depth"
        id="depth"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one area above to choose where to push depth.'
            : 'Which areas do you want to reach Solid in across all 12 keys?'
        }
      >
        {visibleAreas.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No areas available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleAreas.map(id => (
              <CategoryPillButton
                key={id}
                label={SHAPES_AREA_LABELS[id]}
                accentHex={spAccent}
                active={state.depth.areaIds.includes(id)}
                onClick={() => toggleDepthArea(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Mastery"
        id="mastery"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one area above to choose what to truly own.'
            : 'Are there specific areas you want to truly own — Solid in all 12 keys, no hesitation? (v1 ships area-level; per-shape picker coming later.)'
        }
      >
        {visibleAreas.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No areas available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleAreas.map(id => (
              <CategoryPillButton
                key={id}
                label={SHAPES_AREA_LABELS[id]}
                accentHex={spAccent}
                active={state.mastery.areaIds.includes(id)}
                onClick={() => toggleMasteryArea(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        id="consistency"
        question="How many minutes a week do you want to practice Shapes & Patterns?"
      >
        <ConsistencyControl
          unit="minutes"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
          min={5}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Song Repertoire — dimension surface
// =====================================================================

/**
 * Song Repertoire dimension surface. The biggest divergence from
 * ET / HF / S&P:
 *
 *   - **No group multi-pick.** Each dimension is a single count
 *     input that maps to a canonical proficiency level
 *     (Comfortable / Solid / Internalized).
 *
 *   - **Order matches escalating ownership** (Breadth → Depth →
 *     Mastery → Consistency) per the design doc — different from
 *     the ET / HF / S&P "Breadth → Mastery → Depth" order. Songs
 *     read most naturally as "play it / perform it / own it" from
 *     top to bottom.
 *
 *   - **Cumulative-ordering soft nudge.** Internalized ≤ Solid ≤
 *     Comfortable per the spec. Renders an amber non-blocking tip
 *     beneath the count inputs when the numbers violate. Save is
 *     never blocked — the design call wants gentle guidance, not a
 *     scolding gate.
 *
 *   - **No coordinated state coupling** — counts are independent.
 *     Editing Comfortable does not auto-adjust Solid or
 *     Internalized.
 */
function Screen1SongRepertoire({
  state,
  onChange,
  focusDimension,
}: {
  state: SongRepertoireAnchor;
  onChange: (next: SongRepertoireAnchor) => void;
  focusDimension: AnchorDimension | null;
}) {
  useFocusDimension(focusDimension);
  const nudge = songCumulativeNudge(state);
  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth (Comfortable)"
        id="breadth"
        question="How many songs do you want to know how to play by year end? You know how to play them."
      >
        <CountInput
          label="Songs at Comfortable"
          value={state.breadthCount}
          onChange={n => onChange({ ...state, breadthCount: n })}
          suffix="songs"
        />
      </DimensionSection>

      <DimensionSection
        title="Depth (Solid)"
        id="depth"
        question="How many songs do you want to be performance-ready? Impress your friends, family, and loved ones."
      >
        <CountInput
          label="Songs at Solid"
          value={state.depthCount}
          onChange={n => onChange({ ...state, depthCount: n })}
          suffix="songs"
        />
      </DimensionSection>

      <DimensionSection
        title="Mastery (Internalized)"
        id="mastery"
        question="How many songs do you want to own so deeply you could make someone cry, yourself included? You know them with your eyes closed."
      >
        <CountInput
          label="Songs at Internalized"
          value={state.masteryCount}
          onChange={n => onChange({ ...state, masteryCount: n })}
          suffix="songs"
        />
      </DimensionSection>

      {nudge && (
        <div
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          {nudge}
        </div>
      )}

      <DimensionSection
        title="Consistency"
        id="consistency"
        question="How often do you want to cultivate your Song Repertoire?"
      >
        <ConsistencyControl
          unit="sessions"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Production — dimension surface
// =====================================================================

/**
 * Production dimension surface. Three sections only —
 * Breadth → Depth → Consistency. Mastery is deliberately omitted
 * per the April 27 design call (depth/mastery distinction deferred
 * until more firsthand experience with the lesson material).
 *
 *   - Breadth follows the ET / HF / S&P pattern: Yes / No → if No,
 *     pick from 6 paths.
 *   - Depth is a multi-pick path selector pre-filtered to Breadth,
 *     mirroring S&P's Depth shape.
 *   - Consistency unit is **hours** (not sessions or minutes) —
 *     Production sessions are longer-form than ET / HF / S&P (a
 *     Genre Production arc lesson is ~25–40 minutes; multiple
 *     sessions chain). Hours reads more honestly.
 *
 * Single Production module accent on all 6 pills — same call as
 * GoalCreationFlow's Production coverage picker.
 */
function Screen1Production({
  state,
  onChange,
  focusDimension,
}: {
  state: ProductionAnchor;
  onChange: (next: ProductionAnchor) => void;
  focusDimension: AnchorDimension | null;
}) {
  useFocusDimension(focusDimension);
  const counts = productionCounts();
  const productionAccent = moduleMetaById('production')?.accentHex ?? '#3a4875';

  const breadthGroupOptions: BreadthGroupOption[] = PRODUCTION_PATH_IDS.map(id => ({
    id,
    label: PRODUCTION_PATH_LABELS[id],
    accentHex: productionAccent,
  }));

  // Coordinated updater: prune Depth when Breadth changes. Same
  // reuse of pruneMasteryToBreadth as S&P (function is generic over
  // any string-id list).
  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedDepth = pruneMasteryToBreadth(
      nextBreadth,
      state.depth.pathIds,
    ) as ProductionPathId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      depth: { pathIds: prunedDepth },
    });
  };

  const visiblePaths: ReadonlyArray<ProductionPathId> =
    state.breadth.kind === 'all'
      ? PRODUCTION_PATH_IDS
      : PRODUCTION_PATH_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleDepthPath = (id: ProductionPathId) => {
    const has = state.depth.pathIds.includes(id);
    const next = has
      ? state.depth.pathIds.filter(p => p !== id)
      : [...state.depth.pathIds, id];
    onChange({ ...state, depth: { pathIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        id="breadth"
        question={`Do you want to work through all ${counts.total} production lessons this year?`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work through all ${counts.total} lessons`}
          noLabel="No — just specific paths"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Depth"
        id="depth"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one path above to choose where to go deepest.'
            : 'Which paths do you want to go deepest on?'
        }
      >
        {visiblePaths.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No paths available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visiblePaths.map(id => (
              <CategoryPillButton
                key={id}
                label={PRODUCTION_PATH_LABELS[id]}
                accentHex={productionAccent}
                active={state.depth.pathIds.includes(id)}
                onClick={() => toggleDepthPath(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        id="consistency"
        question="How many hours a week do you want to spend on production?"
      >
        <ConsistencyControl
          unit="hours"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Practice Consistency — dimension surface (meta-habit)
// =====================================================================

/**
 * Practice Consistency dimension surface. Different from every
 * other module — it's a meta-habit, not a learning module. Three
 * independent count inputs, no breadth/depth/mastery shape:
 *
 *   Weekly floor  — minimum days/week
 *   Monthly floor — minimum days/month (safety net for bad weeks)
 *   Aspiration    — ideal days/week
 *
 * No coordinated state coupling. The cumulative-coherence nudge
 * (`practiceConsistencyNudge`) fires when:
 *
 *   1. aspiration < weeklyFloor  — "ideal" below "minimum"
 *   2. monthlyFloor < weeklyFloor × 4  — monthly safety-net wouldn't
 *      survive four weeks at the weekly floor
 *
 * Renders as a single combined amber tip below the inputs. Save is
 * never blocked.
 */
function Screen1PracticeConsistency({
  state,
  onChange,
  focusDimension,
}: {
  state: PracticeConsistencyAnchor;
  onChange: (next: PracticeConsistencyAnchor) => void;
  focusDimension: AnchorDimension | null;
}) {
  useFocusDimension(focusDimension);
  const nudge = practiceConsistencyNudge(state);
  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Weekly floor"
        id="weeklyFloor"
        question="What's the minimum number of days per week you want to practice?"
      >
        <CountInput
          label="Weekly floor"
          value={state.weeklyFloor}
          onChange={n => onChange({ ...state, weeklyFloor: n })}
          min={0}
          max={7}
          suffix="days/week"
        />
      </DimensionSection>

      <DimensionSection
        title="Monthly floor"
        id="monthlyFloor"
        question="What's the minimum days per month you want to practice? (Safety net for bad weeks and vacations.)"
      >
        <CountInput
          label="Monthly floor"
          value={state.monthlyFloor}
          onChange={n => onChange({ ...state, monthlyFloor: n })}
          min={0}
          max={31}
          suffix="days/month"
        />
      </DimensionSection>

      <DimensionSection
        title="Aspiration"
        id="aspiration"
        question="What's your ideal? (Feeds session-recommendation ambition.)"
      >
        <CountInput
          label="Aspiration"
          value={state.aspiration}
          onChange={n => onChange({ ...state, aspiration: n })}
          min={0}
          max={7}
          suffix="days/week"
        />
      </DimensionSection>

      {nudge && (
        <div
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          {nudge}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Screen 2 — Review
// =====================================================================

/**
 * Screen 2 — Review your yearly anchor.
 *
 * Three pieces stacked top-to-bottom:
 *
 *   1. **Editable name input.** Auto-generated default
 *      (`defaultAnchorName(moduleId, year)` → "Ear Training 2026")
 *      shown as the placeholder; the user can type their own. Empty
 *      input falls back to the default at save time.
 *
 *   2. **Per-dimension review rows.** One row per populated
 *      dimension showing the dimension title, its current value
 *      (humanized), and an Edit link that routes back to Screen 1
 *      with that dimension scrolled into view. `dimensionRowsFor`
 *      handles the per-module shape variations (4 rows for ET / HF
 *      / S&P / Songs; 3 for Production and Practice consistency).
 *
 *   3. **Natural-language summary.** A "By Dec 31, [year], you want
 *      to …" paragraph describing the whole anchor in connected
 *      prose. Presented in a left-accent-bordered card, mirroring
 *      the design doc example.
 *
 * Save itself lives in the parent component (`handleSave`) so this
 * surface is purely review-and-edit; advancing/saving happens via
 * the modal footer's "Save anchor" button.
 */
function ScreenReview({
  draft,
  onUpdate,
  onEditDimension,
}: {
  draft: AnchorDraft;
  onUpdate: (patch: Partial<AnchorDraft>) => void;
  onEditDimension: (dim: AnchorDimension) => void;
}) {
  const year = new Date().getFullYear();
  const placeholder = defaultAnchorName(draft.moduleId, year);
  const resolvedName = draft.name?.trim() ? draft.name : placeholder;
  const rows = dimensionRowsFor(draft);
  const summary = summarizeAnchor(draft, year, resolvedName);

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Editable umbrella name */}
      <div>
        <label
          className="block text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1"
          htmlFor="anchor-name-input"
        >
          Anchor name
        </label>
        <input
          id="anchor-name-input"
          type="text"
          value={draft.name ?? ''}
          placeholder={placeholder}
          onChange={e => onUpdate({ name: e.target.value })}
          className={`${inputClass} w-full text-base`}
          aria-label="Anchor name"
        />
      </div>

      {/* 2. Per-dimension review rows */}
      <div className="flex flex-col">
        {rows.map(row => (
          <div
            key={row.dimension}
            className="flex items-start justify-between gap-3 border-t border-neutral-200 dark:border-neutral-800 py-3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {row.title}
              </div>
              <div className="text-sm text-neutral-800 dark:text-neutral-100 mt-0.5">
                {row.value}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditDimension(row.dimension)}
              className="text-sm text-teal-700 dark:text-teal-300 hover:underline shrink-0 mt-0.5"
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {/* 3. Natural-language summary with left accent border */}
      {summary && (
        <div
          role="note"
          className="border-l-4 border-teal-500 bg-teal-50 dark:bg-teal-950/30 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100"
        >
          {summary}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 2-dot screen indicator
// =====================================================================

/**
 * Mirrors GoalCreationFlow's StepDots component, scoped to the
 * 2-screen YearlyAnchorFlow shape. Kept local so the flow has no
 * cross-file coupling for a 15-line presentational component;
 * promote to a shared `goals/StepDots.tsx` if a third consumer
 * appears.
 */
function ScreenDots({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === currentIndex;
        return (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              active ? 'w-6 bg-teal-500' : 'w-2 bg-neutral-300 dark:bg-neutral-700'
            }`}
          />
        );
      })}
    </div>
  );
}
