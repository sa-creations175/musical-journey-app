import { db, type SongKeyState } from '../../lib/db';
import { computeKeyStateFromCells } from './matrix/cellRollup';
import { decayStateAfterEngagement } from './matrix/solidDecay';
import { reassignOriginalKey } from './matrix/reassignOriginalKey';
import { ensureSongHasOriginalKey } from './matrixMigration';
import type { SongKeyRowInfo } from './keyDiagnostics';

/**
 * Repairs for the song-key data, one explicit action at a time.
 *
 * ---------------------------------------------------------------
 * NOTHING HERE RUNS AUTOMATICALLY AND NOTHING HERE IS BULK.
 *
 * Every function is invoked by a single button press against a single
 * row, after the diagnostic has shown exactly what is stored. There is
 * no "repair all", because the two decisions that came up in the real
 * data — which of two disagreeing keys is right, and whether a
 * legacy-stage value should survive — are not decidable from the data.
 * The app cannot tell "never played" from "played before cells
 * existed"; only the person who practised it can.
 * ---------------------------------------------------------------
 *
 * Every repair re-reads from Dexie before writing. The diagnostic
 * snapshot the UI is rendering may be seconds old, and these are
 * destructive-ish operations — checking against live state rather than
 * the snapshot is what keeps a stale button press from acting on a row
 * that has since changed.
 */

/** not_started < learning < comfortable < solid. */
const STATE_RANK: Record<SongKeyState, number> = {
  not_started: 0,
  learning: 1,
  comfortable: 2,
  solid: 3,
};

export type RecomputeSafety =
  /** Stored and derived agree, or there is nothing to derive from. */
  | 'none'
  /** Derived is HIGHER. Played cells are positive evidence — they can
   *  only exist if run-throughs happened, so this can be applied
   *  without asking. */
  | 'promotion'
  /** Derived is LOWER, and some cell has been played. The stored value
   *  drifted from a history the cells do record; cells win. */
  | 'evidenced-demotion'
  /** Derived is LOWER and NOTHING has been played. The stored value
   *  predates the cells — a legacy stage-ladder record — and the cells
   *  prove nothing. Applying this destroys the only evidence the song
   *  was ever worked in that key, so it needs explicit confirmation
   *  from someone who knows whether it is true. */
  | 'unevidenced-demotion';

/**
 * How safe it is to overwrite a row's stored state with what its cells
 * derive to. Pure.
 *
 * The signal is `engagedCellCount`, NOT `cellCount`. Step 3
 * materialises empty cells for all twelve keys, which gives every
 * legacy row cells and permanently erases "has no cells" as a way to
 * recognise one. Played-cell count is the only durable distinction.
 */
export function recomputeSafety(row: SongKeyRowInfo): RecomputeSafety {
  if (row.derivedState === null) return 'none';
  if (row.derivedState === row.keyState) return 'none';
  if (STATE_RANK[row.derivedState] > STATE_RANK[row.keyState]) return 'promotion';
  return row.engagedCellCount > 0 ? 'evidenced-demotion' : 'unevidenced-demotion';
}

/** Whether the action can be taken without an extra confirmation. */
export function canApplyWithoutConfirm(safety: RecomputeSafety): boolean {
  return safety === 'promotion' || safety === 'evidenced-demotion';
}

// ---------------------------------------------------------------------
// A — delete a junk row
// ---------------------------------------------------------------------

/**
 * Remove a key row that cannot render and carries nothing.
 *
 * Re-verifies dependents and anchor status against live data before
 * deleting. There is no cascade anywhere in this codebase, so a row
 * that has acquired cells since the diagnostic ran must not be removed
 * — the orphans would be unreachable and invisible.
 */
export async function deleteJunkKeyRow(keyRowId: string): Promise<void> {
  const row = await db.songKeys.get(keyRowId);
  if (!row) return;
  if (row.isOriginalKey === true) {
    throw new Error('refusing to delete the original-key row');
  }
  const [cellCount, runCount] = await Promise.all([
    db.songCells.where('songKeyId').equals(keyRowId).count(),
    db.songCellRunThroughs.where('songKeyId').equals(keyRowId).count(),
  ]);
  if (cellCount > 0 || runCount > 0) {
    throw new Error(
      `refusing to delete: ${cellCount} cells and ${runCount} run-throughs would be orphaned`,
    );
  }
  await db.songKeys.delete(keyRowId);
}

// ---------------------------------------------------------------------
// B — normalise a non-canonical song key
// ---------------------------------------------------------------------

/**
 * Point a song at a canonical key, moving the anchor and clearing the
 * unrenderable row behind it.
 *
 * Used for Blessed's `Gb` → `F#`. The old row cannot simply be deleted
 * (it is the anchor) and cannot simply be renamed (its id embeds the
 * old spelling, and step 3 dedupes by keyName, so a renamed row would
 * collide with the one materialisation creates). So: reassign the
 * anchor to the canonical key — which creates a clean row — then drop
 * the old one, which is by then neither anchor nor dependent-bearing.
 *
 * NOTE this is a placeholder for per-song enharmonic spelling. Gb and
 * F# are the same pitch class; the matrix simply has no way to say so
 * yet. Nothing about this write forecloses respelling later: cells key
 * off songKeyId, never off the name.
 */
export async function normaliseSongKey(
  songId: string,
  toKeyName: string,
): Promise<void> {
  const song = await db.songs.get(songId);
  if (!song) return;
  const fromKeyName = song.key;

  await db.transaction('rw', [db.songs, db.songKeys], async () => {
    const fresh = await db.songs.get(songId);
    if (!fresh) return;
    await db.songs.put({ ...fresh, key: toKeyName, updatedAt: Date.now() });
    await reassignOriginalKey(songId, toKeyName);
  });

  // Drop the superseded row only if it is now safe: demoted by the
  // reassignment above, and carrying nothing.
  if (fromKeyName && fromKeyName !== toKeyName) {
    const stale = (await db.songKeys.where('songId').equals(songId).toArray())
      .find(r => r.keyName === fromKeyName);
    if (stale && stale.isOriginalKey !== true) {
      const [cells, runs] = await Promise.all([
        db.songCells.where('songKeyId').equals(stale.id).count(),
        db.songCellRunThroughs.where('songKeyId').equals(stale.id).count(),
      ]);
      if (cells === 0 && runs === 0) await db.songKeys.delete(stale.id);
    }
  }

  await ensureSongHasOriginalKey(songId);
}

// ---------------------------------------------------------------------
// C — resolve a Song.key ↔ anchor mismatch
// ---------------------------------------------------------------------

export type MismatchChoice = 'use-song-key' | 'use-matrix-anchor';

/**
 * Make `Song.key` and the ★ row agree, in whichever direction the user
 * picked.
 *
 * There is deliberately no default. In the live data the MATRIX was
 * right and the song record was stale (A Couple Minutes: song said F,
 * anchor said Eb, and Eb was the truth) — so a repair that always
 * trusted `Song.key` would have silently moved the anchor off the
 * correct key and taken the `F · learning` row with it.
 */
export async function resolveKeyMismatch(
  songId: string,
  choice: MismatchChoice,
): Promise<void> {
  const song = await db.songs.get(songId);
  if (!song) return;
  const rows = await db.songKeys.where('songId').equals(songId).toArray();
  const anchor = rows.find(r => r.isOriginalKey === true);

  if (choice === 'use-song-key') {
    if (!song.key) return;
    await reassignOriginalKey(songId, song.key);
    return;
  }

  if (!anchor) return;
  await db.transaction('rw', db.songs, async () => {
    const fresh = await db.songs.get(songId);
    if (!fresh) return;
    await db.songs.put({ ...fresh, key: anchor.keyName, updatedAt: Date.now() });
  });
}

// ---------------------------------------------------------------------
// D — recompute a row's state from its cells
// ---------------------------------------------------------------------

/**
 * Rewrite a key row's state to what its cells derive to, mirroring what
 * `cellRollup` does when a run-through is logged.
 *
 * Companion fields move with it — `solidDecayState` and
 * `isRetestRecommended` are derived from the new state exactly as
 * cellRollup derives them (cellRollup.ts:255-268), because the schema
 * documents solidDecayState as null whenever the state is not solid,
 * and leaving a stale one behind would be a fresh inconsistency in
 * place of the one being repaired.
 *
 * `lastEngagedAt` is deliberately NOT touched: no practice happened
 * here, and moving it would fabricate engagement and reset decay
 * clocks the user has not earned.
 *
 * `force` is required for an unevidenced demotion. It exists because
 * the app cannot tell "never played" from "played before cells
 * existed", and the user can.
 */
export async function recomputeKeyStateFromCells(
  keyRowId: string,
  opts: { force?: boolean } = {},
): Promise<{ from: SongKeyState; to: SongKeyState } | null> {
  const row = await db.songKeys.get(keyRowId);
  if (!row) return null;

  const [cells, sections] = await Promise.all([
    db.songCells.where('songKeyId').equals(keyRowId).toArray(),
    db.songMatrixSections.where('songId').equals(row.songId).toArray(),
  ]);
  const sectionCount = sections.filter(s => !s.isArchived).length;

  // computeKeyStateFromCells returns not_started unconditionally when
  // there are no sections, so recomputing here would demote every row
  // on a song whose matrix was never set up.
  if (sectionCount === 0) {
    throw new Error('refusing to recompute: the song has no matrix sections');
  }
  if (cells.length === 0) {
    throw new Error('refusing to recompute: this row has no cells to derive from');
  }

  const derived = computeKeyStateFromCells(
    cells,
    sectionCount,
    row.wholeSongTestPassedAt ?? null,
  );
  if (derived === row.keyState) return null;

  const engaged = cells.filter(
    c => c.cellState !== 'empty' || c.lastRunAt !== null,
  ).length;
  const isDemotion = STATE_RANK[derived] < STATE_RANK[row.keyState];
  if (isDemotion && engaged === 0 && !opts.force) {
    throw new Error(
      'refusing to demote a row whose cells show no practice — confirm to override',
    );
  }

  const decay = decayStateAfterEngagement(row.solidDecayState, derived);
  await db.songKeys.put({
    ...row,
    keyState: derived,
    solidDecayState: decay,
    isRetestRecommended: decay === 'lapsed',
    lastDecayCheckAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { from: row.keyState, to: derived };
}
