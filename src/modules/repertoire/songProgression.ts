/**
 * Post-comfortable progression decisions for the session algorithm.
 *
 * A song that has reached "comfortable in original key" leaves the
 * cell-by-cell drill loop and enters one of three progression
 * paths the user chose via the Song-of-the-Month congrats banner:
 *
 *   deepen       — keep practising in original key as whole-song
 *                  runs, target solid.
 *   expand-keys  — walk the song through the circle of fourths,
 *                  cell-drilling each new key. Original key falls
 *                  into staleness-driven whole-song maintenance.
 *   maintenance  — light weekly rotation, whole-song only, with a
 *                  once-a-week floor regardless of staleness signal.
 *
 * Per-spec, `progressionPath === null` is treated as 'deepen' so the
 * user keeps practising while the banner prompts them to pick. This
 * file is the single home for those rules — pure functions in, pure
 * decisions out.
 */
import type { Song, SongCell, SongKey } from '../../lib/db';

/** Minimum cadence for the maintenance progression path. When the
 *  song hasn't been engaged in this long, the maintenance-path block
 *  surfaces; otherwise the slot is skipped. */
export const MAINTENANCE_PATH_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ProgressionPath = 'deepen' | 'expand-keys' | 'maintenance';

export type PostComfortableBlockDecision =
  | { kind: 'whole-song-run'; keyName: string }
  | { kind: 'cell-drill-expansion'; keyName: string }
  | { kind: 'skip' };

export interface PostComfortableInputs {
  song: Song;
  songKeys: ReadonlyArray<SongKey>;
  songCells: ReadonlyArray<SongCell>;
  /** lastEngagedAt for the song's original-key songKey row. Null when
   *  never engaged. The maintenance path uses this for its weekly
   *  staleness floor. */
  lastEngagedAt: number | null;
  now: number;
}

/**
 * Resolve `song.progressionPath` to a concrete decision. Null and
 * undefined map to 'deepen' so a freshly comfortable song that the
 * user hasn't yet given a path stays in active rotation as
 * whole-song practice.
 */
export function resolveProgressionPath(song: Song): ProgressionPath {
  return song.progressionPath ?? 'deepen';
}

/**
 * Has enough time elapsed since the song was last engaged to surface
 * a maintenance-path block? `null` lastEngagedAt counts as "due" —
 * a song that has never been practised always wants to be touched.
 */
export function isMaintenanceDue(
  lastEngagedAt: number | null,
  now: number,
): boolean {
  if (lastEngagedAt === null) return true;
  return now - lastEngagedAt >= MAINTENANCE_PATH_WEEK_MS;
}

/**
 * For a song on the expand-keys path, return the next key in the
 * circle-of-4ths walk whose cells aren't yet all comfortable.
 * Returns null when:
 *   · the song has no expandKeysOrder (path never chosen or stale
 *     data)
 *   · every key in the order has all-comfortable cells (walk done)
 *
 * A key with no songKeys row OR no songCells rows still counts as
 * "not yet mastered" — fresh territory, return it.
 */
export function findNextExpansionKey(
  song: Song,
  songKeys: ReadonlyArray<SongKey>,
  songCells: ReadonlyArray<SongCell>,
): string | null {
  const order = song.expandKeysOrder;
  if (!order || order.length === 0) return null;
  for (const keyName of order) {
    const key = songKeys.find(
      k => k.songId === song.id && k.keyName === keyName,
    );
    if (!key) return keyName;
    const cells = songCells.filter(
      c => c.songId === song.id && c.songKeyId === key.id,
    );
    if (cells.length === 0) return keyName;
    if (!cells.every(c => c.cellState === 'comfortable')) return keyName;
  }
  return null;
}

/**
 * Single-call decision for what kind of block (if any) a
 * post-comfortable song should produce in this session proposal.
 * Callers feed this the song record + its matrix data + the latest
 * engagement timestamp; the result tells `splitRepertoireAllocation`
 * which block shape to emit.
 *
 * Path semantics:
 *   deepen       → always whole-song-run in the original key.
 *   expand-keys  → cell-drill on the next un-mastered key. When the
 *                  walk is done, drops back to whole-song-run in the
 *                  original key (a finished walk implicitly graduates
 *                  the song to deepen-style maintenance).
 *   maintenance  → whole-song-run iff the weekly floor has elapsed,
 *                  otherwise `skip`.
 */
export function decidePostComfortableBlock(
  inputs: PostComfortableInputs,
): PostComfortableBlockDecision {
  const path = resolveProgressionPath(inputs.song);
  const originalKey = inputs.song.key ?? '';
  switch (path) {
    case 'deepen':
      return { kind: 'whole-song-run', keyName: originalKey };
    case 'expand-keys': {
      const next = findNextExpansionKey(
        inputs.song,
        inputs.songKeys,
        inputs.songCells,
      );
      if (next) return { kind: 'cell-drill-expansion', keyName: next };
      return { kind: 'whole-song-run', keyName: originalKey };
    }
    case 'maintenance':
      if (isMaintenanceDue(inputs.lastEngagedAt, inputs.now)) {
        return { kind: 'whole-song-run', keyName: originalKey };
      }
      return { kind: 'skip' };
  }
}
