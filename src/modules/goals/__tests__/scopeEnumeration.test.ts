// @vitest-environment jsdom
/**
 * scopeEnumeration — VL sub-area enumeration counts.
 *
 * The VL submodule Phase 1 build fans the catalog from 36 flat
 * pattern × key entries to 324 sub-cells (27 sub-cells/key × 12
 * keys). The Shapes-overall enumerator union ies VL into the
 * full catalog, and the per-area Shapes goal scope uses the
 * voice_leading matcher (prefix `vl:`).
 */
import { describe, expect, it } from 'vitest';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
} from '../coverageMetrics';
import { enumerateScopeForGoal } from '../scopeEnumeration';
import type { Goal } from '../../../lib/db';

function shapesGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'g-test',
    scope: 'monthly',
    description: 'test',
    targetMetric: COVERAGE_OVERALL_METRIC.SHAPES,
    targetValue: 1,
    targetUnit: null,
    currentValue: 0,
    contextTag: 'mixed',
    relatedModules: ['shapes-and-patterns'],
    relatedItems: [],
    startDate: 0,
    targetDate: 0,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

describe('enumerateScopeForGoal — voice-leading scope', () => {
  it('VL sub-area returns exactly 372 cells (31 × 12 keys)', () => {
    const goal = shapesGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'voice_leading',
    });
    const refs = enumerateScopeForGoal(goal);
    expect(refs).toHaveLength(372);
    // All start with vl: — the prefix-based matcher should accept them all.
    for (const r of refs) {
      expect(r.startsWith('vl:')).toBe(true);
    }
  });

  it('Shapes-overall scope includes the full VL fan-out', () => {
    const goal = shapesGoal({ targetMetric: COVERAGE_OVERALL_METRIC.SHAPES });
    const refs = enumerateScopeForGoal(goal);
    const vlRefs = refs.filter(r => r.startsWith('vl:'));
    expect(vlRefs).toHaveLength(372);
  });

  it('VL scope contains the expected per-pattern cardinalities × 12 keys', () => {
    const goal = shapesGoal({
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetUnit: 'voice_leading',
    });
    const refs = enumerateScopeForGoal(goal);
    const byPattern = new Map<string, number>();
    for (const ref of refs) {
      const patternId = ref.split(':')[1];
      byPattern.set(patternId, (byPattern.get(patternId) ?? 0) + 1);
    }
    expect(byPattern.get('five-one')).toBe(72);         // 6 sub × 12 keys
    expect(byPattern.get('major-251')).toBe(72);        // 6 sub × 12 keys
    expect(byPattern.get('minor-251')).toBe(72);        // 6 sub × 12 keys
    expect(byPattern.get('diatonic-cycle')).toBe(36);   // 3 sub × 12 keys
    expect(byPattern.get('minor-aba')).toBe(24);        // 2 sub × 12 keys
    expect(byPattern.get('dom7b9')).toBe(48);           // 4 sub × 12 keys
    expect(byPattern.get('dim7')).toBe(48);             // 4 sub × 12 keys
  });
});
