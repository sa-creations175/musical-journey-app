import { db, type SongMatrixSection, type SongSection } from '../../../lib/db';

/**
 * One-way reconciler: bring `songMatrixSections` into sync with the
 * authoritative lead-sheet sections (`songSections`) for one song.
 * Lead sheet is the source of truth; the matrix is a derived mirror
 * that owns its own row ids so cells (`songCells.sectionId`) and
 * progress history stay attached across renames + reorders.
 *
 * Reconciliation rules:
 *   · Each lead-sheet section claims a matrix row, preferring the
 *     existing matrix row whose `songSectionId` points at it.
 *     Renames keep the same matrix id this way.
 *   · Fallback: claim by name match against legacy matrix rows that
 *     don't have `songSectionId` yet — first run after the field
 *     lands "adopts" pre-existing matrix rows so the user's matrix
 *     data isn't orphaned.
 *   · No claim found → create a new matrix row with
 *     `id = matrixsection-{leadSectionId}` for determinism.
 *   · A matrix row whose lead-sheet section disappeared gets
 *     `isArchived: true` (NOT deleted) so its cell history
 *     survives. Restoring the section name re-creates a matching
 *     row; the orphaned archived row stays put for history.
 *   · Updates `name`, `displayOrder`, `isArchived` on claimed rows
 *     when any field would change. No-op writes are skipped so the
 *     sync queue doesn't churn.
 *
 * Idempotent: running it twice in a row produces zero writes the
 * second time. Safe to invoke from the Dexie write hook on every
 * `songSections` change.
 */
export async function syncMatrixSectionsForSong(
  songId: string,
  now: number = Date.now(),
): Promise<void> {
  const [leadSheet, matrixRows] = await Promise.all([
    db.songSections.where('songId').equals(songId).sortBy('order'),
    db.songMatrixSections.where('songId').equals(songId).toArray(),
  ]);

  const writes = reconcileMatrixSections(songId, leadSheet, matrixRows, now);
  if (writes.length === 0) return;
  await db.songMatrixSections.bulkPut(writes);
}

/**
 * Pure reconciliation step. Exported for tests; doesn't touch Dexie.
 * Returns the rows that need to be put — claimed-and-changed matches
 * + freshly-created rows + newly-archived orphans.
 */
export function reconcileMatrixSections(
  songId: string,
  leadSheet: ReadonlyArray<SongSection>,
  matrixRows: ReadonlyArray<SongMatrixSection>,
  now: number,
): SongMatrixSection[] {
  const pool: SongMatrixSection[] = [...matrixRows];
  const writes: SongMatrixSection[] = [];

  // Lead-sheet sections are processed in their lead-sheet order so
  // displayOrder == lead-sheet index naturally.
  leadSheet.forEach((leadSection, idx) => {
    const match = pluckById(pool, leadSection.id) ?? pluckByName(pool, leadSection.name);

    if (match) {
      const updated: SongMatrixSection = {
        ...match,
        name: leadSection.name,
        displayOrder: idx,
        isArchived: false,
        songSectionId: leadSection.id,
        updatedAt: now,
      };
      if (rowHasChanged(match, updated)) {
        writes.push(updated);
      }
    } else {
      writes.push({
        // Deterministic id derived from the lead-sheet id so reruns
        // on the same data don't create duplicate matrix rows.
        id: `matrixsection-${leadSection.id}`,
        songId,
        name: leadSection.name,
        displayOrder: idx,
        isArchived: false,
        splitFromSectionId: null,
        songSectionId: leadSection.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  // Remaining pool entries have no matching lead-sheet section —
  // archive them in place. Don't delete so cell history stays
  // reachable for retrospective views or restoration.
  for (const orphan of pool) {
    if (!orphan.isArchived) {
      writes.push({ ...orphan, isArchived: true, updatedAt: now });
    }
  }

  return writes;
}

/** Claim a matrix row whose songSectionId matches. Mutates the pool. */
function pluckById(
  pool: SongMatrixSection[],
  leadSectionId: string,
): SongMatrixSection | null {
  const i = pool.findIndex(m => m.songSectionId === leadSectionId);
  if (i < 0) return null;
  return pool.splice(i, 1)[0];
}

/** Claim a legacy matrix row (no songSectionId) by exact name match.
 *  Mutates the pool. Only consumes rows without songSectionId so
 *  the song-id-key claim above always wins over name match. */
function pluckByName(
  pool: SongMatrixSection[],
  name: string,
): SongMatrixSection | null {
  const i = pool.findIndex(m => m.songSectionId == null && m.name === name);
  if (i < 0) return null;
  return pool.splice(i, 1)[0];
}

function rowHasChanged(
  before: SongMatrixSection,
  after: SongMatrixSection,
): boolean {
  return (
    before.name !== after.name
    || before.displayOrder !== after.displayOrder
    || before.isArchived !== after.isArchived
    || before.songSectionId !== after.songSectionId
  );
}

// ---------------------------------------------------------------------
// Dexie write hook installation
// ---------------------------------------------------------------------

type DexieHookTable = {
  hook: (
    event: 'creating' | 'updating' | 'deleting',
    fn: (...args: unknown[]) => void,
  ) => void;
};

let hookInstalled = false;

/**
 * Register creating/updating/deleting hooks on `db.songSections` so
 * every lead-sheet write triggers a matrix reconcile for the
 * affected song.
 *
 * Mirrors `installSyncHooks` in src/lib/sync/hooks.ts:
 *
 *   · Deferred via `setTimeout(fn, 0)` to escape Dexie's PSD — the
 *     reconciler reads + writes other tables and must run outside
 *     the parent transaction. The same rationale that doc'd in
 *     hooks.ts applies here.
 *   · Snapshot the row + songId in the hook scope before deferring
 *     so Dexie can't mutate the row out from under us.
 *
 * Idempotent: a flag guards against double-install, since this
 * module is imported from multiple places during development hot
 * reloads.
 *
 * Re-entrancy: the reconciler writes to `songMatrixSections`, not
 * `songSections`, so the hook never re-fires from its own writes.
 */
export function installMatrixSectionsHook(): void {
  if (hookInstalled) return;
  const table = (db as unknown as Record<string, DexieHookTable | undefined>)
    .songSections;
  if (!table || typeof table.hook !== 'function') return;

  table.hook('creating', (...args: unknown[]) => {
    const obj = args[1] as Partial<SongSection> | undefined;
    schedule(obj?.songId);
  });
  table.hook('updating', (...args: unknown[]) => {
    const obj = args[2] as Partial<SongSection> | undefined;
    schedule(obj?.songId);
  });
  table.hook('deleting', (...args: unknown[]) => {
    const obj = args[1] as Partial<SongSection> | undefined;
    schedule(obj?.songId);
  });

  hookInstalled = true;
}

function schedule(songId: string | undefined): void {
  if (typeof songId !== 'string' || songId === '') return;
  setTimeout(() => {
    void syncMatrixSectionsForSong(songId).catch(err => {
      console.warn('[matrix-sections-sync] reconcile failed', err);
    });
  }, 0);
}
