// @vitest-environment jsdom
/**
 * A stage the catalog does not populate is cleared, not a wall.
 *
 * =====================================================================
 * THE SHAPE OF THE NEXT CUT, TESTED BEFORE IT HAPPENS.
 *
 * `computeUnlockedStage` used to `continue` past a stage with no items
 * in it. That reads as "skip it", and it is not: `unlocked` stayed
 * where it was and the loop then met the next stage, found it
 * uncleared, and broke. So an empty stage 2 left stages 3 and 4
 * unreachable for ever — no attempt, no accuracy, no amount of
 * practice would open them, because the gate was on items that no
 * longer existed.
 *
 * The catalog populates all four stages today, which is exactly why
 * this needs a fixture: nothing in the live data can reach the branch,
 * and the cut of 9 Sep 2026 came within one classification of doing so.
 * The catalog is mocked down to two progressions, leaving stage 2 and
 * stage 4 empty.
 * =====================================================================
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../catalog', () => ({
  // One stage-1 progression and one stage-3. Stage 2 and stage 4 have
  // nothing, which is the case being tested.
  PROGRESSIONS: [{ id: '1-4-5' }, { id: '2-5-1' }],
}));

const { computeUnlockedStage, itemsForStage } = await import('../progressionTierUnlock');

describe('an empty stage', () => {
  it('is empty in the fixture, so the test is not passing vacuously', () => {
    expect(itemsForStage(1)).toEqual(['1-4-5']);
    expect(itemsForStage(2)).toEqual([]);
    expect(itemsForStage(3)).toEqual(['2-5-1']);
    expect(itemsForStage(4)).toEqual([]);
  });

  it('does not hold the reader at the stage below it', () => {
    const stage1Done = new Map([['1-4-5', { passes: 10, total: 10 }]]);
    // Stage 1 cleared, stage 2 empty, so the walk should carry through
    // it and stop at stage 3, which has an item and is not cleared.
    expect(computeUnlockedStage(stage1Done)).toBe(3);
  });

  it('still stops at the first stage that has items and is unfinished', () => {
    expect(computeUnlockedStage(new Map())).toBe(1);
  });

  it('opens the top when the only populated stages are cleared', () => {
    const all = new Map([
      ['1-4-5', { passes: 10, total: 10 }],
      ['2-5-1', { passes: 10, total: 10 }],
    ]);
    expect(computeUnlockedStage(all)).toBe(4);
  });
});
