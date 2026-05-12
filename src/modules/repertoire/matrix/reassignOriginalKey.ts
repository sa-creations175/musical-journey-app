import { db, type SongKey } from '../../../lib/db';

/**
 * Reassign which row in `db.songKeys` carries `isOriginalKey: true`
 * for a song. Used when the user edits the song's `key` field — the
 * matrix's original-key column derives from this flag, so without
 * the reassignment the matrix would keep showing the old key as
 * original while the song header advertises the new one.
 *
 * Per the schema contract on SongKey.isOriginalKey:
 *   "Exactly one row per song has isOriginalKey=true at any time.
 *    Reassignable; matrix data stays intact, only the designation
 *    changes."
 *
 * The flip preserves all cell history. Matrix cells are keyed by
 * `songKeyId` (the row id, stable across designation changes), so
 * the user's practice state in the previously-original column stays
 * attached to that column — it just stops being the "original" one.
 * The new original-key column appears as fresh / not-started until
 * the user practices in it.
 *
 * Behavior:
 *   · current isOriginalKey row's keyName === newKeyName → no-op
 *   · target row exists → flip its flag to true; flip the previous
 *     original's flag to false
 *   · target row does NOT exist → create one with
 *     `id = songkey-${songId}-${newKeyName}` (matches the migration's
 *     deterministic id pattern), seeded as not_started; flip the
 *     previous original's flag to false
 *   · multiple rows with isOriginalKey: true (defensive — schema
 *     promises exactly one) → flip every extra back to false
 *
 * Callers should run this inside the same Dexie transaction that
 * updates Song.key so the two stay in lockstep — Dexie inherits the
 * current transaction automatically, so wrapping
 * `db.transaction('rw', [db.songs, db.songKeys], ...)` is enough.
 */
export async function reassignOriginalKey(
  songId: string,
  newKeyName: string,
  now: number = Date.now(),
): Promise<void> {
  const rows = await db.songKeys.where('songId').equals(songId).toArray();

  // Zero rows — the song hasn't been migrated yet (matrixMigration
  // skips songs whose songKeys table is empty for them until the user
  // opens the matrix). Create the original-key row directly. This
  // is the path "No Weapon" hit in production: the user edited the
  // key via the meta editor before ever opening the matrix view, so
  // no migration had run, so there was nothing for the demote loop
  // to act on — and prior to this branch, the function did the right
  // thing implicitly but the lack of an explicit case left readers
  // (and the bug report) uncertain. Now it's explicit and tested.
  if (rows.length === 0) {
    await db.songKeys.put(buildOriginalKeyRow(songId, newKeyName, now));
    return;
  }

  const currentOriginals = rows.filter(r => r.isOriginalKey);
  const targetRow = rows.find(r => r.keyName === newKeyName);

  // No-op: the existing original already names this key. Schema
  // promises at most one isOriginalKey row, but we still check the
  // count so a redundant write doesn't slip through when defensive
  // data drifted into multiple-originals.
  if (
    currentOriginals.length === 1
    && currentOriginals[0].keyName === newKeyName
  ) {
    return;
  }

  const writes: SongKey[] = [];

  // Demote any current originals that aren't the target row.
  for (const row of currentOriginals) {
    if (row.keyName === newKeyName) continue;
    writes.push({ ...row, isOriginalKey: false, updatedAt: now });
  }

  // Promote (or create) the target row.
  if (targetRow) {
    if (!targetRow.isOriginalKey) {
      writes.push({ ...targetRow, isOriginalKey: true, updatedAt: now });
    }
  } else {
    writes.push(buildOriginalKeyRow(songId, newKeyName, now));
  }

  if (writes.length === 0) return;
  await db.songKeys.bulkPut(writes);
}

/**
 * Construct a fresh original-key row. Matches the deterministic id
 * pattern matrixMigration uses so concurrent reassignments across
 * devices converge on the same row rather than duplicating. All
 * progress fields seed to not_started — no practice has happened in
 * this key yet by definition.
 */
function buildOriginalKeyRow(
  songId: string,
  keyName: string,
  now: number,
): SongKey {
  return {
    id: `songkey-${songId}-${keyName}`,
    songId,
    keyName,
    isOriginalKey: true,
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
  };
}
