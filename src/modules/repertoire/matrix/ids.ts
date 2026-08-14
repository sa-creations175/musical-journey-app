/**
 * Deterministic ids for the matrix tables.
 *
 * ---------------------------------------------------------------
 * WHY THESE ARE SHARED RATHER THAN INLINED
 *
 * The `songkey-{songId}-{keyName}` shape was written out at four
 * separate sites (matrixMigration, reassignOriginalKey,
 * CrossKeyFollowupModal, SectionSetupModal's cell variant). They agreed
 * — but the key id EMBEDS THE SPELLING of the key, and per-song
 * enharmonic spelling is the next piece of work after materialisation.
 * When Gb becomes a spelling of F# rather than a different key, this is
 * the thing that has to change, and it should be one place rather than
 * five.
 *
 * Determinism is what makes the whole model converge: two devices
 * materialising the same song independently produce identical ids, so
 * the sync layer's upserts collapse into a no-op instead of duplicating
 * every row.
 * ---------------------------------------------------------------
 *
 * NOTE the id is an identity, not a display value. Nothing should
 * parse a key name back out of one — `songKeys.keyName` is the field
 * that answers that, and it is the one a respell would rewrite.
 * Practice history is insulated either way: `songCells` and
 * `songCellRunThroughs` reference `songKeyId`, never the spelling.
 */

/** Stable id for a song's row in one key. */
export function songKeyRowId(songId: string, keyName: string): string {
  return `songkey-${songId}-${keyName}`;
}

/** Stable id for one section × key intersection. */
export function songCellRowId(songKeyId: string, sectionId: string): string {
  return `cell-${songKeyId}-${sectionId}`;
}
