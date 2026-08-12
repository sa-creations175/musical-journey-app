// @vitest-environment jsdom
/**
 * Scope-level maintenance — trigger + scope identity/cardinality.
 *
 * jsdom for the same reason candidates.test.ts needs it: the goals
 * module graph touches `window` at load behind an import.meta.env.DEV
 * guard. The tests themselves are pure.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../db';
import type { PerformanceEntry } from '../../spacingState';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
} from '../../../modules/goals/coverageMetrics';
import {
  harmonicFluencyCounts,
  earTrainingCounts,
} from '../../moduleItemCounts';
import { HF_GROUP_CATEGORIES } from '../../../modules/goals/progress';
import {
  HF_UNIT_TO_COUNT_GROUP,
  catalogTotalForGoal,
  scopeKeyForGoal,
} from '../scopeCatalog';
import {
  MAINTENANCE_ACCURACY_WINDOW,
  MAINTENANCE_MIN_DISTINCT_DAYS,
  distinctLocalDays,
  itemMeetsMaintenanceBar,
  scopeQualifiesForMaintenance,
  type MaintenanceItemRow,
} from '../scopeMaintenance';

function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1', scope: 'monthly', description: '',
    targetMetric: null, targetValue: null, targetUnit: null,
    currentValue: 0, contextTag: null, relatedModules: [], relatedItems: [],
    startDate: 0, targetDate: 0, status: 'active', parentGoalId: null,
    contributesNumericallyToParent: false, isUmbrella: false,
    lastEngagedAt: null,
    ...partial,
  };
}

const DAY = 24 * 60 * 60 * 1000;
/** Local noon on a fixed date, so day bucketing never straddles a
 *  midnight regardless of the runner's timezone. */
const BASE = new Date(2026, 0, 5, 12, 0, 0).getTime();

/** N attempts spread across `days` distinct local days, `wrong` of
 *  them incorrect (the wrong ones placed first). */
function attempts(
  n: number, days: number, wrong = 0,
): PerformanceEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    t: BASE + (i % days) * DAY,
    kind: 'attempt' as const,
    correct: i >= wrong,
  }));
}

describe('distinctLocalDays', () => {
  it('counts calendar days, not entries', () => {
    expect(distinctLocalDays(attempts(20, 4))).toBe(4);
    expect(distinctLocalDays(attempts(20, 1))).toBe(1);
  });

  it('two entries hours apart on one day count once', () => {
    expect(distinctLocalDays([
      { t: new Date(2026, 0, 5, 8, 0).getTime() },
      { t: new Date(2026, 0, 5, 22, 0).getTime() },
    ])).toBe(1);
  });
});

describe('itemMeetsMaintenanceBar', () => {
  it('passes a full clean window spread across four days', () => {
    expect(itemMeetsMaintenanceBar(attempts(20, 4))).toBe(true);
  });

  it('passes at exactly 90% — two wrong out of twenty', () => {
    expect(itemMeetsMaintenanceBar(attempts(20, 4, 2))).toBe(true);
  });

  it('fails just under 90% — three wrong out of twenty', () => {
    expect(itemMeetsMaintenanceBar(attempts(20, 4, 3))).toBe(false);
  });

  it('REJECTS a cramming sitting: perfect accuracy, one day', () => {
    // The property the day-spread gate exists to protect.
    expect(itemMeetsMaintenanceBar(attempts(20, 1))).toBe(false);
    expect(itemMeetsMaintenanceBar(attempts(20, 3))).toBe(false);
    expect(itemMeetsMaintenanceBar(attempts(20, 4))).toBe(true);
  });

  it('fails on a partial buffer however clean', () => {
    expect(itemMeetsMaintenanceBar(attempts(19, 4))).toBe(false);
    expect(itemMeetsMaintenanceBar([])).toBe(false);
  });

  it('measures only the windowed attempts, not all history', () => {
    // Old failures outside the window must not drag a currently
    // steady item down...
    const old = attempts(10, 4, 10).map(a => ({ ...a, t: a.t - 90 * DAY }));
    expect(itemMeetsMaintenanceBar([...old, ...attempts(20, 4)])).toBe(true);
    // ...and an old good stretch must not rescue a bad current one.
    expect(itemMeetsMaintenanceBar([...attempts(20, 4), ...attempts(20, 4, 5)]))
      .toBe(false);
  });

  it('takes the day spread from the window too', () => {
    // 20 well-spread old attempts followed by 20 crammed recent ones
    // must fail: the spread has to describe what is being measured.
    const old = attempts(20, 8).map(a => ({ ...a, t: a.t - 90 * DAY }));
    expect(itemMeetsMaintenanceBar([...old, ...attempts(20, 1)])).toBe(false);
  });

  it('ignores non-attempt entries', () => {
    const withRating: PerformanceEntry[] = [
      { t: BASE, kind: 'rating', rating: 'flying' },
      ...attempts(20, 4),
    ];
    expect(itemMeetsMaintenanceBar(withRating)).toBe(true);
  });
});

// =====================================================================
// Scope identity + cardinality
// =====================================================================

describe('scopeKeyForGoal', () => {
  it('is the metric for overall scopes', () => {
    expect(scopeKeyForGoal(makeGoal({
      targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
    }))).toBe('harmonic_fluency_coverage_at_acquired');
  });

  it('includes the sub-area for specific scopes', () => {
    expect(scopeKeyForGoal(makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'chord-knowledge',
    }))).toBe('harmonic_fluency_coverage_at_acquired_specific:chord-knowledge');
  });

  it('is stable across two goals over the same scope', () => {
    const a = makeGoal({ id: 'a', targetMetric: COVERAGE_OVERALL_METRIC.SHAPES });
    const b = makeGoal({ id: 'b', targetMetric: COVERAGE_OVERALL_METRIC.SHAPES });
    expect(scopeKeyForGoal(a)).toBe(scopeKeyForGoal(b));
  });

  it('is null for non-coverage goals', () => {
    expect(scopeKeyForGoal(makeGoal({ targetMetric: null }))).toBeNull();
    expect(scopeKeyForGoal(makeGoal({
      targetMetric: 'harmonic_fluency_accuracy_overall',
    }))).toBeNull();
  });
});

describe('catalogTotalForGoal', () => {
  it('overall scopes read the module total', () => {
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
    }))).toBe(harmonicFluencyCounts().total);
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING,
    }))).toBe(earTrainingCounts().total);
  });

  it('HF sub-areas translate kebab targetUnit to the camelCase group', () => {
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'chord-knowledge',
    }))).toBe(harmonicFluencyCounts().byGroup.chordKnowledge);
  });

  it('ET sub-areas read their own count', () => {
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: 'chord-recognition',
    }))).toBe(earTrainingCounts().chordRecognition);
  });

  it('is null for an unresolvable sub-area', () => {
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
      targetUnit: 'no-such-group',
    }))).toBeNull();
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
      targetUnit: null,
    }))).toBeNull();
  });

  it('is null for non-coverage goals', () => {
    expect(catalogTotalForGoal(makeGoal({
      targetMetric: 'harmonic_fluency_accuracy_overall',
    }))).toBeNull();
  });

  it('DRIFT GUARD: the two HF group mappings still describe the same groups', () => {
    // progress.ts (kebab, what a goal's targetUnit carries) and
    // moduleItemCounts.ts (camelCase, what the denominators are keyed
    // by) keep independent hand-maintained copies of the same
    // group→category mapping. If either gains or loses a group this
    // fails, rather than a scope silently resolving to a null total.
    const kebab = Object.keys(HF_GROUP_CATEGORIES).sort();
    const translated = Object.keys(HF_UNIT_TO_COUNT_GROUP).sort();
    expect(translated).toEqual(kebab);
    const camel = Object.keys(harmonicFluencyCounts().byGroup).sort();
    expect(Object.values(HF_UNIT_TO_COUNT_GROUP).sort()).toEqual(camel);
  });
});

// =====================================================================
// Scope verdict
// =====================================================================

const HF = 'harmonic-fluency';
const inScope = () => true;

function hfRows(
  n: number,
  build: (i: number) => Partial<MaintenanceItemRow> = () => ({}),
): MaintenanceItemRow[] {
  return Array.from({ length: n }, (_, i) => ({
    itemRef: `card-${i}`,
    moduleRef: HF,
    acquisitionStage: 'acquired' as const,
    performanceHistory: attempts(20, 4),
    ...build(i),
  }));
}

/** A goal over a scope small enough to fill in a test. Uses the HF
 *  overall metric and the real catalog total. */
const hfGoal = () =>
  makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY });
const HF_TOTAL = harmonicFluencyCounts().total;

describe('scopeQualifiesForMaintenance', () => {
  it('qualifies when the whole catalog is acquired and steady', () => {
    const v = scopeQualifiesForMaintenance(
      hfGoal(), hfRows(HF_TOTAL), inScope, [HF],
    );
    expect(v).toEqual({
      qualifies: true, reason: null,
      catalogTotal: HF_TOTAL, acquiredCount: HF_TOTAL,
    });
  });

  it('THE CARDINALITY GATE: three acquired of a full catalog is not finished', () => {
    // The exact case row-count saturation gets wrong.
    const v = scopeQualifiesForMaintenance(
      hfGoal(), hfRows(3), inScope, [HF],
    );
    expect(v.qualifies).toBe(false);
    expect(v.reason).toBe('items-not-all-acquired');
    expect(v.acquiredCount).toBe(3);
    expect(v.catalogTotal).toBe(HF_TOTAL);
  });

  it('one item short still does not qualify', () => {
    const v = scopeQualifiesForMaintenance(
      hfGoal(), hfRows(HF_TOTAL - 1), inScope, [HF],
    );
    expect(v.reason).toBe('items-not-all-acquired');
  });

  it('a single item below the bar disqualifies the whole scope', () => {
    const rows = hfRows(HF_TOTAL, i =>
      i === 7 ? { performanceHistory: attempts(20, 1) } : {});
    const v = scopeQualifiesForMaintenance(hfGoal(), rows, inScope, [HF]);
    expect(v.qualifies).toBe(false);
    expect(v.reason).toBe('bar-not-met');
  });

  it('an unacquired item is not counted even with a perfect history', () => {
    const rows = hfRows(HF_TOTAL, i =>
      i === 0 ? { acquisitionStage: 'acquiring' as const } : {});
    expect(scopeQualifiesForMaintenance(hfGoal(), rows, inScope, [HF]).reason)
      .toBe('items-not-all-acquired');
  });

  it('de-duplicates by itemRef so extra rows cannot inflate the count', () => {
    // spacingState is unique on [moduleRef+itemRef+hand+style]; a
    // duplicated itemRef must not count twice toward the catalog.
    const dupes = hfRows(3).flatMap(r => [r, { ...r }]);
    const v = scopeQualifiesForMaintenance(hfGoal(), dupes, inScope, [HF]);
    expect(v.acquiredCount).toBe(3);
  });

  it('honours the scope filter', () => {
    const rows = hfRows(HF_TOTAL);
    const only = (ref: string) => ref === 'card-0';
    expect(scopeQualifiesForMaintenance(hfGoal(), rows, only, [HF]).acquiredCount)
      .toBe(1);
  });

  it('ignores rows from outside the module set', () => {
    const rows = hfRows(HF_TOTAL, () => ({ moduleRef: 'intervals' }));
    expect(scopeQualifiesForMaintenance(hfGoal(), rows, inScope, [HF]).acquiredCount)
      .toBe(0);
  });

  it('rating-based scopes report no accuracy signal, not a bare false', () => {
    // Shapes is procedural, Repertoire/Production integration —
    // recordEngagement refuses attempt signals for all three, so
    // there is no accuracy to threshold.
    for (const ref of ['shapes-and-patterns', 'repertoire', 'production']) {
      const v = scopeQualifiesForMaintenance(
        makeGoal({ targetMetric: COVERAGE_OVERALL_METRIC.SHAPES }),
        [], inScope, [ref],
      );
      expect(v.qualifies).toBe(false);
      expect(v.reason).toBe('no-accuracy-signal');
    }
  });

  it('a mixed declarative/rating scope reports no accuracy signal', () => {
    const v = scopeQualifiesForMaintenance(
      hfGoal(), [], inScope, [HF, 'shapes-and-patterns'],
    );
    expect(v.reason).toBe('no-accuracy-signal');
  });

  it('an empty module set is not a coverage scope', () => {
    expect(scopeQualifiesForMaintenance(hfGoal(), [], inScope, []).reason)
      .toBe('not-a-coverage-scope');
  });

  it('an unresolvable catalog total disqualifies rather than defaulting', () => {
    const v = scopeQualifiesForMaintenance(
      makeGoal({
        targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
        targetUnit: 'no-such-group',
      }),
      hfRows(5), inScope, [HF],
    );
    expect(v.qualifies).toBe(false);
    expect(v.reason).toBe('unknown-catalog-total');
  });

  it('an empty scope never qualifies', () => {
    expect(scopeQualifiesForMaintenance(hfGoal(), [], inScope, [HF]).qualifies)
      .toBe(false);
  });
});

describe('threshold constants', () => {
  it('the window sits at the performanceHistory ceiling', async () => {
    // The window cannot exceed what the store retains. If
    // PERFORMANCE_HISTORY_MAX is ever lowered, no item can qualify
    // and this catches it at build time rather than in the wild.
    const { PERFORMANCE_HISTORY_MAX } = await import('../../spacingState');
    expect(MAINTENANCE_ACCURACY_WINDOW).toBeLessThanOrEqual(PERFORMANCE_HISTORY_MAX);
  });

  it('the spread gate is wide enough to exclude a single sitting', () => {
    expect(MAINTENANCE_MIN_DISTINCT_DAYS).toBeGreaterThan(1);
  });
});
