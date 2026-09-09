// @vitest-environment jsdom
/**
 * A movement is part of the shapes denominator (ruling 48).
 *
 * =====================================================================
 * THE FAILURE THIS PREVENTS HAS HAPPENED BEFORE, ON THE OTHER AXIS.
 *
 * `cellTargets`'s own header records it: the coverage NUMERATOR counts
 * `spacingState` rows, so when the denominator counted something else —
 * there, itemRefs with no hand axis — a chord-shape goal could read
 * over 100%. Drilling a movement writes rows under `vl:{id}:…` exactly
 * as drilling a pattern does, so a denominator that stopped at the
 * catalog was the same shape waiting to happen again.
 *
 * =====================================================================
 * TWELVE PER MOVEMENT, AND THE NUMBER IS THE POINT.
 *
 * One row across twelve keys (ruling 20). These assert the arithmetic
 * rather than "it went up", because a denominator that grew by the
 * wrong amount is a denominator that is still wrong.
 *
 * NOTHING CHANGES TODAY, and that is worth saying plainly: with no
 * movements captured, every number below is what it was. What changed
 * is that the machinery is there when the first one is.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { shapesCounts } from '../moduleItemCounts';
import { shapesTargetUniverse } from '../../modules/shapes-and-patterns/cellTargets';
import {
  shapesCoverageDenominator, shapesCoverageDenominators,
} from '../../modules/goals/shapesCoverageGroups';
import { loadScopeMaintenanceViews } from '../sessionAlgorithm/scopeMaintenanceResolve';
import { listMovementIds } from '../../modules/shapes-and-patterns/movements/movementStore';
import { encodeShapesPatterns } from '../../modules/goals/GoalCreationFlow';
import { encodeDimensionRecords } from '../../modules/goals/YearlyAnchorFlow';
import { dimensionRowsFor } from '../../modules/goals/yearlyAnchorReview';

const KEYS_PER_MOVEMENT = 12;
const MOVEMENTS = ['mv-walk-up', 'mv-turnaround'];

describe('the count', () => {
  it('adds twelve targets per movement, on the voice-leading section', () => {
    const before = shapesCounts();
    const after = shapesCounts(undefined, MOVEMENTS);
    expect(after.voiceLeading - before.voiceLeading)
      .toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
    expect(after.total - before.total)
      .toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
  });

  it('leaves the other two sections alone', () => {
    const before = shapesCounts();
    const after = shapesCounts(undefined, MOVEMENTS);
    expect(after.chordShapeDrills).toBe(before.chordShapeDrills);
    expect(after.scaleDrills).toBe(before.scaleDrills);
  });

  it('is exactly what it was when no list is passed', () => {
    // The whole safety of threading rather than reading: a caller that
    // has no movements in hand gets the catalog, which is what it got
    // before this existed.
    expect(shapesCounts(undefined, [])).toEqual(shapesCounts());
  });
});

describe('the universe a goal is scoped out of', () => {
  it('holds the movement targets too', () => {
    const before = shapesTargetUniverse();
    const after = shapesTargetUniverse(undefined, MOVEMENTS);
    expect(after.length - before.length)
      .toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
  });

  it('puts them where a voice-leading coverage group can see them', () => {
    // The group's own matcher decides what is in it. If a movement's
    // itemRef did not match, the denominator would still be short and
    // this would read zero.
    const before = shapesCoverageDenominator('voice_leading');
    const after = shapesCoverageDenominator('voice_leading', undefined, MOVEMENTS);
    expect(after - before).toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
  });
});

describe('the number a goal is OFFERED at', () => {
  /**
   * FOLLOW-UP RULING 3. It was the catalog-only total while the number
   * the goal is MEASURED against counted movements too — so a goal
   * saved today would carry a `targetValue` it could exceed. A movement
   * is part of the pool from the moment it exists.
   *
   * The four callers named in the commit-7 report all take the list
   * now; these assert the two ends of the chain that actually store a
   * number.
   */
  const sp = () => ({
    coverageEnabled: true,
    coverageScope: 'overall' as const,
    coverageGroupIds: [],
    proficiencyEnabled: false,
    consistencyEnabled: false,
    consistencyCount: 0,
  });

  it('is the measured total, in the goal wizard', () => {
    const withOut = encodeShapesPatterns(sp() as never);
    const withIn = encodeShapesPatterns(sp() as never, MOVEMENTS);
    expect(withIn[0].targetValue! - withOut[0].targetValue!)
      .toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
    expect(withIn[0].description).toContain(String(withIn[0].targetValue));
  });

  it('is the measured total, in the yearly anchor', () => {
    const draft = {
      moduleId: 'shapes-and-patterns' as const,
      shapesPatterns: {
        breadth: { kind: 'all' as const, groupIds: [] },
        depth: { areaIds: [] },
        mastery: { areaIds: [] },
        consistency: { count: 3, cadence: 'week' as const },
      },
    };
    const withOut = encodeDimensionRecords(draft as never);
    const withIn = encodeDimensionRecords(draft as never, MOVEMENTS);
    expect(withIn[0].targetValue! - withOut[0].targetValue!)
      .toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
  });

  it('is the measured total for the voice-leading GROUP too', () => {
    // The one level down from the overall figure: a goal set on the
    // voice-leading group alone was offered at the catalog number while
    // being measured against one that counts movements.
    const live = shapesCoverageDenominators(MOVEMENTS);
    const atRest = shapesCoverageDenominators();
    expect(live.get('voice_leading')! - atRest.get('voice_leading')!)
      .toBe(MOVEMENTS.length * KEYS_PER_MOVEMENT);
  });

  it('and leaves the per-pattern groups alone, because a movement is not a pattern', () => {
    const live = shapesCoverageDenominators(MOVEMENTS);
    const atRest = shapesCoverageDenominators();
    for (const [id, n] of atRest) {
      if (id === 'voice_leading') continue;
      expect(live.get(id), id).toBe(n);
    }
  });

  it('and the review sentence agrees with what was saved', () => {
    const draft = {
      moduleId: 'shapes-and-patterns' as const,
      shapesPatterns: {
        breadth: { kind: 'all' as const, groupIds: [] },
        depth: { areaIds: [] },
        mastery: { areaIds: [] },
        consistency: { count: 3, cadence: 'week' as const },
      },
    };
    const saved = encodeDimensionRecords(draft as never, MOVEMENTS)[0].targetValue!;
    const rows = dimensionRowsFor(draft as never, MOVEMENTS);
    expect(rows[0].value).toContain(String(saved));
  });
});

describe('the one async entry point supplies the list', () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.spacingState.clear();
    await db.chordMovements.clear();
  });

  it('asks Shapes & Patterns for its own list', async () => {
    // THE TABLE'S NAME STAYS INSIDE ITS MODULE. `movementStore`'s own
    // test asserts that nothing under `lib/sessionAlgorithm/` names
    // `chordMovements` — a movement is part of the shapes denominator
    // and must never be repertoire, and reading the table there would
    // have bought the first claim by making the second untestable.
    await db.chordMovements.add({
      id: 'mv-walk-up', name: 'The walk-up', barLayout: ['empty'],
      placements: [], createdAt: 1, updatedAt: 1,
    } as never);
    expect(await listMovementIds()).toEqual(['mv-walk-up']);
    await expect(
      loadScopeMaintenanceViews(Date.now(), await listMovementIds()),
    ).resolves.toEqual([]);
  });
});
