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
 *
 * Since the catalog cut of 9 Sep 2026 the stages are thin — stage 3
 * is one progression and stage 4 is one — and nothing here needed
 * changing for that: a stage of one clears on that one item, and the
 * staged-introduction batch simply hands over fewer than three fresh
 * items. The one thing that DID need changing is the empty-stage case;
 * see `computeUnlockedStage`.
 */
import { db, type SpacingState } from '../../../lib/db';
import { PROGRESSIONS } from './catalog';
import {
  MAX_PROGRESSION_STAGE,
  stageForProgression,
  type ProgressionStage,
} from './progressionStages';
import {
  isSubmoduleGated,
  loadEtSubmoduleStatus,
  maxAllowedProgressionStage,
} from '../etStageGate';
import { feelOfAttempt } from '../../../lib/earTraining/heardFeel';
import { CLEAN_FEEL } from '../../../lib/fluencyScale';

const MODULE_REF = 'chord-progressions';

const UNLOCK_MIN_ATTEMPTS = 10;
/**
 * The bar a tier opens at, and what counts as clearing it.
 *
 * =====================================================================
 * A PASS IS RIGHT WITHOUT AN AID, AND THE BAR IS FLUENT'S.
 *
 * Silas's ruling of 10 Sep 2026. An attempt passes for unlocking if it
 * was right and no aid was taken — In flow (100) or Clean (75) on the
 * four-step scale. Replays are allowed: needing to hear it again is
 * slower, not wrong. Working on it (50) and Struggled (25) do not pass,
 * so a card answered with the bass soloed, or the right progression
 * from the wrong position, no longer opens anything.
 *
 * The threshold moves 75% → 80%, which is the same bar the Fluent
 * rating is drawn at. One number for "good enough", across the app.
 *
 * ROWS WITH NO RATING READ AS THE TWO ENDS OF THE SCALE — In flow for a
 * right answer, Struggled for a wrong one — so for a history written
 * before today the rule is exactly what it always was, and only the
 * threshold moved. Silas accepted that ladders may drop.
 * =====================================================================
 */
const UNLOCK_MIN_ACCURACY = 0.80;
const STAGED_INTRODUCTION_BATCH_SIZE = 3;

export interface ItemStats {
  /** How many of the window's attempts PASSED — right, and no aid
   *  taken. Not the same as how many were right: an answer that needed
   *  the bass soloed is right and does not pass. */
  passes: number;
  total: number;
}

/** Walk lifetime attempts in db.attempts and produce a per-itemRef
 *  passes/total tally. Mirrors loadLifetimeStats in
 *  chord-recognition's tierUnlock.ts — same `excludeFromFluency`
 *  skip rule (small-pool focus drills don't count toward unlock). */
async function loadLifetimeStats(): Promise<Map<string, ItemStats>> {
  const attempts = await db.attempts.where('moduleId').equals(MODULE_REF).toArray();
  const stats = new Map<string, ItemStats>();
  for (const a of attempts) {
    if (a.excludeFromFluency) continue;
    const cur = stats.get(a.itemId) ?? { passes: 0, total: 0 };
    cur.total += 1;
    if (feelOfAttempt(a) >= CLEAN_FEEL) cur.passes += 1;
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
    // A STAGE WITH NOTHING IN IT IS CLEARED, NOT A WALL.
    //
    // This used to `continue`, which left `unlocked` where it was and
    // then broke out on the next stage that was not cleared — so an
    // empty stage 2 made stages 3 and 4 unreachable for ever, with no
    // action the reader could take to open them. The catalog cut of
    // 9 Sep leaves every stage populated, and the shape of the bug is
    // exactly the shape of a future cut, so it is fixed rather than
    // relied upon.
    if (items.length === 0) {
      unlocked = (stage + 1) as ProgressionStage;
      continue;
    }
    const allCleared = items.every(id => {
      const s = statsByItem.get(id);
      if (!s) return false;
      if (s.total < UNLOCK_MIN_ATTEMPTS) return false;
      return s.passes / s.total >= UNLOCK_MIN_ACCURACY;
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
 * Cross-submodule gate. Delegates to `etStageGate.ts` so the gate
 * rules live in one place (this file used to inline a CR T1 check;
 * the gate utility now enforces the full Stage 1-5 layered logic).
 *
 *   · ET Stage 2 not met → progressions fully locked (empty set).
 *   · Otherwise: the eligible set is built for
 *     `min(within-submodule earned stage, max allowed by gate)`.
 *
 * The clamp matters because the spec ties each progressions stage
 * to a cross-submodule prerequisite — e.g. progressions Stage 2
 * needs CR T2 cleared even after progressions Stage 1 is earned
 * within the submodule.
 */
export async function loadProgressionsEligibleSet(
  spacingRows: ReadonlyArray<SpacingState>,
): Promise<ReadonlySet<string>> {
  const status = await loadEtSubmoduleStatus();
  if (isSubmoduleGated(status)) return new Set<string>();
  const earned = await getUnlockedProgressionStage();
  const ceiling = maxAllowedProgressionStage(status);
  const effective = Math.min(earned, ceiling) as ProgressionStage;
  return new Set(getEligibleProgressionItems(effective, spacingRows));
}

export { MODULE_REF as CHORD_PROGRESSIONS_MODULE_REF };
export {
  UNLOCK_MIN_ATTEMPTS,
  UNLOCK_MIN_ACCURACY,
  STAGED_INTRODUCTION_BATCH_SIZE,
};
