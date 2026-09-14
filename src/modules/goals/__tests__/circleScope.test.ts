/**
 * The Circle of 4ths cell in a goal's scope: from September 2026 on,
 * never backwards.
 *
 * Silas's answer of 14 Sep 2026: coverage goals, carryover and the
 * dashboard count the Circle, but a past month's carryover must not list
 * it — the cell did not exist then. Carryover reads a goal's scope
 * through `effectiveScopeForGoal`, so this is where that is decided.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../lib/db';
import {
  CIRCLE_OF_FOURTHS_FROM, effectiveScopeForGoal, enumerateScopeForGoal,
} from '../scopeEnumeration';

function monthly(year: number, month: number, patch: Partial<Goal> = {}): Goal {
  return {
    id: `g-${year}-${month}`,
    scope: 'monthly',
    description: 'monthly',
    targetMetric: 'shapes_coverage_at_acquired_specific',
    targetValue: 10,
    targetUnit: 'chord_shape_triads_maj',
    currentValue: 0,
    contextTag: null,
    relatedModules: ['shapes-and-patterns'],
    relatedItems: [],
    startDate: new Date(year, month, 1).getTime(),
    targetDate: new Date(year, month + 1, 0, 23, 59, 59, 999).getTime(),
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...patch,
  } as Goal;
}

const circle = (refs: readonly string[]) => refs.filter(r => r.includes(':circle'));

describe('a goal holds the Circle of 4ths cell from the month it arrived', () => {
  it('starts on 1 September 2026', () => {
    expect(CIRCLE_OF_FOURTHS_FROM).toBe(new Date(2026, 8, 1).getTime());
  });

  it('an August 2026 monthly lists no Circle cell, so its carryover never does', () => {
    const august = monthly(2026, 7);
    expect(circle(enumerateScopeForGoal(august))).toEqual([]);
    expect(enumerateScopeForGoal(august)).toHaveLength(48);
    expect(circle(effectiveScopeForGoal(august))).toEqual([]);
  });

  it('a September 2026 monthly lists them: the four major-triad shapes on the Circle', () => {
    const september = monthly(2026, 8);
    expect(circle(enumerateScopeForGoal(september))).toEqual([
      'chord-shape:maj:circle:root', 'chord-shape:maj:circle:inv1',
      'chord-shape:maj:circle:inv2', 'chord-shape:maj:circle:fluid',
    ]);
    expect(enumerateScopeForGoal(september)).toHaveLength(52);
  });

  it('this month\'s whole Shapes & Patterns scope is the dashboard\'s 1695', () => {
    // 1626 with the chord shapes' Circle, and 69 more with the Circle
    // cell on every Chord Movements & Passes row (13 Sep 2026).
    const overall = monthly(2026, 8, { targetMetric: 'shapes_coverage_at_acquired', targetUnit: null });
    expect(enumerateScopeForGoal(overall)).toHaveLength(1695);
    expect(enumerateScopeForGoal(monthly(2026, 7, {
      targetMetric: 'shapes_coverage_at_acquired', targetUnit: null,
    }))).toHaveLength(1572);
  });
});

describe('Chord Movements & Passes takes the same rule (Silas, 13 Sep 2026)', () => {
  const movements = (year: number, month: number) => monthly(year, month, { targetUnit: 'voice_leading' });

  it('an August 2026 monthly lists no Circle cell: the twelve keys, 828', () => {
    const august = movements(2026, 7);
    expect(circle(enumerateScopeForGoal(august))).toEqual([]);
    expect(enumerateScopeForGoal(august)).toHaveLength(828);
    expect(circle(effectiveScopeForGoal(august))).toEqual([]);
  });

  it('a September 2026 monthly lists the Circle cell on every row: 69 × 13 = 897', () => {
    const september = movements(2026, 8);
    expect(circle(enumerateScopeForGoal(september))).toHaveLength(69);
    expect(enumerateScopeForGoal(september)).toHaveLength(897);
    expect(enumerateScopeForGoal(september)).toContain('vl:major-251:guide-tones:A:circle');
  });
});
