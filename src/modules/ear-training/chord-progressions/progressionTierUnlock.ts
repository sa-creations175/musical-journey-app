/**
 * Progressive-stage unlock for ear-training chord progressions.
 * Mirrors `../chord-recognition/tierUnlock.ts` exactly — same
 * threshold values (10 attempts + 75 % accuracy per item), same
 * staged-introduction batch size (3 fresh items per stage per
 * session), same review/current/fresh mix weights.
 *
 * Cross-submodule gate: Stage 1 additionally requires chord
 * recognition Tier 1 to be CLEARED (the user has unlocked at
 * least Tier 2 on chord-recognition). Stage 1 stays locked until
 * the basic chord-quality ear is in place.
 *
 * Stage N+1 within chord-progressions unlocks when every item in
 * Stage N meets the per-item threshold. The check walks the
 * catalog's stage-tagged progressions, not the bare PROGRESSIONS
 * array, so a future re-classification flows through automatically.
 */
import { db, type SpacingState } from '../../../lib/db';
import { PROGRESSIONS } from './catalog';
import {
  MAX_PROGRESSION_STAGE,
  stageForProgression,
  type ProgressionStage,
} from './progressionStages';
import { getUnlockedTier as getChordRecognitionUnlockedTier } from '../chord-recognition/tierUnlock';

const MODULE_REF = 'chord-progressions';

const UNLOCK_MIN_ATTEMPTS = 10;
const UNLOCK_MIN_ACCURACY = 0.75;
const STAGED_INTRODUCTION_BATCH_SIZE = 3;

interface ItemStats {
  correct: number;
  total: number;
}

/** Walk lifetime attempts in db.attempts and produce a per-itemRef
 *  correct/total tally. Mirrors loadLifetimeStats in
 *  chord-recognition's tierUnlock.ts — same `excludeFromFluency`
 *  skip rule (small-pool focus drills don't count toward unlock). */
async function loadLifetimeStats(): Promise<Map<string, ItemStats>> {
  const attempts = await db.attempts.where('moduleId').equals(MODULE_REF).toArray();
  const stats = new Map<string, ItemStats>();
  for (const a of attempts) {
    if (a.excludeFromFluency) continue;
    const cur = stats.get(a.itemId) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (a.correct) cur.correct += 1;
    stats.set(a.itemId, cur);
  }
  return stats;
}

/** Catalog ids for a given stage in declaration order (the order
 *  they appear in `PROGRESSIONS`). Used both for the unlock walk
 *  and the staged-introduction batch — deterministic surfacing. */
export function itemsForStage(stage: ProgressionStage): string[] {
  return PROGRESSIONS
    .filter(p => stageForProgression(p.id) === stage)
    .map(p => p.id);
}

/** Pure unlock walk. Public so tests can pass fixture stats
 *  without hitting the DB. Stage 1 is the floor — even before any
 *  progression has been attempted, Stage 1 is "unlocked" for the
 *  purpose of this function. The cross-submodule gate (CR T1
 *  cleared) is enforced separately at the integration layer. */
export function computeUnlockedStage(
  statsByItem: ReadonlyMap<string, ItemStats>,
): ProgressionStage {
  let unlocked: ProgressionStage = 1;
  for (let stage = 1; stage < MAX_PROGRESSION_STAGE; stage++) {
    const items = itemsForStage(stage as ProgressionStage);
    if (items.length === 0) continue;
    const allCleared = items.every(id => {
      const s = statsByItem.get(id);
      if (!s) return false;
      if (s.total < UNLOCK_MIN_ATTEMPTS) return false;
      return s.correct / s.total >= UNLOCK_MIN_ACCURACY;
    });
    if (!allCleared) break;
    unlocked = (stage + 1) as ProgressionStage;
  }
  return unlocked;
}

/**
 * Highest stage the user has unlocked within chord-progressions
 * alone (no cross-submodule gate applied — see
 * `getEligibleProgressionItems` for the full gate).
 */
export async function getUnlockedProgressionStage(): Promise<ProgressionStage> {
  const stats = await loadLifetimeStats();
  return computeUnlockedStage(stats);
}

/**
 * Item-refs the chord-progressions module is allowed to surface
 * in a practice session, given an unlock stage. Composition mirrors
 * chord-recognition's getEligibleItems:
 *
 *   · all introduced items from stages below the unlocked stage (review)
 *   · all introduced items from the unlocked stage
 *   · up to 3 fresh items from the unlocked stage (staged introduction)
 *
 * Pure — tests pass row fixtures directly without touching the DB.
 */
export function getEligibleProgressionItems(
  unlockedStage: ProgressionStage,
  spacingStateRows: ReadonlyArray<SpacingState>,
): string[] {
  const introduced = new Set<string>();
  for (const row of spacingStateRows) {
    if (row.moduleRef !== MODULE_REF) continue;
    introduced.add(row.itemRef);
  }

  const eligible: string[] = [];

  // (1) Review pool — earlier stages, introduced items only.
  for (let stage = 1; stage < unlockedStage; stage++) {
    for (const id of itemsForStage(stage as ProgressionStage)) {
      if (introduced.has(id)) eligible.push(id);
    }
  }

  // (2) Current stage — introduced always; up to N fresh added.
  const currentItems = itemsForStage(unlockedStage);
  const fresh: string[] = [];
  for (const id of currentItems) {
    if (introduced.has(id)) eligible.push(id);
    else fresh.push(id);
  }
  for (const id of fresh.slice(0, STAGED_INTRODUCTION_BATCH_SIZE)) {
    eligible.push(id);
  }

  return eligible;
}

/**
 * Cross-submodule gate. Stage 1 of chord-progressions is locked
 * behind chord-recognition Tier 1 being CLEARED (i.e. the user
 * has unlocked at least Tier 2 on chord-recognition). Returns
 * the empty set when the gate isn't met; otherwise returns the
 * normal eligible set for the stage progression has earned.
 *
 * Wired into the session generator the same way
 * `loadChordRecognitionEligibleSet` is — see sessionGenerator.ts.
 */
export async function loadProgressionsEligibleSet(
  spacingRows: ReadonlyArray<SpacingState>,
): Promise<ReadonlySet<string>> {
  const crTier = await getChordRecognitionUnlockedTier();
  if (crTier < 2) {
    // CR Tier 1 not yet cleared → progressions stay fully locked.
    return new Set<string>();
  }
  const stage = await getUnlockedProgressionStage();
  return new Set(getEligibleProgressionItems(stage, spacingRows));
}

export { MODULE_REF as CHORD_PROGRESSIONS_MODULE_REF };
export {
  UNLOCK_MIN_ATTEMPTS,
  UNLOCK_MIN_ACCURACY,
  STAGED_INTRODUCTION_BATCH_SIZE,
};
