import { db, type Song, type SongCell, type SongKey } from '../../lib/db';
import { isSongComfortableInOriginalKey } from './songComfortable';

/**
 * Diagnostic: dump every `songKeys` row for a given song. Loud
 * console output so the user can see immediately whether the matrix
 * is reading from the wrong row, an outdated row, or no row at all.
 *
 * Usage in the browser console:
 *
 *     await __inspectSongKeys('<songId>')
 *
 * If you only know the song's title, find the id first via:
 *
 *     (await db.songs.toArray()).find(s => s.title.includes('No Weapon'))?.id
 *
 * Wiring: this module is imported for side effect from the repertoire
 * shell so the helper attaches once the user navigates into Repertoire.
 * Pure inspection — no writes.
 */
export async function inspectSongKeys(songId: string): Promise<void> {
  const song = await db.songs.get(songId);
  const rows = await db.songKeys.where('songId').equals(songId).toArray();
  const sortedRows = [...rows].sort((a, b) => a.keyName.localeCompare(b.keyName));

  // eslint-disable-next-line no-console
  console.group(`[inspectSongKeys] ${song?.title ?? '(missing song)'} — ${songId}`);
  // eslint-disable-next-line no-console
  console.log('Song.key (top-level field):', song?.key);
  // eslint-disable-next-line no-console
  console.log(`${sortedRows.length} songKeys row(s):`);
  for (const row of sortedRows) {
    // eslint-disable-next-line no-console
    console.log({
      id: row.id,
      keyName: row.keyName,
      isOriginalKey: row.isOriginalKey,
      keyState: row.keyState,
      updatedAt: row.updatedAt,
      updatedAtAgoMs: Date.now() - row.updatedAt,
    });
  }
  const originals = sortedRows.filter(r => r.isOriginalKey);
  if (originals.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('No isOriginalKey:true row found — matrix will fall back to a 12-key cycle starting at C.');
  } else if (originals.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(`${originals.length} rows have isOriginalKey:true — schema invariant violated. Matrix picks the first one (${originals[0].keyName}).`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Original key column: ${originals[0].keyName}`);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}

/**
 * Convenience wrapper: find a song by case-insensitive title
 * substring, then delegate to inspectSongKeys.
 *
 *     await __inspectSongKeysByTitle('no weapon')
 *
 * Picks the first match when the substring matches multiple songs;
 * warns when no song matches. Lets the user skip the songId-lookup
 * step entirely.
 */
export async function inspectSongKeysByTitle(
  titleFragment: string,
): Promise<void> {
  const needle = titleFragment.toLowerCase();
  const songs = await db.songs.toArray();
  const matches = songs.filter(s => s.title.toLowerCase().includes(needle));
  if (matches.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(`[inspectSongKeysByTitle] no song title contains "${titleFragment}"`);
    return;
  }
  if (matches.length > 1) {
    // eslint-disable-next-line no-console
    console.log(
      `[inspectSongKeysByTitle] ${matches.length} matches — inspecting first ("${matches[0].title}"). All matches:`,
      matches.map(s => ({ id: s.id, title: s.title })),
    );
  }
  await inspectSongKeys(matches[0].id);
}

/**
 * Dev tool: manufacture the "comfortable in original key" state for
 * a song without actually practicing it. Used to test the three-path
 * song progression flow (deepen / expand / move-on) without grinding
 * through a real 3-run-through cycle on every section.
 *
 * Writes per non-archived matrix section: an upserted `songCells`
 * row at (sectionId, originalKey.id) with cellState='comfortable',
 * consecutiveCleanCount=3, lastRunWasClean=true. comfortableAt is
 * preserved if the cell was already comfortable (so we don't fast-
 * forward time-gated downstream logic); set to now otherwise.
 * Existing notes / lastEngagedAt / createdAt are preserved.
 *
 * Bails (warns + returns) when:
 *   · Song doesn't exist
 *   · No isOriginalKey:true row in songKeys
 *   · Zero non-archived matrix sections
 *
 * Writes go through `db.songCells.bulkPut` → Dexie sync hooks fire
 * → Supabase + other tabs reflect the change.
 *
 * Console:
 *   await __makeComfortableInOriginalKey('<songId>')
 *
 * Look the songId up via __inspectSongKeysByTitle('<fragment>')
 * if you only know the title.
 *
 * Sibling to isSongComfortableInOriginalKey — this is the inverse
 * data-manufacturing path for testing. The predicate's data
 * contract is the source of truth; this helper writes exactly what
 * the predicate reads.
 */
export async function makeComfortableInOriginalKey(songId: string): Promise<{
  song: Song;
  originalKey: SongKey;
  sectionCount: number;
  cellsCreated: number;
  cellsUpdated: number;
}> {
  const song = await db.songs.get(songId);
  if (!song) {
    throw new Error(`[makeComfortableInOriginalKey] no song with id ${songId}`);
  }

  const keys = await db.songKeys.where('songId').equals(songId).toArray();
  const originalKey = keys.find(k => k.isOriginalKey) ?? null;
  if (!originalKey) {
    // eslint-disable-next-line no-console
    console.warn(
      `[makeComfortableInOriginalKey] "${song.title}" has no isOriginalKey:true row in songKeys — the predicate would return false anyway. Aborting.`,
    );
    throw new Error('no original key row');
  }

  const allSections = await db.songMatrixSections
    .where('songId').equals(songId)
    .toArray();
  const sections = allSections.filter(s => !s.isArchived);
  if (sections.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[makeComfortableInOriginalKey] "${song.title}" has no non-archived matrix sections — the predicate would return false. Set the matrix up first. Aborting.`,
    );
    throw new Error('no matrix sections');
  }

  const now = Date.now();
  const rows: SongCell[] = [];
  let cellsCreated = 0;
  let cellsUpdated = 0;
  for (const section of sections) {
    // SectionSetupModal uses the same `cell-${songKeyId}-${sectionId}`
    // id convention; matching it ensures we upsert into the existing
    // row when one is already there instead of orphaning it.
    const id = `cell-${originalKey.id}-${section.id}`;
    const existing = await db.songCells.get(id);
    if (existing) cellsUpdated += 1;
    else cellsCreated += 1;
    rows.push({
      id,
      songId,
      sectionId: section.id,
      songKeyId: originalKey.id,
      cellState: 'comfortable',
      // Preserve the original transition timestamp if already comfy
      // — fast-forwarding it would mess with time-gated downstream
      // logic that reads "how long has this been comfortable?"
      comfortableAt: existing?.comfortableAt ?? now,
      consecutiveCleanCount: 3,
      lastRunAt: now,
      lastRunWasClean: true,
      notes: existing?.notes ?? null,
      lastEngagedAt: existing?.lastEngagedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  await db.songCells.bulkPut(rows);

  const ok = await isSongComfortableInOriginalKey(songId);
  // eslint-disable-next-line no-console
  console.group(
    `[makeComfortableInOriginalKey] "${song.title}" — ${originalKey.keyName}`,
  );
  // eslint-disable-next-line no-console
  console.log(`Sections (non-archived): ${sections.length}`);
  // eslint-disable-next-line no-console
  console.log(`Cells created: ${cellsCreated}, updated: ${cellsUpdated}`);
  // eslint-disable-next-line no-console
  console.log(`isSongComfortableInOriginalKey now reports: ${ok}`);
  // eslint-disable-next-line no-console
  console.groupEnd();

  return {
    song,
    originalKey,
    sectionCount: sections.length,
    cellsCreated,
    cellsUpdated,
  };
}

// Expose on window so the helpers are reachable from the browser
// console without needing a module import path.
if (typeof window !== 'undefined') {
  const w = window as unknown as {
    __inspectSongKeys?: typeof inspectSongKeys;
    __inspectSongKeysByTitle?: typeof inspectSongKeysByTitle;
    __makeComfortableInOriginalKey?: typeof makeComfortableInOriginalKey;
  };
  w.__inspectSongKeys = inspectSongKeys;
  w.__inspectSongKeysByTitle = inspectSongKeysByTitle;
  w.__makeComfortableInOriginalKey = makeComfortableInOriginalKey;
}
