// @vitest-environment jsdom
/**
 * Polish-sprint test — locks in the one-time migration that
 * relaxes legacy repertoire goals tagged 'keys' to 'mixed' so the
 * polish-sprint context-filter intersection stops dropping them
 * under non-keys contexts.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import { cleanupRepertoireGoalContextIfNeeded } from '../cleanup';

const NOW = 1_700_000_000_000;

function goal(partial: Partial<Goal>): Goal {
  return {
    id: 'g-x',
    scope: 'monthly',
    description: 'Test goal',
    targetMetric: 'song_proficiency_whole',
    targetValue: 1,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: NOW,
    targetDate: NOW + 30 * 24 * 60 * 60 * 1000,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

describe('cleanupRepertoireGoalContextIfNeeded', () => {
  beforeEach(async () => {
    await db.goals.clear();
  });

  it('relaxes active repertoire-tagged keys-context goals to mixed', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g1', contextTag: 'keys', relatedModules: ['repertoire'] }),
      goal({
        id: 'g2',
        contextTag: 'keys',
        relatedModules: ['repertoire', 'harmonic-fluency'],
      }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g1')?.contextTag).toBe('mixed');
    expect(after.find(g => g.id === 'g2')?.contextTag).toBe('mixed');
  });

  it('does not touch non-repertoire goals', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-shapes', contextTag: 'keys', relatedModules: ['shapes-and-patterns'] }),
      goal({ id: 'g-prod',   contextTag: 'laptop', relatedModules: ['production'] }),
      goal({ id: 'g-hf',     contextTag: 'mixed',  relatedModules: ['harmonic-fluency'] }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g-shapes')?.contextTag).toBe('keys');
    expect(after.find(g => g.id === 'g-prod')?.contextTag).toBe('laptop');
    expect(after.find(g => g.id === 'g-hf')?.contextTag).toBe('mixed');
  });

  it('does not touch repertoire goals already tagged mixed/null/laptop/phone', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-mixed', contextTag: 'mixed',  relatedModules: ['repertoire'] }),
      goal({ id: 'g-null',  contextTag: null,     relatedModules: ['repertoire'] }),
      goal({ id: 'g-phone', contextTag: 'phone',  relatedModules: ['repertoire'] }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g-mixed')?.contextTag).toBe('mixed');
    expect(after.find(g => g.id === 'g-null')?.contextTag).toBe(null);
    expect(after.find(g => g.id === 'g-phone')?.contextTag).toBe('phone');
  });

  it('also relaxes paused goals (not just active)', async () => {
    await db.goals.add(
      goal({ id: 'g-paused', contextTag: 'keys', relatedModules: ['repertoire'], status: 'paused' }),
    );

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.get('g-paused');
    expect(after?.contextTag).toBe('mixed');
  });

  it('skips completed/abandoned goals — terminal states stay untouched', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-done',  contextTag: 'keys', relatedModules: ['repertoire'], status: 'completed' }),
      goal({ id: 'g-aban',  contextTag: 'keys', relatedModules: ['repertoire'], status: 'abandoned' }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g-done')?.contextTag).toBe('keys');
    expect(after.find(g => g.id === 'g-aban')?.contextTag).toBe('keys');
  });

  it('is idempotent — second run is a no-op', async () => {
    await db.goals.add(
      goal({ id: 'g1', contextTag: 'keys', relatedModules: ['repertoire'] }),
    );

    await cleanupRepertoireGoalContextIfNeeded();
    const afterFirst = await db.goals.toArray();
    await cleanupRepertoireGoalContextIfNeeded();
    const afterSecond = await db.goals.toArray();

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond[0].contextTag).toBe('mixed');
  });
});
