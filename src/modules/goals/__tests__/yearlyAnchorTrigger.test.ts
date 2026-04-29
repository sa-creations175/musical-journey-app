// @vitest-environment jsdom
/**
 * Phase 2 step 5f contract tests for the anchor-existence helpers.
 * Covers the predicate (`hasActiveAnchorForModule`) exhaustively
 * and the async query (`anchorExistsForModule`) end-to-end via
 * fake-indexeddb.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  anchorExistsForModule,
  hasActiveAnchorForModule,
  targetDateInYear,
} from '../yearlyAnchorTrigger';

const YEAR = 2026;

function umbrella(partial: Partial<Goal>): Goal {
  return {
    id: partial.id ?? 'umb-1',
    scope: partial.scope ?? 'yearly',
    description: partial.description ?? 'Ear Training 2026',
    targetMetric: partial.targetMetric ?? null,
    targetValue: partial.targetValue ?? null,
    targetUnit: partial.targetUnit ?? null,
    currentValue: partial.currentValue ?? 0,
    contextTag: partial.contextTag ?? null,
    relatedModules: partial.relatedModules ?? ['ear-training'],
    relatedItems: partial.relatedItems ?? [],
    startDate: partial.startDate ?? new Date(YEAR, 0, 1).getTime(),
    targetDate: partial.targetDate ?? new Date(YEAR, 11, 31, 23, 59, 59, 999).getTime(),
    status: partial.status ?? 'active',
    parentGoalId: partial.parentGoalId ?? null,
    contributesNumericallyToParent: partial.contributesNumericallyToParent ?? false,
    isUmbrella: partial.isUmbrella ?? true,
    lastEngagedAt: partial.lastEngagedAt ?? null,
  };
}

beforeEach(async () => {
  await db.goals.clear();
});

// -------------------------------------------------------------------
// targetDateInYear
// -------------------------------------------------------------------

describe('targetDateInYear', () => {
  it('matches a date in the requested year', () => {
    expect(targetDateInYear(new Date(2026, 5, 15).getTime(), 2026)).toBe(true);
  });

  it('rejects a date in a different year', () => {
    expect(targetDateInYear(new Date(2025, 11, 31).getTime(), 2026)).toBe(false);
    expect(targetDateInYear(new Date(2027, 0, 1).getTime(), 2026)).toBe(false);
  });

  it('matches Dec 31 last-millisecond inclusive', () => {
    expect(targetDateInYear(new Date(2026, 11, 31, 23, 59, 59, 999).getTime(), 2026)).toBe(true);
  });

  it('matches Jan 1 first-millisecond inclusive', () => {
    expect(targetDateInYear(new Date(2026, 0, 1, 0, 0, 0, 0).getTime(), 2026)).toBe(true);
  });
});

// -------------------------------------------------------------------
// hasActiveAnchorForModule (pure predicate)
// -------------------------------------------------------------------

describe('hasActiveAnchorForModule', () => {
  it('returns false on empty list', () => {
    expect(hasActiveAnchorForModule([], 'ear-training', YEAR)).toBe(false);
  });

  it('returns true for a matching active umbrella', () => {
    const goals = [umbrella({ relatedModules: ['ear-training'] })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(true);
  });

  it('returns false when relatedModules does not include the moduleId', () => {
    const goals = [umbrella({ relatedModules: ['harmonic-fluency'] })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns false when isUmbrella is false (a regular goal)', () => {
    const goals = [umbrella({ isUmbrella: false })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns false when scope is not yearly', () => {
    const goals = [umbrella({ scope: 'monthly' })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns false when status is paused', () => {
    const goals = [umbrella({ status: 'paused' })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns false when status is abandoned', () => {
    const goals = [umbrella({ status: 'abandoned' })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns false when status is completed', () => {
    const goals = [umbrella({ status: 'completed' })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns false when targetDate falls outside the year', () => {
    const goals = [umbrella({
      targetDate: new Date(2025, 11, 31).getTime(),  // 2025, not 2026
    })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(false);
  });

  it('returns true when the right umbrella exists alongside others', () => {
    const goals = [
      umbrella({ id: 'a', relatedModules: ['ear-training'] }),
      umbrella({ id: 'b', relatedModules: ['production'] }),
      umbrella({ id: 'c', relatedModules: ['shapes-and-patterns'], status: 'paused' }),
    ];
    expect(hasActiveAnchorForModule(goals, 'production', YEAR)).toBe(true);
    expect(hasActiveAnchorForModule(goals, 'harmonic-fluency', YEAR)).toBe(false);
  });

  it('handles multi-module relatedModules (defensive — should not normally happen)', () => {
    const goals = [umbrella({ relatedModules: ['ear-training', 'production'] })];
    expect(hasActiveAnchorForModule(goals, 'ear-training', YEAR)).toBe(true);
    expect(hasActiveAnchorForModule(goals, 'production', YEAR)).toBe(true);
  });
});

// -------------------------------------------------------------------
// anchorExistsForModule (Dexie-backed)
// -------------------------------------------------------------------

describe('anchorExistsForModule', () => {
  it('returns false when no goals exist', async () => {
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(false);
  });

  it('returns true when a matching umbrella exists', async () => {
    await db.goals.add(umbrella({ relatedModules: ['ear-training'] }));
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(true);
  });

  it('returns false when only a paused umbrella exists', async () => {
    await db.goals.add(umbrella({ relatedModules: ['ear-training'], status: 'paused' }));
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(false);
  });

  it('returns false for a different module than the existing umbrella', async () => {
    await db.goals.add(umbrella({ relatedModules: ['ear-training'] }));
    expect(await anchorExistsForModule('production', YEAR)).toBe(false);
  });

  it('ignores prior-year umbrellas', async () => {
    await db.goals.add(umbrella({
      relatedModules: ['ear-training'],
      targetDate: new Date(2025, 11, 31).getTime(),
    }));
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(false);
  });

  it('returns true when both a stale 2025 and a fresh 2026 umbrella exist for the same module', async () => {
    await db.goals.bulkAdd([
      umbrella({ id: 'a', relatedModules: ['ear-training'], targetDate: new Date(2025, 11, 31).getTime() }),
      umbrella({ id: 'b', relatedModules: ['ear-training'], targetDate: new Date(2026, 11, 31).getTime() }),
    ]);
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(true);
  });

  it('does not match non-umbrella goals with the same relatedModules', async () => {
    await db.goals.add(umbrella({ isUmbrella: false, relatedModules: ['ear-training'] }));
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(false);
  });

  it('returns true for each of multiple modules with distinct umbrellas', async () => {
    await db.goals.bulkAdd([
      umbrella({ id: 'a', relatedModules: ['ear-training'] }),
      umbrella({ id: 'b', relatedModules: ['production'] }),
      umbrella({ id: 'c', relatedModules: ['practice-consistency'] }),
    ]);
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(true);
    expect(await anchorExistsForModule('production', YEAR)).toBe(true);
    expect(await anchorExistsForModule('practice-consistency', YEAR)).toBe(true);
    expect(await anchorExistsForModule('harmonic-fluency', YEAR)).toBe(false);
  });
});
