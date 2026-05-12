import { db } from '../../lib/db';

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

// Expose on window so the helpers are reachable from the browser
// console without needing a module import path.
if (typeof window !== 'undefined') {
  const w = window as unknown as {
    __inspectSongKeys?: typeof inspectSongKeys;
    __inspectSongKeysByTitle?: typeof inspectSongKeysByTitle;
  };
  w.__inspectSongKeys = inspectSongKeys;
  w.__inspectSongKeysByTitle = inspectSongKeysByTitle;
}
