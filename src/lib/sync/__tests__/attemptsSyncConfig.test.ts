// @vitest-environment jsdom
/**
 * The attempts entry in SYNC_TABLES.
 *
 * Config is data, and data is exactly the kind of thing that drifts
 * without anything failing loudly — a wrong `idField` drops every row
 * at the hook, a wrong column name fails the upsert, and a missing
 * `appendOnly` silently reintroduces a full-table id query on the
 * biggest table in the app. None of those surface as a test failure
 * anywhere else.
 */
import { describe, expect, it } from 'vitest';
import { SYNC_TABLE_BY_DEXIE, SYNC_TABLES, isSynced } from '../tables';

const attempts = SYNC_TABLE_BY_DEXIE.get('attempts');

describe('attempts sync config', () => {
  it('is registered as a synced table', () => {
    expect(isSynced('attempts')).toBe(true);
    expect(attempts).toBeDefined();
  });

  it('points at the Postgres table migration 008 creates', () => {
    expect(attempts!.pg).toBe('attempts');
  });

  it('keys on `id` — the client-minted string, not the old numeric key', () => {
    // queueUpsert silently skips a row whose idField value isn't a
    // string, so getting this wrong loses every attempt with no error.
    expect(attempts!.idField).toBe('id');
  });

  it('promotes moduleId and timestamp to the columns 008 declares', () => {
    // Names must match the SQL exactly; a mismatch fails the upsert
    // and stalls the drain.
    expect(attempts!.topLevel).toEqual([
      { dexie: 'moduleId', pg: 'module_id' },
      { dexie: 'timestamp', pg: 'timestamp' },
    ]);
  });

  it('is marked append-only so the orphan sweep skips it', () => {
    expect(attempts!.appendOnly).toBe(true);
  });

  it('is the ONLY append-only table', () => {
    // Guards against the flag being sprinkled onto tables that can
    // genuinely be deleted from the UI — drillSessions
    // (deletePracticeSession) and the song tables especially. A wrong
    // flag means deletes never propagate, with nothing to correct it.
    const flagged = SYNC_TABLES.filter(t => t.appendOnly).map(t => t.dexie);
    expect(flagged).toEqual(['attempts']);
  });

  it('leaves the genuine counter tables out of sync', () => {
    // These need additive merge, not last-write-wins. dailySummaries
    // in particular is derived from attempts and gets rebuilt locally
    // rather than replicated.
    for (const table of [
      'dailySummaries', 'intervals', 'chordQualities',
      'drillTypes', 'producerStats', 'quizStats',
    ]) {
      expect(isSynced(table), table).toBe(false);
    }
  });
});
