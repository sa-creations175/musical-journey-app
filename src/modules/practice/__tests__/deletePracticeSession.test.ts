// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type PracticeSession, type PracticeBlock } from '../../../lib/db';
import { deletePracticeSession } from '../deletePracticeSession';

function makeSession(id: string, overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id,
    startedAt: Date.now(),
    endedAt: null,
    plannedDurationMin: 30,
    actualDurationMin: 25,
    context: 'mixed',
    timeOfDay: 'morning',
    sessionRole: 'only',
    sessionIntent: null,
    hardBlocks: false,
    energyFocus: null,
    energyMotivation: null,
    energyInspiration: null,
    dayProfileUsed: null,
    reasoningSnapshot: null,
    notes: null,
    lastEngagedAt: null,
    sessionRating: null,
    affirmation: null,
    ...overrides,
  };
}

function makeBlock(id: string, sessionId: string, order: number): PracticeBlock {
  return {
    id,
    sessionId,
    orderIndex: order,
    moduleRef: 'shapes-and-patterns',
    subModuleRef: null,
    itemRefs: [],
    plannedMinutes: 10,
    actualMinutes: 10,
    completionStatus: 'completed',
    performanceRating: null,
    blockColor: null,
    notes: null,
  };
}

describe('deletePracticeSession', () => {
  beforeEach(async () => {
    await db.practiceSessions.clear();
    await db.practiceBlocks.clear();
    await db.syncQueue.clear();
  });

  it('removes the session row and every block that references it', async () => {
    await db.practiceSessions.bulkAdd([
      makeSession('s1'),
      makeSession('s2'),
    ]);
    await db.practiceBlocks.bulkAdd([
      makeBlock('b1', 's1', 0),
      makeBlock('b2', 's1', 1),
      makeBlock('b3', 's2', 0),
    ]);

    const result = await deletePracticeSession('s1');
    expect(result.blocksDeleted).toBe(2);

    expect(await db.practiceSessions.get('s1')).toBeUndefined();
    expect(await db.practiceSessions.get('s2')).toBeDefined();

    const remainingBlocks = await db.practiceBlocks.toArray();
    expect(remainingBlocks.map(b => b.id).sort()).toEqual(['b3']);
  });

  it('is a no-op on blocks when the session had none, but still deletes the session', async () => {
    await db.practiceSessions.add(makeSession('orphan'));

    const result = await deletePracticeSession('orphan');
    expect(result.blocksDeleted).toBe(0);
    expect(await db.practiceSessions.get('orphan')).toBeUndefined();
  });

  it('does not delete unrelated sessions when the id matches no row', async () => {
    await db.practiceSessions.add(makeSession('keep'));
    await db.practiceBlocks.add(makeBlock('keep-b', 'keep', 0));

    await deletePracticeSession('nonexistent');

    expect(await db.practiceSessions.get('keep')).toBeDefined();
    expect(await db.practiceBlocks.get('keep-b')).toBeDefined();
  });
});
