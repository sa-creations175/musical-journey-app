import {
  db,
  type Song,
  type SongKey,
} from '../../lib/db';

/**
 * Key rows the old matrix migration invented, and never cleaned up.
 *
 * ---------------------------------------------------------------
 * WHERE THE PHANTOM COMES FROM.
 *
 * `matrixMigration.buildOriginalKeyRow` created a song's first key row
 * with `keyName = song.key ?? 'C'` and
 * `keyState = mapStageToKeyState(song.stage)`. So a song with no key
 * set and a hand-set stage of Learning got a **C** row already at
 * `learning`, stamped `lastEngagedAt = song.addedDate` — a state and a
 * date describing practice that never happened.
 *
 * Later the real original key was set. `reassignOriginalKey` correctly
 * seeds the NEW row at `not_started`, and says so in its own comment —
 * but it does not clear the old one. The invented row stays on the
 * matrix forever, reading "C · Learning · 2mo ago".
 *
 * With the stage derived, that row is no longer only cosmetic: a
 * `learning` keyState is below comfortable so it cannot hold a rung,
 * but it is above `not_started`, and it is a lie on a screen whose
 * whole job is to say where the song actually is.
 * ---------------------------------------------------------------
 *
 * THE TEST IS THE MECHANISM, NOT THE KEY NAME. A song genuinely in C
 * with real practice behind it must survive untouched, so nothing here
 * looks at which key it is. What identifies a seeded row is that it
 * claims a state while no evidence of practice exists anywhere, AND
 * carries the song's added date as its engagement timestamp — the
 * fingerprint only the migration leaves.
 *
 * That second half is what separates it from a row the cross-key
 * follow-up modal created: those also carry a state with no practice
 * behind them, but they are a real user statement ("I was working
 * these keys"), and they leave `lastEngagedAt` NULL. Clearing them
 * would be deleting an answer the user gave.
 */

export interface SeededRowFinding {
  songId: string;
  songTitle: string;
  keyRowId: string;
  keyName: string;
  /** The state the migration invented. */
  claimedState: SongKey['keyState'];
  /** The song's added date, which the row carries as its engagement. */
  stampedAt: number;
  /** True when this row is still the designated original key. A
   *  reassignment leaves the phantom behind as a non-original row,
   *  which is the common case — but a song whose key was never
   *  corrected still has the invented row as its anchor. */
  isOriginalKey: boolean;
}

/** Everything that would count as this key having been practised. */
async function hasPracticeEvidence(row: SongKey): Promise<boolean> {
  if (row.wholeSongTestPassedAt !== null) return true;
  if (row.livedWithSessionCount > 0) return true;

  const [keyRuns, cells] = await Promise.all([
    db.songKeyRunThroughs.where('songKeyId').equals(row.id).count(),
    db.songCells.where('songKeyId').equals(row.id).toArray(),
  ]);
  if (keyRuns > 0) return true;
  if (cells.some(c => c.cellState !== 'empty')) return true;

  const cellIds = cells.map(c => c.id);
  if (cellIds.length === 0) return false;
  const cellRuns = await db.songCellRunThroughs
    .where('cellId').anyOf(cellIds).count();
  return cellRuns > 0;
}

/**
 * Read-only. Answers "what would be cleared", and clearing is a
 * separate decision — the same split `keyDiagnostics` already uses,
 * and the reason is that a repair nobody previewed is a repair nobody
 * consented to.
 */
export async function findSeededKeyRows(): Promise<SeededRowFinding[]> {
  const [songs, keys] = await Promise.all([
    db.songs.toArray(),
    db.songKeys.toArray(),
  ]);
  const songById = new Map<string, Song>(songs.map(s => [s.id, s]));
  const out: SeededRowFinding[] = [];

  for (const row of keys) {
    if (row.keyState === 'not_started') continue;

    const song = songById.get(row.songId);
    if (!song) continue;

    // The fingerprint. A song with no `addedDate` was seeded with the
    // migration's own clock instead, which is indistinguishable from a
    // real timestamp — so those are left alone rather than guessed at.
    // Leaving a phantom row costs a wrong line on one screen; clearing
    // a real one costs practice history.
    if (song.addedDate === undefined || song.addedDate === null) continue;
    if (row.lastEngagedAt !== song.addedDate) continue;

    if (await hasPracticeEvidence(row)) continue;

    out.push({
      songId: song.id,
      songTitle: song.title,
      keyRowId: row.id,
      keyName: row.keyName,
      claimedState: row.keyState,
      stampedAt: song.addedDate,
      isOriginalKey: row.isOriginalKey,
    });
  }
  return out;
}

/** Per-song counts, for reporting before anything is written. */
export function countBySong(
  findings: ReadonlyArray<SeededRowFinding>,
): Array<{ songId: string; songTitle: string; count: number; keyNames: string[] }> {
  const bySong = new Map<string, { songTitle: string; keyNames: string[] }>();
  for (const f of findings) {
    const entry = bySong.get(f.songId) ?? { songTitle: f.songTitle, keyNames: [] };
    entry.keyNames.push(f.keyName);
    bySong.set(f.songId, entry);
  }
  return [...bySong.entries()]
    .map(([songId, v]) => ({
      songId, songTitle: v.songTitle, count: v.keyNames.length, keyNames: v.keyNames,
    }))
    .sort((a, b) => b.count - a.count || a.songTitle.localeCompare(b.songTitle));
}

/**
 * Reset one invented row to the state it should have had.
 *
 * The ROW SURVIVES — all twelve keys are materialised and deleting one
 * would leave a hole the matrix renders as a missing row. What goes is
 * the fabricated state and the fabricated timestamp, leaving exactly
 * what `reassignOriginalKey` produces for a key nothing has happened
 * in yet.
 *
 * `isOriginalKey` is NOT touched. Whether this row is the song's
 * anchor is a separate question with its own repair in `keyRepairs`,
 * and a cleanup that silently moved the anchor would be doing two
 * things under one name.
 */
export async function clearSeededKeyRow(keyRowId: string): Promise<void> {
  const row = await db.songKeys.get(keyRowId);
  if (!row) return;
  await db.songKeys.put({
    ...row,
    keyState: 'not_started',
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    isRetestRecommended: false,
    lastEngagedAt: null,
    updatedAt: Date.now(),
  });
}
