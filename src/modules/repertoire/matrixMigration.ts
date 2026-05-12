import {
  db,
  type RepertoireStage,
  type Song,
  type SongKey,
  type SongKeyState,
} from '../../lib/db';
import { whenSyncReady } from '../../lib/sync/syncReady';

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
  // Temporary diagnostic — added to confirm whether saveMeta is
  // actually reaching this seed path for "No Weapon". Remove once
  // the report is in.
  // eslint-disable-next-line no-console
  console.log(`[ensureSongHasOriginalKey] called for songId: ${songId}, existing rows: ${existing}`);
  if (existing > 0) return;
  const song = await db.songs.get(songId);
  if (!song) return;
  await db.songKeys.put(buildOriginalKeyRow(song, Date.now()));
}

function buildOriginalKeyRow(song: Song, now: number): SongKey {
  const stage: RepertoireStage = song.stage ?? 'learning';
  const keyState = mapStageToKeyState(stage);
  // No `key` set on the song record means we don't know the home
  // key. 'C' is a neutral default the user can change once the
  // matrix UI exposes the original-key picker (per spec, the
  // designation is reassignable without losing matrix state).
  const keyName = song.key ?? 'C';

  return {
    id: `songkey-${song.id}-${keyName}`,
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
    solidAt: keyState === 'solid' ? now : null,
    solidDecayState: keyState === 'solid' ? 'solid' : null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    lastEngagedAt: song.addedDate ?? now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Stage → keyState mapping per the design doc's migration table.
 * Inputs are the legacy RepertoireStage; outputs are the new
 * SongKeyState. Every input maps to exactly one output, no nulls.
 *
 * Notes on the trickier rows:
 *
 *   'cross-key' → 'comfortable'
 *     The old Cross-key state implied the user had the original
 *     key down well enough to start working others. In the new
 *     model that's at least Comfortable on the original. The
 *     "which other keys were you working?" follow-up is a matrix-
 *     UI concern (step 3) — migration only seeds the original key.
 *
 *   'internalized' → 'solid'
 *     Closest honest equivalent. True Internalized in the new
 *     model also requires 3+ keys at Solid plus the lived-with
 *     gate, and we have none of that signal historically — so we
 *     migrate to Solid (the original-key floor) and let the user
 *     earn their way back to Internalized through actual practice
 *     in additional keys.
 *
 *   'maintenance' → 'solid'
 *     The legacy maintenance state mixed two things: post-mastery
 *     proficiency AND a user-declared "stop actively developing
 *     this" intent. The new model splits them — Solid carries the
 *     proficiency, and a separate maintenance-intent toggle (not
 *     yet built; ships in a later step) carries the intent. We
 *     map state cleanly to Solid here; the intent semantics are
 *     deferred without losing data — the user can flip the toggle
 *     on for these songs once it ships.
 */
export function mapStageToKeyState(stage: RepertoireStage): SongKeyState {
  switch (stage) {
    case 'learning':     return 'learning';
    case 'comfortable':  return 'comfortable';
    case 'cross-key':    return 'comfortable';
    case 'internalized': return 'solid';
    case 'maintenance':  return 'solid';
  }
}
