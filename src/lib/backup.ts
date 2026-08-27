import type { Table } from 'dexie';
import { db, newAttemptId } from './db';
import { setPref } from './userPrefs';
import { APP_VERSION } from './appVersion';
import { localDayKey } from './dailyGoal';

export const BACKUP_VERSION = 1;
export const PREF_LAST_EXPORTED_AT = 'lastExportedAt';

export interface BackupFile {
  version: number;
  exportedAt: string;
  appVersion: string;
  data: Record<string, unknown[]>;
}

// All Dexie tables that carry user practice data. Ordered for readability
// in the exported JSON — actual import order doesn't matter since we
// wrap the whole restore in one transaction.
const TABLES = {
  intervals: db.intervals,
  chordQualities: db.chordQualities,
  chordShapes: db.chordShapes,
  songs: db.songs,
  sessions: db.sessions,
  logicSkills: db.logicSkills,
  producerStats: db.producerStats,
  quizStats: db.quizStats,
  userPrefs: db.userPrefs,
  attempts: db.attempts,
  dailySummaries: db.dailySummaries,
  progressionAssociations: db.progressionAssociations,
  modeAssociations: db.modeAssociations,
  intervalDescriptions: db.intervalDescriptions,
  songSections: db.songSections,
  songChords: db.songChords,
  songPracticeLog: db.songPracticeLog,
  songCrossKeyProgress: db.songCrossKeyProgress,
  wantToLearn: db.wantToLearn,
  drillSkills: db.drillSkills,
  drillTypes: db.drillTypes,
  drillSessions: db.drillSessions,
  creativeSessions: db.creativeSessions,
  skillAnnotations: db.skillAnnotations,
  harmonicDiaryEntries: db.harmonicDiaryEntries,
  productionLessons: db.productionLessons,
  productionLessonSessions: db.productionLessonSessions,
  glossaryTermStates: db.glossaryTermStates,
  referenceTracks: db.referenceTracks,
  lessonReferenceTracks: db.lessonReferenceTracks,
} as const;

type TableMap = typeof TABLES;
type TableName = keyof TableMap;
const TABLE_NAMES = Object.keys(TABLES) as TableName[];

async function gatherData(): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    const table = TABLES[name] as unknown as Table<unknown, unknown>;
    data[name] = await table.toArray();
  }
  return data;
}

export async function buildBackup(): Promise<BackupFile> {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: await gatherData(),
  };
}

export async function exportBackup(): Promise<void> {
  const payload = await buildBackup();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `musical-journey-backup-${localDayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  await setPref(PREF_LAST_EXPORTED_AT, Date.now());
}

export type BackupValidation =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string };

const ERR_INVALID =
  "This file isn't a valid backup. Please select a musical-journey-backup JSON file.";
const ERR_NEWER =
  'This backup is from a newer version of the app. Please update the app before restoring.';
const ERR_CORRUPT = 'This backup appears corrupted. Try a different backup file.';

export function validateBackup(raw: unknown): BackupValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: ERR_INVALID };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== 'number') return { ok: false, error: ERR_INVALID };
  if (obj.version > BACKUP_VERSION) return { ok: false, error: ERR_NEWER };
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: ERR_CORRUPT };
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, error: ERR_CORRUPT };
  const data = obj.data as Record<string, unknown>;
  // Every present table must be an array; missing tables are OK (older
  // exports may predate tables added later).
  for (const name of Object.keys(data)) {
    if (!Array.isArray(data[name])) return { ok: false, error: ERR_CORRUPT };
  }
  return { ok: true, backup: obj as unknown as BackupFile };
}

export async function readBackupFile(file: File): Promise<BackupValidation> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    return validateBackup(parsed);
  } catch {
    return { ok: false, error: ERR_INVALID };
  }
}

/**
 * Give every attempt row a string id, minting one where it is missing
 * or numeric.
 *
 * ---------------------------------------------------------------
 * WHY THIS ISN'T HANDLED BY THE STORE REJECTING IT
 *
 * `attempts` moved from `++id` auto-increment to client-generated
 * `att-<uuid>` in v33/v34, so every backup exported before then holds
 * numeric ids. The tempting assumption is that restoring one fails
 * loudly — it does not. IndexedDB accepts numbers as keys, so those
 * rows restore CLEANLY and then sit there permanently unsyncable:
 * `queueUpsert` skips any row whose id isn't a string (hooks.ts) and
 * `toPgRow` throws on one (engine.ts), so the write is dropped with a
 * console warning nobody reads. And numeric ids are what collided
 * across devices in the first place.
 *
 * A restore is also the one moment the app knowingly overwrites
 * everything, so silently importing rows that can never leave the
 * device is the worst possible time for it.
 * ---------------------------------------------------------------
 *
 * Minting fresh ids is safe here precisely because nothing references
 * an attempt id: no foreign key anywhere in the schema, and no reader
 * orders by it. Identity for an attempt is (moduleId, itemId,
 * timestamp), all of which are preserved untouched.
 *
 * Pure, and exported for its own tests.
 */
export function normalizeRestoredAttempts(
  rows: ReadonlyArray<unknown>,
): unknown[] {
  return rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    const id = (row as { id?: unknown }).id;
    if (typeof id === 'string' && id !== '') return row;
    return { ...(row as Record<string, unknown>), id: newAttemptId() };
  });
}

/**
 * Table keys in the FILE that this build no longer has a table for.
 *
 * =====================================================================
 * A DROPPED TABLE MUST NOT MAKE A RESTORE SILENT.
 *
 * `restoreBackup` walks the CURRENT map, not the file's keys, so a
 * backup carrying a retired table restores cleanly and simply ignores
 * it. That is the right behaviour — there is nowhere to put the rows —
 * but doing it without a word means a file the reader believes is a
 * complete copy comes back incomplete and nothing says so.
 *
 * `flashcardStates` is the first of these: dropped at Dexie v38, and
 * present in every backup taken before that. BACKUP_VERSION stays at 1
 * deliberately — bumping it would invalidate those files outright, and
 * they are still good for everything else in them.
 * =====================================================================
 */
function retiredTablesIn(backup: BackupFile): Array<{ name: string; rows: number }> {
  const known = new Set<string>(TABLE_NAMES);
  return Object.entries(backup.data as Record<string, unknown>)
    .filter(([name]) => !known.has(name))
    .map(([name, rows]) => ({
      name,
      rows: Array.isArray(rows) ? rows.length : 0,
    }))
    .filter(t => t.rows > 0);
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  // Warned BEFORE the transaction, so the line is in the console even
  // if the restore itself then fails.
  for (const t of retiredTablesIn(backup)) {
    console.warn(
      `[backup] skipped ${t.rows} row${t.rows === 1 ? '' : 's'} from `
      + `"${t.name}" — that table no longer exists in this version of `
      + `the app. Nothing else in the file was affected.`,
    );
  }
  const tables = TABLE_NAMES.map(name => TABLES[name] as unknown as Table<unknown, unknown>);
  await db.transaction('rw', tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = TABLES[name] as unknown as Table<unknown, unknown>;
      await table.clear();
      const rows = backup.data[name];
      if (Array.isArray(rows) && rows.length > 0) {
        await table.bulkPut(
          name === 'attempts' ? normalizeRestoredAttempts(rows) : rows,
        );
      }
    }
  });
}
