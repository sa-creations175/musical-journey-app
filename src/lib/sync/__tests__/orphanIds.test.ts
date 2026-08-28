// @vitest-environment jsdom
/**
 * Tests for computeOrphanIdsForReplacePull — the replace-mode pull's
 * orphan filter. Defends recent local writes (within
 * PENDING_PUSH_PROTECTION_MS of the pull's start) from being deleted
 * before they've had a chance to drain into Supabase.
 *
 * The bug this protects against: a local row gets written but the
 * sync hook's setTimeout(fn, 0) deferred `queueUpsert` hasn't fired
 * yet → a replace-pull runs → row absent from cloud → row deleted
 * → user's edit silently reverts on next page load.
 */
import { describe, expect, it } from 'vitest';
import {
  PENDING_PUSH_PROTECTION_MS,
  ROW_RECENCY_FIELDS,
  computeOrphanIdsForReplacePull,
  rowRecency,
} from '../engine';

const NOW = 1_700_000_000_000;

describe('computeOrphanIdsForReplacePull', () => {
  it('deletes local rows that are absent from cloud and stale', () => {
    const local = [
      { id: 'r-old', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()),
    ).toEqual(['r-old']);
  });

  it('protects rows whose updatedAt is within the protection window', () => {
    const local = [
      { id: 'r-recent', updatedAt: NOW - 1_000 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()),
    ).toEqual([]);
  });

  it('treats the protection window as half-open: exactly at the boundary deletes', () => {
    // now - updatedAt === PENDING_PUSH_PROTECTION_MS is NOT "less than",
    // so the row passes through to deletion. The window is strict <.
    const local = [
      { id: 'r-boundary', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()),
    ).toEqual(['r-boundary']);
  });

  it('deletes rows with no updatedAt field (no protection signal)', () => {
    const local = [
      { id: 'r-nofield', someOther: 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()),
    ).toEqual(['r-nofield']);
  });

  it('keeps rows that exist in cloud regardless of updatedAt', () => {
    const local = [
      { id: 'r-known', updatedAt: NOW - 10 * PENDING_PUSH_PROTECTION_MS },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(['r-known']), 'id', NOW, new Set<string>()),
    ).toEqual([]);
  });

  it('honors a non-id primary-key field (idField param)', () => {
    const local = [
      { skillId: 's-stale', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
      { skillId: 's-known', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(['s-known']), 'skillId', NOW, new Set<string>()),
    ).toEqual(['s-stale']);
  });

  it('ignores rows with missing / non-string ids', () => {
    const local = [
      { id: '', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
      { id: 42, updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
      { id: 'real', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()),
    ).toEqual(['real']);
  });

  it('mixes protected + stale + cloud rows correctly', () => {
    const local = [
      // Recently saved 'Ab' row — the original bug case.
      { id: 'songkey-No-Weapon-Ab', updatedAt: NOW - 500 },
      // Old row absent from cloud (a deleted-on-another-device case).
      { id: 'songkey-Old-Song-C', updatedAt: NOW - 24 * 60 * 60 * 1000 },
      // Existing row that's also in cloud.
      { id: 'songkey-Other-Song-G', updatedAt: NOW - 60 * 60 * 1000 },
    ];
    const cloud = new Set(['songkey-Other-Song-G']);
    expect(
      computeOrphanIdsForReplacePull(local, cloud, 'id', NOW, new Set<string>()),
    ).toEqual(['songkey-Old-Song-C']);
  });
});

describe('rowRecency', () => {
  it('reads exactly the three row-lifecycle fields', () => {
    expect([...ROW_RECENCY_FIELDS]).toEqual(['updatedAt', 'timestamp', 'createdAt']);
  });

  it('takes the newest of several, not the first present', () => {
    // Order in ROW_RECENCY_FIELDS must not decide the answer — a row
    // carrying an old updatedAt and a fresh timestamp is fresh.
    expect(rowRecency({ updatedAt: 100, timestamp: 900, createdAt: 500 })).toBe(900);
    expect(rowRecency({ updatedAt: 900, timestamp: 100 })).toBe(900);
  });

  it('returns null when the row carries no lifecycle timestamp', () => {
    expect(rowRecency({ id: 'x' })).toBeNull();
    expect(rowRecency({})).toBeNull();
  });

  it('ignores non-numeric and non-finite values', () => {
    // A string date or a NaN would otherwise poison the comparison and
    // silently drop protection.
    expect(rowRecency({ timestamp: '2026-08-13' })).toBeNull();
    expect(rowRecency({ timestamp: NaN })).toBeNull();
    expect(rowRecency({ timestamp: Infinity })).toBeNull();
    expect(rowRecency({ timestamp: NaN, createdAt: 700 })).toBe(700);
  });
});

describe('pending-push protection across the real schema', () => {
  const fresh = NOW - 1_000;
  const stale = NOW - PENDING_PUSH_PROTECTION_MS - 1;

  it('protects a just-logged drillSession, which carries timestamp not updatedAt', () => {
    // The row shape logSession() actually writes (drillModel.ts) — no
    // updatedAt anywhere on it. Before the fallback this was deleted.
    const local = [{
      id: 'dses-a1b2c3-abc',
      drillTypeId: 'dt-1',
      skillId: 'sk-1',
      hand: 'both',
      durationSeconds: 90,
      feelRating: 3,
      timestamp: fresh,
    }];
    expect(computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>())).toEqual([]);
  });

  it('protects a just-logged songCellRunThrough, which carries createdAt not timestamp', () => {
    // The three matrix tables use createdAt. A timestamp-only fallback
    // would still have deleted this one.
    const local = [{
      id: 'scrt-1',
      cellId: 'cell-1',
      songId: 'song-1',
      sectionId: 'sec-1',
      songKeyId: 'sk-1',
      wasClean: true,
      createdAt: fresh,
    }];
    expect(computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>())).toEqual([]);
  });

  it('protects a just-written songPracticeLog and productionLessonSession', () => {
    const local = [
      { id: 'plog-1', songId: 's1', durationMin: 20, feelRating: 4, timestamp: fresh },
      { id: 'pls-1', lessonId: 'wf-01', timestamp: fresh },
    ];
    expect(computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>())).toEqual([]);
  });

  it('still deletes those same rows once they are genuinely stale', () => {
    // The protection must be a window, not a blanket exemption —
    // otherwise deletes made on another device never propagate.
    const local = [
      { id: 'dses-old', timestamp: stale },
      { id: 'scrt-old', createdAt: stale },
    ];
    expect(computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()))
      .toEqual(['dses-old', 'scrt-old']);
  });

  it('does NOT let a domain timestamp confer protection', () => {
    // engagedAt / startedAt describe when practice happened, not when
    // the row was written, and the user can date them. A future-dated
    // one would protect an orphan forever, so they are excluded.
    const local = [
      { id: 'ske-backdated', engagedAt: fresh, createdAt: stale },
      { id: 'ske-future', engagedAt: NOW + 10 * PENDING_PUSH_PROTECTION_MS, createdAt: stale },
      { id: 'pls-started', startedAt: fresh, timestamp: stale },
    ];
    expect(computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>()))
      .toEqual(['ske-backdated', 'ske-future', 'pls-started']);
  });

  it('protects an attempt row, which is why this lands before attempts sync', () => {
    // AttemptRecord carries timestamp only. Step 6b adds the table to
    // SYNC_TABLES; without this fallback its rows would be exposed to
    // orphan deletion from the moment it starts syncing.
    const local = [{
      id: 'att-11111111-2222-3333-4444-555555555555',
      moduleId: 'intervals',
      itemId: 'm3',
      correct: true,
      timestamp: fresh,
    }];
    expect(computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set<string>())).toEqual([]);
  });
});

describe('a queued write is not an orphan', () => {
  // The sweep used to ignore the sync queue entirely, while the
  // bulkPut a few lines below it had consulted the queue for a long
  // time. So a row with an un-drained write was protected from being
  // OVERWRITTEN by cloud state and still eligible for DELETION for not
  // being part of it.
  it('protects a row with a pending write, even with no recency field', () => {
    const local = [{ id: 'r-queued' }];
    expect(
      computeOrphanIdsForReplacePull(
        local, new Set(), 'id', NOW, new Set(['r-queued']),
      ),
    ).toEqual([]);
  });

  it('still deletes an unqueued row beside a queued one', () => {
    const local = [{ id: 'r-queued' }, { id: 'r-orphan' }];
    expect(
      computeOrphanIdsForReplacePull(
        local, new Set(), 'id', NOW, new Set(['r-queued']),
      ),
    ).toEqual(['r-orphan']);
  });

  it('protects a spacingState-shaped row, which has no recency field at all', () => {
    // The exact shape that lost ten rows: no updatedAt, no timestamp,
    // no createdAt. Before this, nothing could protect it.
    const local = [{ id: 'sp-repertoire-both-songCell:c1', itemRef: 'songCell:c1' }];
    expect(
      computeOrphanIdsForReplacePull(
        local, new Set(), 'id', NOW, new Set(['sp-repertoire-both-songCell:c1']),
      ),
    ).toEqual([]);
  });

  it('an empty queue changes nothing about the old behaviour', () => {
    const local = [{ id: 'r-nofield' }];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW, new Set()),
    ).toEqual(['r-nofield']);
  });
});
