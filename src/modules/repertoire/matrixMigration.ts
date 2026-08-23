import {
  db,
  type Song,
  type SongKey,
} from '../../lib/db';
import { whenSyncReady } from '../../lib/sync/syncReady';
import { songKeyRowId } from './matrix/ids';

/**
 * Phase 1.5 step 2 — auto-populate `songKeys` for every existing
 * song so the section × key matrix model has a starting state to
 * render from. Per `docs/SONG_PROGRESSION_DESIGN_3.md` "Migration
 * spec":
 *
 *   - One row per song, `isOriginalKey = true`.
 *   - `keyName` from `song.key` (fallback 'C' when undefined).
 *   - `keyState` derived from `song.stage` (the legacy
 *     RepertoireStage). See mapStageToKeyState below.
 *   - No cells, no run-throughs, no lived-with counters seeded —
 *     spec is explicit: "Cell states, run-through history, lived-
 *     with session counts, consecutive clean counts — all start
 *     fresh." That granularity was never tracked under the legacy
 *     stage model, so nothing real is lost.
 *
 * The section-setup banner the spec mentions ("queued on first
 * matrix open") is derived at read time by the matrix view from
 * the absence of any non-archived `songMatrixSections` rows for a
 * song. No prompts-table row, no separate queue.
 *
 * Idempotent: re-runs are no-ops once every song has a
 * corresponding songKeys row. Deterministic IDs
 * (`songkey-{songId}-{keyName}`) make concurrent runs across
 * devices a no-op-ish overwrite rather than a duplicate.
 *
 * Lifecycle-aware: awaits whenSyncReady() before writing so the
 * migration writes go through the Dexie sync hooks to Supabase
 * cleanly. Without that, writes can land before the sync layer is
 * registered and get wiped by the next replace-mode pull (see the
 * April 2026 seeder fix in goals/data.ts for the underlying
 * lesson).
 */

let migrationInFlight: Promise<void> | null = null;

export async function migrateSongsToMatrixIfNeeded(): Promise<void> {
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = (async () => {
    try {
      await runMigration();
    } finally {
      migrationInFlight = null;
    }
  })();
  return migrationInFlight;
}

async function runMigration(): Promise<void> {
  await whenSyncReady();

  const [songs, existingKeys] = await Promise.all([
    db.songs.toArray(),
    db.songKeys.toArray(),
  ]);

  // Already-migrated songs — any songKeys row at all means the
  // song has at least its original-key row. We don't try to
  // backfill missing keys here; the matrix UI's cross-key prompt
  // handles intentional gaps.
  const migratedSongIds = new Set(existingKeys.map(k => k.songId));
  const songsToMigrate = songs.filter(s => !migratedSongIds.has(s.id));
  if (songsToMigrate.length === 0) return;

  const now = Date.now();
  const newKeys: SongKey[] = songsToMigrate.map(song => buildOriginalKeyRow(song, now));

  // bulkPut is upsert by primary key. Concurrent migration on a
  // second device that produced the same deterministic IDs would
  // result in idempotent overwrites here, not duplicate rows.
  await db.songKeys.bulkPut(newKeys);
}

/**
 * Single-song variant of the bulk migration. Idempotent: no-op when
 * the song already has at least one songKeys row, no-op when the
 * song record itself is missing. Used by saveMeta in SongDetailView
 * to bootstrap the matrix for songs that haven't been opened in the
 * matrix view yet — without this, editing the key field on a fresh
 * song would update Song.key but leave songKeys empty, and the
 * matrix would render against a stale or absent designation.
 *
 * The seed mirrors the bulk migration's row shape exactly (same
 * deterministic id, same stage→keyState mapping) so the two paths
 * stay consistent.
 */
export async function ensureSongHasOriginalKey(songId: string): Promise<void> {
  const existing = await db.songKeys.where('songId').equals(songId).count();
  if (existing > 0) return;
  const song = await db.songs.get(songId);
  if (!song) return;
  await db.songKeys.put(buildOriginalKeyRow(song, Date.now()));
}

function buildOriginalKeyRow(song: Song, now: number): SongKey {
  // ---------------------------------------------------------------
  // NO LONGER SEEDS A STATE FROM THE STAGE, and the reason is that the
  // arrow now points the other way. Stage is DERIVED from key states;
  // seeding a key state from a stage makes the derivation read back
  // its own input and call it evidence.
  //
  // It is also what produced the phantom this repair exists to clear:
  // a song with no key and a hand-set stage of Learning got a **C**
  // row already at `learning`, stamped with the song's added date —
  // a state and a date describing practice that never happened. See
  // `seededKeyRows.ts`.
  //
  // Every key now starts where `reassignOriginalKey` and `materialise`
  // already start theirs: not_started, with nothing claimed.
  // ---------------------------------------------------------------
  const keyState: SongKey['keyState'] = 'not_started';
  // No `key` set on the song record means we don't know the home
  // key. 'C' is a neutral default the user can change once the
  // matrix UI exposes the original-key picker (per spec, the
  // designation is reassignable without losing matrix state).
  const keyName = song.key ?? 'C';

  return {
    id: songKeyRowId(song.id, keyName),
    songId: song.id,
    keyName,
    isOriginalKey: true,
    keyState,
    // Migrated-into-Solid songs get a fresh decay window from
    // migration day — the legacy stage record doesn't preserve the
    // moment the user actually achieved Internalized, and faking a
    // historical timestamp risks immediately surfacing a "lapsed,
    // retest now" prompt on a song the user has done nothing wrong
    // with. Honest stance: the new clock starts now.
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    // NULL, not the added date. A date here is a claim that something
    // happened, and adding a song is not practising it — that stamp is
    // exactly what made the phantom row look like history.
    lastEngagedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * `mapStageToKeyState` lived here and is gone.
 *
 * It translated a hand-set stage into a key state, which was the only
 * way a migrated song could arrive with progress already on the
 * matrix. With the stage DERIVED from key states that translation runs
 * backwards — it would let the derivation read back its own input and
 * call it evidence — and its last caller went with the seeding in
 * `buildOriginalKeyRow` above. Removed rather than left unreferenced:
 * an unused mapper between two vocabularies is an invitation to
 * reintroduce the cycle.
 */
