// @vitest-environment jsdom
/**
 * Tests for computeDailyGoalNeed — the pure aggregator that drives
 * the "What your goals need today" screen. Validates per-metric
 * translation, module ordering, max-take aggregation across multiple
 * goals on the same module, and the empty-input null contract.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  computeDailyGoalNeed,
  mergeDailyNeed,
  type DailyNeed,
} from '../dailyGoalNeed';
import type { ModuleSessionNeed } from '../../../lib/sessionAlgorithm/sessionNeed';
import type { GoalFlowModuleId } from '../../goals/goalVocabulary';
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

// ---------------------------------------------------------------------
// Phase B Commit 3 — mergeDailyNeed (Phase B overrides legacy)
// ---------------------------------------------------------------------

function need(
  attemptsToday: number,
  timeNeededSeconds: number,
  isOverPractice = false,
): ModuleSessionNeed {
  return { attemptsToday, timeNeededSeconds, isOverPractice };
}

function phaseBMap(
  entries: Array<[GoalFlowModuleId, ModuleSessionNeed]>,
): Map<GoalFlowModuleId, ModuleSessionNeed> {
  return new Map(entries);
}

describe('mergeDailyNeed', () => {
  it('returns null when both sources are empty', () => {
    expect(mergeDailyNeed(null, phaseBMap([]))).toBeNull();
  });

  it('Phase B entry alone — produces a row with the breakdown attached', () => {
    // 65 attempts × 30 s = 1950 s → 33 min (rounded).
    const out = mergeDailyNeed(null, phaseBMap([
      ['harmonic-fluency', need(65, 1950)],
    ]));
    expect(out).not.toBeNull();
    const hf = out!.entries.find(e => e.moduleId === 'harmonic-fluency')!;
    expect(hf.dailyMinutes).toBe(33);
    expect(hf.phaseB).toEqual({
      attemptsToday: 65,
      timePerAttemptSeconds: 30,
      isOverPractice: false,
    });
    expect(out!.totalMinutes).toBe(33);
  });

  it('Phase B OVERRIDES the legacy estimate for the same module', () => {
    // Legacy says HF is 15 min; Phase B says 33 min — Phase B wins.
    const legacy: DailyNeed = {
      entries: [{ moduleId: 'harmonic-fluency', dailyMinutes: 15 }],
      totalMinutes: 15,
    };
    const out = mergeDailyNeed(legacy, phaseBMap([
      ['harmonic-fluency', need(65, 1950)],
    ]));
    const hf = out!.entries.find(e => e.moduleId === 'harmonic-fluency')!;
    expect(hf.dailyMinutes).toBe(33);
    expect(hf.phaseB).toBeDefined();
  });

  it('legacy-only modules pass through untouched alongside Phase B modules', () => {
    // S&P + Repertoire are legacy-estimated; HF is Phase B. All three
    // survive, ordered by MODULE_ORDER (S&P, Repertoire, …, HF).
    const legacy: DailyNeed = {
      entries: [
        { moduleId: 'shapes-and-patterns', dailyMinutes: 20 },
        { moduleId: 'repertoire', dailyMinutes: 60 },
      ],
      totalMinutes: 80,
    };
    const out = mergeDailyNeed(legacy, phaseBMap([
      ['harmonic-fluency', need(20, 600)],
    ]));
    const ids = out!.entries.map(e => e.moduleId);
    expect(ids).toEqual(['shapes-and-patterns', 'repertoire', 'harmonic-fluency']);
    // Legacy entries keep their shape (no phaseB breakdown).
    expect(out!.entries[0].phaseB).toBeUndefined();
    expect(out!.entries[1].phaseB).toBeUndefined();
    expect(out!.entries[2].phaseB).toBeDefined();
    // Total = 20 + 60 + 10 (600 s).
    expect(out!.totalMinutes).toBe(90);
  });

  it('over-practice module stays in the list, contributes 0 to the total', () => {
    const legacy: DailyNeed = {
      entries: [{ moduleId: 'shapes-and-patterns', dailyMinutes: 20 }],
      totalMinutes: 20,
    };
    const out = mergeDailyNeed(legacy, phaseBMap([
      ['harmonic-fluency', need(0, 0, /* isOverPractice */ true)],
    ]));
    const hf = out!.entries.find(e => e.moduleId === 'harmonic-fluency')!;
    expect(hf.dailyMinutes).toBe(0);
    expect(hf.phaseB?.isOverPractice).toBe(true);
    // Total reflects only the S&P legacy entry — over-practice adds 0.
    expect(out!.totalMinutes).toBe(20);
  });

  it('recovers the per-attempt seed exactly from timeNeeded ÷ attemptsToday', () => {
    // 17 attempts × 30 s = 510 s. timePerAttempt must come back as 30.
    const out = mergeDailyNeed(null, phaseBMap([
      ['ear-training', need(17, 510)],
    ]));
    const et = out!.entries.find(e => e.moduleId === 'ear-training')!;
    expect(et.phaseB!.timePerAttemptSeconds).toBe(30);
  });
});
