// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type VoicingPattern } from '../../../lib/db';
import { markSyncReady } from '../../../lib/sync/syncReady';
import { QUALITY_INTERVALS } from '../catalog';
import {
  buildSystemVoicingPatterns,
  seedVoicingPatternsIfNeeded,
} from '../seedVoicingPatterns';

describe('buildSystemVoicingPatterns', () => {
  const patterns = buildSystemVoicingPatterns();

  it('produces the expected catalog size + per-source breakdown', () => {
    expect(patterns).toHaveLength(67);
    const bySource = patterns.reduce<Record<string, number>>((acc, p) => {
      acc[p.source] = (acc[p.source] ?? 0) + 1;
      return acc;
    }, {});
    expect(bySource).toEqual({
      'triad-inv': 18,
      'seventh-inv': 24,
      extension: 14,
      special: 3,
      'extended-dom': 8,
    });
  });

  it('has unique, stable ids', () => {
    const ids = patterns.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Re-running the pure builder yields byte-identical output.
    expect(buildSystemVoicingPatterns()).toEqual(patterns);
  });

  it('every qualityId is a key of QUALITY_INTERVALS', () => {
    for (const p of patterns) {
      expect(p.qualityId in QUALITY_INTERVALS).toBe(true);
    }
  });

  it('all rows are isSystem and offsets are non-negative + strictly ascending', () => {
    for (const p of patterns) {
      expect(p.isSystem).toBe(true);
      expect(p.offsets.length).toBeGreaterThan(0);
      let prev = -1;
      for (const e of p.offsets) {
        expect(e.offset).toBeGreaterThanOrEqual(0);
        expect(e.offset).toBeGreaterThan(prev); // strictly ascending
        expect(e.hand === 'L' || e.hand === 'R').toBe(true);
        prev = e.offset;
      }
    }
  });
});

describe('seedVoicingPatternsIfNeeded', () => {
  beforeEach(async () => {
    markSyncReady();
    await db.voicingPatterns.clear();
  });

  it('seeds the full system catalog and is idempotent', async () => {
    await seedVoicingPatternsIfNeeded();
    const first = await db.voicingPatterns.toArray();
    expect(first).toHaveLength(67);
    expect(first.every(p => p.isSystem)).toBe(true);

    await seedVoicingPatternsIfNeeded();
    const second = await db.voicingPatterns.toArray();
    expect(second).toHaveLength(67); // no duplicates on re-run
  });

  it('prunes obsolete system rows but never touches user rows', async () => {
    const bogusSystem: VoicingPattern = {
      id: 'vp:sys:bogus:x',
      qualityId: 'maj',
      label: 'Obsolete',
      offsets: [{ offset: 12, hand: 'R' }],
      isSystem: true,
      sortOrder: 0,
      source: 'triad-inv',
      createdAt: 0,
      updatedAt: 0,
    };
    const userRow: VoicingPattern = {
      id: 'user-uuid-1',
      qualityId: 'maj7',
      label: 'My voicing',
      offsets: [{ offset: 12, hand: 'L' }, { offset: 16, hand: 'R' }],
      isSystem: false,
      sortOrder: 0,
      source: 'user',
      createdAt: 1,
      updatedAt: 1,
    };
    await db.voicingPatterns.bulkPut([bogusSystem, userRow]);

    await seedVoicingPatternsIfNeeded();

    expect(await db.voicingPatterns.get('vp:sys:bogus:x')).toBeUndefined();
    expect(await db.voicingPatterns.get('user-uuid-1')).toEqual(userRow);
    const systemCount = (await db.voicingPatterns.toArray()).filter(
      p => p.isSystem,
    ).length;
    expect(systemCount).toBe(67);
  });
});
