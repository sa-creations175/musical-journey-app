/**
 * Tests for computeRowsToBulkPut — the pull's overwrite filter that
 * decides which fetched cloud rows actually get bulkPut over local
 * state. Two guards:
 *   1. pending-write guard — never overwrite a row that still has an
 *      un-pushed local write in the sync queue (the "save during a
 *      session, then a focus-triggered pull reverts it" race).
 *   2. last-write-wins — never overwrite a local row whose `updatedAt`
 *      is strictly newer than the cloud copy's. Missing timestamps on
 *      either side fall through to the legacy overwrite.
 */
import { describe, expect, it } from 'vitest';
import { computeRowsToBulkPut } from '../engine';

type Row = Record<string, unknown>;
const localMap = (rows: Row[]) =>
  new Map<string, Row>(rows.map(r => [r.id as string, r]));

describe('computeRowsToBulkPut', () => {
  it('writes a cloud row that has no local counterpart', () => {
    const cloud = [{ id: 'a', updatedAt: 100 }];
    const out = computeRowsToBulkPut(cloud, new Set(), localMap([]), 'id');
    expect(out.map(r => r.id)).toEqual(['a']);
  });

  it('skips a cloud row with a pending local write (any operation)', () => {
    const cloud = [
      { id: 'a', updatedAt: 100 },
      { id: 'b', updatedAt: 100 },
    ];
    const local = localMap([
      { id: 'a', updatedAt: 50 },
      { id: 'b', updatedAt: 50 },
    ]);
    const out = computeRowsToBulkPut(cloud, new Set(['a']), local, 'id');
    expect(out.map(r => r.id)).toEqual(['b']);
  });

  it('skips a cloud row when the local copy is strictly newer (LWW)', () => {
    const cloud = [{ id: 'a', updatedAt: 100 }];
    const local = localMap([{ id: 'a', updatedAt: 200 }]);
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'id');
    expect(out).toEqual([]);
  });

  it('writes a cloud row when the cloud copy is newer', () => {
    const cloud = [{ id: 'a', updatedAt: 300 }];
    const local = localMap([{ id: 'a', updatedAt: 200 }]);
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'id');
    expect(out.map(r => r.id)).toEqual(['a']);
  });

  it('overwrites on a timestamp tie (cloud is canonical)', () => {
    const cloud = [{ id: 'a', updatedAt: 200 }];
    const local = localMap([{ id: 'a', updatedAt: 200 }]);
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'id');
    expect(out.map(r => r.id)).toEqual(['a']);
  });

  it('overwrites when local has no updatedAt but cloud does (cloud wins)', () => {
    const cloud = [{ id: 'a', updatedAt: 100 }];
    const local = localMap([{ id: 'a' }]); // legacy / pre-migration local row
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'id');
    expect(out.map(r => r.id)).toEqual(['a']);
  });

  it('local wins when local has updatedAt and cloud does NOT (pre-fix cloud row)', () => {
    const cloud = [{ id: 'a' }]; // pre-fix cloud row, no updatedAt in data blob
    const local = localMap([{ id: 'a', updatedAt: 999 }]);
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'id');
    expect(out).toEqual([]);
  });

  it('overwrites when neither side has updatedAt (legacy table behavior)', () => {
    const cloud = [{ id: 'a' }];
    const local = localMap([{ id: 'a' }]);
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'id');
    expect(out.map(r => r.id)).toEqual(['a']);
  });

  it('ignores rows with a missing or empty id', () => {
    const cloud = [
      { id: '', updatedAt: 100 },
      { updatedAt: 100 },
      { id: 'ok', updatedAt: 100 },
    ];
    const out = computeRowsToBulkPut(cloud, new Set(), localMap([]), 'id');
    expect(out.map(r => r.id)).toEqual(['ok']);
  });

  it('honors a non-default idField', () => {
    const cloud = [{ skillId: 'x', updatedAt: 100 }];
    const local = new Map<string, Row>([['x', { skillId: 'x', updatedAt: 200 }]]);
    const out = computeRowsToBulkPut(cloud, new Set(), local, 'skillId');
    expect(out).toEqual([]);
  });

  it('applies both guards together across a batch', () => {
    const cloud = [
      { id: 'pending', updatedAt: 100 }, // excluded by pending guard
      { id: 'localNewer', updatedAt: 100 }, // excluded by LWW
      { id: 'cloudNewer', updatedAt: 300 }, // written
      { id: 'brandNew', updatedAt: 100 }, // written (no local)
    ];
    const local = localMap([
      { id: 'pending', updatedAt: 50 },
      { id: 'localNewer', updatedAt: 500 },
      { id: 'cloudNewer', updatedAt: 200 },
    ]);
    const out = computeRowsToBulkPut(cloud, new Set(['pending']), local, 'id');
    expect(out.map(r => r.id).sort()).toEqual(['brandNew', 'cloudNewer']);
  });
});
