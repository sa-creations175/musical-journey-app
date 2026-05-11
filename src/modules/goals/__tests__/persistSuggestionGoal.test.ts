// @vitest-environment jsdom
/**
 * Edit-mode contract tests for persistSuggestionGoal and
 * persistRepertoireMonthlyGoal. Covers id preservation for matched
 * slices, deletion of removed slices, umbrella auto-creation on
 * 1→2-record edits, and Repertoire spotlight match by songId.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  persistSuggestionGoal,
  persistRepertoireMonthlyGoal,
} from '../GoalSuggestionFlow';
import { COVERAGE_SPECIFIC_METRIC } from '../coverageMetrics';
import { SONG_OF_MONTH_METRIC } from '../../repertoire/songOfMonth';

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

describe('persistSuggestionGoal — edit-mode match + write', () => {
  it('reuses the existing accuracy row id when its slice survives the edit', async () => {
    const umb = mkGoal({ id: 'umb', isUmbrella: true, relatedModules: ['harmonic-fluency'] });
    const accuracy = mkGoal({
      id: 'acc-keep',
      parentGoalId: 'umb',
      targetMetric: 'harmonic_fluency_accuracy_overall',
      targetValue: 75,
      currentValue: 17,
      startDate: NOW - 1000,
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.bulkPut([umb, accuracy]);

    await persistSuggestionGoal({
      records: [{
        description: 'Reach 90% overall accuracy',
        targetMetric: 'harmonic_fluency_accuracy_overall',
        targetValue: 90,
        targetUnit: '%',
      }],
      scope: 'monthly',
      moduleId: 'harmonic-fluency',
      targetDate: TARGET,
      anchorGoalId: 'anchor',
      existingUmbrella: umb,
      existingChildren: [accuracy],
    });

    const after = await db.goals.toArray();
    const kept = after.find(g => g.id === 'acc-keep');
    expect(kept).toBeDefined();
    expect(kept?.targetValue).toBe(90); // updated
    expect(kept?.currentValue).toBe(17); // preserved
    expect(kept?.startDate).toBe(NOW - 1000); // preserved
  });

  it('deletes existing children whose slice was removed on edit', async () => {
    const umb = mkGoal({ id: 'umb', isUmbrella: true, relatedModules: ['harmonic-fluency'] });
    const accuracy = mkGoal({
      id: 'acc-drop',
      parentGoalId: 'umb',
      targetMetric: 'harmonic_fluency_accuracy_overall',
      relatedModules: ['harmonic-fluency'],
    });
    const consistency = mkGoal({
      id: 'cons-keep',
      parentGoalId: 'umb',
      targetMetric: 'harmonic_fluency_days_per_cadence',
      targetValue: 5,
      targetUnit: 'week',
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.bulkPut([umb, accuracy, consistency]);

    await persistSuggestionGoal({
      records: [{
        description: '5 days a week on harmonic fluency',
        targetMetric: 'harmonic_fluency_days_per_cadence',
        targetValue: 5,
        targetUnit: 'week',
      }],
      scope: 'monthly',
      moduleId: 'harmonic-fluency',
      targetDate: TARGET,
      anchorGoalId: 'anchor',
      existingUmbrella: umb,
      existingChildren: [accuracy, consistency],
    });

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'acc-drop')).toBeUndefined();
    expect(after.find(g => g.id === 'cons-keep')).toBeDefined();
  });

  it('coverage-specific records match by group id when possible', async () => {
    const umb = mkGoal({ id: 'umb', isUmbrella: true, relatedModules: ['harmonic-fluency'] });
    const cov1 = mkGoal({
      id: 'cov-foundational',
      parentGoalId: 'umb',
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'foundational',
      relatedModules: ['harmonic-fluency'],
    });
    const cov2 = mkGoal({
      id: 'cov-ear',
      parentGoalId: 'umb',
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'ear-recognition',
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.bulkPut([umb, cov1, cov2]);

    // New: foundational stays + chord-knowledge added; ear-recognition removed.
    await persistSuggestionGoal({
      records: [
        {
          description: 'Cover foundational',
          targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
          targetValue: null,
          targetUnit: 'foundational',
        },
        {
          description: 'Cover chord-knowledge',
          targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
          targetValue: null,
          targetUnit: 'chord-knowledge',
        },
      ],
      scope: 'monthly',
      moduleId: 'harmonic-fluency',
      targetDate: TARGET,
      anchorGoalId: 'anchor',
      existingUmbrella: umb,
      existingChildren: [cov1, cov2],
    });

    const after = await db.goals.toArray();
    // foundational id preserved
    const foundational = after.find(g => g.targetUnit === 'foundational');
    expect(foundational?.id).toBe('cov-foundational');
    // ear-recognition id reused for chord-knowledge (fallback match)
    const chordKnowledge = after.find(g => g.targetUnit === 'chord-knowledge');
    expect(chordKnowledge?.id).toBe('cov-ear');
    // No ear-recognition row left
    expect(after.find(g => g.targetUnit === 'ear-recognition')).toBeUndefined();
  });

  it('auto-creates an umbrella when going from 1 record to 2 on edit', async () => {
    const single = mkGoal({
      id: 'standalone',
      parentGoalId: 'anchor',
      targetMetric: 'harmonic_fluency_days_per_cadence',
      targetValue: 5,
      targetUnit: 'week',
      relatedModules: ['harmonic-fluency'],
    });
    await db.goals.put(single);

    await persistSuggestionGoal({
      records: [
        {
          description: '5 days a week on harmonic fluency',
          targetMetric: 'harmonic_fluency_days_per_cadence',
          targetValue: 5,
          targetUnit: 'week',
        },
        {
          description: 'Reach 80% overall accuracy',
          targetMetric: 'harmonic_fluency_accuracy_overall',
          targetValue: 80,
          targetUnit: '%',
        },
      ],
      scope: 'monthly',
      moduleId: 'harmonic-fluency',
      targetDate: TARGET,
      anchorGoalId: 'anchor',
      existingUmbrella: null,
      existingChildren: [single],
    });

    const after = await db.goals.toArray();
    const umbrellas = after.filter(g => g.isUmbrella);
    expect(umbrellas).toHaveLength(1);
    const kept = after.find(g => g.id === 'standalone');
    expect(kept?.parentGoalId).toBe(umbrellas[0].id);
  });
});

describe('persistRepertoireMonthlyGoal — edit-mode', () => {
  it('reuses the spotlight goal id when the songId is unchanged', async () => {
    const umb = mkGoal({ id: 'rep-umb', isUmbrella: true, relatedModules: ['repertoire'] });
    const slot1 = mkGoal({
      id: 'spotlight',
      parentGoalId: 'rep-umb',
      targetMetric: 'song_whole_at_level',
      targetUnit: 'comfortable',
      relatedItems: ['song-A'],
      currentValue: 0.4,
      relatedModules: ['repertoire'],
    });
    const days = mkGoal({
      id: 'days',
      parentGoalId: 'rep-umb',
      targetMetric: 'repertoire_days_per_cadence',
      targetValue: 6,
      targetUnit: 'week',
      relatedModules: ['repertoire'],
    });
    await db.goals.bulkPut([umb, slot1, days]);

    await db.songs.put({
      id: 'song-A',
      title: 'Song A',
      artist: null,
      key: 'C',
      learningOrder: 1,
      addedDate: NOW,
    } as never);

    await persistRepertoireMonthlyGoal({
      queue: [{ key: 'k1', data: { kind: 'song', songId: 'song-A' } }],
      daysTarget: { consistencyEnabled: true, consistencyCount: 5, consistencyCadence: 'week' },
      anchorGoalId: 'anchor',
      scope: 'monthly',
      targetDate: TARGET,
      allSongs: [{
        id: 'song-A',
        title: 'Song A',
        artist: null,
        key: 'C',
        learningOrder: 1,
        addedDate: NOW,
      } as never],
      wantToLearn: [],
      existingUmbrella: umb,
      existingChildren: [slot1, days],
    });

    const after = await db.goals.toArray();
    const spotlight = after.find(g => g.targetMetric === 'song_whole_at_level');
    expect(spotlight?.id).toBe('spotlight');
    expect(spotlight?.currentValue).toBe(0.4);
    const daysAfter = after.find(g => g.targetMetric === 'repertoire_days_per_cadence');
    expect(daysAfter?.id).toBe('days');
    expect(daysAfter?.targetValue).toBe(5);
  });

  it('deletes the days child when daysTarget is disabled on edit', async () => {
    const umb = mkGoal({ id: 'rep-umb', isUmbrella: true, relatedModules: ['repertoire'] });
    const days = mkGoal({
      id: 'days',
      parentGoalId: 'rep-umb',
      targetMetric: 'repertoire_days_per_cadence',
      targetValue: 6,
      targetUnit: 'week',
      relatedModules: ['repertoire'],
    });
    const slot1 = mkGoal({
      id: 'spotlight',
      parentGoalId: 'rep-umb',
      targetMetric: SONG_OF_MONTH_METRIC,
      targetValue: 1,
      targetUnit: 'tbd',
      relatedItems: [],
      relatedModules: ['repertoire'],
    });
    await db.goals.bulkPut([umb, days, slot1]);

    await persistRepertoireMonthlyGoal({
      queue: [{ key: 'k1', data: { kind: 'tbd' } }],
      daysTarget: { consistencyEnabled: false, consistencyCount: 6, consistencyCadence: 'week' },
      anchorGoalId: 'anchor',
      scope: 'monthly',
      targetDate: TARGET,
      allSongs: [],
      wantToLearn: [],
      existingUmbrella: umb,
      existingChildren: [days, slot1],
    });

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'days')).toBeUndefined();
    expect(after.find(g => g.id === 'spotlight')).toBeDefined();
  });
});
