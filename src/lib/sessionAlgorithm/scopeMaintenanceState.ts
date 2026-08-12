/**
 * Scope-level maintenance — the STATE (step 2 of 3).
 *
 * The trigger (scopeMaintenance.ts) decides whether a scope MAY be
 * offered maintenance. This records what the user did about it. The
 * split matters: qualifying is a fact about practice history and is
 * recomputed every time; being in maintenance is a decision, and a
 * decision has to be remembered.
 *
 * NOTHING HERE HAPPENS AUTOMATICALLY. A scope enters maintenance only
 * via `confirmScopeMaintenance`, which is only ever called from a
 * user action. There is deliberately no "auto-confirm when qualified"
 * path — that was the one thing the design rules out.
 *
 * ---------------------------------------------------------------
 * WHY userPrefs AND NOT A NEW TABLE
 *
 * This is a handful of rows keyed by scope, and `userPrefs` is
 * already a synced table (`user_prefs`, idField 'key', whole row in
 * the JSONB blob — see sync/tables.ts) with a settled get/set API. A
 * dedicated table would mean a Dexie version bump, a Supabase mirror,
 * and a SYNC_TABLES entry for state that has none of the query needs
 * that would justify them: it is never filtered, sorted, or ranged
 * over, only looked up by scope key.
 *
 * The whole map lives under ONE pref key rather than one key per
 * scope. Per-scope keys would spread a single logical object across
 * rows that sync independently, so two devices confirming different
 * scopes could interleave into a state neither of them chose. One
 * row is one last-write-wins unit, which is the correct granularity
 * for "which scopes has the user put into maintenance".
 *
 * If this ever needs querying, promoting it to a table is a
 * self-contained migration — the shape below is already row-like.
 * ---------------------------------------------------------------
 * DISMISSAL IS A SNOOZE, NOT A "NO"
 *
 * Dismissing quiets the suggestion for 7 days, after which it returns
 * IF the scope still qualifies. Requalification is checked at ask
 * time, not stored — if accuracy slipped in the interim there is
 * nothing to re-offer, and the suggestion simply does not come back.
 * That falls out of `shouldSuggestMaintenance` taking the live
 * verdict as an argument rather than caching one.
 */

import { getPref, setPref } from '../userPrefs';

/** Single userPrefs row holding the whole scope→record map. */
export const SCOPE_MAINTENANCE_PREF_KEY = 'scopeMaintenance.v1';

/** How long a dismissal quiets the suggestion. */
export const MAINTENANCE_DISMISSAL_QUIET_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What the user has decided about one scope.
 *
 *   'none'       — no decision on record (also the shape of a missing
 *                  entry, so callers never branch on undefined)
 *   'confirmed'  — the user put this scope into maintenance
 *
 * Dismissal is NOT a status. A dismissal is a timestamp, because it
 * expires; modelling it as a state would leave a scope sitting in
 * 'dismissed' forever and require a sweep to clear it.
 */
export type ScopeMaintenanceStatus = 'none' | 'confirmed';

export interface ScopeMaintenanceRecord {
  status: ScopeMaintenanceStatus;
  /** When the user confirmed. Null unless status is 'confirmed'. */
  confirmedAt: number | null;
  /** When the suggestion was last dismissed. Null if never. Retained
   *  after a later confirm so the history stays readable. */
  dismissedAt: number | null;
  /** Total dismissals, for the same reason `PromptRecord` keeps one:
   *  a suggestion refused many times is a signal about the
   *  suggestion, not the user. Not consumed yet. */
  dismissalCount: number;
}

export type ScopeMaintenanceMap = Readonly<
  Record<string, ScopeMaintenanceRecord>
>;

const EMPTY_RECORD: ScopeMaintenanceRecord = {
  status: 'none',
  confirmedAt: null,
  dismissedAt: null,
  dismissalCount: 0,
};

// ---------------------------------------------------------------------
// Pure decision logic
// ---------------------------------------------------------------------

/** The record for a scope, or a neutral one when absent. Total by
 *  construction so no caller has to handle a missing key. */
export function recordForScope(
  map: ScopeMaintenanceMap,
  scopeKey: string,
): ScopeMaintenanceRecord {
  return map[scopeKey] ?? EMPTY_RECORD;
}

/** Is a dismissal still inside its quiet window? */
export function isDismissalQuiet(
  record: ScopeMaintenanceRecord,
  now: number,
): boolean {
  if (record.dismissedAt === null) return false;
  return now - record.dismissedAt < MAINTENANCE_DISMISSAL_QUIET_MS;
}

/**
 * Should a surface show the maintenance suggestion for this scope?
 *
 * Pure, and takes the live qualification verdict as an argument
 * rather than reading it from state — that is what makes "returns
 * after 7 days IF the scope still qualifies" true without any
 * bookkeeping. A scope whose accuracy slipped stops qualifying and
 * the suggestion silently stops being offered.
 *
 * False once confirmed: the suggestion's whole job is to get a
 * decision, and it has one.
 */
export function shouldSuggestMaintenance(
  record: ScopeMaintenanceRecord,
  qualifies: boolean,
  now: number,
): boolean {
  if (!qualifies) return false;
  if (record.status === 'confirmed') return false;
  return !isDismissalQuiet(record, now);
}

/** Is this scope currently in maintenance? A confirmed scope stays
 *  confirmed until explicitly released — losing the state because a
 *  bad week dropped accuracy below the bar would silently restore a
 *  full allocation the user did not ask for. Re-evaluating a
 *  confirmed scope is a later decision, not an implicit one. */
export function isScopeInMaintenance(
  map: ScopeMaintenanceMap,
  scopeKey: string,
): boolean {
  return recordForScope(map, scopeKey).status === 'confirmed';
}

// ---------------------------------------------------------------------
// Pure reducers — every write goes through one of these
// ---------------------------------------------------------------------

export function withConfirmation(
  map: ScopeMaintenanceMap,
  scopeKey: string,
  now: number,
): ScopeMaintenanceMap {
  const prev = recordForScope(map, scopeKey);
  return {
    ...map,
    [scopeKey]: { ...prev, status: 'confirmed', confirmedAt: now },
  };
}

export function withDismissal(
  map: ScopeMaintenanceMap,
  scopeKey: string,
  now: number,
): ScopeMaintenanceMap {
  const prev = recordForScope(map, scopeKey);
  return {
    ...map,
    [scopeKey]: {
      ...prev,
      dismissedAt: now,
      dismissalCount: prev.dismissalCount + 1,
    },
  };
}

/** Take a scope back out of maintenance. Returns the map unchanged
 *  when the scope was never in it. */
export function withRelease(
  map: ScopeMaintenanceMap,
  scopeKey: string,
): ScopeMaintenanceMap {
  const prev = map[scopeKey];
  if (!prev || prev.status !== 'confirmed') return map;
  return { ...map, [scopeKey]: { ...prev, status: 'none', confirmedAt: null } };
}

// ---------------------------------------------------------------------
// Persistence — thin wrappers over the pure reducers
// ---------------------------------------------------------------------

export async function loadScopeMaintenance(): Promise<ScopeMaintenanceMap> {
  return getPref<ScopeMaintenanceMap>(SCOPE_MAINTENANCE_PREF_KEY, {});
}

async function mutate(
  fn: (map: ScopeMaintenanceMap) => ScopeMaintenanceMap,
): Promise<ScopeMaintenanceMap> {
  // Read-modify-write against the freshest value rather than a
  // caller-held snapshot, so two surfaces acting in the same tick
  // cannot drop each other's change.
  const next = fn(await loadScopeMaintenance());
  await setPref(SCOPE_MAINTENANCE_PREF_KEY, next);
  return next;
}

/** User confirmed the suggestion. The ONLY way into maintenance. */
export function confirmScopeMaintenance(
  scopeKey: string,
  now: number = Date.now(),
): Promise<ScopeMaintenanceMap> {
  return mutate(map => withConfirmation(map, scopeKey, now));
}

/** User dismissed the suggestion — quiet for 7 days. Dismissing on
 *  any surface writes the one shared record, which is what makes a
 *  dismissal in one place quiet all three in step 3. */
export function dismissScopeMaintenanceSuggestion(
  scopeKey: string,
  now: number = Date.now(),
): Promise<ScopeMaintenanceMap> {
  return mutate(map => withDismissal(map, scopeKey, now));
}

/** User took the scope back out of maintenance. */
export function releaseScopeMaintenance(
  scopeKey: string,
): Promise<ScopeMaintenanceMap> {
  return mutate(map => withRelease(map, scopeKey));
}
