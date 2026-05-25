import { describe, expect, it } from 'vitest';
import { planSectionMove, type SectionOrderRow } from '../sectionReorder';

// Sorted-by-order list, contiguous order values.
const sections: SectionOrderRow[] = [
  { id: 'a', order: 0 },
  { id: 'b', order: 1 },
  { id: 'c', order: 2 },
];

describe('planSectionMove', () => {
  it('moves a middle section up by swapping order with the section above', () => {
    const plan = planSectionMove(sections, 'b', -1);
    expect(plan).toEqual({
      moved: { id: 'b', order: 0 },
      neighbour: { id: 'a', order: 1 },
    });
  });

  it('moves a middle section down by swapping order with the section below', () => {
    const plan = planSectionMove(sections, 'b', 1);
    expect(plan).toEqual({
      moved: { id: 'b', order: 2 },
      neighbour: { id: 'c', order: 1 },
    });
  });

  it('returns null at the top boundary (first section cannot move up)', () => {
    expect(planSectionMove(sections, 'a', -1)).toBeNull();
  });

  it('returns null at the bottom boundary (last section cannot move down)', () => {
    expect(planSectionMove(sections, 'c', 1)).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(planSectionMove(sections, 'zzz', 1)).toBeNull();
  });

  it('swaps the actual order values, not indices (non-contiguous order)', () => {
    // Still sorted by order, but values are sparse (10, 20, 30).
    const sparse: SectionOrderRow[] = [
      { id: 'x', order: 10 },
      { id: 'y', order: 20 },
      { id: 'z', order: 30 },
    ];
    const plan = planSectionMove(sparse, 'z', -1);
    expect(plan).toEqual({
      moved: { id: 'z', order: 20 },
      neighbour: { id: 'y', order: 30 },
    });
  });
});
