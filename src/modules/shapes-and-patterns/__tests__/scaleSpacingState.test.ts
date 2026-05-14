// @vitest-environment jsdom
/**
 * Scales submodule Part 2 — verifies that scale itemRefs flow
 * through the same lazy spacingState path chord shapes use. No
 * eager seeding on goal creation; rows materialise on first
 * engagement, exactly as for chord shapes.
 *
 * Pins three pieces of the integration contract:
 *
 *   1. recordEngagement accepts both 3-part (major / nat-min) and
 *      4-part (major-pent / minor-pent with starting point) scale
 *      itemRefs against moduleRef='shapes-and-patterns' and writes
 *      them as procedural rows.
 *
 *   2. The broad scale_drills coverage matcher picks up rows from
 *      either shape — so a "Cover all scales" S&P goal sees pent
 *      and non-pent rows alike.
 *
 *   3. The roll-up denominator in moduleItemCounts.shapesCounts
 *      mirrors the SCALE_CELLS catalog (96 after the fan-out), not
 *      the legacy 48.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../lib/db';
import { recordEngagement } from '../../../lib/spacingState';
import { itemRefMatcherForCoverageGroup } from '../../goals/shapesCoverageGroups';
import { shapesCounts } from '../../../lib/moduleItemCounts';

beforeEach(async () => {
  await db.spacingState.clear();
});

describe('Scales lazy spacingState creation', () => {
  it('writes a procedural row on first engagement for a 3-part scale', async () => {
    await recordEngagement({
      itemRef: 'scale:major:C',
      moduleRef: 'shapes-and-patterns',
      signal: { kind: 'rating', rating: 'cruising' },
      timestamp: 1_700_000_000_000,
    });

    const rows = await db.spacingState
      .where('moduleRef').equals('shapes-and-patterns').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('scale:major:C');
    expect(rows[0].memoryType).toBe('procedural');
    expect(rows[0].acquisitionStage).toBe('acquiring');
  });

  it('writes a procedural row for a 4-part pent itemRef', async () => {
    await recordEngagement({
      itemRef: 'scale:major-pentatonic:5:Eb',
      moduleRef: 'shapes-and-patterns',
      signal: { kind: 'rating', rating: 'flying' },
    });

    const row = await db.spacingState
      .where('itemRef').equals('scale:major-pentatonic:5:Eb').first();
    expect(row).toBeDefined();
    expect(row!.moduleRef).toBe('shapes-and-patterns');
    expect(row!.memoryType).toBe('procedural');
  });
});

describe('scale_drills coverage matcher accepts pent fan-out', () => {
  it('matches both 3-part and 4-part scale itemRefs', () => {
    const matcher = itemRefMatcherForCoverageGroup('scale_drills')!;
    expect(matcher('scale:major:C')).toBe(true);
    expect(matcher('scale:natural-minor:F')).toBe(true);
    expect(matcher('scale:major-pentatonic:1:Bb')).toBe(true);
    expect(matcher('scale:minor-pentatonic:b7:Ab')).toBe(true);
  });

  it('rejects non-scale itemRefs', () => {
    const matcher = itemRefMatcherForCoverageGroup('scale_drills')!;
    expect(matcher('chord-shape:maj:C:root')).toBe(false);
    expect(matcher('vl:aba-251:C')).toBe(false);
  });
});

describe('shapesCounts.scaleDrills tracks the SCALE_CELLS catalog', () => {
  it('reports 96 cells (post-Scales fan-out), not the legacy 48', () => {
    const c = shapesCounts();
    expect(c.scaleDrills).toBe(96);
  });
});
