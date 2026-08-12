/**
 * Scope-level maintenance — the async resolver (step 3).
 *
 * One place that answers, for every active coverage goal:
 *
 *   · is this scope IN maintenance?          (confirmed state)
 *   · should we SUGGEST entering?            (qualified + not quiet)
 *   · should we SUGGEST releasing?           (slipped + not quiet)
 *
 * The three surfaces and the session generator all need some slice of
 * that, and every one of them would otherwise re-derive it slightly
 * differently. A suggestion that appears in the weekly plan but not
 * post-session — because two call sites disagreed about the quiet
 * window — is the exact failure the shared resolver exists to
 * prevent.
 *
 * Reads Dexie once and hands back plain data; all the deciding is
 * done by the pure functions in scopeMaintenance.ts and
 * scopeMaintenanceState.ts.
 */

import { db, type Goal, type SpacingState } from '../db';
import {
  candidateSpecForGoal,
} from './candidates';
import {
  scopeQualifiesForMaintenance,
  scopeShouldSuggestRelease,
  type MaintenanceItemRow,
  type MaintenanceQualification,
} from './scopeMaintenance';
import { scopeKeyForGoal } from './scopeCatalog';
import {
  loadScopeMaintenance,
  recordForScope,
  shouldSuggestMaintenance,
  shouldSuggestRelease,
  type ScopeMaintenanceMap,
} from './scopeMaintenanceState';

/** Everything a surface needs to render one scope's state. */
export interface ScopeMaintenanceView {
  scopeKey: string;
  goalId: string;
  /** Human-facing scope label, taken from the goal's own description
   *  so the notice names the scope the way the user named it. */
  label: string;
  moduleRefs: readonly string[];
  inMaintenance: boolean;
  suggestEnter: boolean;
  suggestRelease: boolean;
  /** Why the scope does or does not qualify — lets a surface explain
   *  itself instead of silently showing nothing. */
  qualification: MaintenanceQualification;
}

/** Rows shaped for the pure trigger. `performanceHistory` is stored
 *  loosely on the Dexie row; cast at the boundary the same way
 *  spacingState.ts does. */
function toMaintenanceRows(
  rows: ReadonlyArray<SpacingState>,
): MaintenanceItemRow[] {
  return rows.map(r => ({
    itemRef: r.itemRef,
    moduleRef: r.moduleRef,
    acquisitionStage: r.acquisitionStage,
    performanceHistory:
      r.performanceHistory as unknown as MaintenanceItemRow['performanceHistory'],
  }));
}

/**
 * Resolve every active coverage goal against the maintenance rules.
 * Pure given its inputs — the Dexie read is the caller's job (see
 * `loadScopeMaintenanceViews`) so this stays testable.
 */
export function resolveScopeMaintenanceViews(
  goals: ReadonlyArray<Goal>,
  spacingRows: ReadonlyArray<SpacingState>,
  state: ScopeMaintenanceMap,
  now: number,
): ScopeMaintenanceView[] {
  const rows = toMaintenanceRows(spacingRows);
  const out: ScopeMaintenanceView[] = [];
  const seen = new Set<string>();

  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    const scopeKey = scopeKeyForGoal(goal);
    if (scopeKey === null) continue;
    // Two active goals can target one scope; it gets one view.
    if (seen.has(scopeKey)) continue;

    const spec = candidateSpecForGoal(goal);
    if (spec.kind !== 'coverage') continue;
    seen.add(scopeKey);

    const inScope = spec.itemRefFilter ?? (() => true);
    const qualification = scopeQualifiesForMaintenance(
      goal, rows, inScope, spec.moduleRefs,
    );
    const record = recordForScope(state, scopeKey);
    const slipped = scopeShouldSuggestRelease(rows, inScope, spec.moduleRefs);

    out.push({
      scopeKey,
      goalId: goal.id,
      label: goal.description || scopeKey,
      moduleRefs: spec.moduleRefs,
      inMaintenance: record.status === 'confirmed',
      suggestEnter: shouldSuggestMaintenance(record, qualification.qualifies, now),
      suggestRelease: shouldSuggestRelease(record, slipped, now),
      qualification,
    });
  }

  return out;
}

/** The scope keys currently in maintenance — what the session
 *  generator's selection gate consumes. */
export function maintenanceScopeKeysFrom(
  views: ReadonlyArray<ScopeMaintenanceView>,
): Set<string> {
  return new Set(views.filter(v => v.inMaintenance).map(v => v.scopeKey));
}

/** Load state + goals + rows and resolve. The one async entry point. */
export async function loadScopeMaintenanceViews(
  now: number = Date.now(),
): Promise<ScopeMaintenanceView[]> {
  const [goals, spacingRows, state] = await Promise.all([
    db.goals.toArray(),
    db.spacingState.toArray(),
    loadScopeMaintenance(),
  ]);
  return resolveScopeMaintenanceViews(goals, spacingRows, state, now);
}
