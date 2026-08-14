import { db, type Song, type SongKey, type SongKeyState } from '../../lib/db';
import { isCanonicalSongKey } from './matrix/keys';

/**
 * Why the matrix's original key disagrees with `Song.key` — for every
 * song at once.
 *
 * ---------------------------------------------------------------
 * WHY THIS IS UI AND NOT A CONSOLE HELPER
 *
 * `__inspectSongKeys` already dumps this for ONE song, but it takes a
 * song id, and obtaining one needs `db` — which is dev-gated, and
 * rightly so. `openSong` sets React state without touching the URL, so
 * there is no way to learn a song id on the deployed build either. The
 * result was a diagnostic that only runs where the bug isn't.
 *
 * Reporting ALL songs rather than one matched by title is the point:
 * if reassignment is broken everywhere, ten rows failing identically
 * is a stronger signal than any single row, and ten rows failing
 * DIFFERENTLY immediately rules out a single shared cause.
 * ---------------------------------------------------------------
 *
 * Read-only. No writes, no repair — this answers "what is stored",
 * and what to do about it is a separate decision.
 */

/**
 * The ways `Song.key` and the matrix's `isOriginalKey` row can fail to
 * agree. Ordered roughly by how far upstream the cause sits, so a
 * column of identical values reads as one cause rather than ten.
 */
export type SongKeyProblem =
  /** Song.key is unset — nothing to disagree with, matrix falls back to 'C'. */
  | 'song-key-unset'
  /** Song.key isn't one of the twelve — renders a 13th matrix row. */
  | 'song-key-non-canonical'
  /** No songKeys rows at all: the migration never ran for this song. */
  | 'no-key-rows'
  /** Rows exist but none is flagged original — the grid has no anchor. */
  | 'no-original'
  /** More than one row flagged original; `.find()` picks by array order. */
  | 'multiple-originals'
  /** Exactly one original, but it names a different key than Song.key.
   *  THE REPORTED SYMPTOM: the edit reached `songs` and not `songKeys`,
   *  or was reverted afterwards. */
  | 'original-mismatch';

export interface SongKeyRowInfo {
  keyName: string;
  isOriginalKey: boolean;
  keyState: SongKeyState;
  updatedAt: number;
}

export interface SongKeyDiagnostic {
  songId: string;
  title: string;
  /** The `Song.key` field the meta editor writes. */
  songKey: string | null;
  /** Every songKeys row, originals first then alphabetical. */
  rows: SongKeyRowInfo[];
  /** Null when Song.key and the matrix agree. */
  problem: SongKeyProblem | null;
}

/**
 * Classify one song. Pure — exported so every branch is testable
 * without a database.
 *
 * Order matters: an unset or non-canonical `Song.key` is reported
 * ahead of any row-level disagreement, because a mismatch against a
 * value that was never valid is a different bug than a mismatch
 * against a good one.
 */
export function classifySongKeys(
  song: Pick<Song, 'id' | 'title' | 'key'>,
  keyRows: ReadonlyArray<SongKey>,
): SongKeyDiagnostic {
  const rows: SongKeyRowInfo[] = [...keyRows]
    .map(r => ({
      keyName: r.keyName,
      isOriginalKey: r.isOriginalKey === true,
      keyState: r.keyState,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => {
      if (a.isOriginalKey !== b.isOriginalKey) return a.isOriginalKey ? -1 : 1;
      return a.keyName.localeCompare(b.keyName);
    });

  const originals = rows.filter(r => r.isOriginalKey);

  const problem = ((): SongKeyProblem | null => {
    if (song.key === undefined || song.key === null || song.key === '') {
      return 'song-key-unset';
    }
    if (!isCanonicalSongKey(song.key)) return 'song-key-non-canonical';
    if (rows.length === 0) return 'no-key-rows';
    if (originals.length === 0) return 'no-original';
    if (originals.length > 1) return 'multiple-originals';
    if (originals[0].keyName !== song.key) return 'original-mismatch';
    return null;
  })();

  return {
    songId: song.id,
    title: song.title,
    songKey: song.key ?? null,
    rows,
    problem,
  };
}

/**
 * Problem songs first (so ten identical failures group at the top),
 * then alphabetically by title. Pure.
 */
export function orderDiagnostics(
  entries: ReadonlyArray<SongKeyDiagnostic>,
): SongKeyDiagnostic[] {
  return [...entries].sort((a, b) => {
    const aBad = a.problem !== null;
    const bBad = b.problem !== null;
    if (aBad !== bBad) return aBad ? -1 : 1;
    if (aBad && bBad && a.problem !== b.problem) {
      return (a.problem as string).localeCompare(b.problem as string);
    }
    return a.title.localeCompare(b.title);
  });
}

/** Read every song and its key rows. Read-only. */
export async function collectSongKeyDiagnostics(): Promise<SongKeyDiagnostic[]> {
  const [songs, allKeys] = await Promise.all([
    db.songs.toArray(),
    db.songKeys.toArray(),
  ]);
  const bySong = new Map<string, SongKey[]>();
  for (const row of allKeys) {
    const list = bySong.get(row.songId);
    if (list) list.push(row);
    else bySong.set(row.songId, [row]);
  }
  return orderDiagnostics(
    songs.map(s => classifySongKeys(s, bySong.get(s.id) ?? [])),
  );
}

/** Human-readable one-liner per problem, shown under the table. */
export const PROBLEM_LABEL: Record<SongKeyProblem, string> = {
  'song-key-unset': 'no key set on the song record',
  'song-key-non-canonical': 'song key is not one of the twelve',
  'no-key-rows': 'no matrix key rows — migration never ran for this song',
  'no-original': 'matrix rows exist but none is marked original',
  'multiple-originals': 'more than one row marked original',
  'original-mismatch': 'matrix original disagrees with the song key',
};
