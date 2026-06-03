// @vitest-environment jsdom
/**
 * Month-start cleanup — previous-month unrecoverable detection
 * (pure picker) + cascade bulk delete (fake-indexeddb).
 *
 * Fixture date: June 2 2026 — May is the previous month, April is
 * two months back. Mirrors the carryover.test.ts convention of
 * anchoring far enough from month boundaries that the math is
 * unambiguous.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  deleteGoalsWithCascade,
  pickPreviousMonthUnrecoverable,
  type AnnotatedGoal,
} from '../monthEndCleanup';
import type { GoalFeasibility } from '../progress';

const TODAY = new Date(2026, 5, 2, 9, 0, 0); // June 2 2026
const MAY_END = new Date(2026, 4, 31, 23, 59, 59).getTime();
const APRIL_END = new Date(2026, 3, 30, 23, 59, 59).getTime();
const JUNE_END = new Date(2026, 5, 30, 23, 59, 59).getTime();

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    scope: 'monthly',
    description: '',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 10,
    targetUnit: 'cards',
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: new Date(2026, 4, 1).getTime(),
    targetDate: MAY_END,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

const UNRECOVERABLE: GoalFeasibility = {
  kind: 'measurable',
  status: 'unrecoverable',
  projected: 2,
  target: 10,
  currentValue: 2,
  daysRemaining: 0,
  recommendation: '',
};

const ON_TRACK: GoalFeasibility = {
  kind: 'measurable',
  status: 'on_track',
  projected: 10,
  target: 10,
  currentValue: 10,
  daysRemaining: 0,
  recommendation: '',
};

const UNKNOWN: GoalFeasibility = { kind: 'unknown' };

function annotate(goal: Goal, feasibility: GoalFeasibility): AnnotatedGoal {
  return { goal, feasibility };
}

// -------------------------------------------------------------
// pickPreviousMonthUnrecoverable — pure picker
// -------------------------------------------------------------

describe('pickPreviousMonthUnrecoverable', () => {
  it('picks previous-month unrecoverable monthly goals', () => {
    const result = pickPreviousMonthUnrecoverable(
      [
        annotate(mkGoal({ id: 'may-1' }), UNRECOVERABLE),
        annotate(mkGoal({ id: 'may-2' }), UNRECOVERABLE),
      ],
      TODAY,
    );
    expect(result.goalIds.sort()).toEqual(['may-1', 'may-2']);
    expect(result.count).toBe(2);
    expect(result.monthLabel).toBe('May');
  });

  it('excludes goals that hit their target (on_track past deadline)', () => {
    const result = pickPreviousMonthUnrecoverable(
      [
        annotate(mkGoal({ id: 'missed' }), UNRECOVERABLE),
        annotate(mkGoal({ id: 'hit', currentValue: 10 }), ON_TRACK),
      ],
      TODAY,
    );
    expect(result.goalIds).toEqual(['missed']);
    expect(result.count).toBe(1);
  });

  it('excludes current-month goals even when unrecoverable', () => {
    const result = pickPreviousMonthUnrecoverable(
      [annotate(mkGoal({ id: 'june', targetDate: JUNE_END }), UNRECOVERABLE)],
      TODAY,
    );
    expect(result.goalIds).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('excludes non-monthly scopes and non-active statuses', () => {
    const result = pickPreviousMonthUnrecoverable(
      [
        annotate(
          mkGoal({ id: 'weekly', scope: 'weekly', targetDate: MAY_END }),
          UNRECOVERABLE,
        ),
        annotate(
          mkGoal({ id: 'yearly', scope: 'yearly', targetDate: MAY_END }),
          UNRECOVERABLE,
        ),
        annotate(mkGoal({ id: 'done', status: 'completed' }), UNRECOVERABLE),
        annotate(mkGoal({ id: 'gone', status: 'abandoned' }), UNRECOVERABLE),
      ],
      TODAY,
    );
    expect(result.goalIds).toEqual([]);
  });

  it('never counts unknown-kind feasibilities as unrecoverable', () => {
    const result = pickPreviousMonthUnrecoverable(
      [annotate(mkGoal({ id: 'mystery', targetMetric: 'count_completed' }), UNKNOWN)],
      TODAY,
    );
    expect(result.goalIds).toEqual([]);
  });

  it('includes umbrella container only when ALL children are dismissed', () => {
    const allGone = pickPreviousMonthUnrecoverable(
      [
        annotate(mkGoal({ id: 'umb', isUmbrella: true, targetMetric: null }), UNKNOWN),
        annotate(mkGoal({ id: 'c1', parentGoalId: 'umb' }), UNRECOVERABLE),
        annotate(mkGoal({ id: 'c2', parentGoalId: 'umb' }), UNRECOVERABLE),
      ],
      TODAY,
    );
    expect(allGone.goalIds.sort()).toEqual(['c1', 'c2', 'umb']);
    // Container is bookkeeping — banner counts the two leaves.
    expect(allGone.count).toBe(2);

    const oneSurvives = pickPreviousMonthUnrecoverable(
      [
        annotate(mkGoal({ id: 'umb', isUmbrella: true, targetMetric: null }), UNKNOWN),
        annotate(mkGoal({ id: 'c1', parentGoalId: 'umb' }), UNRECOVERABLE),
        annotate(mkGoal({ id: 'c2', parentGoalId: 'umb', currentValue: 10 }), ON_TRACK),
      ],
      TODAY,
    );
    expect(oneSurvives.goalIds).toEqual(['c1']);
    expect(oneSurvives.count).toBe(1);
  });

  it('keeps an empty previous-month umbrella (nothing to dismiss under it)', () => {
    const result = pickPreviousMonthUnrecoverable(
      [annotate(mkGoal({ id: 'umb', isUmbrella: true, targetMetric: null }), UNKNOWN)],
      TODAY,
    );
    expect(result.goalIds).toEqual([]);
  });

  it('labels by month when all goals share one, null when mixed', () => {
    const mixed = pickPreviousMonthUnrecoverable(
      [
        annotate(mkGoal({ id: 'may' }), UNRECOVERABLE),
        annotate(mkGoal({ id: 'april', targetDate: APRIL_END }), UNRECOVERABLE),
      ],
      TODAY,
    );
    expect(mixed.count).toBe(2);
    expect(mixed.monthLabel).toBeNull();

    const aprilOnly = pickPreviousMonthUnrecoverable(
      [annotate(mkGoal({ id: 'april', targetDate: APRIL_END }), UNRECOVERABLE)],
      TODAY,
    );
    expect(aprilOnly.monthLabel).toBe('April');
  });

  it('handles the year boundary (January sees December goals)', () => {
    const january = new Date(2027, 0, 3, 9, 0, 0);
    const decemberEnd = new Date(2026, 11, 31, 23, 59, 59).getTime();
    const result = pickPreviousMonthUnrecoverable(
      [annotate(mkGoal({ id: 'dec', targetDate: decemberEnd }), UNRECOVERABLE)],
      january,
    );
    expect(result.goalIds).toEqual(['dec']);
    expect(result.monthLabel).toBe('December');
  });
});

// -------------------------------------------------------------
// deleteGoalsWithCascade — Dexie-backed bulk delete
// -------------------------------------------------------------

describe('deleteGoalsWithCascade', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('deletes exactly the given non-umbrella goals', async () => {
    await db.goals.bulkAdd([
      mkGoal({ id: 'a' }),
      mkGoal({ id: 'b' }),
      mkGoal({ id: 'keep' }),
    ]);
    await deleteGoalsWithCascade(['a', 'b']);
    const remaining = await db.goals.toArray();
    expect(remaining.map(g => g.id)).toEqual(['keep']);
  });

  it('cascades umbrella deletion into same-scope children', async () => {
    await db.goals.bulkAdd([
      mkGoal({ id: 'umb', isUmbrella: true, targetMetric: null }),
      mkGoal({ id: 'child-1', parentGoalId: 'umb' }),
      mkGoal({ id: 'child-2', parentGoalId: 'umb' }),
      mkGoal({ id: 'unrelated' }),
    ]);
    await deleteGoalsWithCascade(['umb']);
    const remaining = (await db.goals.toArray()).map(g => g.id).sort();
    expect(remaining).toEqual(['unrelated']);
  });

  it('yearly umbrella cascade does NOT eat monthly stowaways', async () => {
    // The original cross-scope hazard: yearly anchors share
    // parentGoalId with both yearly children and monthly stowaways.
    // Deleting the anchor must only take the yearly children.
    await db.goals.bulkAdd([
      mkGoal({
        id: 'anchor',
        scope: 'yearly',
        isUmbrella: true,
        targetMetric: null,
        targetDate: new Date(2026, 11, 31).getTime(),
      }),
      mkGoal({
        id: 'yearly-child',
        scope: 'yearly',
        parentGoalId: 'anchor',
        targetDate: new Date(2026, 11, 31).getTime(),
      }),
      mkGoal({ id: 'monthly-stowaway', parentGoalId: 'anchor' }),
    ]);
    await deleteGoalsWithCascade(['anchor']);
    const remaining = (await db.goals.toArray()).map(g => g.id).sort();
    expect(remaining).toEqual(['monthly-stowaway']);
  });

  it('deleting a monthly goal deletes its weekly plan slices', async () => {
    // The June 2026 duplicate-weekly bug: weekly slices left behind
    // after their monthly parent was dismissed broke confirmed-plan
    // detection, and re-planning duplicated the week.
    await db.goals.bulkAdd([
      mkGoal({ id: 'may-monthly' }),
      mkGoal({
        id: 'slice-1',
        scope: 'weekly',
        parentGoalId: 'may-monthly',
        targetMetric: null,
        contributesNumericallyToParent: true,
      }),
      mkGoal({
        id: 'slice-2',
        scope: 'weekly',
        parentGoalId: 'may-monthly',
        targetMetric: null,
        contributesNumericallyToParent: true,
      }),
      // Weekly goal parented to a DIFFERENT monthly — must survive.
      mkGoal({ id: 'other-monthly' }),
      mkGoal({
        id: 'other-slice',
        scope: 'weekly',
        parentGoalId: 'other-monthly',
        targetMetric: null,
      }),
      // Standalone weekly goal (no parent) — must survive.
      mkGoal({ id: 'standalone-weekly', scope: 'weekly', parentGoalId: null }),
    ]);
    await deleteGoalsWithCascade(['may-monthly']);
    const remaining = (await db.goals.toArray()).map(g => g.id).sort();
    expect(remaining).toEqual(['other-monthly', 'other-slice', 'standalone-weekly']);
  });

  it('monthly umbrella cascade also takes its children\'s weekly slices', async () => {
    await db.goals.bulkAdd([
      mkGoal({ id: 'umb', isUmbrella: true, targetMetric: null }),
      mkGoal({ id: 'monthly-child', parentGoalId: 'umb' }),
      mkGoal({
        id: 'weekly-slice',
        scope: 'weekly',
        parentGoalId: 'monthly-child',
        targetMetric: null,
      }),
    ]);
    await deleteGoalsWithCascade(['umb']);
    expect(await db.goals.count()).toBe(0);
  });

  it('tolerates ids that no longer exist', async () => {
    await db.goals.bulkAdd([mkGoal({ id: 'real' })]);
    await deleteGoalsWithCascade(['real', 'ghost']);
    expect(await db.goals.count()).toBe(0);
  });

  it('no-ops on an empty id list', async () => {
    await db.goals.bulkAdd([mkGoal({ id: 'a' })]);
    await deleteGoalsWithCascade([]);
    expect(await db.goals.count()).toBe(1);
  });
});
