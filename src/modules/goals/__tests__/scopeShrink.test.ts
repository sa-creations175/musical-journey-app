/**
 * A coverage goal's target is a frozen count. The 20 Aug 2026
 * chord-shape cut took the module from 1320 items to 1116 and emptied
 * every extension sub-area, so goals saved before it can now be
 * unreachable. These pin that the app SAYS so rather than rewriting the
 * number the user chose.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../lib/db';
import { detectScopeShrink, describeScopeShrink } from '../scopeShrink';

function mkGoal(patch: Partial<Goal>): Goal {
  return {
    id: 'g1',
    scope: 'monthly',
    description: 'test goal',
    targetMetric: 'shapes_coverage_at_acquired',
    targetValue: 100,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: ['shapes-and-patterns'],
    relatedItems: [],
    startDate: 0,
    targetDate: 0,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...patch,
  } as Goal;
}

describe('detectScopeShrink', () => {
  it('leaves a reachable goal alone', () => {
    // 100 of the 1116 items that exist post-cut.
    expect(detectScopeShrink(mkGoal({ targetValue: 100 }))).toBeNull();
  });

  it('flags an overall goal whose target outlived the catalog', () => {
    // 852 + 96 + 372 = 1320 was the pre-cut module total.
    const shrink = detectScopeShrink(mkGoal({ targetValue: 1320 }));
    expect(shrink).not.toBeNull();
    expect(shrink!.storedTarget).toBe(1320);
    expect(shrink!.availableNow).toBe(1116);
    expect(shrink!.isEmpty).toBe(false);
  });

  it('flags a sub-area goal whose scope is now empty, and names it', () => {
    const shrink = detectScopeShrink(mkGoal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_extensions',
      targetValue: 168,
    }));
    expect(shrink).not.toBeNull();
    expect(shrink!.isEmpty).toBe(true);
    expect(shrink!.availableNow).toBe(0);
    // The def is kept at denominator 0 exactly so this resolves.
    expect(shrink!.scopeLabel).toBeTruthy();
  });

  it('leaves a surviving sub-area alone', () => {
    expect(detectScopeShrink(mkGoal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_triads',
      targetValue: 288,
    }))).toBeNull();
  });

  it('skips umbrellas — children report their own shrink', () => {
    expect(detectScopeShrink(mkGoal({ isUmbrella: true, targetValue: 9999 }))).toBeNull();
  });

  it('skips non-coverage goals and targetless goals', () => {
    expect(detectScopeShrink(mkGoal({
      targetMetric: 'ear_training_accuracy_overall', targetValue: 90,
    }))).toBeNull();
    expect(detectScopeShrink(mkGoal({ targetValue: null }))).toBeNull();
  });
});

describe('describeScopeShrink', () => {
  it('never proposes a replacement number', () => {
    const shrink = detectScopeShrink(mkGoal({ targetValue: 1320 }))!;
    const text = describeScopeShrink(shrink);
    expect(text).toContain('1116');
    expect(text).toContain('1320');
    // The whole point is handing the decision back, so no "change it
    // to N" phrasing.
    expect(text).not.toMatch(/change it to|we('| ha)ve (set|updated)|now targets/i);
  });

  it('says an empty scope is empty rather than reporting 0 items', () => {
    const shrink = detectScopeShrink(mkGoal({
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_extensions',
      targetValue: 168,
    }))!;
    expect(describeScopeShrink(shrink)).toMatch(/no longer has any items/);
  });
});
