// @vitest-environment jsdom
/**
 * Polish-sprint test — locks in the hard context filter on the
 * algorithm's candidate aggregation.
 *
 * Two filters compose:
 *   · isSpacingRowCompatibleWithContext — drops Shapes & Patterns
 *     rows under non-keys (mental-viz isn't in spacingState, so
 *     there's no item-level subset to surface; module drops).
 *   · isGoalCompatibleWithContext — rank ladder so a goal tagged
 *     'keys' doesn't contribute when the user is on phone/laptop.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateGoalCandidatesByModule,
  isGoalCompatibleWithContext,
  isSpacingRowCompatibleWithContext,
} from '../sessionGenerator';
import type { Goal, PracticeSessionContext, SpacingState } from '../../../lib/db';

const NOW = 1_700_000_000_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function spacingRow(partial: Partial<SpacingState>): SpacingState {
  return {
    id: 'row-x',
    itemRef: 'item-x',
    hand: 'both',
    style: 'solid',
    moduleRef: 'harmonic-fluency',
    memoryType: 'declarative',
    acquisitionStage: 'new',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...partial,
  };
}

function coverageGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-x',
    scope: 'monthly',
    description: 'cover items',
    targetMetric: 'harmonic_fluency_coverage_at_acquired',
    targetValue: 50,
    targetUnit: null,
    currentValue: 5,
    contextTag: null,
    relatedModules: ['harmonic-fluency'],
    relatedItems: [],
    startDate: NOW - 10 * MS_PER_DAY,
    targetDate: NOW + 20 * MS_PER_DAY,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------
// Predicate-level tests
// ---------------------------------------------------------------------

describe('isGoalCompatibleWithContext — rank ladder', () => {
  it('null contextTag is always compatible', () => {
    const g = coverageGoal({ contextTag: null });
    for (const ctx of ['keys', 'laptop', 'phone', 'mixed'] as PracticeSessionContext[]) {
      expect(isGoalCompatibleWithContext(g, ctx)).toBe(true);
    }
  });

  it('keys-tagged goal needs keys or mixed; drops on laptop or phone', () => {
    const g = coverageGoal({ contextTag: 'keys' });
    expect(isGoalCompatibleWithContext(g, 'keys')).toBe(true);
    expect(isGoalCompatibleWithContext(g, 'keys')).toBe(true);
    expect(isGoalCompatibleWithContext(g, 'laptop')).toBe(false);
    expect(isGoalCompatibleWithContext(g, 'phone')).toBe(false);
  });

  it('laptop-tagged goal passes on keys/mixed/laptop; drops on phone', () => {
    const g = coverageGoal({ contextTag: 'laptop' });
    expect(isGoalCompatibleWithContext(g, 'keys')).toBe(true);
    expect(isGoalCompatibleWithContext(g, 'keys')).toBe(true);
    expect(isGoalCompatibleWithContext(g, 'laptop')).toBe(true);
    expect(isGoalCompatibleWithContext(g, 'phone')).toBe(false);
  });

  it('phone-tagged goal passes everywhere (least constrained)', () => {
    const g = coverageGoal({ contextTag: 'phone' });
    for (const ctx of ['keys', 'laptop', 'phone'] as PracticeSessionContext[]) {
      expect(isGoalCompatibleWithContext(g, ctx)).toBe(true);
    }
  });
});

describe('isSpacingRowCompatibleWithContext — context arc hard filters', () => {
  it('keys passes Shapes + Repertoire; drops HF + ET + Production (Phase 4 Step 5)', () => {
    const shapes = spacingRow({ moduleRef: 'shapes-and-patterns' });
    const rep = spacingRow({ moduleRef: 'repertoire' });
    const hf = spacingRow({ moduleRef: 'harmonic-fluency' });
    const et = spacingRow({ moduleRef: 'intervals' });
    const prod = spacingRow({ moduleRef: 'production' });
    const ctx = 'keys' as PracticeSessionContext;
    expect(isSpacingRowCompatibleWithContext(shapes, ctx)).toBe(true);
    expect(isSpacingRowCompatibleWithContext(rep, ctx)).toBe(true);
    // Phase 4 Step 5: physical-instrument sessions exclude the
    // cognitive modules from the default proposal — they're
    // available via + Add module if the user wants them, but the
    // algorithm doesn't surface them on its own.
    expect(isSpacingRowCompatibleWithContext(hf, ctx)).toBe(false);
    expect(isSpacingRowCompatibleWithContext(et, ctx)).toBe(false);
    expect(isSpacingRowCompatibleWithContext(prod, ctx)).toBe(false);
  });

  it('laptop + phone drop Shapes & Patterns; keep all others', () => {
    const shapes = spacingRow({ moduleRef: 'shapes-and-patterns' });
    const hf = spacingRow({ moduleRef: 'harmonic-fluency' });
    const rep = spacingRow({ moduleRef: 'repertoire' });
    const et = spacingRow({ moduleRef: 'intervals' });
    const prod = spacingRow({ moduleRef: 'production' });
    for (const ctx of ['laptop', 'phone'] as PracticeSessionContext[]) {
      expect(isSpacingRowCompatibleWithContext(shapes, ctx)).toBe(false);
      expect(isSpacingRowCompatibleWithContext(hf, ctx)).toBe(true);
      expect(isSpacingRowCompatibleWithContext(rep, ctx)).toBe(true);
      expect(isSpacingRowCompatibleWithContext(et, ctx)).toBe(true);
      expect(isSpacingRowCompatibleWithContext(prod, ctx)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// Integration: aggregateGoalCandidatesByModule end-to-end
// ---------------------------------------------------------------------

describe('aggregateGoalCandidatesByModule — context filter integration', () => {
  it('keys context: Shapes block contributes when goal + rows align', () => {
    const goal = coverageGoal({
      id: 'g-shapes',
      targetMetric: 'shapes_coverage_at_acquired',
      contextTag: 'keys',
      relatedModules: ['shapes-and-patterns'],
    });
    const row = spacingRow({
      itemRef: 'scale:major:C',
      moduleRef: 'shapes-and-patterns',
      memoryType: 'procedural',
    });

    const blocks = aggregateGoalCandidatesByModule([goal], [row], NOW, 'keys');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].moduleRef).toBe('shapes-and-patterns');
  });

  it('phone context: Shapes block drops because spacing rows are filtered out', () => {
    const goal = coverageGoal({
      id: 'g-shapes',
      targetMetric: 'shapes_coverage_at_acquired',
      contextTag: 'phone',
      relatedModules: ['shapes-and-patterns'],
    });
    const row = spacingRow({
      itemRef: 'scale:major:C',
      moduleRef: 'shapes-and-patterns',
      memoryType: 'procedural',
    });

    const blocks = aggregateGoalCandidatesByModule([goal], [row], NOW, 'phone');
    expect(blocks).toEqual([]);
  });

  it('phone context: keys-tagged HF goal drops; null-tagged HF goal survives', () => {
    const keysGoal = coverageGoal({ id: 'g-keys', contextTag: 'keys' });
    const nullGoal = coverageGoal({ id: 'g-null', contextTag: null });
    const row = spacingRow({
      itemRef: 'card-1',
      moduleRef: 'harmonic-fluency',
    });

    const onlyKeys = aggregateGoalCandidatesByModule([keysGoal], [row], NOW, 'phone');
    expect(onlyKeys).toEqual([]);

    const onlyNull = aggregateGoalCandidatesByModule([nullGoal], [row], NOW, 'phone');
    expect(onlyNull).toHaveLength(1);
    expect(onlyNull[0].moduleRef).toBe('harmonic-fluency');
  });

  it('laptop context: laptop-tagged production goal contributes; phone context drops it', () => {
    const goal = coverageGoal({
      id: 'g-prod',
      targetMetric: 'production_coverage_at_acquired',
      contextTag: 'laptop',
      relatedModules: ['production'],
    });
    const row = spacingRow({
      itemRef: 'wf-01',
      moduleRef: 'production',
      memoryType: 'integration',
    });

    const onLaptop = aggregateGoalCandidatesByModule([goal], [row], NOW, 'laptop');
    expect(onLaptop).toHaveLength(1);

    const onPhone = aggregateGoalCandidatesByModule([goal], [row], NOW, 'phone');
    expect(onPhone).toEqual([]);
  });

  it('default context (mixed) preserves pre-filter behaviour for backwards compat', () => {
    // No context arg — should default to 'mixed' which is keys-equivalent.
    const goal = coverageGoal({
      targetMetric: 'shapes_coverage_at_acquired',
      contextTag: 'keys',
      relatedModules: ['shapes-and-patterns'],
    });
    const row = spacingRow({
      itemRef: 'scale:major:C',
      moduleRef: 'shapes-and-patterns',
      memoryType: 'procedural',
    });

    const blocks = aggregateGoalCandidatesByModule([goal], [row], NOW);
    expect(blocks).toHaveLength(1);
  });
});
