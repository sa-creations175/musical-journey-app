/**
 * Progressive-stage unlock for ear-training scales/modes. Mirrors
 * the chord-recognition tierUnlock.ts architecture and the
 * chord-progressions progressionTierUnlock.ts implementation —
 * same thresholds (≥10 attempts + ≥75% accuracy per item), same
 * staged-introduction batch (3 fresh items per stage per session),
 * same `'introduced' = has a spacingState row` signal.
 *
 * Stage layout (catalog-tagged via Mode.stage):
 *   Stage 1: Lydian, Ionian, Mixolydian, Dorian, Aeolian,
 *            Phrygian, Locrian (7 church modes)
 *   Stage 2: Harmonic minor, Melodic minor
 *
 * Cross-submodule gate: Stage 1 is locked behind chord-recognition
 * Tier 1 being CLEARED (CR's `unlockedTier >= 2`). Mirrors the
 * gate in progressionTierUnlock.ts.
 *
 * itemRef format quirk: scales-modes records attempts AND
 * spacingState rows against `${mode.id}-tab1` (HearScaleTab) and
 * `${mode.id}-tab2` (SitInsideTab) — NOT bare mode IDs. The
 * tier system aggregates the two tab variants per mode for unlock
 * stats (Stage 2 unlocks when each of the 7 Stage 1 MODES has
 * ≥10 combined attempts + ≥75% accuracy, not when each of the
 * 14 mode×tab cells does). The eligible set returned for the
 * candidates filter emits BOTH variant forms (`mode-tab1`,
 * `mode-tab2`) so spacingState rows match cleanly downstream.
 */
import { db, type SpacingState } from '../../../lib/db';
import { MODES, MAX_SCALE_MODE_STAGE, type ScaleModeStage, type ModeId } from './catalog';
import {
  isSubmoduleGated,
  loadEtSubmoduleStatus,
  maxAllowedScaleModesStage,
} from '../etStageGate';

const MODULE_REF = 'scales-modes';

const UNLOCK_MIN_ATTEMPTS = 10;
const UNLOCK_MIN_ACCURACY = 0.75;
const STAGED_INTRODUCTION_BATCH_SIZE = 3;

interface ItemStats {
  correct: number;
  total: number;
}

/** Strip the `-tab1` / `-tab2` suffix so per-tab attempts roll up
 *  to a single per-mode bucket. Mirrors how the user-facing spec
 *  ("Stage 2 unlocks when all 7 Stage 1 items meet the threshold")
 *  treats one mode as one item regardless of how many drill surfaces
 *  it has. */
function bareIdOf(attemptItemId: string): string {
  return attemptItemId.replace(/-tab[12]$/, '');
}

/** Walk lifetime attempts in db.attempts and produce per-mode-id
 *  correct/total tallies. `excludeFromFluency` rows skip per the
 *  chord-recognition convention. */
async function loadLifetimeStats(): Promise<Map<string, ItemStats>> {
  const attempts = await db.attempts.where('moduleId').equals(MODULE_REF).toArray();
  const stats = new Map<string, ItemStats>();
  for (const a of attempts) {
    if (a.excludeFromFluency) continue;
    const id = bareIdOf(a.itemId);
    const cur = stats.get(id) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (a.correct) cur.correct += 1;
    stats.set(id, cur);
  }
  return stats;
}

/** Mode IDs in catalog declaration order for a given stage. Used
 *  both by the unlock walk and the staged-introduction batch so
 *  the order is deterministic across renders. */
export function modesForStage(stage: ScaleModeStage): ModeId[] {
  return MODES.filter(m => m.stage === stage).map(m => m.id);
}

/** Convert a bare mode ID to BOTH per-tab variant forms — what
 *  the spacingState rows + candidates.ts comparison consume. */
function variantsFor(modeId: string): string[] {
  return [`${modeId}-tab1`, `${modeId}-tab2`];
}

/** Pure unlock walk. Public so tests can pass fixture stats. Stage
 *  1 is the floor; cross-submodule gate (CR T1 cleared) is enforced
 *  separately at the integration layer. */
export function computeUnlockedScaleModesStage(
  statsByModeId: ReadonlyMap<string, ItemStats>,
): ScaleModeStage {
  let unlocked: ScaleModeStage = 1;
  for (let stage = 1; stage < MAX_SCALE_MODE_STAGE; stage++) {
    const items = modesForStage(stage as ScaleModeStage);
    if (items.length === 0) continue;
    const allCleared = items.every(id => {
      const s = statsByModeId.get(id);
      if (!s) return false;
      if (s.total < UNLOCK_MIN_ATTEMPTS) return false;
      return s.correct / s.total >= UNLOCK_MIN_ACCURACY;
    });
    if (!allCleared) break;
    unlocked = (stage + 1) as ScaleModeStage;
  }
  return unlocked;
}

/** Highest stage unlocked from scales-modes alone (no cross-
 *  submodule gate). DB-aware wrapper around computeUnlockedScaleModesStage. */
export async function getUnlockedScaleModesStage(): Promise<ScaleModeStage> {
  const stats = await loadLifetimeStats();
  return computeUnlockedScaleModesStage(stats);
}

/**
 * Eligible per-tab itemRefs for a session. Pure — caller supplies
 * the spacingState rows used for the introduced signal.
 *
 * Composition mirrors chord-recognition / chord-progressions:
 *   · review pool — introduced items from stages below unlocked
 *   · current stage introduced items
 *   · up to 3 fresh items from the current stage
 *
 * "Introduced" for a mode = at least one of its per-tab variants
 * has a spacingState row. Once introduced, BOTH per-tab variants
 * surface so the mode shows up in either drill surface.
 */
export function getEligibleScaleModeItems(
  unlockedStage: ScaleModeStage,
  spacingStateRows: ReadonlyArray<SpacingState>,
): string[] {
  const introducedModes = new Set<string>();
  for (const row of spacingStateRows) {
    if (row.moduleRef !== MODULE_REF) continue;
    introducedModes.add(bareIdOf(row.itemRef));
  }

  const out: string[] = [];
  const push = (id: string) => {
    for (const v of variantsFor(id)) out.push(v);
  };

  // (1) Review pool — earlier stages, introduced modes only.
  for (let stage = 1; stage < unlockedStage; stage++) {
    for (const id of modesForStage(stage as ScaleModeStage)) {
      if (introducedModes.has(id)) push(id);
    }
  }

  // (2) Current stage — introduced always; fresh staged to BATCH_SIZE.
  const current = modesForStage(unlockedStage);
  const fresh: string[] = [];
  for (const id of current) {
    if (introducedModes.has(id)) push(id);
    else fresh.push(id);
  }
  for (const id of fresh.slice(0, STAGED_INTRODUCTION_BATCH_SIZE)) push(id);

  return out;
}

/**
 * Cross-submodule gate. Delegates to `etStageGate.ts` so the gate
 * rules live in one place. Scales-modes Stage 2 (harmonic /
 * melodic minor) is gated behind ET Stage 3 — meaning CR T2
 * cleared AND progressions Stage 1 cleared — even after scales-
 * modes Stage 1 is earned within the submodule.
 */
export async function loadScaleModesEligibleSet(
  spacingRows: ReadonlyArray<SpacingState>,
): Promise<ReadonlySet<string>> {
  const status = await loadEtSubmoduleStatus();
  if (isSubmoduleGated(status)) return new Set<string>();
  const earned = await getUnlockedScaleModesStage();
  const ceiling = maxAllowedScaleModesStage(status);
  const effective = Math.min(earned, ceiling) as ScaleModeStage;
  return new Set(getEligibleScaleModeItems(effective, spacingRows));
}

export { MODULE_REF as SCALES_MODES_MODULE_REF };
export {
  UNLOCK_MIN_ATTEMPTS,
  UNLOCK_MIN_ACCURACY,
  STAGED_INTRODUCTION_BATCH_SIZE,
};
