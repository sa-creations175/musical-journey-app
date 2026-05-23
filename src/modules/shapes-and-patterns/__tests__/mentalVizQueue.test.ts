import { describe, it, expect } from 'vitest';
import { orderMentalVizQueue } from '../mentalVizQueue';
import { MENTAL_VIZ_ITEMS } from '../mentalVizLibrary';

const NOW = 1_000_000;

describe('orderMentalVizQueue', () => {
  it('returns the whole library, unseen items leading', () => {
    const a = MENTAL_VIZ_ITEMS[0].itemRef;
    const b = MENTAL_VIZ_ITEMS[1].itemRef;
    // a + b seen with FUTURE due dates; everything else unseen.
    const q = orderMentalVizQueue([
      { itemRef: a, nextDueAt: NOW + 100_000 },
      { itemRef: b, nextDueAt: NOW + 50_000 },
    ]);
    expect(q).toHaveLength(MENTAL_VIZ_ITEMS.length);
    // Unseen lead; the two future-due items sink to the tail.
    expect(q[0].itemRef).not.toBe(a);
    expect(q[0].itemRef).not.toBe(b);
    const tail = q.slice(-2).map(i => i.itemRef);
    expect(tail).toContain(a);
    expect(tail).toContain(b);
    // b due sooner than a → b before a.
    const ia = q.findIndex(i => i.itemRef === a);
    const ib = q.findIndex(i => i.itemRef === b);
    expect(ib).toBeLessThan(ia);
  });

  it('orders overdue items ahead of not-yet-due when all are seen', () => {
    const overdue = MENTAL_VIZ_ITEMS[5].itemRef;
    const rows = MENTAL_VIZ_ITEMS.map((it, idx) => ({
      itemRef: it.itemRef,
      nextDueAt: it.itemRef === overdue ? NOW - 5_000 : NOW + 100_000 + idx,
    }));
    const q = orderMentalVizQueue(rows);
    expect(q[0].itemRef).toBe(overdue);
  });
});
