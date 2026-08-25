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
import { normaliseDirection } from '../../ear-training/intervals/seed';
import type { AttemptRecord } from '../../../lib/db';
import {
  normalizeAttemptItemId,
  parseAttemptItemId,
} from '../../ear-training/chord-recognition/inversionUtils';

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

/**
 * Some modules store attempts at a FINER granularity than the row a
 * catalog surface shows. This is the key such a row buckets under.
 *
 * `chord-recognition` is the live case. Attempts log against
 * `chordId:inversion` (`maj:0`, `min:2`), but both the Skills
 * catalogue and the dashboard tree show one row per chord — the tree
 * is `chord recognition → chord type → chord`, with inversion below
 * the leaf rather than beside it.
 *
 * THIS FIXES A REAL MISS, not a rounding difference. `skills/registry.ts`
 * bucketed on the raw `itemId` and then looked up the bare chord id
 * from `db.chordQualities`, so `mod.get('maj')` never matched a stored
 * `maj:0`. Every chord-recognition attempt logged since the inversion
 * build was invisible to the Skills catalogue, which showed the whole
 * module as untouched.
 *
 * Distinct from `canonicalItemId`, which answers "which item is this?"
 * — this answers "which catalog row does this item roll up into?".
 * For every module without a rollup the two agree.
 */
export function catalogRollupKey(moduleId: string, itemId: string): string {
  if (moduleId === 'chord-recognition') {
    return parseAttemptItemId(itemId).chordId;
  }
  return canonicalItemId(moduleId, itemId);
}

/**
 * The catalog itemRef one stored attempt belongs to.
 *
 * `canonicalItemId` takes an id string, but for one module the id is
 * not the whole identity. Intervals store the interval in `itemId` and
 * the direction in a SEPARATE `direction` column, so an ascending and a
 * descending major 3rd share `M3` and are told apart only by that
 * field. Ascending and descending are different sounds and different
 * skills — the catalog treats them as two items, and this is where the
 * two columns are recombined into the one ref that identifies them.
 *
 * `spacingState` already stores intervals the composed way
 * (`M3:asc`), so this brings the attempt log into line with the shape
 * the rest of the app already uses.
 *
 * Attempts with no `direction` predate the field and read as
 * ascending, matching `skills/registry.ts`.
 *
 * NOTE the relationship to `catalogRollupKey`: for intervals the two
 * deliberately differ. This returns the ITEM (`M3:asc`); the rollup key
 * returns the catalog ROW the Skills catalogue walks, which is the bare
 * interval, with direction handled by that surface's own split.
 */
export function itemRefForAttempt(
  attempt: Pick<AttemptRecord, 'moduleId' | 'itemId' | 'direction'>,
): string {
  const base = canonicalItemId(attempt.moduleId, attempt.itemId);
  if (attempt.moduleId === 'intervals') {
    // `normaliseDirection` folds a historical `P1:desc` onto `P1:asc`.
    // Those attempts are REAL unison data — at zero semitones
    // `playInterval` plays the same MIDI note twice whichever branch it
    // takes — so they merge rather than being stranded under a ref the
    // drill can no longer produce.
    return `${base}:${normaliseDirection(base, attempt.direction ?? 'asc')}`;
  }
  return base;
}
