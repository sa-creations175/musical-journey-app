/**
 * Lean-to-goals intent multipliers + helpers.
 *
 * Step 3 of the Flexible Session Proposal build. When the user picks
 * the 'lean_to_goals' intent on the questionnaire, this module's
 * helpers reshape the proposal weighting so behind-pace modules /
 * submodules get a larger share at the expense of ahead-of-pace ones.
 *
 * Two hooks, applied at different layers:
 *
 *   1. Module-level (non-keys contexts only). `leanFactorByModule`
 *      returns a per-moduleId multiplier that REPLACES the existing
 *      weeklyPaceFactor in aggregateGoalCandidatesByModule. The keys
 *      context skips this hook because the graduated S&P/Rep split
 *      is a hard allocation that would override module-weight tilts
 *      anyway — better to be explicit and not pretend.
 *
 *   2. Within-S&P submodule (all contexts).
 *      `redistributePlannedSecondsBySubmodule` post-processes the
 *      proposal cards: for each S&P bucket with ≥ 2 non-warm-up
 *      segments, redistributes plannedSeconds proportionally to the
 *      per-submodule lean multipliers while preserving total bucket
 *      seconds. Warm-up segments are excluded from the redistribution
 *      (their durations stay locked — mirrors the block-delete rule).
 *
 * Multiplier mapping (collapses pace.ts's 5-band ladder to 3 tiers):
 *
 *   well-ahead             →  0.6   (pull-down — ahead can wait)
 *   ahead                  →  1.0   (neutral — already at pace)
 *   at-risk                →  1.0   (neutral — modest deficit, not urgent)
 *   behind                 →  1.5   (lift)
 *   significantly-behind   →  1.5   (lift — same as behind; lean is a
 *                                    coarse 3-tier signal)
 *
 * Per-submodule pace aggregation: when multiple coverage goals
 * target the same S&P submodule, the WORST (lowest) ratio wins —
 * matches the spec's "if VL goals are behind pace" framing: any
 * single behind goal makes the submodule behind.
 */

import type { Goal, Song, SpacingState } from '../db';
import type { ProposalBlock, ProposalCardData } from '../../modules/practice/proposalTypes';
import { COVERED_STAGES } from '../../modules/goals/progress';
import { coverageGroupIdToActivityArea } from '../../modules/goals/shapesCoverageGroups';
import { isCoverageOverallMetric, isCoverageSpecificMetric } from '../../modules/goals/coverageMetrics';
import type { IntentChoice } from '../../modules/practice/inputs';
import type { PracticeSessionContext } from '../db';
import { moduleMetaById } from '../moduleMeta';
import { candidateSpecForGoal } from './candidates';
import { isModuleAllowedForContext } from './contextWeighting';
import { bandForRatio, paceForCoverageGoal, type PaceBand } from './pace';
import type { WeeklyPaceResult } from './weeklyPace';

// =====================================================================
// Constants
// =====================================================================

export const LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER = 1.5;
export const LEAN_TO_GOALS_ON_TRACK_MULTIPLIER = 1.0;
export const LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER = 0.6;

// =====================================================================
// Band → lean multiplier
// =====================================================================

/**
 * Collapse pace.ts's 5-band PaceBand into the 3-tier lean multiplier.
 *
 * Design call: only `well-ahead` (ratio ≥ 1.5 — more than 50% past
 * the expected coverage) triggers the pull-down. The plain `ahead`
 * band (ratio 1.0-1.5) is "on pace, slight surplus" and stays
 * neutral. `at-risk` (ratio 0.85-1.0) is "slight deficit" — also
 * neutral; lean is a coarse signal, finer slips are the existing
 * pace ladder's job. Only `behind` and `significantly-behind`
 * (ratio < 0.85) get the lift.
 */
export function leanMultiplierForBand(band: PaceBand): number {
  switch (band) {
    case 'well-ahead':           return LEAN_TO_GOALS_AHEAD_OF_PACE_MULTIPLIER;
    case 'ahead':                return LEAN_TO_GOALS_ON_TRACK_MULTIPLIER;
    case 'at-risk':              return LEAN_TO_GOALS_ON_TRACK_MULTIPLIER;
    case 'behind':               return LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER;
    case 'significantly-behind': return LEAN_TO_GOALS_BEHIND_PACE_MULTIPLIER;
  }
}

// =====================================================================
// Module-level: lean factor map (non-keys only)
// =====================================================================

/**
 * Build the per-module factor map for the algorithm's
 * weeklyPaceFactorByModule slot. When the intent is NOT
 * 'lean_to_goals', returns the existing factorByModule unchanged —
 * the lean curve only applies under explicit user request. When the
 * context IS 'keys', also returns the existing map: the graduated
 * S&P/Rep split is hard, so module-weight tilts at that level are a
 * lie; we keep behavior identical to non-lean for keys sessions.
 *
 * Modules without a band entry (no active weekly goal) default to
 * the on-track multiplier — leaning has nothing to point at, so the
 * module's weight is left at 1.0× (its base weight stands).
 */
export function leanFactorByModule(args: {
  weeklyPace: WeeklyPaceResult;
  intent: IntentChoice;
  context: PracticeSessionContext;
}): Map<string, number> {
  const { weeklyPace, intent, context } = args;

  if (intent.kind !== 'lean_to_goals') return weeklyPace.factorByModule;
  if (context === 'keys') return weeklyPace.factorByModule;

  const out = new Map<string, number>();
  for (const [moduleId, band] of weeklyPace.bandByModule) {
    out.set(moduleId, leanMultiplierForBand(band));
  }
  return out;
}

// =====================================================================
// Within-S&P submodule: per-submodule lean factor
// =====================================================================

/** Submodule keys this module uses for S&P internal redistribution. */
const SP_SUBMODULE_KEYS = {
  chordShape: 'shapes-and-patterns:chord-shape',
  scale:      'shapes-and-patterns:scale',
  vl:         'shapes-and-patterns:vl',
} as const;

/**
 * Per-S&P-submodule lean multiplier. Walks active S&P coverage goals,
 * computes pace for each (using the goal's targetValue as denominator
 * and the count of COVERED items in spacingState as numerator), and
 * aggregates the WORST ratio per submodule into a lean multiplier.
 *
 * Goal → submodule routing:
 *   coverage_specific with targetUnit in a S&P coverage group →
 *       map via coverageGroupIdToActivityArea → submodule key.
 *   coverage_overall → applies to all three submodules (the user
 *       is covering all of S&P; the same module-level ratio is the
 *       baseline for every submodule's lean tilt).
 *
 * Returns an empty map when intent is not 'lean_to_goals' OR when
 * no S&P coverage goals are active — caller treats absence as 1.0×
 * (no redistribution).
 */
export function leanFactorPerSPSubmodule(args: {
  goals: ReadonlyArray<Goal>;
  spacingRows: ReadonlyArray<SpacingState>;
  intent: IntentChoice;
  now: number;
}): Map<string, number> {
  const { goals, spacingRows, intent, now } = args;
  if (intent.kind !== 'lean_to_goals') return new Map();

  const minRatioBySubmodule = new Map<string, number>();

  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    if (goal.targetMetric === null) continue;
    if (!isCoverageOverallMetric(goal.targetMetric) &&
        !isCoverageSpecificMetric(goal.targetMetric)) continue;

    const spec = candidateSpecForGoal(goal);
    if (spec.kind !== 'coverage') continue;
    if (!spec.moduleRefs.includes('shapes-and-patterns')) continue;

    const totalItems = goal.targetValue ?? 0;
    if (totalItems <= 0) continue;

    const submodules = submodulesForSPGoal(goal);
    if (submodules.length === 0) continue;

    const actualCoverage = countCoveredItems(spec, spacingRows);
    const pace = paceForCoverageGoal({
      startDate: goal.startDate,
      targetDate: goal.targetDate,
      totalItems,
      actualCoverage,
      now,
    });

    for (const sm of submodules) {
      const prev = minRatioBySubmodule.get(sm);
      if (prev === undefined || pace.ratio < prev) {
        minRatioBySubmodule.set(sm, pace.ratio);
      }
    }
  }

  const out = new Map<string, number>();
  for (const [sm, ratio] of minRatioBySubmodule) {
    out.set(sm, leanMultiplierForBand(bandForRatio(ratio)));
  }
  return out;
}

/** Resolve an S&P coverage goal to the submodule(s) it targets.
 *  Overall coverage applies to all three submodules; specific
 *  coverage routes via the activity-area lookup on targetUnit. */
function submodulesForSPGoal(goal: Goal): string[] {
  const metric = goal.targetMetric;
  if (!metric) return [];

  if (isCoverageOverallMetric(metric) && metric === 'shapes_coverage_at_acquired') {
    return [SP_SUBMODULE_KEYS.chordShape, SP_SUBMODULE_KEYS.scale, SP_SUBMODULE_KEYS.vl];
  }

  if (isCoverageSpecificMetric(metric) && metric === 'shapes_coverage_at_acquired_specific') {
    const area = goal.targetUnit ? coverageGroupIdToActivityArea(goal.targetUnit) : null;
    if (area === 'chord_shape_drills') return [SP_SUBMODULE_KEYS.chordShape];
    if (area === 'scale_drills')       return [SP_SUBMODULE_KEYS.scale];
    if (area === 'voice_leading')      return [SP_SUBMODULE_KEYS.vl];
    return [];
  }

  return [];
}

/** Count spacingState rows the spec considers "already covered."
 *  Mirrors the goal-progress numerator the existing progress.ts
 *  computes, but local to keep this helper dependency-flat. */
function countCoveredItems(
  spec: ReturnType<typeof candidateSpecForGoal>,
  spacingRows: ReadonlyArray<SpacingState>,
): number {
  if (spec.kind !== 'coverage') return 0;
  const moduleSet = new Set(spec.moduleRefs);
  let count = 0;
  for (const row of spacingRows) {
    if (!moduleSet.has(row.moduleRef)) continue;
    if (!COVERED_STAGES.has(row.acquisitionStage)) continue;
    if (spec.itemRefFilter && !spec.itemRefFilter(row.itemRef)) continue;
    count++;
  }
  return count;
}

// =====================================================================
// Within-S&P redistribution
// =====================================================================

/** Classify a ProposalBlock into its S&P submodule key, or null when
 *  the block isn't an S&P segment. Mirrors the prefix-discriminator
 *  used by the swap picker (proposalSwap.submoduleKeyForBlock). */
function spSubmoduleKeyForBlock(block: ProposalBlock): string | null {
  if (block.moduleRef !== 'shapes-and-patterns') return null;
  const first = block.itemRefs[0];
  if (first?.startsWith('chord-shape:')) return SP_SUBMODULE_KEYS.chordShape;
  if (first?.startsWith('scale:'))       return SP_SUBMODULE_KEYS.scale;
  if (first?.startsWith('vl:'))          return SP_SUBMODULE_KEYS.vl;
  return null;
}

/**
 * Reshape the planned-seconds allocation within each S&P bucket
 * according to per-submodule lean multipliers. Pure: returns a fresh
 * blocks array; non-S&P blocks pass through unchanged.
 *
 * Algorithm:
 *   1. Identify S&P NON-WARM-UP segments and their submodule keys.
 *      Warm-up segments are excluded — their durations stay locked
 *      per the block-delete spec's "warm-up durations never change."
 *   2. Total S&P bucket seconds = sum of those non-warm-up segments.
 *   3. weightedSeconds = currentSeconds × leanMultiplier[submodule]
 *      (defaults to 1.0× when the submodule has no lean factor).
 *   4. Normalize: newSeconds = round(weighted × total / sumWeighted).
 *   5. Leftover from rounding lands on the first redistributed
 *      segment so the bucket sum stays exact.
 *
 * No-op when:
 *   - leanFactorBySubmodule is empty (caller computed no lean data)
 *   - fewer than 2 redistributable S&P segments in the block list
 *   - every redistributable segment has the same multiplier
 */
export function redistributePlannedSecondsBySubmodule(
  blocks: ReadonlyArray<ProposalBlock>,
  leanFactorBySubmodule: ReadonlyMap<string, number>,
): ProposalBlock[] {
  if (leanFactorBySubmodule.size === 0) return blocks.slice();

  type Candidate = { index: number; submoduleKey: string; multiplier: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.isWarmup) continue;
    const sm = spSubmoduleKeyForBlock(b);
    if (sm === null) continue;
    const mult = leanFactorBySubmodule.get(sm) ?? 1.0;
    candidates.push({ index: i, submoduleKey: sm, multiplier: mult });
  }

  if (candidates.length < 2) return blocks.slice();
  // All same multiplier → no shift would happen; skip the work.
  const allSame = candidates.every(c => c.multiplier === candidates[0].multiplier);
  if (allSame) return blocks.slice();

  const total = candidates.reduce((s, c) => s + blocks[c.index].plannedSeconds, 0);
  if (total <= 0) return blocks.slice();

  const weighted = candidates.map(c => blocks[c.index].plannedSeconds * c.multiplier);
  const sumWeighted = weighted.reduce((s, v) => s + v, 0);
  if (sumWeighted <= 0) return blocks.slice();

  const newSeconds = weighted.map(w => Math.round(w * (total / sumWeighted)));
  const drift = total - newSeconds.reduce((s, v) => s + v, 0);
  if (drift !== 0) newSeconds[0] += drift; // first-redistributed gets the leftover

  const next = blocks.slice();
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[k];
    next[c.index] = { ...blocks[c.index], plannedSeconds: newSeconds[k] };
  }
  return next;
}

// =====================================================================
// Deep focus ('push_on_item' intent) — Step 4 of the Flexible Session
// Proposal build.
// =====================================================================

/**
 * Minimum session length (minutes) at which the optional song-step
 * appears on the deep-focus picker. Sub-threshold sessions get
 * 100% allocation to the chosen module; the song slot is hidden.
 */
export const DEEP_FOCUS_TWO_THING_MIN_MINUTES = 60;

/**
 * Fraction of session time reserved for the chosen song when the
 * user adds one at 60+ min. The chosen module gets the remainder
 * (1 - this fraction). Surfaced as a constant so future tuning
 * (e.g. 0.20 / 0.30) is a one-line change.
 */
export const DEEP_FOCUS_SONG_SPLIT = 0.25;

/** True when the song-step should appear on the deep-focus picker. */
export function shouldOfferDeepFocusSong(timeMinutes: number): boolean {
  return timeMinutes >= DEEP_FOCUS_TWO_THING_MIN_MINUTES;
}

// ---------------------------------------------------------------------
// Module picker option list
// ---------------------------------------------------------------------

/** One row in the deep-focus module picker. Top-level moduleRef (for
 *  HF / ET-subs / Repertoire / Production) OR S&P submodule key
 *  ('shapes-and-patterns:chord-shape' etc.) — same id space the swap
 *  picker uses. The `band` drives the urgency pill; null = no pace
 *  signal available (no weekly goal AND no S&P coverage goal). */
export interface DeepFocusModuleOption {
  key: string;
  label: string;
  accentHex: string;
  band: PaceBand | null;
}


/**
 * Build the picker option list for the deep-focus module step.
 *
 * Context filter:
 *   keys → S&P submodules (3 entries) + Repertoire only.
 *   laptop / phone → all top-level modules allowed by
 *     isModuleAllowedForContext (S&P is excluded by that filter,
 *     so no S&P submodule entries appear).
 *   full → all top-level modules + the 3 S&P submodules.
 *
 * Band sourcing:
 *   Top-level module → weeklyPace.bandByModule.
 *   S&P submodule    → per-submodule ratio derived from active S&P
 *                      coverage goals (same math as
 *                      leanFactorPerSPSubmodule, but exposing the
 *                      band instead of the multiplier).
 *
 * Sort order: behind-pace bands first ('significantly-behind' →
 * 'behind' → 'at-risk' → 'ahead' → 'well-ahead' → null), then
 * stable in catalog order (the order this function emits them).
 */
export function deepFocusModuleOptions(args: {
  context: PracticeSessionContext;
  weeklyPace: WeeklyPaceResult;
  goals: ReadonlyArray<Goal>;
  spacingRows: ReadonlyArray<SpacingState>;
  now: number;
}): DeepFocusModuleOption[] {
  const { context, weeklyPace, goals, spacingRows, now } = args;

  const spBandBySubmodule = spBandsFromGoals({ goals, spacingRows, now });

  // Hand-rolled labels + accents for S&P submodules — moduleMetaById
  // has no entry for the colon-suffixed keys, so we synthesise the
  // display strings here. Accent inherits the S&P module color so
  // the pills read as part of the S&P family.
  const spAccent = moduleMetaById('shapes-and-patterns')?.accentHex ?? '#d4885a';
  const spSubmoduleEntries: DeepFocusModuleOption[] = [
    {
      key: 'shapes-and-patterns:chord-shape',
      label: 'Chord Shapes',
      accentHex: spAccent,
      band: spBandBySubmodule.get('shapes-and-patterns:chord-shape') ?? null,
    },
    {
      key: 'shapes-and-patterns:scale',
      label: 'Scales (S&P)',
      accentHex: spAccent,
      band: spBandBySubmodule.get('shapes-and-patterns:scale') ?? null,
    },
    {
      key: 'shapes-and-patterns:vl',
      label: 'Voice Leading',
      accentHex: spAccent,
      band: spBandBySubmodule.get('shapes-and-patterns:vl') ?? null,
    },
  ];

  // Top-level module candidates — all the ones the user can
  // realistically focus on. Mental-viz isn't in this list because
  // it doesn't appear as its own picker option in the rest of the
  // app's flows; it's a sub-block inside non-keyboard sessions.
  const topLevelCandidates: ReadonlyArray<string> = [
    'harmonic-fluency',
    'intervals',
    'chord-recognition',
    'chord-progressions',
    'scales-modes',
    'repertoire',
    'production',
  ];
  const topLevelEntries: DeepFocusModuleOption[] = [];
  for (const moduleRef of topLevelCandidates) {
    if (!isModuleAllowedForContext(moduleRef, context)) continue;
    const meta = moduleMetaById(moduleRef);
    topLevelEntries.push({
      key: moduleRef,
      label: meta?.label ?? moduleRef,
      accentHex: meta?.accentHex ?? '#4a9088',
      band: weeklyPace.bandByModule.get(moduleRef) ?? null,
    });
  }

  // Compose context-specific picker. Keys: S&P submodules + Rep
  // only (matches the spec). Non-keys: all top-level + S&P submodules
  // if S&P is allowed (which it isn't on laptop/phone — they get
  // top-level only).
  let combined: DeepFocusModuleOption[];
  if (context === 'keys') {
    combined = [
      ...spSubmoduleEntries,
      ...topLevelEntries.filter(o => o.key === 'repertoire'),
    ];
  } else if (isModuleAllowedForContext('shapes-and-patterns', context)) {
    combined = [...spSubmoduleEntries, ...topLevelEntries];
  } else {
    combined = topLevelEntries;
  }

  combined.sort((a, b) => bandSortRank(a.band) - bandSortRank(b.band));
  return combined;
}

/** Sort key for picker ordering: most-overdue first, untouched last. */
function bandSortRank(band: PaceBand | null): number {
  switch (band) {
    case 'significantly-behind': return 0;
    case 'behind':               return 1;
    case 'at-risk':              return 2;
    case 'ahead':                return 3;
    case 'well-ahead':           return 4;
    case null:                   return 5;
  }
}

/** S&P per-submodule pace bands. Mirrors leanFactorPerSPSubmodule
 *  but returns the BAND so callers can map it however they want
 *  (urgency pill vs lean multiplier). Pure. */
function spBandsFromGoals(args: {
  goals: ReadonlyArray<Goal>;
  spacingRows: ReadonlyArray<SpacingState>;
  now: number;
}): Map<string, PaceBand> {
  const { goals, spacingRows, now } = args;
  const minRatio = new Map<string, number>();

  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    if (goal.targetMetric === null) continue;
    if (!isCoverageOverallMetric(goal.targetMetric) &&
        !isCoverageSpecificMetric(goal.targetMetric)) continue;
    const spec = candidateSpecForGoal(goal);
    if (spec.kind !== 'coverage') continue;
    if (!spec.moduleRefs.includes('shapes-and-patterns')) continue;

    const totalItems = goal.targetValue ?? 0;
    if (totalItems <= 0) continue;
    const submodules = submodulesForSPGoalLocal(goal);
    if (submodules.length === 0) continue;

    const actualCoverage = countCoveredItemsLocal(spec, spacingRows);
    const pace = paceForCoverageGoal({
      startDate: goal.startDate,
      targetDate: goal.targetDate,
      totalItems,
      actualCoverage,
      now,
    });

    for (const sm of submodules) {
      const prev = minRatio.get(sm);
      if (prev === undefined || pace.ratio < prev) minRatio.set(sm, pace.ratio);
    }
  }

  const out = new Map<string, PaceBand>();
  for (const [sm, ratio] of minRatio) out.set(sm, bandForRatio(ratio));
  return out;
}

/** Local mirrors of the file-private helpers used by
 *  leanFactorPerSPSubmodule — kept in sync so the lean + deep-focus
 *  picker share the same submodule classification. */
function submodulesForSPGoalLocal(goal: Goal): string[] {
  const metric = goal.targetMetric;
  if (!metric) return [];
  if (isCoverageOverallMetric(metric) && metric === 'shapes_coverage_at_acquired') {
    return [
      'shapes-and-patterns:chord-shape',
      'shapes-and-patterns:scale',
      'shapes-and-patterns:vl',
    ];
  }
  if (isCoverageSpecificMetric(metric) && metric === 'shapes_coverage_at_acquired_specific') {
    const area = goal.targetUnit ? coverageGroupIdToActivityArea(goal.targetUnit) : null;
    if (area === 'chord_shape_drills') return ['shapes-and-patterns:chord-shape'];
    if (area === 'scale_drills')       return ['shapes-and-patterns:scale'];
    if (area === 'voice_leading')      return ['shapes-and-patterns:vl'];
  }
  return [];
}

function countCoveredItemsLocal(
  spec: ReturnType<typeof candidateSpecForGoal>,
  spacingRows: ReadonlyArray<SpacingState>,
): number {
  if (spec.kind !== 'coverage') return 0;
  const moduleSet = new Set(spec.moduleRefs);
  let count = 0;
  for (const row of spacingRows) {
    if (!moduleSet.has(row.moduleRef)) continue;
    if (!COVERED_STAGES.has(row.acquisitionStage)) continue;
    if (spec.itemRefFilter && !spec.itemRefFilter(row.itemRef)) continue;
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------
// applyDeepFocusAllocation — post-process the proposal cards
// ---------------------------------------------------------------------

/**
 * Reshape the proposal to a single-module focus (and optional song
 * carve-out at 60+ min). Pure post-process — runs after the normal
 * algorithm has produced cards.
 *
 * Three modes:
 *
 *   1. intent !== 'push_on_item' OR moduleRef === null:
 *      No-op. Cards return unchanged.
 *
 *   2. moduleRef set, no songId (or sub-threshold session):
 *      Filter card.blocks to those matching the chosen module/submodule
 *      (+ paired warm-ups). Rescale non-warm-up blocks proportionally
 *      so their total seconds fill the original card's total. Warm-up
 *      block durations stay locked.
 *
 *   3. moduleRef set, songId set, time >= 60:
 *      Same filter as (2). Reserve DEEP_FOCUS_SONG_SPLIT × total for
 *      a synthesised Repertoire song-anchor block (carries the chosen
 *      song's title + id). Remaining (1 - split) × total rescales
 *      across the surviving module blocks. Song block lands at the
 *      end of the card.
 *
 * When the chosen module has NO surviving blocks (rare — module
 * isn't in the proposal at all), cards return unchanged so the user
 * sees the normal proposal rather than an empty card. Honest fallback.
 */
export function applyDeepFocusAllocation(args: {
  cards: ProposalCardData[];
  intent: IntentChoice;
  timeMinutes: number;
  songsById: ReadonlyMap<string, Song>;
}): ProposalCardData[] {
  const { cards, intent, timeMinutes, songsById } = args;
  if (intent.kind !== 'push_on_item') return cards;
  if (intent.moduleRef === null) return cards;

  const songEligible =
    intent.songId !== null && shouldOfferDeepFocusSong(timeMinutes);
  const song = songEligible && intent.songId !== null
    ? songsById.get(intent.songId) ?? null
    : null;

  return cards.map(card => {
    const surviving = card.blocks.filter(b => matchesDeepFocusPick(b, intent.moduleRef!));
    if (surviving.length === 0) return card;

    const totalSeconds = card.blocks.reduce((s, b) => s + b.plannedSeconds, 0);
    if (totalSeconds <= 0) return card;

    const songSeconds = song
      ? Math.max(1, Math.round(totalSeconds * DEEP_FOCUS_SONG_SPLIT))
      : 0;
    const moduleSeconds = totalSeconds - songSeconds;

    const reshaped = rescaleNonWarmupSeconds(surviving, moduleSeconds);

    if (song) {
      reshaped.push(synthDeepFocusSongBlock(song, songSeconds));
    }

    const newTotalSeconds = reshaped.reduce((s, b) => s + b.plannedSeconds, 0);
    return { ...card, blocks: reshaped, totalSeconds: newTotalSeconds };
  });
}

/** True when a block belongs in the deep-focus pick. S&P scales
 *  warm-up segments ride along with ANY S&P submodule pick (they
 *  prep the keyboard regardless of which S&P sub-type the user
 *  picked). Repertoire warm-ups ride along with Repertoire picks.
 *  Other warm-ups follow their own module. */
function matchesDeepFocusPick(block: ProposalBlock, moduleRef: string): boolean {
  const blockSubmoduleKey = spSubmoduleKeyForBlockOrNull(block);

  // S&P submodule pick — match the submodule, but also keep the
  // S&P scales warm-up segment so the keyboard prep ride along
  // regardless of which S&P sub-type the user picked.
  if (moduleRef.startsWith('shapes-and-patterns:')) {
    if (blockSubmoduleKey === moduleRef) return true;
    // Scales warm-up segment (moduleRef='shapes-and-patterns',
    // isWarmup, scale:* itemRefs) — keep when the picked module is
    // any S&P submodule.
    if (block.moduleRef === 'shapes-and-patterns' && block.isWarmup) return true;
    return false;
  }

  // Top-level moduleRef pick. Match the moduleRef directly. For
  // Repertoire, the chord-quiz + scale-prep warm-ups have
  // moduleRef='repertoire' and ride along naturally.
  return block.moduleRef === moduleRef;
}

/** Same S&P submodule classifier the swap picker uses, but returns
 *  null for non-S&P blocks rather than a defensive moduleRef
 *  fallback. */
function spSubmoduleKeyForBlockOrNull(block: ProposalBlock): string | null {
  if (block.moduleRef !== 'shapes-and-patterns') {
    // Scale-prefix scale-prep warm-ups live under repertoire moduleRef
    // — leave them as 'repertoire' for the deep-focus filter (they
    // pair with Repertoire picks, not with S&P picks).
    return null;
  }
  const first = block.itemRefs[0];
  if (first?.startsWith('chord-shape:')) return 'shapes-and-patterns:chord-shape';
  if (first?.startsWith('scale:'))       return 'shapes-and-patterns:scale';
  if (first?.startsWith('vl:'))          return 'shapes-and-patterns:vl';
  return null;
}

/** Rescale every non-warm-up block proportionally so the sum hits
 *  `targetSeconds`. Warm-up blocks keep their original plannedSeconds
 *  (mirrors the block-delete / lean redistribute rule). Returns a
 *  fresh blocks array. */
function rescaleNonWarmupSeconds(
  blocks: ReadonlyArray<ProposalBlock>,
  targetSeconds: number,
): ProposalBlock[] {
  const warmupSeconds = blocks
    .filter(b => b.isWarmup)
    .reduce((s, b) => s + b.plannedSeconds, 0);
  const nonWarmupTarget = Math.max(0, targetSeconds - warmupSeconds);

  const nonWarmups = blocks.filter(b => !b.isWarmup);
  const currentSum = nonWarmups.reduce((s, b) => s + b.plannedSeconds, 0);

  if (nonWarmups.length === 0 || currentSum <= 0 || nonWarmupTarget <= 0) {
    return blocks.slice();
  }

  const newSeconds = nonWarmups.map(b =>
    Math.max(1, Math.round(b.plannedSeconds * (nonWarmupTarget / currentSum))),
  );
  const drift = nonWarmupTarget - newSeconds.reduce((s, v) => s + v, 0);
  if (drift !== 0) newSeconds[0] += drift;

  let nonWarmupIdx = 0;
  return blocks.map(b => {
    if (b.isWarmup) return b;
    const updated = { ...b, plannedSeconds: newSeconds[nonWarmupIdx] };
    nonWarmupIdx += 1;
    return updated;
  });
}

/** Synthesise a Repertoire song-anchor block for the deep-focus
 *  song carve-out. No warm-ups attached — the chosen module is the
 *  focus, the song is a secondary slot. */
function synthDeepFocusSongBlock(song: Song, plannedSeconds: number): ProposalBlock {
  const meta = moduleMetaById('repertoire');
  return {
    id: `deep-focus-song-${song.id}`,
    moduleRef: 'repertoire',
    moduleLabel: meta?.label ?? 'song repertoire',
    moduleAccentHex: meta?.accentHex ?? '#4a9088',
    activityDescription: song.title,
    plannedSeconds,
    whySnippet: 'Deep focus — second slot',
    itemRefs: [song.id],
    isWarmup: false,
    isKeyboardRequired: true,
    isSongPractice: true,
  };
}
