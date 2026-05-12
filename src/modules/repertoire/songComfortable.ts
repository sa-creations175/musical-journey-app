/**
 * Comfortable detection for a song in its original key.
 *
 * "Comfortable in original key" is the completion threshold for a
 * Song-of-the-Month slot — when every section's cell at the song's
 * original key has reached `cellState === 'comfortable'`, the user
 * can advance the queue. The cell state machine is empty → learning
 * → comfortable; comfortable is the top, so "comfortable or above"
 * means literally `'comfortable'`.
 *
 * Pure data-layer helpers — no UI, no prompt orchestration. Two
 * variants:
 *
 *   isSongComfortableInOriginalKey(songId)
 *     Strict boolean — true only when every cell at the original
 *     key is comfortable.
 *
 *   comfortableCellRatioInOriginalKey(songId)
 *     The 0..1 progress fraction used to trigger the proactive
 *     TBD nudge ("you're past ~50% comfortable — pick your next
 *     song now"). Returns 0 when the original-key row is missing
 *     or the song has no cells.
 *
 * Defensive edge cases:
 *   · No original-key songKeys row → false / 0. A song without a
 *     designated original key can't satisfy the threshold honestly,
 *     so we never claim it does.
 *   · Zero cells in the original key → false / 0. A song the user
 *     hasn't set matrix sections up for hasn't reached comfortable
 *     by definition.
 *   · Archived sections are NOT special-cased here — songCells
 *     rows for archived sections still count if they exist. The
 *     matrix layer is responsible for marking sections archived
 *     (which removes their cells from the active surface); this
 *     predicate trusts the data.
 */
import { db, type Song, type SongCell, type SongKey } from '../../lib/db';

export async function isSongComfortableInOriginalKey(
  songId: string,
): Promise<boolean> {
  const originalKey = await findOriginalKey(songId);
  if (!originalKey) return false;
  const cells = await db.songCells
    .where('songId')
    .equals(songId)
    .filter(c => c.songKeyId === originalKey.id)
    .toArray();
  if (cells.length === 0) return false;
  return cells.every(c => c.cellState === 'comfortable');
}

/**
 * Fraction of cells at the original key that have reached
 * `comfortable`. Returns 0 in every degenerate case so callers
 * don't have to guard against null.
 */
export async function comfortableCellRatioInOriginalKey(
  songId: string,
): Promise<number> {
  const originalKey = await findOriginalKey(songId);
  if (!originalKey) return 0;
  const cells = await db.songCells
    .where('songId')
    .equals(songId)
    .filter(c => c.songKeyId === originalKey.id)
    .toArray();
  if (cells.length === 0) return 0;
  const comfy = cells.filter(c => c.cellState === 'comfortable').length;
  return comfy / cells.length;
}

/**
 * Synchronous variant of {@link isSongComfortableInOriginalKey} that
 * operates on pre-loaded records. Same predicate; separates IO from
 * logic so the algorithm layer can ask "is this song past the comfy
 * threshold?" once it's already pulled the matrix rows it needs for
 * everything else. Returns true iff every cell at the song's
 * original key is `cellState === 'comfortable'`.
 *
 * Defensive edge cases match the async version:
 *   · No original-key songKeys row → false
 *   · Zero cells at the original key → false
 */
export function isSongPostComfortable(
  song: Song,
  songKeys: ReadonlyArray<SongKey>,
  songCells: ReadonlyArray<SongCell>,
): boolean {
  const originalKey = songKeys.find(
    k => k.songId === song.id && k.isOriginalKey,
  );
  if (!originalKey) return false;
  const cells = songCells.filter(
    c => c.songId === song.id && c.songKeyId === originalKey.id,
  );
  if (cells.length === 0) return false;
  return cells.every(c => c.cellState === 'comfortable');
}

async function findOriginalKey(songId: string) {
  // Exactly one row per song should have isOriginalKey=true. If the
  // data has drifted (two rows tagged), we pick the first match —
  // the comfortable predicate is honest either way (a "second
  // original" key would just be more cells to satisfy).
  const all = await db.songKeys.where('songId').equals(songId).toArray();
  return all.find(k => k.isOriginalKey) ?? null;
}
