import { db } from '../../lib/db';
import { recordEngagementOccurred } from '../../lib/spacingState';
import { getPref, setPref } from '../../lib/userPrefs';
import { cellForLeadSheetEdit } from './leadSheetNudge';
import { sectionHasChords } from './sectionChords';

/**
 * CHARTING A SECTION IS ENGAGEMENT WITH IT.
 *
 * =====================================================================
 * The matrix had no way to tell "you have never touched this" from
 * "you wrote the chart and have not played it yet". Both read Not
 * Started, which is wrong about the second one and wrong in the
 * direction that matters: the sections you have charted are exactly
 * the ones you are most likely to play next.
 *
 * The fix is not a seeded band. A band is a verdict on playing, and
 * nothing here has been played — seeding one would have the app claim
 * a proficiency it has never observed. What charting supports is the
 * weaker, true statement: this happened. That is `Started`.
 *
 * AND IT SCHEDULES NOTHING. See `recordEngagementOccurred`. Charting
 * is the input step the rest of the app depends on, so it must never
 * create practice debt — a chart that puts a cell in the review queue
 * is a chart you put off writing. The schedule begins on the first
 * rated run.
 *
 * ---------------------------------------------------------------
 * THE ORIGINAL KEY ONLY, AND THIS IS THE WHOLE OF THE RULE.
 *
 * Lead sheets here are written in the number system, so one chart
 * covers all twelve keys on paper. It proves nothing about eleven of
 * them. Writing every key would put 96 cells at Started on the
 * strength of work done in one, and Started would stop meaning
 * anything.
 *
 * `cellForLeadSheetEdit` already encodes this choice for the practice
 * nudge, with its reasoning, so it is reused rather than restated —
 * two functions picking a cell for the same lead sheet is two chances
 * to pick differently.
 * ---------------------------------------------------------------
 *
 * APPEND-ONLY. Deleting every chord from a section afterwards does NOT
 * pull the cell back to Not Started. The charting happened; history in
 * this app is a record of events, not a mirror of current content. A
 * status that walked backwards when a file was edited would make the
 * matrix a view of the lead sheet rather than a record of the work.
 * The consequence, stated so it is not a surprise later: a cell can
 * read Started on the strength of a chart that is now empty, and
 * nothing in the UI undoes that.
 * =====================================================================
 */

/** `songCell:<cellId>` — one cell, one home. The same namespace the
 *  song test reps will write to, so a cell's charting signal and its
 *  reps share a row and a history rather than living in two places
 *  that have to be reconciled. */
export function songCellItemRef(cellId: string): string {
  return `songCell:${cellId}`;
}

export const REPERTOIRE_MODULE_REF = 'repertoire';

/** Guards the one-time backfill, the way `clearDeclaredStages` guards
 *  its own pass. */
export const PREF_CHARTING_ENGAGEMENT_BACKFILLED = 'repertoireChartingEngagementBackfilled';

/**
 * Record that a lead-sheet section is charted, if it is.
 *
 * Called after every write to a section. Cheap and silent in the
 * common case: an uncharted section writes nothing, and a cell that
 * already has a row returns it untouched, so the hundredth chord typed
 * into a section costs one indexed lookup and no write.
 *
 * RESOLVES NOTHING ITSELF. The cell comes from `cellForLeadSheetEdit`
 * and the chord test from `sectionHasChords`; both already exist and
 * both are the app's single answer to their question.
 *
 * Returns the itemRef written, or null when nothing was.
 */
export async function noteSectionCharted(
  songSectionId: string,
): Promise<string | null> {
  const section = await db.songSections.get(songSectionId);
  if (!section) return null;

  const song = await db.songs.get(section.songId);
  if (!sectionHasChords(song, section)) return null;

  const [matrixSections, songKeys, cells] = await Promise.all([
    db.songMatrixSections.where('songId').equals(section.songId).toArray(),
    db.songKeys.where('songId').equals(section.songId).toArray(),
    db.songCells.where('songId').equals(section.songId).toArray(),
  ]);

  // Null is legitimate, not an error. `syncMatrixSectionsForSong` runs
  // off a Dexie write hook, so a section added seconds ago may have no
  // matrix row and no cells yet — and a first chord typed inside that
  // window lands here. The backfill catches those; it is idempotent
  // precisely so it can.
  const cellId = cellForLeadSheetEdit({
    songSectionId,
    matrixSections,
    songKeys,
    cells,
  });
  if (cellId === null) return null;

  const itemRef = songCellItemRef(cellId);
  await recordEngagementOccurred({ itemRef, moduleRef: REPERTOIRE_MODULE_REF });
  return itemRef;
}

export interface ChartingBackfillReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  /** Cells given a charting signal by this pass. */
  written: number;
  /** Charted sections whose original-key cell could not be resolved.
   *  Not an error and not retried destructively — the next edit to the
   *  section picks them up once the matrix has caught up. */
  unresolved: number;
  /** Cells that already had a row and were left exactly as they were. */
  alreadyPresent: number;
}

/**
 * One-time pass for sections charted before this signal existed.
 *
 * Runs the same `noteSectionCharted` path as a live edit rather than a
 * parallel bulk write, so there is one definition of what charting
 * records and the backfill cannot drift from it.
 *
 * Guarded by a `userPrefs` flag, but ALSO idempotent underneath —
 * `recordEngagementOccurred` returns an existing row untouched. The
 * flag stops the work, not the damage, because there is no damage to
 * stop. That is deliberate: a guard that is the only thing preventing
 * double-writing is a guard whose failure is silent.
 */
export async function backfillChartingEngagement(): Promise<ChartingBackfillReport> {
  if (await getPref<boolean>(PREF_CHARTING_ENGAGEMENT_BACKFILLED, false)) {
    return { skipped: true, written: 0, unresolved: 0, alreadyPresent: 0 };
  }

  const sections = await db.songSections.toArray();
  let written = 0;
  let unresolved = 0;
  let alreadyPresent = 0;

  for (const section of sections) {
    const song = await db.songs.get(section.songId);
    if (!sectionHasChords(song, section)) continue;

    const before = await db.spacingState
      .where('moduleRef')
      .equals(REPERTOIRE_MODULE_REF)
      .count();
    const itemRef = await noteSectionCharted(section.id);
    if (itemRef === null) {
      unresolved += 1;
      continue;
    }
    const after = await db.spacingState
      .where('moduleRef')
      .equals(REPERTOIRE_MODULE_REF)
      .count();
    if (after > before) written += 1; else alreadyPresent += 1;
  }

  await setPref(PREF_CHARTING_ENGAGEMENT_BACKFILLED, true);
  return { skipped: false, written, unresolved, alreadyPresent };
}
