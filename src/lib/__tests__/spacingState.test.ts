// @vitest-environment jsdom
/**
 * Phase 2 substep 1a contract tests. Two layers:
 *
 *   1. Pure stage-transition functions — no Dexie, exhaustive coverage of
 *      thresholds, windowing, and never-demote semantics.
 *   2. `recordEngagement` integration — fake-indexeddb backs the real db
 *      instance from src/lib/db.ts. Sync hooks are not auto-installed
 *      (see installSyncHooks in src/lib/sync/hooks.ts), so writes don't
 *      touch a remote. The jsdom env is needed because db.ts touches
 *      `window` at module load behind an `import.meta.env.DEV` guard.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERFORMANCE_HISTORY_MAX,
  DECLARATIVE_ACQUIRED_MIN_ATTEMPTS,
  DECLARATIVE_ACQUIRED_WINDOW,
  DECLARATIVE_ACQUIRED_THRESHOLD,
  RATING_ACQUIRED_MIN_RATINGS,
  nextStageDeclarative,
  nextStageRatingBased,
  nextStageExpression,
  computeNextStage,
  recordEngagement,
  getSpacingState,
  type PerformanceEntry,
} from '../spacingState';
import { db } from '../db';

// -------------------------------------------------------------------
// Pure stage-transition helpers
// -------------------------------------------------------------------

function attempts(corrects: boolean[]): PerformanceEntry[] {
  return corrects.map((correct, i) => ({ t: i, kind: 'attempt', correct }));
}

function ratings(rs: Array<'flying' | 'cruising' | 'crawling'>): PerformanceEntry[] {
  return rs.map((rating, i) => ({ t: i, kind: 'rating', rating }));
}

describe('threshold constants are sane', () => {
  it('declarative window covers at least the min-attempts gate', () => {
    expect(DECLARATIVE_ACQUIRED_WINDOW).toBeGreaterThanOrEqual(DECLARATIVE_ACQUIRED_MIN_ATTEMPTS);
  });
  it('threshold is a proper fraction', () => {
    expect(DECLARATIVE_ACQUIRED_THRESHOLD).toBeGreaterThan(0);
    expect(DECLARATIVE_ACQUIRED_THRESHOLD).toBeLessThanOrEqual(1);
  });
  it('history cap is at least the largest window', () => {
    expect(PERFORMANCE_HISTORY_MAX).toBeGreaterThanOrEqual(DECLARATIVE_ACQUIRED_WINDOW);
    expect(PERFORMANCE_HISTORY_MAX).toBeGreaterThanOrEqual(RATING_ACQUIRED_MIN_RATINGS);
  });
});

describe('nextStageDeclarative', () => {
  it('returns "new" unchanged — only acquiring → acquired is in scope', () => {
    expect(nextStageDeclarative('new', attempts([true, true, true, true, true]))).toBe('new');
  });

  it('returns "acquired" unchanged — never demotes', () => {
    expect(nextStageDeclarative('acquired', attempts([false, false, false, false, false]))).toBe('acquired');
  });

  it('stays acquiring with zero attempts', () => {
    expect(nextStageDeclarative('acquiring', [])).toBe('acquiring');
  });

  it('stays acquiring below the min-attempts gate, even at 100%', () => {
    const four100 = attempts([true, true, true, true]);
    expect(four100).toHaveLength(DECLARATIVE_ACQUIRED_MIN_ATTEMPTS - 1);
    expect(nextStageDeclarative('acquiring', four100)).toBe('acquiring');
  });

  it('promotes at the min-attempts boundary when at the threshold (4/5 = 0.8)', () => {
    expect(nextStageDeclarative('acquiring', attempts([true, true, true, true, false]))).toBe('acquired');
  });

  it('stays acquiring at 5 attempts / 60% — below threshold', () => {
    expect(nextStageDeclarative('acquiring', attempts([true, true, true, false, false]))).toBe('acquiring');
  });

  it('stays acquiring at 10 attempts / 70% — clears min but not threshold', () => {
    const seven10 = attempts([true, true, true, true, true, true, true, false, false, false]);
    expect(nextStageDeclarative('acquiring', seven10)).toBe('acquiring');
  });

  it('only the trailing window counts — 3 wrongs at the front, then 10 in a row right', () => {
    const history = attempts([
      false, false, false,
      true, true, true, true, true, true, true, true, true, true,
    ]);
    expect(nextStageDeclarative('acquiring', history)).toBe('acquired');
  });

  it('ignores rating entries entirely', () => {
    const mixed: PerformanceEntry[] = [
      ...ratings(['cruising', 'cruising', 'cruising']),
      ...attempts([true, true, true, true, true]),
    ];
    expect(nextStageDeclarative('acquiring', mixed)).toBe('acquired');
  });
});

describe('nextStageRatingBased', () => {
  it('returns "new" unchanged', () => {
    expect(nextStageRatingBased('new', ratings(['flying', 'flying', 'flying']))).toBe('new');
  });

  it('returns "acquired" unchanged — never demotes', () => {
    expect(nextStageRatingBased('acquired', ratings(['crawling', 'crawling', 'crawling']))).toBe('acquired');
  });

  it('stays acquiring below the min-ratings gate', () => {
    expect(nextStageRatingBased('acquiring', ratings(['cruising', 'cruising']))).toBe('acquiring');
  });

  it('promotes when last 3 are all flying', () => {
    expect(nextStageRatingBased('acquiring', ratings(['flying', 'flying', 'flying']))).toBe('acquired');
  });

  it('promotes when last 3 are all cruising', () => {
    expect(nextStageRatingBased('acquiring', ratings(['cruising', 'cruising', 'cruising']))).toBe('acquired');
  });

  it('promotes when last 3 mix flying and cruising', () => {
    expect(nextStageRatingBased('acquiring', ratings(['flying', 'cruising', 'flying']))).toBe('acquired');
  });

  it('stays acquiring when any of the last 3 is crawling', () => {
    expect(nextStageRatingBased('acquiring', ratings(['cruising', 'crawling', 'cruising']))).toBe('acquiring');
  });

  it('only the last 3 ratings count — earlier crawlings forgiven', () => {
    expect(nextStageRatingBased('acquiring', ratings([
      'crawling', 'crawling', 'crawling',
      'cruising', 'cruising', 'cruising',
    ]))).toBe('acquired');
  });

  it('a recent crawling blocks promotion even after a flying streak', () => {
    expect(nextStageRatingBased('acquiring', ratings([
      'flying', 'flying', 'flying', 'flying',
      'crawling',
    ]))).toBe('acquiring');
  });

  it('ignores attempt entries entirely', () => {
    const mixed: PerformanceEntry[] = [
      ...attempts([true, true, true, true, true]),
      ...ratings(['cruising', 'cruising', 'cruising']),
    ];
    expect(nextStageRatingBased('acquiring', mixed)).toBe('acquired');
  });
});

describe('nextStageExpression', () => {
  it('never advances — recency-only by design', () => {
    expect(nextStageExpression('new')).toBe('new');
    expect(nextStageExpression('acquiring')).toBe('acquiring');
    expect(nextStageExpression('acquired')).toBe('acquired');
    expect(nextStageExpression('consolidated')).toBe('consolidated');
    expect(nextStageExpression('mastered')).toBe('mastered');
  });
});

describe('computeNextStage dispatch', () => {
  it('routes declarative to the attempt-based path', () => {
    expect(computeNextStage('declarative', 'acquiring', attempts([true, true, true, true, true]))).toBe('acquired');
    expect(computeNextStage('declarative', 'acquiring', ratings(['flying', 'flying', 'flying']))).toBe('acquiring');
  });
  it('routes procedural and integration to the rating-based path', () => {
    expect(computeNextStage('procedural',  'acquiring', ratings(['flying', 'flying', 'flying']))).toBe('acquired');
    expect(computeNextStage('integration', 'acquiring', ratings(['flying', 'flying', 'flying']))).toBe('acquired');
  });
  it('routes expression to the no-op path', () => {
    expect(computeNextStage('expression', 'acquiring', [])).toBe('acquiring');
  });
});

// -------------------------------------------------------------------
// recordEngagement integration (fake-indexeddb)
// -------------------------------------------------------------------

beforeEach(async () => {
  await db.spacingState.clear();
});

describe('recordEngagement — first call creates a row', () => {
  it('creates an "acquiring" row for a declarative module', async () => {
    const row = await recordEngagement({
      itemRef: 'M3:asc',
      moduleRef: 'intervals',
      signal: { kind: 'attempt', correct: true },
      timestamp: 1000,
    });
    expect(row.acquisitionStage).toBe('acquiring');
    expect(row.memoryType).toBe('declarative');
    expect(row.itemRef).toBe('M3:asc');
    expect(row.moduleRef).toBe('intervals');
    expect(row.lastEngagedAt).toBe(1000);
    expect(row.currentIntervalDays).toBe(0);
    expect(row.nextDueAt).toBeNull();
    expect(row.performanceHistory).toHaveLength(1);
  });

  it('creates an "acquiring" row for a procedural module', async () => {
    const row = await recordEngagement({
      itemRef: 'chord-shape:maj7:Eb',
      moduleRef: 'shapes-and-patterns',
      signal: { kind: 'rating', rating: 'cruising' },
    });
    expect(row.acquisitionStage).toBe('acquiring');
    expect(row.memoryType).toBe('procedural');
  });

  it('creates an "acquiring" row for an integration module', async () => {
    const row = await recordEngagement({
      itemRef: 'song-id-123',
      moduleRef: 'repertoire',
      signal: { kind: 'rating', rating: 'flying' },
    });
    expect(row.acquisitionStage).toBe('acquiring');
    expect(row.memoryType).toBe('integration');
  });

  it('creates an "acquiring" row for an expression module', async () => {
    const row = await recordEngagement({
      itemRef: 'just-play:keys',
      moduleRef: 'just-play',
      signal: { kind: 'recency' },
    });
    expect(row.acquisitionStage).toBe('acquiring');
    expect(row.memoryType).toBe('expression');
  });
});

describe('recordEngagement — signal/memory-type validation', () => {
  it('throws when a rating signal is sent to a declarative module', async () => {
    await expect(recordEngagement({
      itemRef: 'M3:asc',
      moduleRef: 'intervals',
      signal: { kind: 'rating', rating: 'flying' },
    })).rejects.toThrow(/doesn't match memory type "declarative"/);
  });

  it('throws when an attempt signal is sent to a procedural module', async () => {
    await expect(recordEngagement({
      itemRef: 'chord-shape:maj7:Eb',
      moduleRef: 'shapes-and-patterns',
      signal: { kind: 'attempt', correct: true },
    })).rejects.toThrow(/doesn't match memory type "procedural"/);
  });

  it('throws when a rating signal is sent to an expression module', async () => {
    await expect(recordEngagement({
      itemRef: 'just-play:keys',
      moduleRef: 'just-play',
      signal: { kind: 'rating', rating: 'flying' },
    })).rejects.toThrow(/doesn't match memory type "expression"/);
  });

  it('throws on an unknown moduleRef (delegated to getMemoryType)', async () => {
    await expect(recordEngagement({
      itemRef: 'whatever',
      moduleRef: 'not-a-real-module',
      signal: { kind: 'attempt', correct: true },
    })).rejects.toThrow(/unknown moduleRef/);
  });
});

describe('recordEngagement — stage advancement', () => {
  it('advances acquiring → acquired after 5 correct declarative attempts', async () => {
    const itemRef = 'M3:asc';
    const moduleRef = 'intervals';
    let row;
    for (let i = 0; i < 5; i++) {
      row = await recordEngagement({
        itemRef, moduleRef,
        signal: { kind: 'attempt', correct: true },
        timestamp: 1000 + i,
      });
    }
    expect(row!.acquisitionStage).toBe('acquired');
    expect(row!.performanceHistory).toHaveLength(5);
  });

  it('advances acquiring → acquired after 3 cruising ratings', async () => {
    const itemRef = 'chord-shape:maj7:Eb';
    const moduleRef = 'shapes-and-patterns';
    let row;
    for (let i = 0; i < 3; i++) {
      row = await recordEngagement({
        itemRef, moduleRef,
        signal: { kind: 'rating', rating: 'cruising' },
        timestamp: 1000 + i,
      });
    }
    expect(row!.acquisitionStage).toBe('acquired');
  });

  it('does not advance with a single crawling in the last 3', async () => {
    const itemRef = 'song-id-123';
    const moduleRef = 'repertoire';
    await recordEngagement({ itemRef, moduleRef, signal: { kind: 'rating', rating: 'flying' } });
    await recordEngagement({ itemRef, moduleRef, signal: { kind: 'rating', rating: 'crawling' } });
    const row = await recordEngagement({ itemRef, moduleRef, signal: { kind: 'rating', rating: 'flying' } });
    expect(row.acquisitionStage).toBe('acquiring');
  });

  it('expression items never advance past acquiring', async () => {
    const itemRef = 'diary-entry-x';
    const moduleRef = 'harmonic-diary';
    let row;
    for (let i = 0; i < 10; i++) {
      row = await recordEngagement({
        itemRef, moduleRef,
        signal: { kind: 'recency' },
        timestamp: 1000 + i,
      });
    }
    expect(row!.acquisitionStage).toBe('acquiring');
    expect(row!.performanceHistory).toHaveLength(10);
  });
});

describe('recordEngagement — history cap', () => {
  it(`caps performanceHistory at PERFORMANCE_HISTORY_MAX (${PERFORMANCE_HISTORY_MAX})`, async () => {
    const itemRef = 'M3:asc';
    const moduleRef = 'intervals';
    for (let i = 0; i < PERFORMANCE_HISTORY_MAX + 5; i++) {
      await recordEngagement({
        itemRef, moduleRef,
        signal: { kind: 'attempt', correct: true },
        timestamp: 1000 + i,
      });
    }
    const row = await getSpacingState(itemRef, moduleRef);
    expect(row!.performanceHistory).toHaveLength(PERFORMANCE_HISTORY_MAX);
    // The cap drops the oldest, so the first entry's t should be the
    // sixth attempt (index 5 → timestamp 1005).
    const first = row!.performanceHistory[0] as { t: number };
    expect(first.t).toBe(1000 + 5);
  });
});

describe('recordEngagement — idempotent upsert behavior', () => {
  it('a second call upserts (not duplicates) the row', async () => {
    const itemRef = 'M3:asc';
    const moduleRef = 'intervals';
    await recordEngagement({ itemRef, moduleRef, signal: { kind: 'attempt', correct: true } });
    await recordEngagement({ itemRef, moduleRef, signal: { kind: 'attempt', correct: false } });
    const all = await db.spacingState.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].performanceHistory).toHaveLength(2);
  });

  it('lastEngagedAt advances with each call', async () => {
    const itemRef = 'M3:asc';
    const moduleRef = 'intervals';
    await recordEngagement({ itemRef, moduleRef, signal: { kind: 'attempt', correct: true }, timestamp: 1000 });
    const row2 = await recordEngagement({ itemRef, moduleRef, signal: { kind: 'attempt', correct: true }, timestamp: 2000 });
    expect(row2.lastEngagedAt).toBe(2000);
  });
});

describe('getSpacingState', () => {
  it('returns undefined for an item with no row (canonical "new" stage)', async () => {
    const row = await getSpacingState('never-touched', 'intervals');
    expect(row).toBeUndefined();
  });

  it('returns the row after recordEngagement creates it', async () => {
    await recordEngagement({
      itemRef: 'M3:asc', moduleRef: 'intervals',
      signal: { kind: 'attempt', correct: true },
    });
    const row = await getSpacingState('M3:asc', 'intervals');
    expect(row).toBeDefined();
    expect(row!.itemRef).toBe('M3:asc');
  });

  it('isolates lookups by (moduleRef, itemRef)', async () => {
    await recordEngagement({
      itemRef: 'M3', moduleRef: 'intervals',
      signal: { kind: 'attempt', correct: true },
    });
    await recordEngagement({
      itemRef: 'M3', moduleRef: 'chord-recognition',
      signal: { kind: 'attempt', correct: true },
    });
    const intervalRow = await getSpacingState('M3', 'intervals');
    const chordRow = await getSpacingState('M3', 'chord-recognition');
    expect(intervalRow).toBeDefined();
    expect(chordRow).toBeDefined();
    expect(intervalRow!.id).not.toBe(chordRow!.id);
  });
});
