// @vitest-environment jsdom
/**
 * Tests for computeDailyGoalNeed — the pure aggregator that drives
 * the "What your goals need today" screen. Validates per-metric
 * translation, module ordering, max-take aggregation across multiple
 * goals on the same module, and the empty-input null contract.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../lib/db';
import { computeDailyGoalNeed } from '../dailyGoalNeed';
import {
  REPERTOIRE_SESSION_DEFAULT_MINUTES,
  PRODUCTION_TIME_RANGE_MINUTES,
} from '../../../lib/weeklyAttempts';

const NOW = 1_700_000_000_000;
const TARGET = NOW + 30 * 86_400_000;

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: partial.id ?? 'g',
    scope: partial.scope ?? 'monthly',
    description: partial.description ?? '',
    targetMetric: partial.targetMetric ?? null,
    targetValue: partial.targetValue ?? null,
    targetUnit: partial.targetUnit ?? null,
    currentValue: partial.currentValue ?? 0,
    contextTag: partial.contextTag ?? null,
    relatedModules: partial.relatedModules ?? [],
    relatedItems: partial.relatedItems ?? [],
    startDate: partial.startDate ?? NOW,
    targetDate: partial.targetDate ?? TARGET,
    status: partial.status ?? 'active',
    parentGoalId: partial.parentGoalId ?? null,
    contributesNumericallyToParent: partial.contributesNumericallyToParent ?? false,
    isUmbrella: partial.isUmbrella ?? false,
    lastEngagedAt: partial.lastEngagedAt ?? null,
  };
}

describe('computeDailyGoalNeed — empty / unfilterable inputs', () => {
  it('returns null when no goals exist', () => {
    expect(computeDailyGoalNeed([])).toBeNull();
  });

  it('returns null when every goal is an umbrella', () => {
    const goals = [mkGoal({ isUmbrella: true, scope: 'monthly' })];
    expect(computeDailyGoalNeed(goals)).toBeNull();
  });

  it('returns null when goals exist but none are monthly', () => {
    const goals = [mkGoal({
      scope: 'yearly',
      targetMetric: 'harmonic_fluency_days_per_cadence',
      targetValue: 5,
    })];
    expect(computeDailyGoalNeed(goals)).toBeNull();
  });
});

describe('computeDailyGoalNeed — consistency translation', () => {
  it('shapes_days_per_cadence maps to the Shapes per-day default (~20 min)', () => {
    const goals = [mkGoal({
      targetMetric: 'shapes_days_per_cadence',
      targetValue: 6,
      targetUnit: 'week',
    })];
    const out = computeDailyGoalNeed(goals);
    expect(out).not.toBeNull();
    expect(out!.entries).toHaveLength(1);
    expect(out!.entries[0].moduleId).toBe('shapes-and-patterns');
    expect(out!.entries[0].dailyMinutes).toBe(20);
    expect(out!.totalMinutes).toBe(20);
  });

  it('repertoire_days_per_cadence uses the default session minutes', () => {
    const goals = [mkGoal({
      targetMetric: 'repertoire_days_per_cadence',
      targetValue: 6,
      targetUnit: 'week',
    })];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries[0].dailyMinutes).toBe(REPERTOIRE_SESSION_DEFAULT_MINUTES);
  });

  it('production_lessons_per_cadence uses the lesson midpoint (~60 min)', () => {
    const goals = [mkGoal({
      targetMetric: 'production_lessons_per_cadence',
      targetValue: 3,
      targetUnit: 'week',
    })];
    const out = computeDailyGoalNeed(goals);
    const expected =
      (PRODUCTION_TIME_RANGE_MINUTES.minPerLesson
        + PRODUCTION_TIME_RANGE_MINUTES.maxPerLesson) / 2;
    expect(out!.entries[0].dailyMinutes).toBe(Math.round(expected));
  });

  it('practice_days_per_cadence uses the 30-min whole-app default', () => {
    const goals = [mkGoal({
      targetMetric: 'practice_days_per_cadence',
      targetValue: 6,
      targetUnit: 'week',
    })];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries[0].moduleId).toBe('practice-consistency');
    expect(out!.entries[0].dailyMinutes).toBe(30);
  });
});

describe('computeDailyGoalNeed — aggregation', () => {
  it('produces one entry per module + total = sum of entries', () => {
    const goals = [
      mkGoal({ id: 'a', targetMetric: 'shapes_days_per_cadence', targetValue: 6 }),
      mkGoal({ id: 'b', targetMetric: 'repertoire_days_per_cadence', targetValue: 6 }),
      mkGoal({ id: 'c', targetMetric: 'ear_training_days_per_cadence', targetValue: 5 }),
    ];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries).toHaveLength(3);
    const sum = out!.entries.reduce((s, e) => s + e.dailyMinutes, 0);
    expect(sum).toBe(out!.totalMinutes);
    // Shapes 20 + Repertoire 60 + ET 15 = 95 (Repertoire moved from
    // 45 → 60 in the May 2026 rebalance to cover spotlight +
    // maintenance combined).
    expect(out!.totalMinutes).toBe(95);
  });

  it('orders entries: Shapes → Repertoire → Production → HF → ET → Practice', () => {
    const goals = [
      mkGoal({ id: 'a', targetMetric: 'ear_training_days_per_cadence', targetValue: 5 }),
      mkGoal({ id: 'b', targetMetric: 'shapes_days_per_cadence', targetValue: 6 }),
      mkGoal({ id: 'c', targetMetric: 'harmonic_fluency_days_per_cadence', targetValue: 5 }),
      mkGoal({ id: 'd', targetMetric: 'repertoire_days_per_cadence', targetValue: 6 }),
    ];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries.map(e => e.moduleId)).toEqual([
      'shapes-and-patterns',
      'repertoire',
      'harmonic-fluency',
      'ear-training',
    ]);
  });

  it('takes the larger contribution when one module has multiple goals', () => {
    // Coverage + consistency on the same module describe the same
    // practice time. Sum would double-count; the helper takes max.
    const goals = [
      mkGoal({
        id: 'a',
        targetMetric: 'harmonic_fluency_days_per_cadence',
        targetValue: 5,
        targetUnit: 'week',
      }),
      // A coverage goal on the same module that translates to ~7
      // min/day (small number — wins-by-max won't fire; the
      // consistency 15 still dominates).
      mkGoal({
        id: 'b',
        targetMetric: 'harmonic_fluency_coverage_at_acquired',
        targetValue: 35,
      }),
    ];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries).toHaveLength(1);
    expect(out!.entries[0].dailyMinutes).toBe(15); // consistency default wins
  });
});

describe('computeDailyGoalNeed — Repertoire song goals', () => {
  it('song_whole_at_level contributes a Repertoire session', () => {
    const goals = [mkGoal({
      targetMetric: 'song_whole_at_level',
      targetUnit: 'comfortable',
      relatedItems: ['song-1'],
      relatedModules: ['repertoire'],
    })];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries[0].moduleId).toBe('repertoire');
    expect(out!.entries[0].dailyMinutes).toBe(REPERTOIRE_SESSION_DEFAULT_MINUTES);
  });

  it('song_of_month queue child also contributes a Repertoire session', () => {
    const goals = [mkGoal({
      targetMetric: 'song_of_month',
      targetValue: 2,
      targetUnit: 'wtl',
      relatedItems: ['wtl-1'],
      relatedModules: ['repertoire'],
    })];
    const out = computeDailyGoalNeed(goals);
    expect(out!.entries[0].moduleId).toBe('repertoire');
    expect(out!.entries[0].dailyMinutes).toBe(REPERTOIRE_SESSION_DEFAULT_MINUTES);
  });
});
