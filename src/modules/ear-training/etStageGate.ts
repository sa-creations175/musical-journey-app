/**
 * Cross-submodule ET stage gate. Single source of truth for the
 * five-stage ET progression that spans chord-recognition,
 * chord-progressions, and scales-modes:
 *
 *   Stage 1 — Always available (intervals + CR T1).
 *   Stage 2 — Requires CR T1 cleared.
 *             Unlocks: chord-progressions Stage 1 (key detection),
 *                      scales-modes Stage 1 (church modes).
 *   Stage 3 — Requires CR T2 cleared AND progressions Stage 1 cleared.
 *             Unlocks: chord-progressions Stage 2 (chord motion +
 *                      short diatonic), scales-modes Stage 2
 *                      (harmonic / melodic minor).
 *   Stage 4 — Requires CR T3 cleared AND progressions Stage 2 cleared.
 *             Unlocks: chord-progressions Stage 3 (named patterns +
 *                      modal).
 *   Stage 5 — Requires CR T4 cleared.
 *             Unlocks: chord-progressions Stage 4 (complex / borrowed).
 *
 * Each submodule's tier-unlock file delegates its cross-submodule
 * gate check here instead of duplicating the chord-recognition
 * tier read. A submodule's per-stage `loadXEligibleSet` returns
 * the items for `min(within-submodule earned stage, max allowed by
 * etStageGate)`.
 */
import {
  MAX_PROGRESSION_STAGE,
  type ProgressionStage,
} from './chord-progressions/progressionStages';
import { getUnlockedTier as getChordRecognitionUnlockedTier } from './chord-recognition/tierUnlock';
import { getUnlockedProgressionStage } from './chord-progressions/progressionTierUnlock';
import {
  MAX_SCALE_MODE_STAGE,
  type ScaleModeStage,
} from './scales-modes/catalog';

export type EtStage = 1 | 2 | 3 | 4 | 5;
export const MAX_ET_STAGE: EtStage = 5;

/** Snapshot of the per-submodule progress used by the gate. Pure
 *  data — production callers load via the async wrappers; tests
 *  pass a literal. */
export interface EtSubmoduleStatus {
  /** Chord-recognition's `getUnlockedTier` value (1-5). Tier 1 is
   *  always unlocked; ≥2 means CR T1 is cleared. */
  crTier: number;
  /** Chord-progressions' `getUnlockedProgressionStage` value (1-4).
   *  Stage 1 is the floor; ≥2 means progressions Stage 1 cleared. */
  progressionStage: number;
}

/** Pure: does the user's submodule state qualify them for ET stage
 *  `stage`? Encodes the gate rules from the spec exactly. */
export function meetsEtStage(stage: EtStage, status: EtSubmoduleStatus): boolean {
  switch (stage) {
    case 1: return true;
    case 2: return status.crTier >= 2;
    case 3: return status.crTier >= 3 && status.progressionStage >= 2;
    case 4: return status.crTier >= 4 && status.progressionStage >= 3;
    case 5: return status.crTier >= 5;
  }
}

/** Walk Stages 1→5 and return the highest the user qualifies for.
 *  Stops at the first failed gate (gates aren't strictly nested —
 *  Stage 5 requires CR T4 cleared but NOT additional progression
 *  state, so a user could meet Stage 5 without meeting Stage 4 in
 *  edge cases. Today the catalog content + practice flow make this
 *  case unreachable; if it ever becomes reachable we'd switch to
 *  per-stage independent checks). */
export function computeGlobalEtStage(status: EtSubmoduleStatus): EtStage {
  let highest: EtStage = 1;
  for (let s = 2; s <= MAX_ET_STAGE; s++) {
    if (meetsEtStage(s as EtStage, status)) highest = s as EtStage;
    else break;
  }
  return highest;
}

/** Per-submodule stage S surfaces iff the user has met ET Stage
 *  S+1. Returns the highest submodule stage the gate permits;
 *  call sites clamp their earned stage to this ceiling. */
export function maxAllowedProgressionStage(status: EtSubmoduleStatus): ProgressionStage {
  const et = computeGlobalEtStage(status);
  // Progressions Stage S maps to ET Stage S+1.
  const max = et - 1;
  if (max < 1) return 1; // Stage 1 only when ET >= 2; below that the loader returns the empty set.
  return Math.min(max, MAX_PROGRESSION_STAGE) as ProgressionStage;
}

export function maxAllowedScaleModesStage(status: EtSubmoduleStatus): ScaleModeStage {
  const et = computeGlobalEtStage(status);
  const max = et - 1;
  if (max < 1) return 1;
  return Math.min(max, MAX_SCALE_MODE_STAGE) as ScaleModeStage;
}

/** True when the cross-submodule gate has NOT been met to unlock
 *  this submodule at all (ET Stage 2 minimum). Used by per-submodule
 *  loaders to short-circuit to an empty eligible set. */
export function isSubmoduleGated(status: EtSubmoduleStatus): boolean {
  return !meetsEtStage(2, status);
}

// ---------------------------------------------------------------------
// Async DB-aware wrappers — production call sites use these.
// ---------------------------------------------------------------------

export async function loadEtSubmoduleStatus(): Promise<EtSubmoduleStatus> {
  const [crTier, progressionStage] = await Promise.all([
    getChordRecognitionUnlockedTier(),
    getUnlockedProgressionStage(),
  ]);
  return { crTier, progressionStage };
}

export async function getGlobalEtStage(): Promise<EtStage> {
  return computeGlobalEtStage(await loadEtSubmoduleStatus());
}
