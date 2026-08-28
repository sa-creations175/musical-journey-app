import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';

/**
 * Removing the retired gate — and the key statuses that were never
 * earned.
 *
 * =====================================================================
 * WHAT IS GOING, AND WHY IT IS NOT A CONVERSION.
 *
 * `comfortableAt`, `consecutiveCleanCount` and `lastRunWasClean` were
 * one mechanism between them: the moment the gate was met, the streak
 * toward it, and whether the last run counted. `songCellRunThroughs`
 * was its evidence log.
 *
 * The gate is retired. Comfortable is Fluent-or-better, derived from
 * rated reps through the shared reader, so all four describe a rule
 * the app no longer follows.
 *
 * SILAS CHOSE WIPE OVER CONVERT, and the reason is worth keeping:
 * twelve run-through rows cannot defend twelve Comfortable sections.
 * Converting them would mean inventing ratings nobody gave — synthetic
 * evidence of practice that did happen but was never scored. Carrying
 * a number the reader cannot reproduce is worse than re-earning it.
 *
 * =====================================================================
 * WHAT SURVIVES, AND WHY EACH ONE.
 *
 * `lastRunAt` — says the cell was PLAYED, which is still true and
 * still load-bearing. `findSeededKeyRows` uses it as one of two
 * independent signals when deciding whether a key row may be deleted;
 * removing it would make practised rows look untouched and offer real
 * history for deletion.
 *
 * `notes` — user-written prose. Nothing in the redesign replaces it
 * and nothing derived it.
 *
 * `lastEngagedAt` — when, not how well.
 *
 * `cellState` — a synced NOT NULL column. A row without it fails every
 * upsert. Nothing reads it; it keeps a constant placeholder write
 * until the column is dropped in its own pass.
 *
 * =====================================================================
 * AND THE KEY STATUSES GO TOO, WHICH SUPERSEDES AN EARLIER DECISION.
 *
 * `wholeSongTestPassedAt` was originally to be left alone, on the
 * grounds that a passed whole-song test is a record of something that
 * happened. It was not: every key reading comfortable or solid is a
 * dev-test artefact. A record of a test nobody sat is not a record.
 *
 * So `keyState` resets to `not_started`, and `solidAt` and
 * `wholeSongTestPassedAt` are cleared. THE TIMESTAMP HAS TO GO WITH
 * THE STATUS: `computeKeyStateFromCells` returns `solid` directly when
 * `wholeSongTestPassedAt` is set and every cell is comfortable, so a
 * surviving timestamp would regenerate the fake status on the next
 * read and the deletion would silently undo itself.
 *
 * `songKeyRunThroughs` is NOT touched — see the report. Its rows carry
 * a `kind` of 'test' or 'single', and a 'single' row records a real
 * play-through that never advanced any gate. Deleting the log wholesale
 * would take those with it.
 *
 * `solidDecayState` and `isRetestRecommended` GO WITH IT. They are
 * companions to a solid status and describe a decay clock on a test
 * that never happened. Every reader guards on `keyState` first
 * (`isSolidNotLapsed`, `songRetestState`), so leaving them would be
 * inert TODAY — and that is exactly the argument against leaving them.
 * A value that is only harmless because every current reader remembers
 * a guard is a value that lies the first time one forgets. The schema
 * documents `solidDecayState` as null whenever the state is not solid;
 * after this the rows honour that rather than merely being read as if
 * they did.
 * =====================================================================
 *
 * =====================================================================
 * IRREVERSIBLE, SO IT COUNTS FIRST.
 *
 * `report()` is read-only and answers "what would go". The pass
 * refuses to run if the counts have moved since — not to be clever,
 * but because a wipe against a database that changed under it is a
 * wipe nobody previewed.
 *
 * The deletes propagate: `bulkDelete` and `modify` both fire the sync
 * hooks, so the cloud loses the same rows and the same fields. There
 * is no undo on either side.
 * =====================================================================
 */

export const PREF_RETIRED_CELL_FIELDS_WIPED = 'repertoireRetiredCellFieldsWiped';

/** The counts this wipe was authorised against. A mismatch stops it. */
export const EXPECTED = {
  cells: 379,
  withComfortableAt: 12,
  withStreak: 15,
  runThroughs: 12,
  /** Keys NOT already at not_started — 1 solid, 1 comfortable, 2 learning. */
  keysWithStatus: 4,
  keysWithSolidAt: 1,
  keysWithTestPassed: 1,
} as const;

export interface WipeReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  /** Counts disagreed with `EXPECTED`; nothing was touched. */
  refused: boolean;
  cells: number;
  withComfortableAt: number;
  withStreak: number;
  withLastRunWasClean: number;
  runThroughs: number;
  /** Cells that KEEP a lastRunAt after the wipe. */
  keptLastRunAt: number;
  /** Cells that KEEP notes after the wipe. */
  keptNotes: number;
  /** songKeys not at `not_started`. Zero after. */
  keysWithStatus: number;
  keysWithSolidAt: number;
  keysWithTestPassed: number;
  keysWithDecayState: number;
  keysRetestRecommended: number;
  /** Untouched, and counted so the report can prove it. */
  keyRunThroughs: number;
}

type LegacyCell = {
  id: string;
  comfortableAt?: number | null;
  consecutiveCleanCount?: number;
  lastRunWasClean?: boolean | null;
  lastRunAt: number | null;
  notes: string | null;
};

/** Read-only. What the wipe would remove and what it would leave. */
export async function reportRetiredCellFields(): Promise<WipeReport> {
  const cells = (await db.songCells.toArray()) as unknown as LegacyCell[];
  const runThroughs = await db.songCellRunThroughs.count();
  const keys = await db.songKeys.toArray();
  const keyRunThroughs = await db.songKeyRunThroughs.count();
  return {
    keysWithStatus: keys.filter(k => k.keyState !== 'not_started').length,
    keysWithSolidAt: keys.filter(k => k.solidAt != null).length,
    keysWithTestPassed: keys.filter(k => k.wholeSongTestPassedAt != null).length,
    keysWithDecayState: keys.filter(k => k.solidDecayState != null).length,
    keysRetestRecommended: keys.filter(k => k.isRetestRecommended).length,
    keyRunThroughs,
    skipped: false,
    refused: false,
    cells: cells.length,
    withComfortableAt: cells.filter(c => c.comfortableAt != null).length,
    withStreak: cells.filter(c => (c.consecutiveCleanCount ?? 0) > 0).length,
    withLastRunWasClean: cells.filter(c => c.lastRunWasClean != null).length,
    runThroughs,
    keptLastRunAt: cells.filter(c => c.lastRunAt != null).length,
    keptNotes: cells.filter(c => (c.notes ?? '').trim() !== '').length,
  };
}

/**
 * One-time, destructive.
 *
 * Idempotent underneath its guard in the sense that matters: deleting
 * a field that is already gone is a no-op, and `bulkClear` on an empty
 * table removes nothing. So a cleared pref re-runs harmlessly — the
 * guard stops the work, not the damage.
 */
export async function wipeRetiredCellFields(): Promise<WipeReport> {
  const before = await reportRetiredCellFields();

  if (await getPref<boolean>(PREF_RETIRED_CELL_FIELDS_WIPED, false)) {
    return { ...before, skipped: true };
  }

  // THE NUMBERS THIS WAS AUTHORISED AGAINST. Checked in code and not
  // only in a console snippet, because the snippet proves the state at
  // the moment it ran and this proves it at the moment of the write.
  if (
    before.cells !== EXPECTED.cells
    || before.withComfortableAt !== EXPECTED.withComfortableAt
    || before.withStreak !== EXPECTED.withStreak
    || before.runThroughs !== EXPECTED.runThroughs
    || before.keysWithStatus !== EXPECTED.keysWithStatus
    || before.keysWithSolidAt !== EXPECTED.keysWithSolidAt
    || before.keysWithTestPassed !== EXPECTED.keysWithTestPassed
  ) {
    return { ...before, refused: true };
  }

  // `modify` fires the `updating` hook per row, so each edited cell
  // enqueues an upsert and the fields disappear from the cloud copy
  // too — the whole Dexie row rides in the `data` JSONB blob.
  await db.songCells.toCollection().modify(cell => {
    const c = cell as unknown as Record<string, unknown>;
    delete c.comfortableAt;
    delete c.consecutiveCleanCount;
    delete c.lastRunWasClean;
  });

  // `bulkDelete` fires the `deleting` hook, which enqueues a delete per
  // row regardless of whether a pull is in flight — see hooks.ts. So
  // the log goes from the cloud as well, not just from this device.
  const ids = await db.songCellRunThroughs.toCollection().primaryKeys();
  if (ids.length > 0) await db.songCellRunThroughs.bulkDelete(ids as string[]);

  // THE KEY STATUSES. `modify` again, so each edited key enqueues an
  // upsert and the cloud copy loses the values too. `keyState` is set
  // rather than deleted: it is a NOT NULL column with a real default
  // state, and `not_started` is the honest one.
  await db.songKeys.toCollection().modify(key => {
    key.keyState = 'not_started';
    key.solidAt = null;
    key.wholeSongTestPassedAt = null;
    // The decay clock and the retest flag belong to a solid status.
    // With the status gone they describe nothing, and a retest prompt
    // for a key that was never proven is a prompt for work the app
    // invented.
    key.solidDecayState = null;
    key.isRetestRecommended = false;
  });

  await setPref(PREF_RETIRED_CELL_FIELDS_WIPED, true);
  return { ...(await reportRetiredCellFields()), skipped: false, refused: false };
}

export function describeWipe(r: WipeReport): string {
  if (r.skipped) return '[repertoire] retired cell fields already wiped';
  if (r.refused) {
    return '[repertoire] WIPE REFUSED — counts moved since it was authorised: '
      + `${r.cells} cells, ${r.withComfortableAt} comfortableAt, `
      + `${r.withStreak} streaks, ${r.runThroughs} run-throughs`;
  }
  return `[repertoire] wiped the retired gate: ${r.withComfortableAt} comfortableAt, `
    + `${r.withStreak} streaks, ${r.withLastRunWasClean} lastRunWasClean, `
    + `${r.runThroughs} cell run-throughs, and reset every key status `
    + `with its decay clock. `
    + `Kept ${r.keptLastRunAt} lastRunAt, ${r.keptNotes} notes, `
    + `${r.keyRunThroughs} key run-throughs.`;
}
