import type { Table } from 'dexie';
import { db } from './db';
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
  flashcardStates: db.flashcardStates,
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

export async function restoreBackup(backup: BackupFile): Promise<void> {
  const tables = TABLE_NAMES.map(name => TABLES[name] as unknown as Table<unknown, unknown>);
  await db.transaction('rw', tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = TABLES[name] as unknown as Table<unknown, unknown>;
      await table.clear();
      const rows = backup.data[name];
      if (Array.isArray(rows) && rows.length > 0) {
        await table.bulkPut(rows);
      }
    }
  });
}
