/**
 * Reactive curation-state hook for ET fluency trackers. Subscribes
 * to the `etItemCuration` Dexie table via `useLiveQuery` so any
 * write (single-item sheet, bulk action bar, or another tab) flows
 * through to the UI without a manual reload.
 *
 * Returns a Map keyed by itemRef. Items absent from the table read
 * as undefined — that's the "no curation row yet" state.
 *
 * The hook intentionally ignores the `itemRefs` argument for the
 * query itself (Dexie liveQuery doesn't take an itemRef array
 * efficiently) and filters in memory. The curation table is bounded
 * by the ET catalog size (~150 items max), so the scan + filter is
 * trivial.
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type EtItemCuration } from '../../lib/db';

export function useEtCurationsLive(
  itemRefs: ReadonlyArray<string>,
): Map<string, EtItemCuration> {
  const allRows = useLiveQuery(() => db.etItemCuration.toArray(), []);
  const refSet = useMemo(() => new Set(itemRefs), [itemRefs]);
  return useMemo(() => {
    const out = new Map<string, EtItemCuration>();
    if (!allRows) return out;
    for (const row of allRows) {
      if (refSet.has(row.itemRef)) out.set(row.itemRef, row);
    }
    return out;
  }, [allRows, refSet]);
}
