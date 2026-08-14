// @vitest-environment jsdom
/**
 * Restoring a backup exported BEFORE the v33/v34 attempt-id change.
 *
 * The trap being tested: this failure is silent, not loud. Numeric ids
 * are valid IndexedDB keys, so a pre-migration backup restores cleanly
 * and leaves rows that can never sync — `queueUpsert` skips a non-string
 * id and `toPgRow` throws on one, so every push is dropped with a
 * console warning. "It restored fine" is exactly what it looks like.
 *
 * Both live backups were exported before that change, so this is the
 * real path, not a hypothetical one.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  BACKUP_VERSION,
  normalizeRestoredAttempts,
  restoreBackup,
  type BackupFile,
} from '../backup';

/** An attempts row as it appears in a backup taken before v33. */
function legacyRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    moduleId: 'intervals',
    itemId: 'm3',
    direction: 'asc',
    correct: true,
    timestamp: 1_700_000_000_000 + id,
    ...overrides,
  };
}

function backupWith(attempts: unknown[]): BackupFile {
  return {
    version: BACKUP_VERSION,
    exportedAt: '2026-08-13T00:00:00.000Z',
    appVersion: 'test',
    data: { attempts },
  } as unknown as BackupFile;
}

beforeEach(async () => {
  await db.attempts.clear();
});

describe('normalizeRestoredAttempts', () => {
  it('replaces numeric ids with minted string ids', () => {
    const out = normalizeRestoredAttempts([legacyRow(1), legacyRow(2)]) as Array<{ id: string }>;
    expect(out.every(r => typeof r.id === 'string')).toBe(true);
    expect(out.every(r => r.id.startsWith('att-'))).toBe(true);
    expect(new Set(out.map(r => r.id)).size).toBe(2);
  });

  it('preserves everything that actually identifies an attempt', () => {
    // Nothing references an attempt id — no foreign key, no ordering —
    // so minting a new one is safe ONLY because these survive.
    const [out] = normalizeRestoredAttempts([
      legacyRow(7, { itemId: 'M7', correct: false, excludeFromFluency: true }),
    ]) as Array<Record<string, unknown>>;
    expect(out.moduleId).toBe('intervals');
    expect(out.itemId).toBe('M7');
    expect(out.direction).toBe('asc');
    expect(out.correct).toBe(false);
    expect(out.timestamp).toBe(1_700_000_000_007);
    expect(out.excludeFromFluency).toBe(true);
  });

  it('leaves already-migrated rows exactly as they are', () => {
    const row = { ...legacyRow(1), id: 'att-already-migrated' };
    const [out] = normalizeRestoredAttempts([row]);
    expect(out).toBe(row);
  });

  it('mints for a missing or empty id too', () => {
    const out = normalizeRestoredAttempts([
      { moduleId: 'reading', itemId: 'note:treble:4', correct: true, timestamp: 1 },
      { ...legacyRow(1), id: '' },
    ]) as Array<{ id: string }>;
    expect(out.every(r => r.id.startsWith('att-'))).toBe(true);
  });

  it('passes non-object entries through rather than throwing', () => {
    expect(normalizeRestoredAttempts([null, 42])).toEqual([null, 42]);
  });
});

describe('restoreBackup with a pre-migration file', () => {
  it('lands every row with a syncable string id', async () => {
    await restoreBackup(backupWith([legacyRow(1), legacyRow(2), legacyRow(3)]));
    const stored = await db.attempts.toArray();
    expect(stored).toHaveLength(3);
    for (const row of stored) {
      expect(typeof row.id).toBe('string');
      expect(row.id!.startsWith('att-')).toBe(true);
    }
    expect(new Set(stored.map(r => r.id)).size).toBe(3);
  });

  it('keeps all three rows rather than collapsing them', async () => {
    // Ids are minted per row; a shared one would leave a single row.
    await restoreBackup(backupWith([legacyRow(1), legacyRow(2), legacyRow(3)]));
    expect(await db.attempts.count()).toBe(3);
  });

  it('restores the practice history itself unchanged', async () => {
    await restoreBackup(backupWith([
      legacyRow(1, { itemId: 'P5', correct: false }),
      legacyRow(2, { itemId: 'm2', correct: true }),
    ]));
    const stored = (await db.attempts.toArray()).sort((a, b) => a.timestamp - b.timestamp);
    expect(stored.map(r => [r.itemId, r.correct])).toEqual([
      ['P5', false],
      ['m2', true],
    ]);
  });
});
