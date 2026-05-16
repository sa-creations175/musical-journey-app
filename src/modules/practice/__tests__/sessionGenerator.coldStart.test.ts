// @vitest-environment jsdom
/**
 * Tests for maybeInjectRepertoireColdStartBlock — the cold-start
 * cure for song goals when no Repertoire spacingState rows exist.
 *
 * Scenarios:
 *   · song goal + no spacing block + maintenance song → block injected
 *   · song goal + Repertoire block already exists → no-op
 *   · no song goal → no injection (even with songs available)
 *   · no candidate (no spotlight + no maintenance) → no injection
 *   · TBD-only spotlight, no maintenance → still injects (downstream
 *     surfaces the "Add a song in Goals" inline action)
 *   · context excludes Repertoire (phone) → no injection
 */
import { describe, expect, it } from 'vitest';
import { maybeInjectRepertoireColdStartBlock } from '../sessionGenerator';
import type { AlgorithmBlock } from '../../../lib/sessionAlgorithm/timeAllocation';
import type { Goal, Song } from '../../../lib/db';
import type { RepertoireSplitContext } from '../repertoireSplit';

const NOW = 1_700_000_000_000;

function mkGoal(partial: Partial<Goal>): Goal {
  return {
    id: 'goal-1',
    scope: 'monthly',
    description: '',
    targetMetric: 'song_whole_at_level',
    targetValue: null,
    targetUnit: 'comfortable',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['repertoire'],
    relatedItems: ['song-A'],
    startDate: NOW,
    targetDate: NOW + 30 * 86_400_000,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

function mkSong(partial: Partial<Song>): Song {
  return {
    id: 'song-A',
    title: 'Song A',
    artist: null,
    key: 'C',
    addedDate: NOW,
    learningOrder: 1,
    ...partial,
  } as Song;
}

function hfBlock(): AlgorithmBlock {
  return {
    id: 'block-hf',
    moduleRef: 'harmonic-fluency',
    memoryType: 'declarative',
    itemRefs: ['card-1'],
    weight: 4,
    hasAcquiringItems: false,
    isKeyboardRequired: false,
  };
}

function repertoireBlock(): AlgorithmBlock {
  return {
    id: 'block-rep',
    moduleRef: 'repertoire',
    memoryType: 'integration',
    itemRefs: ['song-X'],
    weight: 3,
    hasAcquiringItems: false,
    isKeyboardRequired: false,
  };
}

function splitCtx(partial: Partial<RepertoireSplitContext>): RepertoireSplitContext {
  return {
    spotlight: null,
    spotlightSong: null,
    spotlightReadiness: null,
    spotlightPostComfortable: null,
    maintenanceSong: null,
    maintenanceReadiness: null,
    maintenancePostComfortable: null,
    context: 'keys',
    ...partial,
  };
}

const SPLIT_WITH_MAINTENANCE: RepertoireSplitContext = splitCtx({
  maintenanceSong: mkSong({ id: 'song-maint', title: 'Maintenance Song' }),
  maintenanceReadiness: 'ready',
});

const SPLIT_WITH_SPOTLIGHT_AND_MAINT: RepertoireSplitContext = splitCtx({
  spotlight: {
    slotIndex: 1,
    kind: 'song',
    refId: 'song-spot',
    goalId: 'g-spot',
    displayTitle: 'Spotlight',
  },
  spotlightSong: mkSong({ id: 'song-spot', title: 'Spotlight' }),
  spotlightReadiness: 'ready',
  maintenanceSong: mkSong({ id: 'song-maint', title: 'Maintenance Song' }),
  maintenanceReadiness: 'ready',
});

const SPLIT_TBD_ONLY: RepertoireSplitContext = splitCtx({
  spotlight: {
    slotIndex: 1,
    kind: 'tbd',
    refId: null,
    goalId: 'g-tbd',
    displayTitle: 'TBD',
  },
});

const SPLIT_EMPTY: RepertoireSplitContext = splitCtx({});

describe('maybeInjectRepertoireColdStartBlock', () => {
  it('injects a synthetic Repertoire block when song goal exists + no spacing block', () => {
    const out = maybeInjectRepertoireColdStartBlock(
      [hfBlock()],
      [mkGoal({})],
      SPLIT_WITH_MAINTENANCE,
      'keys',
    );
    expect(out).toHaveLength(2);
    const injected = out.find(b => b.moduleRef === 'repertoire');
    expect(injected).toBeDefined();
    expect(injected!.itemRefs).toEqual(['song-maint']);
  });

  it('includes both spotlight + maintenance song ids in itemRefs', () => {
    const out = maybeInjectRepertoireColdStartBlock(
      [],
      [mkGoal({})],
      SPLIT_WITH_SPOTLIGHT_AND_MAINT,
      'keys',
    );
    const injected = out.find(b => b.moduleRef === 'repertoire');
    expect(injected?.itemRefs).toEqual(['song-spot', 'song-maint']);
  });

  it('is a no-op when a Repertoire block already exists from spacing rows', () => {
    const out = maybeInjectRepertoireColdStartBlock(
      [hfBlock(), repertoireBlock()],
      [mkGoal({})],
      SPLIT_WITH_MAINTENANCE,
      'keys',
    );
    expect(out).toHaveLength(2);
    expect(out.filter(b => b.moduleRef === 'repertoire')).toHaveLength(1);
    expect(out.find(b => b.moduleRef === 'repertoire')?.id).toBe('block-rep');
  });

  it('is a no-op when no song goal exists', () => {
    const out = maybeInjectRepertoireColdStartBlock(
      [hfBlock()],
      [mkGoal({ targetMetric: 'harmonic_fluency_days_per_cadence' })],
      SPLIT_WITH_MAINTENANCE,
      'keys',
    );
    expect(out).toHaveLength(1);
    expect(out.every(b => b.moduleRef !== 'repertoire')).toBe(true);
  });

  it('is a no-op when split context has neither spotlight nor maintenance', () => {
    const out = maybeInjectRepertoireColdStartBlock(
      [hfBlock()],
      [mkGoal({})],
      SPLIT_EMPTY,
      'keys',
    );
    expect(out).toHaveLength(1);
  });

  it('still injects when only a TBD spotlight exists (no songId)', () => {
    // TBD spotlight has no real songId — itemRefs ends up empty —
    // but the block is still emitted so the downstream split logic
    // can surface the "Add a song in Goals" inline action.
    const out = maybeInjectRepertoireColdStartBlock(
      [],
      [mkGoal({})],
      SPLIT_TBD_ONLY,
      'keys',
    );
    const injected = out.find(b => b.moduleRef === 'repertoire');
    expect(injected).toBeDefined();
    expect(injected!.itemRefs).toEqual([]);
  });

  it('still injects on phone — Repertoire passes the hard filter on every context', () => {
    // The context hard filter excludes Shapes on phone/laptop but
    // Repertoire is always allowed. The cold-start guard mirrors that
    // policy via isModuleAllowedForContext so the helper stays in
    // lockstep with the rest of the algorithm.
    const out = maybeInjectRepertoireColdStartBlock(
      [hfBlock()],
      [mkGoal({})],
      SPLIT_WITH_MAINTENANCE,
      'phone',
    );
    expect(out.find(b => b.moduleRef === 'repertoire')).toBeDefined();
  });

  it('is a no-op when repertoireSplit is null', () => {
    const out = maybeInjectRepertoireColdStartBlock(
      [hfBlock()],
      [mkGoal({})],
      null,
      'keys',
    );
    expect(out).toHaveLength(1);
  });
});
