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
 * Denominator note: "every section's cell" means every NON-ARCHIVED
 * `songMatrixSection` must have a cell at the original key AND that
 * cell must be `comfortable`. Running `every` over only the
 * materialised cells is wrong — a song with five sections but a
 * single materialised+comfortable cell would read as comfortable
 * vacuously. The denominator is the section count, mirroring
 * `computeSongLevelState`'s learningPercent formula.
 *
 * Defensive edge cases:
 *   · No original-key songKeys row → false / 0. A song without a
 *     designated original key can't satisfy the threshold honestly,
 *     so we never claim it does.
 *   · No non-archived matrix sections → false / 0. A song the user
 *     hasn't set the matrix up for hasn't reached comfortable by
 *     definition.
 *   · A section with no cell at the original key → counts against
 *     the threshold (it can't be comfortable if never materialised).
 *   · Archived sections are excluded from both numerator and
 *     denominator — they're off the active surface, so their cells
 *     neither gate nor help the threshold.
 */
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../lib/db';

/** Non-archived matrix-section ids for a song. The comfortable
 *  predicates denominate by this set, not by the materialised-cell
 *  count — see the denominator note in the file header. */
async function nonArchivedMatrixSectionIds(
  songId: string,
): Promise<Set<string>> {
  const sections = await db.songMatrixSections
    .where('songId')
    .equals(songId)
    .toArray();
  return new Set(sections.filter(s => !s.isArchived).map(s => s.id));
}

export async function isSongComfortableInOriginalKey(
  songId: string,
): Promise<boolean> {
  const originalKey = await findOriginalKey(songId);
  if (!originalKey) return false;
  const sectionIds = await nonArchivedMatrixSectionIds(songId);
  if (sectionIds.size === 0) return false;
  const cells = await db.songCells
    .where('songId')
    .equals(songId)
    .filter(c => c.songKeyId === originalKey.id && sectionIds.has(c.sectionId))
    .toArray();
  const comfortable = cells.filter(c => c.cellState === 'comfortable').length;
  // Every non-archived section must contribute a comfortable cell —
  // a section with no original-key cell falls short of the count.
  return comfortable === sectionIds.size;
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
  const sectionIds = await nonArchivedMatrixSectionIds(songId);
  if (sectionIds.size === 0) return 0;
  const cells = await db.songCells
    .where('songId')
    .equals(songId)
    .filter(c => c.songKeyId === originalKey.id && sectionIds.has(c.sectionId))
    .toArray();
  const comfy = cells.filter(c => c.cellState === 'comfortable').length;
  // Denominate by section count — sections with no original-key cell
  // drag the ratio down, same as a non-comfortable cell would.
  return comfy / sectionIds.size;
}

/**
 * Synchronous variant of {@link isSongComfortableInOriginalKey} that
 * operates on pre-loaded records. Same predicate; separates IO from
 * logic so the algorithm layer can ask "is this song past the comfy
 * threshold?" once it's already pulled the matrix rows it needs for
 * everything else. Returns true iff every non-archived matrix section
 * has a comfortable cell at the song's original key.
 *
 * Callers must pass the song's matrix sections — without them the
 * denominator collapses to the materialised-cell count and a
 * half-built matrix reads as comfortable.
 *
 * Defensive edge cases match the async version:
 *   · No original-key songKeys row → false
 *   · No non-archived matrix sections → false
 *   · A section with no comfortable original-key cell → false
 */
export function isSongPostComfortable(
  song: Song,
  songKeys: ReadonlyArray<SongKey>,
  songCells: ReadonlyArray<SongCell>,
  matrixSections: ReadonlyArray<SongMatrixSection>,
): boolean {
  const originalKey = songKeys.find(
    k => k.songId === song.id && k.isOriginalKey,
  );
  if (!originalKey) return false;
  const sectionIds = new Set(
    matrixSections
      .filter(s => s.songId === song.id && !s.isArchived)
      .map(s => s.id),
  );
  if (sectionIds.size === 0) return false;
  const cells = songCells.filter(
    c =>
      c.songId === song.id &&
      c.songKeyId === originalKey.id &&
      sectionIds.has(c.sectionId),
  );
  const comfortable = cells.filter(c => c.cellState === 'comfortable').length;
  return comfortable === sectionIds.size;
}

async function findOriginalKey(songId: string) {
  // Exactly one row per song should have isOriginalKey=true. If the
  // data has drifted (two rows tagged), we pick the first match —
  // the comfortable predicate is honest either way (a "second
  // original" key would just be more cells to satisfy).
  const all = await db.songKeys.where('songId').equals(songId).toArray();
  return all.find(k => k.isOriginalKey) ?? null;
}
