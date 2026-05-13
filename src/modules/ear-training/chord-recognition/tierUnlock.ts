import { db, type SpacingState } from '../../../lib/db';
import {
  CHORD_RECOGNITION_TIERS,
  MAX_TIER,
  type ChordRecognitionTier,
  itemsForTier,
  toAttemptForm,
} from './chordRecognitionTiers';

/** Module ref string for chord-recognition spacingState rows. */
const MODULE_REF = 'chord-recognition';

/** Lifetime attempt count required per item before the unlock check
 *  even considers it. Below this floor an item can't gate a tier. */
const UNLOCK_MIN_ATTEMPTS = 10;

/** Lifetime accuracy fraction required per item to count as cleared
 *  in the unlock check. correctAttempts / totalAttempts ≥ this. */
const UNLOCK_MIN_ACCURACY = 0.75;

/** Cap on new items introduced per tier per practice session.
 *  Items beyond this stay locked until the user has at least
 *  attempted the current cohort. */
const STAGED_INTRODUCTION_BATCH_SIZE = 3;

interface ItemStats {
  correct: number;
  total: number;
}

/** Walk lifetime attempts in db.attempts and produce a per-itemRef
 *  correct/total tally. `excludeFromFluency` rows are skipped — they
 *  are non-fluency signals (e.g. small-pool focus drills) and would
 *  inflate the count without representing genuine recognition
 *  ability. */
async function loadLifetimeStats(): Promise<Map<string, ItemStats>> {
  const attempts = await db.attempts
    .where('moduleId').equals(MODULE_REF).toArray();
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

/** Pure unlock walk. Public so tests can pass fixture stats without
 *  hitting the DB. */
export function computeUnlockedTier(
  statsByItem: ReadonlyMap<string, ItemStats>,
): ChordRecognitionTier {
  let unlocked: ChordRecognitionTier = 1;
  for (let tier = 1; tier < MAX_TIER; tier++) {
    const items = itemsForTier(tier as ChordRecognitionTier);
    const allCleared = items.every(item => {
      const s = statsByItem.get(toAttemptForm(item));
      if (!s) return false;
      if (s.total < UNLOCK_MIN_ATTEMPTS) return false;
      return s.correct / s.total >= UNLOCK_MIN_ACCURACY;
    });
    if (!allCleared) break;
    unlocked = (tier + 1) as ChordRecognitionTier;
  }
  return unlocked;
}

/**
 * Highest tier the user has unlocked. Tier 1 is always unlocked.
 * Tier N+1 unlocks when every item in tier N meets BOTH:
 *   · totalAttempts >= UNLOCK_MIN_ATTEMPTS (10), AND
 *   · correctAttempts / totalAttempts >= UNLOCK_MIN_ACCURACY (0.75).
 *
 * The userId parameter is reserved for future multi-user contexts;
 * Dexie tables are per-installation today and the read filters by
 * moduleRef alone.
 */
export async function getUnlockedTier(_userId?: string): Promise<ChordRecognitionTier> {
  const stats = await loadLifetimeStats();
  return computeUnlockedTier(stats);
}

/**
 * Convenience wrapper called at the end of a chord-recognition
 * session so the UI can detect a freshly-crossed tier threshold.
 * Returns the now-unlocked tier; callers compare against their
 * "previous" snapshot to decide whether to surface a toast.
 *
 * Today the unlock state isn't persisted (it's a pure function of
 * the attempts log), so this is exactly `getUnlockedTier`. The
 * separate export exists so the integration site reads
 * intention-first ("we just finished a session, advance if we
 * earned it") and a future cached / event-sourced implementation
 * can swap in without rippling.
 */
export async function checkAndAdvanceTier(userId?: string): Promise<ChordRecognitionTier> {
  return getUnlockedTier(userId);
}

/**
 * Item-refs the chord-recognition module is allowed to surface in a
 * practice session, given an unlock state.
 *
 * Composition:
 *   · all introduced items from tiers below the unlocked tier
 *     (review — items the user has attempted at least once)
 *   · all introduced items from the unlocked tier
 *   · up to STAGED_INTRODUCTION_BATCH_SIZE (3) fresh items from the
 *     unlocked tier (never-attempted; "introduced" via this call)
 *
 * Item presence in spacingState is the "introduced" signal —
 * recordEngagement creates a row on first attempt and never deletes
 * it. Rows for items outside the tier system (e.g. a stray
 * dim7:1 attempted in a legacy build) are ignored entirely;
 * progress on them doesn't count toward unlock and they don't
 * appear in the eligible set.
 *
 * Pure — tests pass row fixtures directly without touching the DB.
 */
export function getEligibleItems(
  unlockedTier: ChordRecognitionTier,
  spacingStateRows: ReadonlyArray<SpacingState>,
): string[] {
  const introducedItemRefs = new Set<string>();
  for (const row of spacingStateRows) {
    if (row.moduleRef !== MODULE_REF) continue;
    introducedItemRefs.add(row.itemRef);
  }

  const eligible: string[] = [];

  // (1) Review pool — earlier tiers, introduced items only. Items
  //     the user never touched in earlier tiers shouldn't suddenly
  //     materialise when tier 3 unlocks; those should remain a
  //     deliberate practice choice via the explicit review path.
  for (let tier = 1; tier < unlockedTier; tier++) {
    for (const canonical of itemsForTier(tier as ChordRecognitionTier)) {
      const attemptForm = toAttemptForm(canonical);
      if (introducedItemRefs.has(attemptForm)) eligible.push(attemptForm);
    }
  }

  // (2) Current tier — split into introduced (always eligible) and
  //     not-yet-introduced (eligible only for the staged batch).
  //     Iteration order from itemsForTier is the static declaration
  //     order, so the staged batch is deterministic: the first N
  //     fresh items in the tier list.
  const currentItems = itemsForTier(unlockedTier);
  const freshFromCurrent: string[] = [];
  for (const canonical of currentItems) {
    const attemptForm = toAttemptForm(canonical);
    if (introducedItemRefs.has(attemptForm)) {
      eligible.push(attemptForm);
    } else {
      freshFromCurrent.push(attemptForm);
    }
  }
  for (const fresh of freshFromCurrent.slice(0, STAGED_INTRODUCTION_BATCH_SIZE)) {
    eligible.push(fresh);
  }

  return eligible;
}

/**
 * Classify an item-ref (attempt form) into the three weighting
 * buckets the in-quiz mixer uses. Items outside the tier system
 * receive `'untracked'`; the caller decides how to weight them
 * (today the quiz just skips them).
 */
export type EligibilityCategory = 'review' | 'current' | 'fresh' | 'untracked';

export function classifyForMix(
  itemRefAttemptForm: string,
  unlockedTier: ChordRecognitionTier,
  spacingStateRows: ReadonlyArray<SpacingState>,
): EligibilityCategory {
  // Cheap inline copies of the helpers used by getEligibleItems —
  // classifyForMix is called per candidate, so we avoid rebuilding
  // the introduced set on each call by computing membership once
  // upstream and passing in. (Callers may opt to inline a hot loop
  // using `getEligibleItems` directly; this exposed helper is
  // mostly for tests + readability.)
  let tier: ChordRecognitionTier;
  try {
    tier = tierForItemAttemptForm(itemRefAttemptForm);
  } catch {
    return 'untracked';
  }
  if (tier < unlockedTier) return 'review';
  if (tier > unlockedTier) return 'untracked';
  // tier === unlockedTier — distinguish introduced vs fresh.
  const introduced = spacingStateRows.some(
    r => r.moduleRef === MODULE_REF && r.itemRef === itemRefAttemptForm,
  );
  return introduced ? 'current' : 'fresh';
}

/** Helper that mirrors getTierForItem but takes the attempt form
 *  ("maj:0") directly — saves callers a separate normalisation step
 *  when classifying. */
function tierForItemAttemptForm(itemRefAttemptForm: string): ChordRecognitionTier {
  for (const [tierStr, items] of Object.entries(CHORD_RECOGNITION_TIERS)) {
    const tier = Number(tierStr) as ChordRecognitionTier;
    for (const canonical of items) {
      if (toAttemptForm(canonical) === itemRefAttemptForm) return tier;
    }
  }
  throw new Error(`chord-recognition: item-ref "${itemRefAttemptForm}" is not part of the tier system`);
}

/** Multiplicative weight applied per eligibility bucket inside the
 *  in-quiz adaptive selector. Exported so the spec and tests share
 *  the source-of-truth values. */
export const MIX_WEIGHT: Record<Exclude<EligibilityCategory, 'untracked'>, number> = {
  review: 0.2,
  current: 0.7,
  fresh: 0.1,
};

/** Re-export for the in-quiz mixer's convenience. */
export { MODULE_REF as CHORD_RECOGNITION_MODULE_REF };
