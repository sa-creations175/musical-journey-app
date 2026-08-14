import {
  db,
  type Song,
  type SongCell,
  type SongCellRunThrough,
  type SongKey,
  type SongKeyState,
} from '../../lib/db';
import { isCanonicalSongKey } from './matrix/keys';
import { computeKeyStateFromCells } from './matrix/cellRollup';

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

/**
 * Per-row consistency findings. Separate from SongKeyProblem, which is
 * about the song as a whole.
 */
export type KeyRowFlag =
  /** keyName isn't one of the twelve — this row can never render. */
  | 'non-canonical'
  /** Advanced state with no cells at all. EXPECTED for rows the
   *  original migration created: matrixMigration seeds keyState from
   *  the song's legacy stage, with no cells in existence. Reported so
   *  it is visible, but it is history, not corruption. */
  | 'state-from-migration'
  /** not_started despite having practice attached. A real
   *  inconsistency — something logged against this key and the rollup
   *  didn't follow. */
  | 'state-behind-history'
  /** Stored keyState disagrees with what its cells derive to, by the
   *  app's own computeKeyStateFromCells rule. */
  | 'state-mismatch';

export interface SongKeyRowInfo {
  /** The songKeys row id, carried through verbatim.
   *
   *  NOT reconstructible from songId + keyName, though all three
   *  current generators happen to use that shape: a row whose keyName
   *  was edited after creation keeps its original id, and a rebuilt
   *  guess would address a row that does not exist. Repairs act on
   *  this. */
  id: string;
  keyName: string;
  isOriginalKey: boolean;
  keyState: SongKeyState;
  updatedAt: number;
  /** songCells rows pointing at this key. */
  cellCount: number;
  /** ...of which show practice (non-empty state or a logged run). */
  engagedCellCount: number;
  /** songCellRunThroughs rows pointing at this key. */
  runThroughCount: number;
  /** What the app's own rollup would compute for this row, or null
   *  when it has no cells to derive from. */
  derivedState: SongKeyState | null;
  flags: KeyRowFlag[];
  /** Safe to delete: unrenderable AND carrying no practice. */
  deletable: boolean;
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
 * Describe one key row: what hangs off it, and whether its stored
 * state agrees with that.
 *
 * The agreement check runs the app's OWN rollup rule
 * (computeKeyStateFromCells) rather than a hand-rolled approximation,
 * so the diagnostic cannot disagree with what the matrix would
 * compute. Pure.
 */
export function describeKeyRow(
  row: SongKey,
  cells: ReadonlyArray<SongCell>,
  runThroughCount: number,
  sectionCount: number,
): SongKeyRowInfo {
  const engagedCellCount = cells.filter(
    c => c.cellState !== 'empty' || c.lastRunAt !== null,
  ).length;
  const hasHistory = engagedCellCount > 0 || runThroughCount > 0;

  const derivedState = cells.length > 0
    ? computeKeyStateFromCells(cells, sectionCount, row.wholeSongTestPassedAt ?? null)
    : null;

  const flags: KeyRowFlag[] = [];
  if (!isCanonicalSongKey(row.keyName)) flags.push('non-canonical');

  if (row.keyState !== 'not_started' && cells.length === 0) {
    // The migration's signature: state seeded from the legacy stage
    // with no cells to derive it from. History, not corruption.
    flags.push('state-from-migration');
  }
  if (row.keyState === 'not_started' && hasHistory) {
    flags.push('state-behind-history');
  }
  if (derivedState !== null && derivedState !== row.keyState) {
    flags.push('state-mismatch');
  }

  return {
    id: row.id,
    keyName: row.keyName,
    isOriginalKey: row.isOriginalKey === true,
    keyState: row.keyState,
    updatedAt: row.updatedAt,
    cellCount: cells.length,
    engagedCellCount,
    runThroughCount,
    derivedState,
    flags,
    // Deleting a row orphans its cells and run-throughs, and no
    // cascade exists anywhere in the codebase — so a row is only
    // offered for deletion when there is nothing to orphan.
    //
    // AND never the anchor, however empty. Blessed's only row is a
    // non-canonical 'Gb' that is also its original key: deleting it
    // would leave the song with no key rows at all, which is a worse
    // state than the one being repaired. A bad anchor gets renamed
    // (normaliseSongKey), never removed.
    deletable:
      !isCanonicalSongKey(row.keyName)
      && row.isOriginalKey !== true
      && cells.length === 0
      && runThroughCount === 0,
  };
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
  cells: ReadonlyArray<SongCell> = [],
  runThroughs: ReadonlyArray<SongCellRunThrough> = [],
  sectionCount = 0,
): SongKeyDiagnostic {
  const cellsByKey = new Map<string, SongCell[]>();
  for (const c of cells) {
    const list = cellsByKey.get(c.songKeyId);
    if (list) list.push(c);
    else cellsByKey.set(c.songKeyId, [c]);
  }
  const runsByKey = new Map<string, number>();
  for (const r of runThroughs) {
    runsByKey.set(r.songKeyId, (runsByKey.get(r.songKeyId) ?? 0) + 1);
  }

  const rows: SongKeyRowInfo[] = [...keyRows]
    .map(r => describeKeyRow(r, cellsByKey.get(r.id) ?? [], runsByKey.get(r.id) ?? 0, sectionCount))
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
  const [songs, allKeys, allCells, allRuns, allSections] = await Promise.all([
    db.songs.toArray(),
    db.songKeys.toArray(),
    db.songCells.toArray(),
    db.songCellRunThroughs.toArray(),
    db.songMatrixSections.toArray(),
  ]);

  const group = <T,>(rows: T[], songIdOf: (r: T) => string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const row of rows) {
      const id = songIdOf(row);
      const list = m.get(id);
      if (list) list.push(row);
      else m.set(id, [row]);
    }
    return m;
  };

  const keysBySong = group(allKeys, r => r.songId);
  const cellsBySong = group(allCells, r => r.songId);
  const runsBySong = group(allRuns, r => r.songId);
  const sectionsBySong = group(allSections, r => r.songId);

  return orderDiagnostics(
    songs.map(s => classifySongKeys(
      s,
      keysBySong.get(s.id) ?? [],
      cellsBySong.get(s.id) ?? [],
      runsBySong.get(s.id) ?? [],
      (sectionsBySong.get(s.id) ?? []).filter(sec => !sec.isArchived).length,
    )),
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

/** Short labels for the per-row flags. */
export const ROW_FLAG_LABEL: Record<KeyRowFlag, string> = {
  'non-canonical': 'not a key',
  'state-from-migration': 'state from migration',
  'state-behind-history': 'state behind its history',
  'state-mismatch': 'state disagrees with cells',
};
