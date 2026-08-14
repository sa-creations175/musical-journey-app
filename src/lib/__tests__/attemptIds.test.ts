// @vitest-environment jsdom
/**
 * Attempt ids after the v33/v34 primary-key change.
 *
 * Two things are pinned here, and they fail in different ways:
 *
 *   · the SHAPE of a minted id, and that every write path gets one.
 *     Without it, rows reach Dexie keyless and IndexedDB rejects them —
 *     loud, but only at runtime.
 *   · that ids are UNIQUE PER ROW rather than per batch. That one is
 *     silent: a shared id makes bulkAdd keep only the last row, so a
 *     four-chord progression submission would land as a single attempt
 *     and nothing would report an error.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newAttemptId, type AttemptRecord } from '../db';
import { addAttempt, bulkAddAttempts } from '../practiceWrites';

function row(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    moduleId: 'intervals',
    itemId: 'm3',
    correct: true,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.attempts.clear();
});

describe('newAttemptId', () => {
  it('mints a prefixed uuid', () => {
    const id = newAttemptId();
    expect(id).toMatch(
      /^att-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('never repeats', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newAttemptId()));
    expect(ids.size).toBe(500);
  });
});

describe('addAttempt', () => {
  it('stamps an id onto a record built without one', () => {
    // Every quiz constructs its literal without an id — the choke point
    // is what makes that safe.
    return addAttempt(row()).then(async () => {
      const stored = await db.attempts.toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toMatch(/^att-/);
    });
  });

  it('keeps an id the caller supplied', async () => {
    await addAttempt(row({ id: 'att-explicit' }));
    const stored = await db.attempts.toArray();
    expect(stored[0].id).toBe('att-explicit');
  });
});

describe('bulkAddAttempts', () => {
  it('gives every row its OWN id, not one per batch', async () => {
    // The silent failure: one id across the batch means bulkAdd keeps
    // only the last row. This is exactly the chord-progression case —
    // four slots written in a single call.
    await bulkAddAttempts([
      row({ itemId: '2-5-1' }),
      row({ itemId: '2-5-1' }),
      row({ itemId: '2-5-1' }),
      row({ itemId: '2-5-1' }),
    ]);
    const stored = await db.attempts.toArray();
    expect(stored).toHaveLength(4);
    expect(new Set(stored.map(a => a.id)).size).toBe(4);
  });

  it('preserves the per-slot timestamps the collapse rule depends on', async () => {
    // ChordProgressionsQuiz writes `now + i` per slot. Grouping a
    // submission back together reads those, so the id change must not
    // disturb them.
    const now = 1_700_000_000_000;
    await bulkAddAttempts([0, 1, 2, 3].map(i => row({ itemId: '2-5-1', timestamp: now + i })));
    const stored = (await db.attempts.toArray()).sort((a, b) => a.timestamp - b.timestamp);
    expect(stored.map(a => a.timestamp)).toEqual([now, now + 1, now + 2, now + 3]);
  });
});

describe('the store itself', () => {
  it('REJECTS a row written without an id', async () => {
    // The loud failure the optional-but-stamped design depends on: a
    // write path that bypasses practiceWrites must break immediately,
    // not land a row under a silently invented key.
    await expect(db.attempts.add(row())).rejects.toThrow();
    expect(await db.attempts.count()).toBe(0);
  });

  it('keys by the id, so re-putting the same id updates in place', async () => {
    await db.attempts.add(row({ id: 'att-fixed', correct: true }));
    await db.attempts.put(row({ id: 'att-fixed', correct: false }));
    const stored = await db.attempts.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].correct).toBe(false);
  });
});
