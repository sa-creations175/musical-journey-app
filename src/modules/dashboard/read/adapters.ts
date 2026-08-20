/**
 * Turning what each module stores into stats against its catalog.
 *
 * Every function here is pure: loaded rows in, `ItemStats` out. The
 * Dexie reads live at the call site so this stays testable without a
 * database.
 *
 * Two rules hold across every adapter:
 *
 *   THE DENOMINATOR IS THE CATALOG. Stats are produced per catalog row,
 *   in catalog order, and a row with nothing logged comes back as
 *   `emptyItemStats` rather than being omitted. An uncovered item is
 *   part of the denominator; that is the whole point.
 *
 *   THE NUMERATOR IS FILTERED TO CATALOG MEMBERSHIP. Engagements are
 *   looked up BY catalog ref, so stored practice that outlives a
 *   catalog entry - a cut chord shape, a renamed item - contributes to
 *   nothing rather than pushing a percentage over 100%.
 */
import type { AttemptRecord } from '../../../lib/db';
import type { ModuleCatalog } from './catalogs';
import {
  emptyItemStats,
  engagementsFromAttempts,
  itemStatsFromEngagements,
  type Engagement,
  type ItemStats,
} from './itemStats';

/**
 * Stats for every row in a catalog, in catalog order.
 *
 * A row that aggregates several stored refs (Reading's conceptual
 * knowledge) is computed over their engagements combined - one row,
 * one verdict, over everything it covers.
 */
export function statsForCatalog(
  catalog: ModuleCatalog,
  engagements: ReadonlyArray<Engagement>,
): ItemStats[] {
  const byRef = new Map<string, Engagement[]>();
  for (const e of engagements) {
    const bucket = byRef.get(e.itemRef);
    if (bucket) bucket.push(e);
    else byRef.set(e.itemRef, [e]);
  }
  const options = {
    accuracyKind: catalog.accuracyKind,
    ...(catalog.coverageRule ? { coverageRule: catalog.coverageRule } : {}),
  };
  return catalog.items.map(item => {
    const own = item.itemRefs.flatMap(ref => byRef.get(ref) ?? []);
    return own.length === 0
      ? emptyItemStats(item.id, options)
      : itemStatsFromEngagements(item.id, own, options);
  });
}

/** The attempt-driven modules: ear training, harmonic fluency,
 *  reading, production vocabulary. */
export function statsForAttemptCatalog(
  catalog: ModuleCatalog,
  attempts: ReadonlyArray<AttemptRecord>,
): ItemStats[] {
  return statsForCatalog(
    catalog,
    engagementsFromAttempts(collapseSubmissions(attempts)),
  );
}

/**
 * Collapse the rows of one submitted answer into a single
 * all-or-nothing result.
 *
 * WHY ALL-OR-NOTHING. The chord-progressions full-progression drill
 * writes one row per chord slot. Counting those as four independent
 * attempts makes three-of-four read as 75%, but the skill being tested
 * is holding the whole progression together - it is harder than the
 * cadence-level work in chord motion, and if it is shaky the number
 * should say so. One submitted answer is one result.
 *
 * WHY ONLY STAMPED ROWS. Rows written before `submissionId` existed
 * carry none, and they pass through UNGROUPED - one row per slot, as
 * stored. Grouping them would mean clustering on timestamp proximity, a
 * heuristic over data never designed to carry the grouping, and a
 * number produced that way is one you cannot trust. Legacy rows read
 * honestly as ungroupable instead, which the affordance states.
 *
 * The collapsed row keeps the LATEST timestamp in the group, so recency
 * reads as the moment the answer was submitted rather than the first
 * slot of it. `excludeFromFluency` carries if any row in the group had
 * it - a focus-protected submission is focus-protected whole.
 */
export function collapseSubmissions(
  attempts: ReadonlyArray<AttemptRecord>,
): AttemptRecord[] {
  const out: AttemptRecord[] = [];
  const groups = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    if (!a.submissionId) {
      out.push(a);
      continue;
    }
    // Two different itemIds can share a submission id - a slash
    // progression writes chord rows and `-inversion` rows from the same
    // answer, and they are separate catalog items that each collapse on
    // their own.
    const key = `${a.moduleId} ${a.itemId} ${a.submissionId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(a);
    else groups.set(key, [a]);
  }
  for (const group of groups.values()) out.push(collapseGroup(group));
  return out;
}

function collapseGroup(group: AttemptRecord[]): AttemptRecord {
  let latest = group[0];
  let allCorrect = true;
  let excluded = false;
  for (const a of group) {
    if (a.timestamp > latest.timestamp) latest = a;
    if (!a.correct) allCorrect = false;
    if (a.excludeFromFluency) excluded = true;
  }
  return {
    ...latest,
    correct: allCorrect,
    ...(excluded ? { excludeFromFluency: true } : {}),
  };
}

/**
 * How many stored rows predate submission tracking and so cannot be
 * collapsed.
 *
 * Exported so an affordance can say "N of these attempts predate
 * submission tracking and count one row per chord" rather than leaving
 * the discrepancy between old and new rows unexplained.
 */
export function ungroupableCount(
  attempts: ReadonlyArray<AttemptRecord>,
  belongsToItem: (itemId: string) => boolean,
): number {
  return attempts.filter(a => !a.submissionId && belongsToItem(a.itemId)).length;
}
