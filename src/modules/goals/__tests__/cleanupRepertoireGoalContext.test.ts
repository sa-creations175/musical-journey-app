// @vitest-environment jsdom
/**
 * Pins the cleanup migration that:
 *   (1) Relaxes legacy repertoire goals tagged 'keys' to null so
 *       the context-filter intersection stops dropping them under
 *       non-keys contexts.
 *   (2) Migrates any legacy `contextTag: 'mixed'` rows to null
 *       (the 'mixed' value was removed from PracticeSessionContext).
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

  it('relaxes active repertoire-tagged keys-context goals to null', async () => {
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
    expect(after.find(g => g.id === 'g1')?.contextTag).toBe(null);
    expect(after.find(g => g.id === 'g2')?.contextTag).toBe(null);
  });

  it('migrates any legacy contextTag="mixed" row to null (regardless of module)', async () => {
    // 'mixed' is no longer a valid PracticeSessionContext — any row
    // carrying it from a pre-migration release gets relaxed to null.
    // Cast through unknown because the type union no longer admits
    // the string 'mixed'.
    await db.goals.bulkAdd([
      goal({ id: 'g-rep',   contextTag: 'mixed' as unknown as Goal['contextTag'], relatedModules: ['repertoire'] }),
      goal({ id: 'g-hf',    contextTag: 'mixed' as unknown as Goal['contextTag'], relatedModules: ['harmonic-fluency'] }),
      goal({ id: 'g-multi', contextTag: 'mixed' as unknown as Goal['contextTag'], relatedModules: ['repertoire', 'ear-training'] }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g-rep')?.contextTag).toBe(null);
    expect(after.find(g => g.id === 'g-hf')?.contextTag).toBe(null);
    expect(after.find(g => g.id === 'g-multi')?.contextTag).toBe(null);
  });

  it('does not touch non-repertoire keys-context goals (only mixed is relaxed across modules)', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-shapes', contextTag: 'keys',   relatedModules: ['shapes-and-patterns'] }),
      goal({ id: 'g-prod',   contextTag: 'laptop', relatedModules: ['production'] }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g-shapes')?.contextTag).toBe('keys');
    expect(after.find(g => g.id === 'g-prod')?.contextTag).toBe('laptop');
  });

  it('does not touch repertoire goals already tagged null/laptop/phone', async () => {
    await db.goals.bulkAdd([
      goal({ id: 'g-null',  contextTag: null,    relatedModules: ['repertoire'] }),
      goal({ id: 'g-phone', contextTag: 'phone', relatedModules: ['repertoire'] }),
    ]);

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.toArray();
    expect(after.find(g => g.id === 'g-null')?.contextTag).toBe(null);
    expect(after.find(g => g.id === 'g-phone')?.contextTag).toBe('phone');
  });

  it('also relaxes paused goals (not just active)', async () => {
    await db.goals.add(
      goal({ id: 'g-paused', contextTag: 'keys', relatedModules: ['repertoire'], status: 'paused' }),
    );

    await cleanupRepertoireGoalContextIfNeeded();

    const after = await db.goals.get('g-paused');
    expect(after?.contextTag).toBe(null);
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
    expect(afterSecond[0].contextTag).toBe(null);
  });
});
