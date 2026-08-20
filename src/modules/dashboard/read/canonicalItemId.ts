/**
 * One entry point for turning a stored `AttemptRecord.itemId` into the
 * key the read layer buckets on.
 *
 * WHY THIS EXISTS
 *
 * Three separate places computed per-item stats and two of them skipped
 * item-id normalisation entirely, so the Dashboard, the Skills
 * catalogue and the in-quiz tracker could show different numbers for
 * the same chord (`docs/RULE_LEGIBILITY.md` §1.12). Chord recognition
 * logged bare `maj` before the inversion build and `maj:0` after; only
 * the quiz folded the two together.
 *
 * The fix is not "remember to normalise" — it is having one function
 * every caller routes through, so a module that gains a legacy id
 * shape later gets it applied everywhere at once instead of in
 * whichever caller someone remembered.
 *
 * A module with no legacy shapes returns its id unchanged. That is the
 * common case and deliberately requires no registration.
 */
import { normalizeAttemptItemId } from '../../ear-training/chord-recognition/inversionUtils';

/**
 * Modules whose stored item ids need folding before they can be
 * bucketed. Keyed by `AttemptRecord.moduleId`.
 *
 * `chord-recognition` — attempts logged before the inversion build
 * carry a bare chord id (`maj`); everything since carries
 * `chordId:inversion` (`maj:0`). The one-shot migration in
 * `inversionMigration.ts` rewrites stored rows, but it runs per device
 * and may not have run here, so the read side folds too.
 */
const NORMALISERS: Readonly<Record<string, (itemId: string) => string>> = {
  'chord-recognition': normalizeAttemptItemId,
};

/**
 * Canonical bucketing key for one attempt.
 *
 * Pure and total: an unknown module, an empty id, or an id already in
 * canonical form all pass through unchanged rather than throwing. A
 * read path that crashes on unexpected stored data is worse than one
 * that counts it under its own literal id.
 */
export function canonicalItemId(moduleId: string, itemId: string): string {
  return NORMALISERS[moduleId]?.(itemId) ?? itemId;
}

/** True when this module folds any stored id shapes. Exported so a
 *  caller can explain the folding in an affordance rather than having
 *  the numbers silently differ from the raw log. */
export function moduleNormalisesItemIds(moduleId: string): boolean {
  return moduleId in NORMALISERS;
}
