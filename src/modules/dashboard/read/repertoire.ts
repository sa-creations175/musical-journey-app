/**
 * Song Repertoire: the one catalog that is rows in Dexie rather than a
 * constant, and the one module whose three columns come from three
 * different places.
 *
 * ─── What each column reads, and why ─────────────────────────────────
 *
 * COVERAGE reads PRACTICE. A section is covered at 3+ logged practice
 *   sessions that touched it. Practice is song-level by design: the
 *   only required field is duration, and "40 minutes, couldn't tell you
 *   which sections" is a complete record rather than a degraded one.
 *
 * ACCURACY reads TEST. A run-through is clean or it is not, so this
 *   column is `measured`, not self-rated. The design doc puts Song
 *   Repertoire under the four-step fluency scale, and that is still
 *   true of the RATING a player gives a practice session — but the
 *   column answers "does this section hold up", and the honest source
 *   for that is whether the run-throughs were clean.
 *
 * RECENCY reads BOTH. Practising a section without testing it still
 *   means you touched it.
 *
 * A practice session therefore enters as an engagement marked
 * `not-graded`: it counts toward coverage and recency and stays out of
 * the accuracy window, because it carries no pass or fail to count.
 * That is the same shape as a focus-protected attempt and a different
 * reason, which is why `AccuracyExclusion` names both.
 *
 * ─── Sections come from two tables, and so do their ids ──────────────
 *
 * The tree uses `songMatrixSections`, which the write hook keeps
 * mirroring the authoritative lead-sheet `songSections`. But
 * `SongPracticeLog.sectionIds` holds ids from EITHER table depending on
 * which surface logged the session: the cell modal passes a matrix
 * section id, the song-level practice modal passes lead-sheet ids. The
 * resolver below accepts both, using `SongMatrixSection.songSectionId`
 * as the bridge.
 *
 * Pure: loaded rows in, stats out.
 */
import type {
  Song,
  SongCell,
  SongCellRunThrough,
  SongKey,
  SongMatrixSection,
  SongPracticeLog,
} from '../../../lib/db';
import type { CatalogItem, ModuleCatalog } from './catalogs';
import { statsForCatalog } from './adapters';
import type { Engagement, ItemStats } from './itemStats';

/** Everything the repertoire read needs, loaded once by the caller. */
export interface RepertoireData {
  songs: ReadonlyArray<Song>;
  sections: ReadonlyArray<SongMatrixSection>;
  keys: ReadonlyArray<SongKey>;
  cells: ReadonlyArray<SongCell>;
  runThroughs: ReadonlyArray<SongCellRunThrough>;
  practiceLogs: ReadonlyArray<SongPracticeLog>;
}

/** `section:{sectionId}` — the read layer's ref for one tree row. */
export function sectionItemRef(sectionId: string): string {
  return `section:${sectionId}`;
}

/**
 * Song to section, from the matrix mirror.
 *
 * Archived sections are excluded: the matrix hides them and their cell
 * history is preserved, so counting them would put rows in the
 * denominator that no surface offers a way to practise.
 *
 * KEYS ARE NOT IN THE DENOMINATOR. There is no intention to learn every
 * song in every key, so counting keys would make songs incomparable —
 * one at 25% because it carries four keys and another at 55% because it
 * carries one. Keys live below the section row.
 */
export function repertoireCatalog(data: RepertoireData): ModuleCatalog {
  const songById = new Map(data.songs.map(s => [s.id, s]));
  const items: CatalogItem[] = [];
  const ordered = [...data.sections]
    .filter(s => !s.isArchived && songById.has(s.songId))
    .sort((a, b) => {
      const songA = songById.get(a.songId)!;
      const songB = songById.get(b.songId)!;
      return songA.learningOrder - songB.learningOrder
        || songA.title.localeCompare(songB.title)
        || a.displayOrder - b.displayOrder;
    });
  for (const section of ordered) {
    const song = songById.get(section.songId)!;
    items.push({
      id: sectionItemRef(section.id),
      label: section.name,
      path: ['song repertoire', song.title],
      itemRefs: [sectionItemRef(section.id)],
    });
  }
  return {
    sourceId: 'repertoire',
    label: 'song repertoire',
    // Clean-or-not is an outcome, not a self-report. See the header.
    accuracyKind: 'measured',
    items,
  };
}

/**
 * Map any section id a practice log might carry onto its matrix
 * section id.
 *
 * Lead-sheet ids resolve through `songSectionId`. Matrix ids resolve to
 * themselves. A legacy matrix row whose `songSectionId` the reconciler
 * has not stamped yet simply will not resolve from the lead-sheet side
 * — which shows up as a section missing some practice rather than as a
 * wrong number attached to the right one.
 */
export function buildSectionIdResolver(
  sections: ReadonlyArray<SongMatrixSection>,
): (sectionId: string) => string | undefined {
  const matrixIds = new Set(sections.map(s => s.id));
  const byLeadSheetId = new Map<string, string>();
  for (const s of sections) {
    if (s.songSectionId) byLeadSheetId.set(s.songSectionId, s.id);
  }
  return (sectionId: string) =>
    matrixIds.has(sectionId) ? sectionId : byLeadSheetId.get(sectionId);
}

/**
 * Which sections one practice session touched.
 *
 * An empty `sectionIds` means "the whole song, or I don't remember",
 * which is a real record and not a missing one — so it touches every
 * live section of that song. Three whole-song sessions do cover every
 * section, because the player did play them.
 */
function sectionsTouchedByPractice(
  log: SongPracticeLog,
  sectionsBySong: ReadonlyMap<string, SongMatrixSection[]>,
  resolve: (sectionId: string) => string | undefined,
): string[] {
  if (log.sectionIds.length === 0) {
    return (sectionsBySong.get(log.songId) ?? []).map(s => s.id);
  }
  const out: string[] = [];
  for (const raw of log.sectionIds) {
    const resolved = resolve(raw);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * Engagements for the section rows.
 *
 * Practice sessions enter as `not-graded` — coverage and recency only.
 * Run-throughs enter graded, 100 for clean and 0 for not, aggregated
 * across every key the section has been tested in. A section is one row
 * whether you have tested it in one key or four.
 */
export function repertoireEngagements(data: RepertoireData): Engagement[] {
  const live = data.sections.filter(s => !s.isArchived);
  const liveIds = new Set(live.map(s => s.id));
  const sectionsBySong = new Map<string, SongMatrixSection[]>();
  for (const s of live) {
    const arr = sectionsBySong.get(s.songId);
    if (arr) arr.push(s);
    else sectionsBySong.set(s.songId, [s]);
  }
  const resolve = buildSectionIdResolver(data.sections);

  const out: Engagement[] = [];

  for (const log of data.practiceLogs) {
    for (const sectionId of sectionsTouchedByPractice(log, sectionsBySong, resolve)) {
      if (!liveIds.has(sectionId)) continue;
      out.push({
        itemRef: sectionItemRef(sectionId),
        timestamp: log.timestamp,
        // Ignored: a practice session has no pass or fail to score.
        score: 0,
        notCounted: 'not-graded',
      });
    }
  }

  for (const run of data.runThroughs) {
    if (!liveIds.has(run.sectionId)) continue;
    out.push({
      itemRef: sectionItemRef(run.sectionId),
      timestamp: run.createdAt,
      score: run.wasClean ? 100 : 0,
    });
  }

  return out;
}

export function repertoireStats(data: RepertoireData): {
  catalog: ModuleCatalog;
  stats: ItemStats[];
} {
  const catalog = repertoireCatalog(data);
  return { catalog, stats: statsForCatalog(catalog, repertoireEngagements(data)) };
}
