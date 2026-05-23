// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type VoicingPattern } from '../../../lib/db';
import {
  orderVoicingCandidates,
  loadVoicingCandidates,
  createUserVoicingPattern,
} from '../voicingPatterns';

function pat(id: string, over: Partial<VoicingPattern> = {}): VoicingPattern {
  return {
    id,
    qualityId: 'maj7',
    label: id,
    offsets: [{ offset: 12, hand: 'R' }],
    isSystem: true,
    sortOrder: 0,
    source: 'seventh-inv',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('orderVoicingCandidates', () => {
  it('orders pinned (in pin order) → user → system, then by sortOrder', () => {
    const patterns = [
      pat('sys-a', { isSystem: true, sortOrder: 1 }),
      pat('sys-b', { isSystem: true, sortOrder: 0 }),
      pat('user-a', { isSystem: false, sortOrder: 5 }),
      pat('user-b', { isSystem: false, sortOrder: 9 }),
    ];
    const ordered = orderVoicingCandidates(patterns, ['user-b', 'sys-a']);
    expect(ordered.map(p => p.id)).toEqual([
      'user-b', // pinned, pin order 0
      'sys-a',  // pinned, pin order 1
      'user-a', // user, not pinned
      'sys-b',  // system, not pinned (lowest sortOrder among system)
    ]);
  });

  it('does not mutate the input array', () => {
    const patterns = [pat('a'), pat('b')];
    const copy = [...patterns];
    orderVoicingCandidates(patterns, []);
    expect(patterns).toEqual(copy);
  });
});

describe('loadVoicingCandidates + createUserVoicingPattern', () => {
  beforeEach(async () => {
    await db.voicingPatterns.clear();
  });

  it('returns quality patterns plus pinned-by-id extras, deduped', async () => {
    await db.voicingPatterns.bulkPut([
      pat('maj7-root', { qualityId: 'maj7' }),
      pat('maj7-inv1', { qualityId: 'maj7' }),
      pat('min7-root', { qualityId: 'min7' }), // other quality
    ]);
    // Pin one maj7 (already in set → no dupe) and one min7 (outside set → added).
    const result = await loadVoicingCandidates('maj7', ['maj7-root', 'min7-root']);
    const ids = result.map(p => p.id).sort();
    expect(ids).toEqual(['maj7-inv1', 'maj7-root', 'min7-root']);
  });

  it('persists a user pattern (isSystem:false, sanitized, source user)', async () => {
    const p = await createUserVoicingPattern('dom7', [7, 0, 4, 7]);
    expect(p.isSystem).toBe(false);
    expect(p.source).toBe('user');
    expect(p.qualityId).toBe('dom7');
    expect(p.offsets).toEqual([
      { offset: 0, hand: 'R' },
      { offset: 4, hand: 'R' },
      { offset: 7, hand: 'R' },
    ]); // deduped + sorted
    const stored = await db.voicingPatterns.get(p.id);
    expect(stored).toEqual(p);
  });

  it('uses a default label, or a custom name when provided ("Save to library")', async () => {
    const def = await createUserVoicingPattern('maj7', [{ offset: 0, hand: 'R' }]);
    expect(def.label).toBe('Saved voicing');

    const named = await createUserVoicingPattern(
      'maj7',
      [{ offset: 0, hand: 'R' }],
      'Drop 2',
    );
    expect(named.label).toBe('Drop 2');
    expect((await db.voicingPatterns.get(named.id))?.label).toBe('Drop 2');
  });
});
