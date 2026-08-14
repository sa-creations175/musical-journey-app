import {
  db,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../../lib/db';
import { whenSyncReady } from '../../../lib/sync/syncReady';
import { ensureSongHasOriginalKey } from '../matrixMigration';
import { CIRCLE_OF_FOURTHS_KEYS } from './keys';
import { songCellRowId, songKeyRowId } from './ids';

/**
 * Give every song a complete matrix: all twelve keys, every section,
 * a real `songCells` row in each intersection.
 *
 * ---------------------------------------------------------------
 * WHY THE GRID WAS DEAD
 *
 * `KeyRow` renders an interactive cell only where a `songCells` row
 * exists; without one it draws an inert div. The only user-reachable
 * creator was `SectionSetupModal`, whose confirm requires
 * `sections.length > 0` — but whose only entry point was a banner
 * rendered when `visibleSections.length === 0`. Mutually exclusive. Once
 * the section reconciler began auto-creating matrix sections from the
 * lead sheet, that banner could never appear, so cells were never
 * created and every cell in every song was inert.
 * ---------------------------------------------------------------
 *
 * THREE RULES THIS MUST NOT BREAK:
 *
 * 1. Dedupe by `keyName`, never by row id. A row whose id embeds an
 *    older spelling still occupies its key; matching on the id would
 *    mint a duplicate row for a key the song already has.
 *
 * 2. Touch no existing state. Not `keyState`, not `cellState`, not a
 *    timestamp. This runs over songs carrying legacy stage-ladder
 *    values that nothing can reconstruct, and it is about to destroy
 *    the signal that protects them — `engagedCellCount === 0` is the
 *    only remaining way to recognise one once every row has cells, and
 *    it stays true precisely because the cells created here are empty.
 *
 * 3. Additive only. Nothing is deleted, including non-canonical rows —
 *    removing those is an explicit repair the user performs with the
 *    dependent counts in front of them, not a side effect of a sweep.
 *
 * Deterministic ids make it idempotent and convergent: a second run
 * writes nothing, and two devices running it independently produce
 * identical rows that upsert into each other rather than duplicating.
 */

export interface MaterialisationPlan {
  newKeys: SongKey[];
  newCells: SongCell[];
}

/**
 * Work out what a song is missing. Pure — no Dexie, so every rule above
 * is testable directly.
 *
 * Archived sections are filtered HERE rather than relying on callers
 * to do it. An archived section is hidden from the grid, so cells for
 * it are rows nothing can ever reach — and this runs over the user's
 * whole library, where one forgetful caller means unreachable rows in
 * every song.
 */
export function planMaterialisation(
  songId: string,
  sections: ReadonlyArray<SongMatrixSection>,
  existingKeys: ReadonlyArray<SongKey>,
  existingCells: ReadonlyArray<SongCell>,
  now: number,
): MaterialisationPlan {
  // Rule 1 — dedupe on the NAME.
  const haveKeyName = new Set(existingKeys.map(k => k.keyName));

  const newKeys: SongKey[] = CIRCLE_OF_FOURTHS_KEYS
    .filter(keyName => !haveKeyName.has(keyName))
    .map(keyName => ({
      id: songKeyRowId(songId, keyName),
      songId,
      keyName,
      // Never claims the anchor. `ensureSongHasOriginalKey` owns that
      // designation and runs before this; a sweep inventing a second
      // original would produce the `multiple-originals` state the
      // diagnostic exists to catch.
      isOriginalKey: false,
      keyState: 'not_started',
      solidAt: null,
      solidDecayState: null,
      lastDecayCheckAt: null,
      livedWithSessionCount: 0,
      livedWithFirstSessionAt: null,
      livedWithWindowStartAt: null,
      livedWithSessionsInWindow: 0,
      wholeSongTestPassedAt: null,
      isRetestRecommended: false,
      lastEngagedAt: null,
      createdAt: now,
      updatedAt: now,
    }));

  // Cells go on canonical keys only — existing ones and the new ones
  // alike. A non-canonical leftover row is deliberately left barren:
  // it can never render, and giving it cells would make it
  // undeletable, since the repair refuses to orphan dependents.
  const canonical = new Set<string>(CIRCLE_OF_FOURTHS_KEYS);
  const keysForCells = [
    ...existingKeys.filter(k => canonical.has(k.keyName)),
    ...newKeys,
  ];

  const visibleSections = sections.filter(s => !s.isArchived);

  const havePair = new Set(
    existingCells.map(c => `${c.songKeyId}|${c.sectionId}`),
  );

  const newCells: SongCell[] = [];
  for (const key of keysForCells) {
    for (const section of visibleSections) {
      if (havePair.has(`${key.id}|${section.id}`)) continue;
      newCells.push({
        id: songCellRowId(key.id, section.id),
        songId,
        sectionId: section.id,
        songKeyId: key.id,
        // Rule 2 — empty, always. An `empty` cell with a null
        // `lastRunAt` reads as unengaged everywhere, which is what
        // keeps the legacy-state protection intact.
        cellState: 'empty',
        comfortableAt: null,
        consecutiveCleanCount: 0,
        lastRunAt: null,
        lastRunWasClean: null,
        notes: null,
        lastEngagedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return { newKeys, newCells };
}

/**
 * Materialise one song. Safe to call repeatedly; writes nothing when
 * the song is already complete.
 *
 * Returns what it added, so the sweep can report a total rather than
 * claiming success silently.
 */
export async function materialiseMatrixForSong(
  songId: string,
  now: number = Date.now(),
): Promise<{ keys: number; cells: number }> {
  // The anchor first, so the twelve rows below it are only ever
  // non-original and the designation stays owned by one place.
  await ensureSongHasOriginalKey(songId);

  const [sections, keys, cells] = await Promise.all([
    db.songMatrixSections.where('songId').equals(songId).toArray(),
    db.songKeys.where('songId').equals(songId).toArray(),
    db.songCells.where('songId').equals(songId).toArray(),
  ]);

  const visible = sections.filter(s => !s.isArchived);
  // No sections means no grid to fill. Creating twelve bare key rows
  // for a song with no lead sheet would add clutter and no capability.
  if (visible.length === 0) return { keys: 0, cells: 0 };

  const plan = planMaterialisation(songId, visible, keys, cells, now);
  if (plan.newKeys.length === 0 && plan.newCells.length === 0) {
    return { keys: 0, cells: 0 };
  }

  await db.transaction('rw', [db.songKeys, db.songCells], async () => {
    if (plan.newKeys.length > 0) await db.songKeys.bulkPut(plan.newKeys);
    if (plan.newCells.length > 0) await db.songCells.bulkPut(plan.newCells);
  });

  return { keys: plan.newKeys.length, cells: plan.newCells.length };
}

let sweepInFlight: Promise<{ songs: number; keys: number; cells: number }> | null = null;

/**
 * Materialise every song. Runs at startup, behind `whenSyncReady()`.
 *
 * The gate is not cosmetic. These writes have to pass through the Dexie
 * sync hooks to reach Supabase; landing them before the sync layer
 * registers would leave several hundred rows local-only, and the next
 * replace-mode pull would delete them as orphans. `matrixMigration`
 * learned this first — same reasoning, same guard.
 *
 * Ungated otherwise, and idempotent by construction: a song that is
 * already complete produces an empty plan and no writes, so the cost of
 * running every start is a handful of reads. That also means a song
 * added on another device is picked up on the next open here, which a
 * run-once pref would have missed forever.
 */
export async function materialiseAllSongs(): Promise<{
  songs: number; keys: number; cells: number;
}> {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    try {
      await whenSyncReady();
      const songs = await db.songs.toArray();
      let touched = 0;
      let keys = 0;
      let cells = 0;
      for (const song of songs) {
        try {
          const added = await materialiseMatrixForSong(song.id);
          if (added.keys > 0 || added.cells > 0) touched += 1;
          keys += added.keys;
          cells += added.cells;
        } catch (err) {
          // One bad song must not stop the sweep — a partially
          // materialised library is strictly better than none, and the
          // next start retries whatever failed.
          console.warn('[matrix] materialisation failed for', song.id, err);
        }
      }
      return { songs: touched, keys, cells };
    } finally {
      sweepInFlight = null;
    }
  })();
  return sweepInFlight;
}
