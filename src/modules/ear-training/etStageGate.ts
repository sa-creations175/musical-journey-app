/**
 * The cross-submodule Ear Training gate.
 *
 * =====================================================================
 * ONE GATE, AND IT IS CHORD RECOGNITION'S.
 *
 *   Stage 1 — Always available (intervals + chord recognition Tier 1).
 *   Stage 2 — Requires CR Tier 1 cleared. Opens Scales & Modes Tier 1
 *             (Ionian, Aeolian and the two minors).
 *   Stage 3 — Requires CR Tier 2 cleared. Opens Scales & Modes Tier 2.
 *   Stage 4 — Requires CR Tier 3 cleared.
 *   Stage 5 — Requires CR Tier 4 cleared.
 *
 * You name the six triads by ear before the app asks you to hear them
 * move — that is the whole of the gate, and it is what the Settings
 * page says.
 *
 * =====================================================================
 * THE PROGRESSIONS HALF OF THIS GATE IS GONE, WITH THE LADDER.
 *
 * Stages 3 and 4 used to ALSO require a progressions stage, so a reader
 * whose chord-recognition ear had run ahead was held at Scales & Modes
 * Tier 1 by a progressions ladder that gated the old eight-entry
 * catalog — a catalog the Full Progression card had already stopped
 * using. Silas retired the ladder on 10 Sep 2026 and the requirement
 * went with it: what remains is the chord-recognition ladder, read
 * once, by everyone downstream of it.
 * =====================================================================
 */
import { getUnlockedTier as getChordRecognitionUnlockedTier } from './chord-recognition/tierUnlock';
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
}

/** Pure: does the user's submodule state qualify them for ET stage
 *  `stage`? */
export function meetsEtStage(stage: EtStage, status: EtSubmoduleStatus): boolean {
  switch (stage) {
    case 1: return true;
    case 2: return status.crTier >= 2;
    case 3: return status.crTier >= 3;
    case 4: return status.crTier >= 4;
    case 5: return status.crTier >= 5;
  }
}

/** Walk Stages 1→5 and return the highest the user qualifies for. */
export function computeGlobalEtStage(status: EtSubmoduleStatus): EtStage {
  let highest: EtStage = 1;
  for (let s = 2; s <= MAX_ET_STAGE; s++) {
    if (meetsEtStage(s as EtStage, status)) highest = s as EtStage;
    else break;
  }
  return highest;
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
  return { crTier: await getChordRecognitionUnlockedTier() };
}

export async function getGlobalEtStage(): Promise<EtStage> {
  return computeGlobalEtStage(await loadEtSubmoduleStatus());
}
