// @vitest-environment jsdom
/**
 * practiceWrites — the three Dev-Mode-gated write paths. When Dev Mode
 * is ON every wrapper is a silent no-op; when OFF they write normally.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type AttemptRecord, type DrillSession, type SpacingState } from '../db';
import { setDevMode } from '../devMode';
import {
  addAttempt,
  addDrillSession,
  bulkAddAttempts,
  bulkAddDrillSessions,
  putSpacingState,
} from '../practiceWrites';

function mkAttempt(): AttemptRecord {
  return { moduleId: 'harmonic-fluency', itemId: 'card-1', correct: true, timestamp: 1 };
}

function mkSpacingState(id: string): SpacingState {
  return {
    id,
    itemRef: 'item-1',
    moduleRef: 'harmonic-fluency',
    memoryType: 'declarative',
    hand: 'both',
    style: 'solid',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: 1,
    nextDueAt: null,
    performanceHistory: [],
  } as SpacingState;
}

function mkDrillSession(id: string): DrillSession {
  return {
    id,
    drillTypeId: 'drill-1',
    timestamp: 1,
  } as DrillSession;
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.drillSessions.clear();
});

afterEach(() => {
  setDevMode(false);
  sessionStorage.clear();
});

describe('Dev Mode OFF — writes land', () => {
  it('addAttempt / bulkAddAttempts write', async () => {
    await addAttempt(mkAttempt());
    await bulkAddAttempts([mkAttempt(), mkAttempt()]);
    expect(await db.attempts.count()).toBe(3);
  });

  it('putSpacingState writes', async () => {
    await putSpacingState(mkSpacingState('s1'));
    expect(await db.spacingState.count()).toBe(1);
  });

  it('addDrillSession / bulkAddDrillSessions write', async () => {
    await addDrillSession(mkDrillSession('d1'));
    await bulkAddDrillSessions([mkDrillSession('d2'), mkDrillSession('d3')]);
    expect(await db.drillSessions.count()).toBe(3);
  });
});

describe('Dev Mode ON — writes are silent no-ops', () => {
  beforeEach(() => setDevMode(true));

  it('attempts writes are skipped', async () => {
    await addAttempt(mkAttempt());
    await bulkAddAttempts([mkAttempt(), mkAttempt()]);
    expect(await db.attempts.count()).toBe(0);
  });

  it('spacingState writes are skipped', async () => {
    await putSpacingState(mkSpacingState('s1'));
    expect(await db.spacingState.count()).toBe(0);
  });

  it('drillSessions writes are skipped', async () => {
    await addDrillSession(mkDrillSession('d1'));
    await bulkAddDrillSessions([mkDrillSession('d2')]);
    expect(await db.drillSessions.count()).toBe(0);
  });

  it('does not throw and resolves cleanly', async () => {
    await expect(addAttempt(mkAttempt())).resolves.toBeUndefined();
  });
});
