/**
 * User-curation overlay for ET items. CRUD around the
 * `etItemCuration` Dexie table (db.ts v23). All four ET submodules
 * share this — chord recognition, chord progressions, scales-modes,
 * intervals — so curation isn't duplicated per surface.
 *
 * Contract:
 *   · readCuration(itemRef)              → current overlay (or null)
 *   · readManyCurations(itemRefs)        → bulk read for a quiz's
 *                                          item pool; missing rows
 *                                          come back absent
 *   · loadHiddenItemRefs()               → cheap "what's hidden?"
 *                                          read for the session loader
 *   · loadFlaggedItemRefs()              → mirror for the flag review
 *                                          UI
 *   · setCustomLabel(ref, label|null)    → null clears the override
 *   · setFlag(ref, on, note?)            → toggle flag + optional note
 *   · setHidden(ref, hidden)             → soft-delete toggle
 *
 * All writes upsert by itemRef and stamp `updatedAt`. Empty
 * overlays (all fields absent / falsy) ARE preserved rather than
 * pruned — the row's existence is a meaningful "user has touched
 * this item via the sheet at least once" signal even if every
 * field has been cleared back to defaults.
 */
import { db, type EtItemCuration } from '../../lib/db';

export async function readCuration(itemRef: string): Promise<EtItemCuration | null> {
  return (await db.etItemCuration.get(itemRef)) ?? null;
}

export async function readManyCurations(
  itemRefs: ReadonlyArray<string>,
): Promise<Map<string, EtItemCuration>> {
  if (itemRefs.length === 0) return new Map();
  const rows = await db.etItemCuration.bulkGet([...itemRefs]);
  const out = new Map<string, EtItemCuration>();
  rows.forEach((row, i) => { if (row) out.set(itemRefs[i], row); });
  return out;
}

/** All itemRefs the user has soft-hidden. Fed to the session
 *  loader's eligibility map so hidden items never reach proposals
 *  regardless of tier/stage state. Uses `.toArray() + filter`
 *  (the codebase convention for boolean fields — see
 *  modules/repertoire/songComfortable.ts) rather than a typed
 *  Dexie index query: boolean indexes have version-dependent
 *  query semantics and the curation table stays small
 *  (one row per user-touched item, bounded by the catalog). */
export async function loadHiddenItemRefs(): Promise<Set<string>> {
  const rows = await db.etItemCuration.toArray();
  return new Set(rows.filter(r => r.hidden).map(r => r.itemRef));
}

export async function loadFlaggedItemRefs(): Promise<Set<string>> {
  const rows = await db.etItemCuration.toArray();
  return new Set(rows.filter(r => r.flagged).map(r => r.itemRef));
}

/** Upsert sentinel: `undefined` preserves the existing value,
 *  `null` deletes the field, a real value sets it. */
type PatchOp<T> = T | null | undefined;

interface UpsertPatch {
  customLabel?: PatchOp<string>;
  flagged?: PatchOp<boolean>;
  flagNote?: PatchOp<string>;
  hidden?: PatchOp<boolean>;
  addedFromRepertoire?: PatchOp<boolean>;
}

async function upsert(itemRef: string, patch: UpsertPatch): Promise<void> {
  const existing = await db.etItemCuration.get(itemRef);
  // For each field: undefined → preserve, null → delete, value → set.
  const apply = <T,>(op: PatchOp<T>, prev: T | undefined): T | undefined => {
    if (op === undefined) return prev;
    if (op === null) return undefined;
    return op;
  };
  const next: EtItemCuration = {
    itemRef,
    customLabel: apply(patch.customLabel, existing?.customLabel),
    flagged: apply(patch.flagged, existing?.flagged),
    flagNote: apply(patch.flagNote, existing?.flagNote),
    hidden: apply(patch.hidden, existing?.hidden),
    addedFromRepertoire: apply(
      patch.addedFromRepertoire,
      existing?.addedFromRepertoire,
    ),
    updatedAt: Date.now(),
  };
  // Strip undefined keys so the IndexedDB row stays tidy.
  const nextRow = next as unknown as Record<string, unknown>;
  for (const k of Object.keys(nextRow)) {
    if (nextRow[k] === undefined) delete nextRow[k];
  }
  await db.etItemCuration.put(next);
}

export async function setCustomLabel(
  itemRef: string,
  label: string | null,
): Promise<void> {
  // Empty string + null both clear the override.
  const trimmed = label?.trim() ?? '';
  await upsert(itemRef, { customLabel: trimmed === '' ? null : trimmed });
}

export async function setFlag(
  itemRef: string,
  flagged: boolean,
  note?: string | null,
): Promise<void> {
  if (!flagged) {
    // Un-flag clears BOTH the flag and the note.
    await upsert(itemRef, { flagged: null, flagNote: null });
    return;
  }
  // Flag-on: always set true; note only updated when explicitly
  // provided (undefined leaves any existing note alone).
  const noteOp: PatchOp<string> =
    note === undefined ? undefined : note?.trim() ? note.trim() : null;
  await upsert(itemRef, { flagged: true, flagNote: noteOp });
}

export async function setHidden(itemRef: string, hidden: boolean): Promise<void> {
  await upsert(itemRef, { hidden: hidden ? true : null });
}

/** Mark / unmark this catalog item as "added from a song's detected
 *  progression" (Lead Sheet Redesign step 9). `true` flips the flag
 *  on; `false` clears it. The lead-sheet tag's ✓ indicator reads
 *  from this; future session-loader work may bias toward these. */
export async function setAddedFromRepertoire(
  itemRef: string,
  on: boolean,
): Promise<void> {
  await upsert(itemRef, { addedFromRepertoire: on ? true : null });
}

/** All itemRefs the user has promoted via the lead-sheet → ET
 *  pipeline. Mirror of `loadHiddenItemRefs` / `loadFlaggedItemRefs`. */
export async function loadAddedFromRepertoireRefs(): Promise<Set<string>> {
  const rows = await db.etItemCuration.toArray();
  return new Set(rows.filter(r => r.addedFromRepertoire).map(r => r.itemRef));
}

/**
 * Permanently remove the curation row for `itemRef`. Used by the
 * "Delete permanently" affordance on already-hidden items in the
 * curation sheet (and its bulk equivalent in the action bar).
 *
 * Distinct from setHidden(_, false), which only clears the hidden
 * flag — the row stays around with whatever label / flag overlay
 * the user had on it. `deleteCuration` blows the row away entirely:
 * any customLabel / flag / hidden state is gone. Catalog defaults
 * resume from this point.
 *
 * Safe on a missing row — Dexie's delete is a no-op for unknown
 * keys, so the caller doesn't need to gate on existence first.
 */
export async function deleteCuration(itemRef: string): Promise<void> {
  await db.etItemCuration.delete(itemRef);
}

/** Resolve the display label for an ET item: prefer a non-empty
 *  customLabel, fall back to the catalog's default name. Used by
 *  the quiz surfaces to render the user's preferred label without
 *  threading a separate fetch through each. */
export function resolveDisplayLabel(
  curation: EtItemCuration | null | undefined,
  defaultLabel: string,
): string {
  return curation?.customLabel?.trim() || defaultLabel;
}
