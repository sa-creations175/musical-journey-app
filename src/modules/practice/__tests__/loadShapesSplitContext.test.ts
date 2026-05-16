// @vitest-environment jsdom
/**
 * Investigation-fix tests for loadShapesSplitContext (sessionGenerator).
 *
 *   · Active-song filter — only songs in {learning / comfortable /
 *     cross-key} (or no stage set, which defaults to learning) seed
 *     the Scales warm-up's key priority. Internalised + maintenance
 *     drop.
 *   · Key canonicalisation — F# / D# / etc. flow through
 *     canonicaliseKey before being pushed, so a F#-spelled song
 *     lines up with the Gb-spelled scaleSkills catalog.
 *   · Goal-aware scale budget — when an active Scales coverage goal
 *     exists, the loader sums per-cell drill seconds (90 s nat-min,
 *     30 s elsewhere) across every due cell matching the goal's
 *     coverage and hands shapesSplit a single number.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Song, type Goal, type SpacingState } from '../../../lib/db';
import { loadShapesSplitContext } from '../sessionGenerator';

const NOW = 1_700_000_000_000;

function song(overrides: Partial<Song>): Song {
  return {
    id: overrides.id ?? `song-${Math.random()}`,
    title: 'Untitled',
    artist: 'unknown',
    learningOrder: 1,
    audioLinks: [],
    addedDate: NOW,
    ...overrides,
  };
}

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: overrides.id ?? `goal-${Math.random()}`,
    scope: 'monthly',
    description: 'test goal',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: ['shapes-and-patterns'],
    relatedItems: [],
    startDate: NOW,
    targetDate: NOW + 30 * 24 * 60 * 60 * 1000,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

function row(itemRef: string, overrides: Partial<SpacingState> = {}): SpacingState {
  return {
    id: itemRef,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await db.songs.clear();
  await db.goals.clear();
  await db.spacingState.clear();
  await db.songKeys.clear();
  await db.songCells.clear();
  await db.songMatrixSections.clear();
});

describe('loadShapesSplitContext — song keys are NOT threaded into the warm-up context', () => {
  // The Scales warm-up is purely spacing-state-driven. Song-key
  // priming lives in the per-song `scale-prep` blocks built by
  // repertoireSplit.ts. These tests pin that the loader doesn't
  // expose any song-derived key surface on the returned context.

  it('returns no song-derived key fields regardless of which songs exist', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', key: 'C', stage: 'learning' }),
      song({ id: 's2', key: 'F#', stage: 'comfortable' }),
      song({ id: 's3', key: 'Db', stage: 'cross-key' }),
    ]);
    const ctx = await loadShapesSplitContext([], NOW);
    // Pre-fix, the loader populated activeSongKeys / activeSongTitlesByKey
    // / sotmAnchorKey. Post-fix, none of those fields exist on the
    // context type. Defensive: also assert no leaked properties.
    expect((ctx as unknown as Record<string, unknown>).activeSongKeys).toBeUndefined();
    expect((ctx as unknown as Record<string, unknown>).activeSongTitlesByKey).toBeUndefined();
    expect((ctx as unknown as Record<string, unknown>).sotmAnchorKey).toBeUndefined();
  });

  it('returns only spacing-state-relevant fields (rowsByItemRef, unlockedTier, now, scalesGoalDueSeconds)', async () => {
    await db.songs.add(song({ id: 's1', key: 'Db', stage: 'learning' }));
    const ctx = await loadShapesSplitContext([], NOW);
    expect(Object.keys(ctx).sort()).toEqual([
      'now',
      'rowsByItemRef',
      'scalesGoalDueSeconds',
      'unlockedTier',
    ]);
  });
});

describe('loadShapesSplitContext — goal-aware Scales budget', () => {
  it('returns null when no Scales goal is active', async () => {
    await db.goals.add(goal({
      id: 'g-not-scales',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'chord_shape_triads',
      status: 'active',
    }));
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.scalesGoalDueSeconds).toBeNull();
  });

  it('returns null when the Scales goal is not active', async () => {
    await db.goals.add(goal({
      id: 'g-paused',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'scale_major',
      status: 'paused',
    }));
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.scalesGoalDueSeconds).toBeNull();
  });

  it('sums due-cell drill seconds across matching scale itemRefs (major = 30 s each)', async () => {
    await db.goals.add(goal({
      id: 'g-major',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'scale_major',
      status: 'active',
    }));
    const rows = [
      row('scale:major:C', { nextDueAt: NOW - 1 }),   // due → 30 s
      row('scale:major:F', { nextDueAt: NOW - 1 }),   // due → 30 s
      row('scale:major:Bb', { nextDueAt: NOW + 1000 }), // not due → 0
      row('scale:natural-minor:C', { nextDueAt: NOW - 1 }), // not in goal → 0
    ];
    const ctx = await loadShapesSplitContext(rows, NOW);
    expect(ctx.scalesGoalDueSeconds).toBe(60);
  });

  it('weighs natural-minor cells at 90 s and other kinds at 30 s', async () => {
    await db.goals.add(goal({
      id: 'g-all-scales',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'scale_drills', // legacy "all scales" bucket
      status: 'active',
    }));
    const rows = [
      row('scale:major:C', { nextDueAt: NOW - 1 }),         // 30 s
      row('scale:natural-minor:C', { nextDueAt: NOW - 1 }), // 90 s
      row('scale:major-pentatonic:1:C', { nextDueAt: NOW - 1 }), // 30 s
      row('scale:minor-pentatonic:b3:C', { nextDueAt: NOW - 1 }), // 30 s
    ];
    const ctx = await loadShapesSplitContext(rows, NOW);
    expect(ctx.scalesGoalDueSeconds).toBe(30 + 90 + 30 + 30);
  });

  it('returns 0 (not null) when goal exists but no due cells match', async () => {
    await db.goals.add(goal({
      id: 'g-major',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'scale_major',
      status: 'active',
    }));
    const rows = [
      row('scale:major:C', { nextDueAt: NOW + 1000 }),     // not due
      row('scale:major-pentatonic:1:C', { nextDueAt: NOW - 1 }), // due but wrong kind
    ];
    const ctx = await loadShapesSplitContext(rows, NOW);
    expect(ctx.scalesGoalDueSeconds).toBe(0);
  });

  it('per-starting-point goal narrows to that sp only', async () => {
    await db.goals.add(goal({
      id: 'g-pent5',
      targetMetric: 'shapes_coverage_at_acquired_specific',
      targetUnit: 'scale_major_pentatonic_5',
      status: 'active',
    }));
    const rows = [
      row('scale:major-pentatonic:1:C', { nextDueAt: NOW - 1 }),  // wrong sp
      row('scale:major-pentatonic:5:C', { nextDueAt: NOW - 1 }),  // 30 s
      row('scale:major-pentatonic:5:F', { nextDueAt: NOW - 1 }),  // 30 s
      row('scale:major-pentatonic:6:C', { nextDueAt: NOW - 1 }),  // wrong sp
    ];
    const ctx = await loadShapesSplitContext(rows, NOW);
    expect(ctx.scalesGoalDueSeconds).toBe(60);
  });
});

// The `sotmAnchorKey` field was removed from ShapesSplitContext
// entirely (the warm-up no longer takes any song-derived key
// input). Regression tests for the Db-keeps-appearing bug now
// live as field-absence assertions in the "song keys are NOT
// threaded" describe block above.
