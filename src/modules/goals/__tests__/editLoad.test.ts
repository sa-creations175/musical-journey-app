// @vitest-environment jsdom
/**
 * Tests for editLoad — the decoder layer that turns an existing
 * monthly goal (umbrella or child) into a fully-populated prefill
 * the GoalSuggestionFlow body can render.
 *
 * Coverage:
 *   · Module identification from relatedModules + metric prefix
 *   · Umbrella-walking from a child reference
 *   · Standalone-child path (no umbrella)
 *   · Merge semantics — overall + specific coverage, multi-group
 *     concatenation, *Enabled flags reset to false then OR'd in
 *   · Repertoire queue + days reconstruction
 *   · PracticeConsistency days extraction
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import { isSuggestionFlowEditCandidate, loadGoalForEdit } from '../editLoad';
import { COVERAGE_OVERALL_METRIC, COVERAGE_SPECIFIC_METRIC } from '../coverageMetrics';

const NOW = new Date(2026, 4, 11).getTime();
const TARGET = new Date(2026, 4, 31).getTime();

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

beforeEach(async () => {
  await db.goals.clear();
});

describe('loadGoalForEdit — module identification', () => {
  it('returns null for goals with no recognised module', async () => {
    const orphan = mkGoal({ id: 'orphan', relatedModules: ['unknown-module'] });
    await db.goals.put(orphan);
    expect(await loadGoalForEdit(orphan)).toBeNull();
  });

  it('recognises practice-consistency via metric prefix when relatedModules is empty', async () => {
    const days = mkGoal({
      id: 'pc-days',
      targetMetric: 'practice_days_per_cadence',
      targetValue: 5,
      targetUnit: 'week',
      relatedModules: [],
    });
    await db.goals.put(days);
    const prefill = await loadGoalForEdit(days);
    expect(prefill?.moduleId).toBe('practice-consistency');
  });
});

describe('loadGoalForEdit — HF umbrella with all three slices', () => {
  it('reconstructs coverage + accuracy + consistency from children', async () => {
    const umb = mkGoal({
      id: 'hf-umb',
      isUmbrella: true,
      relatedModules: ['harmonic-fluency'],
      targetMetric: null,
    });
    const coverage = mkGoal({
      id: 'hf-cov',
      parentGoalId: 'hf-umb',
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'foundational',
      relatedModules: ['harmonic-fluency'],
    });
    const coverage2 = mkGoal({
      id: 'hf-cov-2',
      parentGoalId: 'hf-umb',
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'chord-knowledge',
      relatedModules: ['harmonic-fluency'],
    });
    const accuracy = mkGoal({
      id: 'hf-acc',
      parentGoalId: 'hf-umb',
      targetMetric: 'harmonic_fluency_accuracy_overall',
      targetValue: 80,
      relatedModules: ['harmonic-fluency'],
    });
    const days = mkGoal({
      id: 'hf-days',
      parentGoalId: 'hf-umb',
      targetMetric: 'harmonic_fluency_days_per_cadence',
      targetValue: 5,
      targetUnit: 'week',
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.bulkPut([umb, coverage, coverage2, accuracy, days]);

    const prefill = await loadGoalForEdit(umb);
    expect(prefill?.moduleId).toBe('harmonic-fluency');
    if (prefill?.moduleId !== 'harmonic-fluency') throw new Error('wrong module');
    expect(prefill.umbrellaId).toBe('hf-umb');
    expect(prefill.existingChildren).toHaveLength(4);
    expect(prefill.target.coverageEnabled).toBe(true);
    expect(prefill.target.coverageScope).toBe('specific');
    expect(prefill.target.coverageGroupIds.sort()).toEqual(
      ['chord-knowledge', 'foundational'],
    );
    expect(prefill.target.accuracyEnabled).toBe(true);
    expect(prefill.target.accuracyPercent).toBe(80);
    expect(prefill.target.consistencyEnabled).toBe(true);
    expect(prefill.target.consistencyCount).toBe(5);
  });

  it('forces *Enabled flags to false when slice not present', async () => {
    // Single-child umbrella with only consistency saved: coverage +
    // accuracy must come back disabled, contrary to the defaults
    // (which have consistency on but the others off — confirming
    // the reset isn't masking).
    const umb = mkGoal({
      id: 'hf-umb',
      isUmbrella: true,
      relatedModules: ['harmonic-fluency'],
    });
    const days = mkGoal({
      id: 'hf-days',
      parentGoalId: 'hf-umb',
      targetMetric: 'harmonic_fluency_days_per_cadence',
      targetValue: 4,
      targetUnit: 'week',
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.bulkPut([umb, days]);

    const prefill = await loadGoalForEdit(umb);
    if (prefill?.moduleId !== 'harmonic-fluency') throw new Error('wrong module');
    expect(prefill.target.coverageEnabled).toBe(false);
    expect(prefill.target.accuracyEnabled).toBe(false);
    expect(prefill.target.consistencyEnabled).toBe(true);
    expect(prefill.target.consistencyCount).toBe(4);
  });

  it('coverage overall beats specific when both present in children', async () => {
    const umb = mkGoal({
      id: 'hf-umb',
      isUmbrella: true,
      relatedModules: ['harmonic-fluency'],
    });
    const overall = mkGoal({
      id: 'hf-cov-o',
      parentGoalId: 'hf-umb',
      targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.bulkPut([umb, overall]);

    const prefill = await loadGoalForEdit(umb);
    if (prefill?.moduleId !== 'harmonic-fluency') throw new Error('wrong module');
    expect(prefill.target.coverageScope).toBe('overall');
    expect(prefill.target.coverageGroupIds).toEqual([]);
  });
});

describe('loadGoalForEdit — walking from child to umbrella', () => {
  it('loads the umbrella + all siblings when given any child', async () => {
    const umb = mkGoal({
      id: 'et-umb',
      isUmbrella: true,
      relatedModules: ['ear-training'],
    });
    const cov = mkGoal({
      id: 'et-cov',
      parentGoalId: 'et-umb',
      targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING,
      relatedModules: ['ear-training'],
    });
    const days = mkGoal({
      id: 'et-days',
      parentGoalId: 'et-umb',
      targetMetric: 'ear_training_days_per_cadence',
      targetValue: 5,
      targetUnit: 'week',
      relatedModules: ['ear-training'],
    });
    await db.goals.bulkPut([umb, cov, days]);

    const fromChild = await loadGoalForEdit(cov);
    expect(fromChild?.umbrellaId).toBe('et-umb');
    expect(fromChild?.existingChildren).toHaveLength(2);
  });

  it('treats a standalone child (no umbrella) as a one-element list', async () => {
    const standalone = mkGoal({
      id: 'et-solo',
      targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING,
      relatedModules: ['ear-training'],
      parentGoalId: null,
    });
    await db.goals.put(standalone);

    const prefill = await loadGoalForEdit(standalone);
    if (prefill?.moduleId !== 'ear-training') throw new Error('wrong module');
    expect(prefill.umbrellaId).toBeNull();
    expect(prefill.existingChildren).toHaveLength(1);
    expect(prefill.target.coverageEnabled).toBe(true);
  });
});

describe('loadGoalForEdit — Repertoire queue + days', () => {
  it('reconstructs the queue from song_whole_at_level + song_of_month children', async () => {
    const umb = mkGoal({
      id: 'rep-umb',
      isUmbrella: true,
      relatedModules: ['repertoire'],
    });
    const slot1 = mkGoal({
      id: 'rep-slot1',
      parentGoalId: 'rep-umb',
      targetMetric: 'song_whole_at_level',
      targetUnit: 'comfortable',
      relatedItems: ['song-A'],
      relatedModules: ['repertoire'],
    });
    const slot2 = mkGoal({
      id: 'rep-slot2',
      parentGoalId: 'rep-umb',
      targetMetric: 'song_of_month',
      targetValue: 2,
      targetUnit: 'wtl',
      relatedItems: ['wtl-X'],
      relatedModules: ['repertoire'],
    });
    const slot3 = mkGoal({
      id: 'rep-slot3',
      parentGoalId: 'rep-umb',
      targetMetric: 'song_of_month',
      targetValue: 3,
      targetUnit: 'tbd',
      relatedItems: [],
      relatedModules: ['repertoire'],
    });
    const days = mkGoal({
      id: 'rep-days',
      parentGoalId: 'rep-umb',
      targetMetric: 'repertoire_days_per_cadence',
      targetValue: 6,
      targetUnit: 'week',
      relatedModules: ['repertoire'],
    });
    await db.goals.bulkPut([umb, slot1, slot2, slot3, days]);

    const prefill = await loadGoalForEdit(umb);
    if (prefill?.moduleId !== 'repertoire') throw new Error('wrong module');
    expect(prefill.queue).toEqual([
      { kind: 'song', refId: 'song-A' },
      { kind: 'wtl',  refId: 'wtl-X' },
      { kind: 'tbd',  refId: null },
    ]);
    expect(prefill.daysTarget.consistencyEnabled).toBe(true);
    expect(prefill.daysTarget.consistencyCount).toBe(6);
  });

  it('returns days-disabled when no days child exists', async () => {
    const umb = mkGoal({
      id: 'rep-umb',
      isUmbrella: true,
      relatedModules: ['repertoire'],
    });
    const slot1 = mkGoal({
      id: 'rep-slot1',
      parentGoalId: 'rep-umb',
      targetMetric: 'song_whole_at_level',
      targetUnit: 'comfortable',
      relatedItems: ['song-A'],
      relatedModules: ['repertoire'],
    });
    await db.goals.bulkPut([umb, slot1]);

    const prefill = await loadGoalForEdit(umb);
    if (prefill?.moduleId !== 'repertoire') throw new Error('wrong module');
    expect(prefill.daysTarget.consistencyEnabled).toBe(false);
  });
});

describe('isSuggestionFlowEditCandidate — routing predicate', () => {
  it('matches monthly new-vocab metric children', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'monthly',
      targetMetric: 'harmonic_fluency_days_per_cadence',
    }))).toBe(true);
  });

  it('matches monthly umbrella rows with relatedModules set', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'monthly',
      isUmbrella: true,
      targetMetric: null,
      relatedModules: ['harmonic-fluency'],
    }))).toBe(true);
  });

  it('matches monthly song_of_month metric (Repertoire queue child)', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'monthly',
      targetMetric: 'song_of_month',
      targetValue: 2,
      targetUnit: 'wtl',
      relatedModules: ['repertoire'],
    }))).toBe(true);
  });

  it('matches monthly song_whole_at_level when relatedModules includes repertoire', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'monthly',
      targetMetric: 'song_whole_at_level',
      relatedModules: ['repertoire'],
    }))).toBe(true);
  });

  it('rejects non-monthly goals', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'yearly',
      isUmbrella: true,
      targetMetric: null,
      relatedModules: ['harmonic-fluency'],
    }))).toBe(false);
  });

  it('rejects umbrellas with no relatedModules', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'monthly',
      isUmbrella: true,
      targetMetric: null,
      relatedModules: [],
    }))).toBe(false);
  });

  it('rejects legacy old-vocab metrics', () => {
    expect(isSuggestionFlowEditCandidate(mkGoal({
      scope: 'monthly',
      targetMetric: 'items_at_level',
    }))).toBe(false);
  });
});

describe('loadGoalForEdit — Practice Consistency', () => {
  it('pulls daysPerWeek from a standalone practice_days_per_cadence goal', async () => {
    const goal = mkGoal({
      id: 'pc',
      targetMetric: 'practice_days_per_cadence',
      targetValue: 5,
      targetUnit: 'week',
    });
    await db.goals.put(goal);

    const prefill = await loadGoalForEdit(goal);
    if (prefill?.moduleId !== 'practice-consistency') throw new Error('wrong module');
    expect(prefill.target.daysPerWeek).toBe(5);
  });
});
