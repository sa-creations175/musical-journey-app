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
  computeOrphanIdsForReplacePull,
} from '../engine';

const NOW = 1_700_000_000_000;

describe('computeOrphanIdsForReplacePull', () => {
  it('deletes local rows that are absent from cloud and stale', () => {
    const local = [
      { id: 'r-old', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW),
    ).toEqual(['r-old']);
  });

  it('protects rows whose updatedAt is within the protection window', () => {
    const local = [
      { id: 'r-recent', updatedAt: NOW - 1_000 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW),
    ).toEqual([]);
  });

  it('treats the protection window as half-open: exactly at the boundary deletes', () => {
    // now - updatedAt === PENDING_PUSH_PROTECTION_MS is NOT "less than",
    // so the row passes through to deletion. The window is strict <.
    const local = [
      { id: 'r-boundary', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW),
    ).toEqual(['r-boundary']);
  });

  it('deletes rows with no updatedAt field (no protection signal)', () => {
    const local = [
      { id: 'r-nofield', someOther: 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW),
    ).toEqual(['r-nofield']);
  });

  it('keeps rows that exist in cloud regardless of updatedAt', () => {
    const local = [
      { id: 'r-known', updatedAt: NOW - 10 * PENDING_PUSH_PROTECTION_MS },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(['r-known']), 'id', NOW),
    ).toEqual([]);
  });

  it('honors a non-id primary-key field (idField param)', () => {
    const local = [
      { skillId: 's-stale', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
      { skillId: 's-known', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(['s-known']), 'skillId', NOW),
    ).toEqual(['s-stale']);
  });

  it('ignores rows with missing / non-string ids', () => {
    const local = [
      { id: '', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
      { id: 42, updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
      { id: 'real', updatedAt: NOW - PENDING_PUSH_PROTECTION_MS - 1 },
    ];
    expect(
      computeOrphanIdsForReplacePull(local, new Set(), 'id', NOW),
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
      computeOrphanIdsForReplacePull(local, cloud, 'id', NOW),
    ).toEqual(['songkey-Old-Song-C']);
  });
});
