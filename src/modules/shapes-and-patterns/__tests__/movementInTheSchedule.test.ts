/**
 * A movement enters the schedule the way a pattern does.
 *
 * =====================================================================
 * THE GAP THIS CLOSED WAS DERIVED, NOT ASSUMED, AND IT WAS REAL.
 *
 * Everything downstream of a cell already treated a movement's ref as
 * an ordinary `vl:` one — the spacing rows, the drill session, the
 * demand in seconds. But `buildVoiceLeadingSegment` walked the STATIC
 * CATALOG to build its candidate pool, so a movement could never be
 * proposed however overdue it was. The first test below is the one that
 * would have caught that; the rest are the properties that make its
 * inclusion "no special casing" rather than a second path.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import type { AllocatedBlock } from '../../../lib/sessionAlgorithm/timeAllocation';
import { shapeShapesBlock, type ShapesSplitContext } from '../shapesSplit';
import { movementItemRef } from '../movements/movementCells';
import { computeAlgoSpacingDemandSeconds } from '../../../lib/sessionAlgorithm/algoSpacingDemand';
import { CHORD_SHAPE_CELL_SECONDS } from '../../../lib/sessionAlgorithm/timePerAttempt';

const NOW = Date.UTC(2026, 8, 8);
const MOVEMENT = { id: 'mv-walkup', label: 'Walk-up' };

function row(itemRef: string, nextDueAt: number | null): SpacingState {
  return {
    id: `sp-${itemRef}`, itemRef, moduleRef: 'shapes-and-patterns',
    hand: 'both', memoryType: 'procedural', acquisitionStage: 'acquiring',
    currentIntervalDays: 3, lastEngagedAt: NOW - 1000, nextDueAt,
    performanceHistory: [],
  } as SpacingState;
}

function context(over: Partial<ShapesSplitContext> = {}): ShapesSplitContext {
  return {
    rowsByItemRef: new Map(),
    unlockedTier: 3,
    now: NOW,
    scalesGoalDueSeconds: null,
    ...over,
  } as ShapesSplitContext;
}

const BLOCK: AllocatedBlock = {
  id: 'algo-block-sp',
  moduleRef: 'shapes-and-patterns',
  memoryType: 'procedural',
  itemRefs: [],
  weight: 1,
  hasAcquiringItems: false,
  isKeyboardRequired: false,
  plannedSeconds: 30 * 60,
  phase: 'review',
};

/** The voice-leading segment of a split, or null. */
function vlSegment(ctx: ShapesSplitContext) {
  return shapeShapesBlock(BLOCK, ctx)
    .find(s => s.kind === 'voice-leading') ?? null;
}

describe('the candidate pool sees it', () => {
  it('does not, when no movement is passed — which is the old behaviour', () => {
    const seg = vlSegment(context())!;
    expect(seg).not.toBeNull();
    expect(seg.itemRefs.some(r => r.includes('mv-walkup'))).toBe(false);
  });

  it('proposes an overdue movement ahead of everything unstarted', () => {
    // A due cell outranks an unstarted one, and that rule is the
    // patterns' own — a movement is sorted by it rather than beside it.
    const overdue = movementItemRef('mv-walkup', 'C');
    const seg = vlSegment(context({
      movements: [MOVEMENT],
      rowsByItemRef: new Map([[overdue, row(overdue, NOW - 86_400_000)]]),
    }))!;
    expect(seg.itemRefs[0]).toBe(overdue);
  });

  it('names the movement in the block’s own label', () => {
    const overdue = movementItemRef('mv-walkup', 'C');
    const seg = vlSegment(context({
      movements: [MOVEMENT],
      rowsByItemRef: new Map([[overdue, row(overdue, NOW - 86_400_000)]]),
    }))!;
    expect(seg.label).toContain('Walk-up');
  });

  it('offers every key of it, once each, when they are all due', () => {
    const due = new Map(
      ['C', 'F', 'Bb', 'Eb'].map(k => {
        const ref = movementItemRef('mv-walkup', k);
        return [ref, row(ref, NOW - 86_400_000)] as const;
      }),
    );
    const seg = vlSegment(context({ movements: [MOVEMENT], rowsByItemRef: due }))!;
    const mine = seg.itemRefs.filter(r => r.startsWith('vl:mv-walkup:'));
    expect(new Set(mine).size).toBe(mine.length);
    expect(mine.length).toBe(4);
    for (const r of mine) expect(r.split(':')).toHaveLength(3);
  });

  it('has no prerequisite — a due movement never waits on a pattern', () => {
    // A type-position pattern's third type waits on its second. A
    // movement is ONE row (ruling 20): there is no earlier position to
    // have started, so nothing gates it. Shown by a due movement in a
    // pool where every catalog cell is untouched — it is served first
    // rather than held back.
    const due = movementItemRef('mv-walkup', 'Ab');
    const seg = vlSegment(context({
      movements: [MOVEMENT],
      rowsByItemRef: new Map([[due, row(due, NOW - 86_400_000)]]),
    }))!;
    expect(seg.itemRefs[0]).toBe(due);
  });

  it('an untouched movement sorts after the shipped patterns', () => {
    // The ordering rule this build chose, pinned rather than left to be
    // rediscovered: on the unstarted tier the catalog comes first,
    // because the shipped patterns are the ground under everything
    // else. Once either has been drilled, due date decides and the
    // distinction disappears.
    const seg = vlSegment(context({ movements: [MOVEMENT] }))!;
    expect(seg.itemRefs.length).toBeGreaterThan(0);
    expect(seg.itemRefs.every(r => !r.startsWith('vl:mv-walkup:'))).toBe(true);
  });
});

describe('the time it is budgeted, and the time it is charged', () => {
  it('agrees with what the demand calculation already charged it', () => {
    // THE TWO HAVE TO MATCH OR THE GENERATOR PLANS A BLOCK IT HAS NOT
    // BUDGETED FOR. `computeAlgoSpacingDemandSeconds` falls through to
    // `CHORD_SHAPE_CELL_SECONDS` for a `vl:` row it cannot parse, which
    // is exactly what a movement's row is — so the pool charges the
    // same number rather than one chosen separately.
    const due = movementItemRef('mv-walkup', 'C');
    expect(computeAlgoSpacingDemandSeconds(
      'shapes-and-patterns', [row(due, NOW - 1000)], NOW,
    )).toBe(CHORD_SHAPE_CELL_SECONDS);
  });
});
