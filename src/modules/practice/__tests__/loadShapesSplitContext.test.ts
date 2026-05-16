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

describe('loadShapesSplitContext — active-song filter', () => {
  it('drops internalized + maintenance songs from activeSongKeys', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', key: 'C', stage: 'learning' }),
      song({ id: 's2', key: 'F', stage: 'comfortable' }),
      song({ id: 's3', key: 'Bb', stage: 'cross-key' }),
      song({ id: 's4', key: 'Db', stage: 'internalized' }),   // drop
      song({ id: 's5', key: 'G', stage: 'maintenance' }),     // drop
    ]);
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['C', 'F', 'Bb']);
  });

  it('treats songs with no stage set as active (defaults to learning)', async () => {
    await db.songs.add(song({ id: 's-undef', key: 'C' }));
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['C']);
  });

  it('skips songs without a key', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', key: undefined, stage: 'learning' }),
      song({ id: 's2', key: 'C', stage: 'learning' }),
    ]);
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['C']);
  });
});

describe('loadShapesSplitContext — key canonicalisation', () => {
  it('maps F# to Gb so it lines up with the scaleSkills catalog', async () => {
    await db.songs.add(song({ id: 's1', key: 'F#', stage: 'learning' }));
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['Gb']);
  });

  it('preserves already-canonical spellings (B and Gb pass through)', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', key: 'B', stage: 'learning' }),
      song({ id: 's2', key: 'Gb', stage: 'learning' }),
    ]);
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['B', 'Gb']);
  });

  it('deduplicates two songs at the same canonical key (F# and Gb collapse)', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', key: 'F#', stage: 'learning' }),  // → Gb
      song({ id: 's2', key: 'Gb', stage: 'learning' }),  // already Gb
    ]);
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['Gb']);
  });

  it('drops freeform/unparseable keys', async () => {
    await db.songs.bulkAdd([
      song({ id: 's1', key: 'C', stage: 'learning' }),
      song({ id: 's2', key: 'D minor', stage: 'learning' }), // not canonical
    ]);
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.activeSongKeys).toEqual(['C']);
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

describe('loadShapesSplitContext — SotM anchor key (warm-up isolation)', () => {
  /** Seed a Repertoire monthly umbrella + a specific-song slot-1
   *  child. Originally this seeded an active SotM that the loader
   *  would surface as sotmAnchorKey; after the warm-up isolation
   *  fix, the loader ignores SotM state entirely — these tests
   *  verify that ignoring. */
  async function seedSotm(songId: string) {
    await db.goals.bulkAdd([
      goal({
        id: 'umbrella',
        scope: 'monthly',
        isUmbrella: true,
        targetMetric: null,
        relatedModules: ['repertoire'],
      }),
      goal({
        id: 'sotm-child',
        parentGoalId: 'umbrella',
        targetMetric: 'song_whole_at_level',
        targetUnit: 'comfortable',
        relatedItems: [songId],
        relatedModules: ['repertoire'],
      }),
    ]);
  }

  it('never returns a sotmAnchorKey from the warm-up loader — no SotM exists', async () => {
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.sotmAnchorKey).toBeNull();
  });

  it('never returns a sotmAnchorKey even when a SotM song exists in a non-comfortable stage', async () => {
    // Pre-fix this would have surfaced 'Gb' as the anchor and the
    // warm-up would have walked from Gb — the bug the user saw as
    // Db (or whatever the SotM key happened to be) appearing in
    // the general warm-up. The warm-up loader must ignore SotM.
    await db.songs.add(song({ id: 'sotm', key: 'F#', stage: 'learning' }));
    await seedSotm('sotm');
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.sotmAnchorKey).toBeNull();
  });

  it('still null when a SotM exists for an Eb / Db / etc. key (regression for the warm-up Db bug)', async () => {
    await db.songs.add(song({ id: 'sotm', key: 'Db', stage: 'learning' }));
    await seedSotm('sotm');
    const ctx = await loadShapesSplitContext([], NOW);
    expect(ctx.sotmAnchorKey).toBeNull();
  });
});
