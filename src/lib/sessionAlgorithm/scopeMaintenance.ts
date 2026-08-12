/**
 * Scope-level maintenance — the TRIGGER (step 2 of 3).
 *
 * Step 1 built the selection primitive: a spec that surfaces acquired
 * AND due items, so a fully-learned scope can still produce a block.
 * This decides WHEN a scope may be OFFERED that state. It never
 * decides that a scope enters it — the app suggests, the user
 * confirms. See scopeMaintenanceState.ts for the confirmed half.
 *
 * A scope qualifies when all three hold:
 *
 *   1. every item in the scope is acquired — measured against CATALOG
 *      CARDINALITY, not row count;
 *   2. accuracy >= 90% over the last 20 attempts, per item;
 *   3. those attempts are spread across >= 4 distinct days.
 *
 * ---------------------------------------------------------------
 * WHY DISTINCT DAYS AND NOT A SESSION COUNT
 *
 * The requirement as designed was ">= 4 separate sessions on >= 4
 * distinct days". The session half is NOT DERIVABLE from what the app
 * stores: neither `AttemptRecord` nor `PerformanceEntry` carries a
 * session id. `practiceSessions` has startedAt/endedAt, but attempts
 * made outside a planned session — standalone HF/ET drilling, which
 * is normal — fall inside no range at all, so a timestamp join would
 * silently undercount exactly the practice that is hardest to see.
 *
 * Rather than approximate, the day count carries the whole
 * requirement, because it IMPLIES the session count for the purpose
 * that motivated it. The stated point was that one long cramming
 * sitting must not qualify a scope. Attempts on 4 distinct days
 * cannot be one sitting — a sitting spanning 4 calendar days would
 * have to run past three consecutive midnights. Two sittings on the
 * same day add nothing to an anti-cramming test, so the session count
 * is redundant given the day count rather than lost.
 *
 * This is a strictly sufficient condition, not a weakened one.
 * ---------------------------------------------------------------
 * WHY DECLARATIVE SCOPES ONLY
 *
 * "Accuracy" only exists for declarative items. `recordEngagement`
 * REJECTS an attempt signal for anything else — see
 * assertSignalMatchesMemoryType: declarative→attempt,
 * procedural/integration→rating, expression→recency. So Shapes
 * (procedural) and Repertoire / Production (integration) carry
 * ratings and have no accuracy signal to threshold at all.
 *
 * Those scopes therefore never qualify, and say so with a reason
 * rather than silently returning false. Inventing a rating-based
 * equivalent would be a design decision, not an implementation
 * detail, so it is left to be asked rather than assumed. Repertoire
 * separately already has its own maintenance path
 * (`songProgression.progressionPath`).
 * ---------------------------------------------------------------
 * THE 20-ATTEMPT WINDOW IS AT THE STORE'S CEILING
 *
 * `performanceHistory` is capped at PERFORMANCE_HISTORY_MAX = 20
 * entries, enforced by a `.slice(-20)` on every write. For a
 * declarative item every entry is an attempt, so "the last 20
 * attempts" is exactly a full buffer — satisfiable, with zero
 * headroom. The window CANNOT be widened past 20 without either
 * raising that cap (which only affects rows written after the
 * change) or re-sourcing from `db.attempts`. Worth knowing before
 * revising these first-draft numbers upward.
 *
 * Pure and synchronous throughout — rows in, verdict out.
 */

import type { AcquisitionStage, Goal } from '../db';
import type { PerformanceEntry } from '../spacingState';
import { localDayKey } from '../dailyGoal';
import { COVERED_STAGES } from './acquisitionStage';
import { catalogTotalForGoal } from './scopeCatalog';

// ---------------------------------------------------------------------
// Thresholds — FIRST DRAFT, to be revised against real usage.
// ---------------------------------------------------------------------

/** Fraction correct required across the window. Deliberately stricter
 *  than the `acquiring → acquired` bar (DECLARATIVE_ACQUIRED_THRESHOLD
 *  = 0.8): reaching acquired is a different claim from being steady
 *  enough to step down to maintenance. */
export const MAINTENANCE_ACCURACY_THRESHOLD = 0.9;

/** Attempts inspected, most recent first. Deliberately wider than the
 *  acquisition window (DECLARATIVE_ACQUIRED_WINDOW = 10), and at the
 *  store's ceiling — see the header note. */
export const MAINTENANCE_ACCURACY_WINDOW = 20;

/** Attempts required before the threshold is even evaluated. Equal to
 *  the window: a partial buffer means the item has not yet been seen
 *  enough times to make the claim. Separate constant from the window
 *  so the minimum can be relaxed later without also narrowing what
 *  gets measured. */
export const MAINTENANCE_MIN_ATTEMPTS = 20;

/** Distinct local days the windowed attempts must span. The
 *  anti-cramming gate — see the header note on why this stands in for
 *  the session count. */
export const MAINTENANCE_MIN_DISTINCT_DAYS = 4;

/**
 * Accuracy below which a CONFIRMED scope is suggested for release,
 * over the same 20-attempt window.
 *
 * THE GAP BETWEEN 0.90 AND 0.85 IS THE WHOLE POINT. A single shared
 * threshold would put a scope hovering at the bar into alternating
 * enter/release suggestions week after week — each one individually
 * correct, and collectively noise. Five points is about one miss in
 * twenty: wide enough that an off rep changes nothing, narrow enough
 * to catch real drift.
 */
export const MAINTENANCE_RELEASE_THRESHOLD = 0.85;

// ---------------------------------------------------------------------
// Per-item bar
// ---------------------------------------------------------------------

/** The subset of a spacingState row this module needs. Structural so
 *  tests can build fixtures without faking Dexie, matching the
 *  `SpacingRow` convention in types.ts. */
export interface MaintenanceItemRow {
  itemRef: string;
  moduleRef: string;
  acquisitionStage: AcquisitionStage;
  /** Stored loosely on the Dexie row; cast at the call site the same
   *  way spacingState.ts does. */
  performanceHistory: ReadonlyArray<PerformanceEntry>;
}

/** Distinct local calendar days among the supplied entries. Uses the
 *  app's existing `localDayKey` so "a day" means the same thing here
 *  as it does to streaks, the calendar, and daily summaries — a
 *  second definition of midnight is exactly the kind of drift that
 *  makes two surfaces disagree about the same practice. */
export function distinctLocalDays(
  entries: ReadonlyArray<{ t: number }>,
): number {
  const days = new Set<string>();
  for (const e of entries) days.add(localDayKey(new Date(e.t)));
  return days.size;
}

/**
 * Does one item clear the accuracy + spread bar?
 *
 * Both tests run over the SAME windowed attempts. The spread has to
 * describe the attempts being measured — accuracy from one stretch of
 * practice and a day count from some older stretch would be two
 * unrelated claims presented as one.
 */
export function itemMeetsMaintenanceBar(
  history: ReadonlyArray<PerformanceEntry>,
): boolean {
  const attempts = history
    .filter((e): e is Extract<PerformanceEntry, { kind: 'attempt' }> =>
      e.kind === 'attempt')
    .slice(-MAINTENANCE_ACCURACY_WINDOW);

  if (attempts.length < MAINTENANCE_MIN_ATTEMPTS) return false;
  if (distinctLocalDays(attempts) < MAINTENANCE_MIN_DISTINCT_DAYS) return false;

  const correct = attempts.filter(a => a.correct).length;
  return correct / attempts.length >= MAINTENANCE_ACCURACY_THRESHOLD;
}

/**
 * Windowed accuracy for one item, or null when the buffer is not yet
 * full. Null is NOT a failure — it means "no verdict available",
 * which entry and release read in opposite directions: entry treats
 * an unjudgeable item as not-yet-qualifying, release treats it as no
 * evidence of slipping.
 */
export function windowedAccuracy(
  history: ReadonlyArray<PerformanceEntry>,
): number | null {
  const attempts = history
    .filter((e): e is Extract<PerformanceEntry, { kind: 'attempt' }> =>
      e.kind === 'attempt')
    .slice(-MAINTENANCE_ACCURACY_WINDOW);
  if (attempts.length < MAINTENANCE_MIN_ATTEMPTS) return null;
  return attempts.filter(a => a.correct).length / attempts.length;
}

/**
 * Has this item slipped far enough to warrant suggesting release?
 *
 * NO DAY-SPREAD REQUIREMENT here, deliberately. Spread is an ENTRY
 * requirement — it is how the app satisfies itself that the learning
 * is durable rather than crammed. Slipping accuracy is slipping
 * accuracy however it is distributed, and demanding spread before
 * acknowledging a decline would just delay the suggestion.
 */
export function itemBelowReleaseBar(
  history: ReadonlyArray<PerformanceEntry>,
): boolean {
  const accuracy = windowedAccuracy(history);
  if (accuracy === null) return false;
  return accuracy < MAINTENANCE_RELEASE_THRESHOLD;
}

// ---------------------------------------------------------------------
// Scope verdict
// ---------------------------------------------------------------------

/** Why a scope does or does not qualify. Carried so the three
 *  surfaces in step 3 can explain themselves instead of showing or
 *  hiding a suggestion with no account of why. */
export type MaintenanceDisqualifier =
  /** Not a coverage goal, so it has no "scope" in this sense. */
  | 'not-a-coverage-scope'
  /** Shapes / Repertoire / Production — rating-based, so no accuracy
   *  signal exists to threshold. See the header note. */
  | 'no-accuracy-signal'
  /** The catalog total for this scope could not be resolved. */
  | 'unknown-catalog-total'
  /** Fewer acquired items than the catalog holds — the scope is not
   *  finished, it is merely finished among the items touched so far. */
  | 'items-not-all-acquired'
  /** Every item is acquired, but at least one has not held >=90%
   *  across >=20 attempts spanning >=4 days. */
  | 'bar-not-met';

export interface MaintenanceQualification {
  qualifies: boolean;
  reason: MaintenanceDisqualifier | null;
  /** Catalog cardinality for the scope; null when unresolved. */
  catalogTotal: number | null;
  /** Distinct acquired itemRefs found in scope. */
  acquiredCount: number;
}

/** Modules whose items carry an accuracy signal. Derived from the
 *  memory-type contract rather than listed by hand: declarative is
 *  precisely the set `recordEngagement` accepts attempts for. */
function hasAccuracySignal(moduleRefs: readonly string[]): boolean {
  return moduleRefs.every(ref => DECLARATIVE_MODULE_REFS.has(ref));
}

/** The declarative moduleRefs, mirrored from MODULE_MEMORY_TYPES.
 *  Kept as a local set rather than calling `getMemoryType` so this
 *  module stays pure and total — `getMemoryType` THROWS on an unknown
 *  ref, and a goal carrying a stale moduleRef should disqualify a
 *  suggestion, not crash the surface showing it. */
const DECLARATIVE_MODULE_REFS: ReadonlySet<string> = new Set([
  'harmonic-fluency',
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
]);

/**
 * Does this goal's scope qualify to be OFFERED scope-level
 * maintenance? Pure — the caller supplies the scope's spacingState
 * rows.
 *
 * `rows` should be every row for the goal's moduleRefs; this filters
 * to the scope itself via the goal's own item filter. Rows are
 * de-duplicated by itemRef before counting, because spacingState is
 * unique on [moduleRef+itemRef+hand+style] and a single item can own
 * several rows. That is a no-op for declarative modules (always
 * hand='both', style='solid') and is here so the count cannot quietly
 * become a row count if the scope set ever widens.
 */
export function scopeQualifiesForMaintenance(
  goal: Goal,
  rows: ReadonlyArray<MaintenanceItemRow>,
  itemInScope: (itemRef: string) => boolean,
  moduleRefs: readonly string[],
): MaintenanceQualification {
  const empty = { catalogTotal: null, acquiredCount: 0 };

  if (moduleRefs.length === 0) {
    return { qualifies: false, reason: 'not-a-coverage-scope', ...empty };
  }
  if (!hasAccuracySignal(moduleRefs)) {
    return { qualifies: false, reason: 'no-accuracy-signal', ...empty };
  }

  const catalogTotal = catalogTotalForGoal(goal);
  if (catalogTotal === null || catalogTotal <= 0) {
    return { qualifies: false, reason: 'unknown-catalog-total', ...empty };
  }

  const moduleSet = new Set(moduleRefs);
  const acquiredByItem = new Map<string, MaintenanceItemRow>();
  for (const row of rows) {
    if (!moduleSet.has(row.moduleRef)) continue;
    if (!itemInScope(row.itemRef)) continue;
    if (!COVERED_STAGES.has(row.acquisitionStage)) continue;
    acquiredByItem.set(row.itemRef, row);
  }
  const acquiredCount = acquiredByItem.size;

  // THE CARDINALITY GATE. This is the check that separates "nothing
  // left to cover among what I have touched" from "nothing left to
  // cover". A 90-item scope with 3 touched-and-acquired items reads
  // as saturated to a row-only test and must not read as finished
  // here.
  if (acquiredCount < catalogTotal) {
    return {
      qualifies: false,
      reason: 'items-not-all-acquired',
      catalogTotal,
      acquiredCount,
    };
  }

  for (const row of acquiredByItem.values()) {
    if (!itemMeetsMaintenanceBar(row.performanceHistory)) {
      return {
        qualifies: false,
        reason: 'bar-not-met',
        catalogTotal,
        acquiredCount,
      };
    }
  }

  return { qualifies: true, reason: null, catalogTotal, acquiredCount };
}

/**
 * Has a CONFIRMED scope slipped far enough to suggest releasing it?
 *
 * Symmetric with entry, one threshold lower. Entry needs EVERY item
 * at or above 0.90; release fires when ANY item has fallen below
 * 0.85. Reading the same measure in both directions is what makes
 * the 5-point gap function as hysteresis — a scope that dips to 0.88
 * neither re-qualifies for entry nor triggers a release, which is
 * exactly the dead band the gap is for.
 *
 * (The alternative reading — scope-AGGREGATE accuracy below 0.85 —
 * would let one badly-rotted item hide inside a large scope's
 * average. Per-item matches how entry is measured, so the two ends
 * of the state describe the same thing.)
 *
 * Items without a full window are skipped, not counted against the
 * scope: no verdict is not a bad verdict.
 */
export function scopeShouldSuggestRelease(
  rows: ReadonlyArray<MaintenanceItemRow>,
  itemInScope: (itemRef: string) => boolean,
  moduleRefs: readonly string[],
): boolean {
  const moduleSet = new Set(moduleRefs);
  for (const row of rows) {
    if (!moduleSet.has(row.moduleRef)) continue;
    if (!itemInScope(row.itemRef)) continue;
    if (itemBelowReleaseBar(row.performanceHistory)) return true;
  }
  return false;
}
