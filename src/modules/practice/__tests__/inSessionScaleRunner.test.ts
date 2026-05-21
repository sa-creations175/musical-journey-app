import { describe, it, expect } from 'vitest';
import {
  resolveScaleRunnerItems,
  isScaleRunnerBlock,
} from '../inSessionScaleRunner';

describe('resolveScaleRunnerItems', () => {
  it('maps scale itemRefs to cells in order, preserving seconds', () => {
    const rows = resolveScaleRunnerItems([
      { itemRef: 'scale:major:C', seconds: 30 },
      { itemRef: 'scale:natural-minor:C', seconds: 90 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].itemRef).toBe('scale:major:C');
    expect(rows[0].seconds).toBe(30);
    expect(rows[0].cell.kind).toBe('major');
    expect(rows[1].cell.kind).toBe('natural-minor');
  });

  it('drops non-scale itemRefs', () => {
    const rows = resolveScaleRunnerItems([
      { itemRef: 'scale:major:C', seconds: 30 },
      { itemRef: 'chord-shape:maj7:C', seconds: 90 },
      { itemRef: 'not-a-ref', seconds: 10 },
    ]);
    expect(rows.map(r => r.itemRef)).toEqual(['scale:major:C']);
  });
});

describe('isScaleRunnerBlock', () => {
  it('is true when the first item is a scale cell', () => {
    expect(isScaleRunnerBlock([{ itemRef: 'scale:major:C', seconds: 30 }])).toBe(true);
  });

  it('is false for chord-shapes, empty, or null', () => {
    expect(isScaleRunnerBlock([{ itemRef: 'chord-shape:maj7:C', seconds: 90 }])).toBe(false);
    expect(isScaleRunnerBlock([])).toBe(false);
    expect(isScaleRunnerBlock(null)).toBe(false);
    expect(isScaleRunnerBlock(undefined)).toBe(false);
  });
});
