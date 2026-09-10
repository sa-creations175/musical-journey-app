/**
 * A saved goal's name follows the spelling setting.
 *
 * =====================================================================
 * "WHY DOESN'T IT JUST FOLLOW THE SETTING" — SILAS, 10 SEP 2026.
 *
 * A coverage goal's description was a sentence written at save time, so
 * it froze the progression spelling in force that day: a goal saved
 * under hyphens read "major 2m-5-1" for ever, on a page where the grid
 * beside it said "major 2m · 5 · 1". It is re-derived on read now, from
 * fields the goal already stored.
 *
 * NOTHING WAS MIGRATED and nothing needed to be, which is the half of
 * this worth a test: the group id and the count were on the record all
 * along, so an old row re-derives exactly like a new one.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { goalDescription, shapesCoverageDescription } from '../goalDescription';
import { COVERAGE_SPECIFIC_METRIC } from '../coverageMetrics';
import {
  DEFAULT_PROGRESSION_SPELLING, type ProgressionSpelling,
} from '../../../lib/progressionSpelling';

const DOTS: ProgressionSpelling = {
  ...DEFAULT_PROGRESSION_SPELLING, separator: 'dot',
};
const OFF: ProgressionSpelling = {
  ...DEFAULT_PROGRESSION_SPELLING, qualities: 'off',
};

/** A goal as the creation flow saves one, with a stale sentence on it. */
const coverageGoal = (stored: string) => ({
  description: stored,
  targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
  targetValue: 12,
  targetUnit: 'voice_leading_major_251',
});

describe('a coverage goal is re-derived', () => {
  it('ignores the sentence that was stored and rebuilds it', () => {
    // The stored string is deliberately nonsense: if it came through,
    // the test would say so rather than passing on a coincidence.
    const goal = coverageGoal('Cover all 12 items in WHATEVER (acquired)');
    expect(goalDescription(goal)).toBe('Cover all 12 items in major 2m-5-1 (acquired)');
  });

  it('follows the separator', () => {
    const goal = coverageGoal('anything');
    expect(goalDescription(goal, DOTS))
      .toBe('Cover all 12 items in major 2m · 5 · 1 (acquired)');
  });

  it('follows the qualities, right down to dropping them', () => {
    const goal = coverageGoal('anything');
    expect(goalDescription(goal, OFF))
      .toBe('Cover all 12 items in major 2-5-1 (acquired)');
  });

  it('keeps the count the reader agreed to, not the catalog\'s current one', () => {
    // A goal is a promise about a number. A catalog that grew must not
    // quietly move the finish line.
    const goal = { ...coverageGoal('anything'), targetValue: 7 };
    expect(goalDescription(goal)).toContain('Cover all 7 items');
  });
});

describe('anything else keeps its own words', () => {
  it('leaves a goal the reader typed alone', () => {
    expect(goalDescription({
      description: 'Learn Isn\'t She Lovely by Christmas',
      targetMetric: 'songs_at_comfortable_plus',
      targetValue: 1,
      targetUnit: 'songs',
    }, DOTS)).toBe('Learn Isn\'t She Lovely by Christmas');
  });

  it('leaves a coverage goal whose group has gone', () => {
    // THE FALLBACK IS WHAT MAKES THIS SAFE EVERYWHERE. A stored
    // `targetUnit` naming a group that no longer exists keeps the
    // sentence it was saved with rather than losing its name.
    expect(goalDescription({
      description: 'Cover all 12 items in a retired group (acquired)',
      targetMetric: COVERAGE_SPECIFIC_METRIC.SHAPES,
      targetValue: 12,
      targetUnit: 'voice_leading_a_row_that_retired',
    })).toBe('Cover all 12 items in a retired group (acquired)');
  });

  it('leaves an umbrella, which has no target at all', () => {
    expect(goalDescription({
      description: 'Get solid at gospel harmony',
      targetMetric: null,
      targetValue: null,
      targetUnit: null,
    })).toBe('Get solid at gospel harmony');
  });
});

describe('one template, used at both ends', () => {
  it('writes what the creation flow writes', () => {
    // The saved sentence and the rendered one come from the same
    // function, so a goal saved today and read tomorrow agree.
    const saved = shapesCoverageDescription(
      'voice_leading_major_251', 12, 'major 2m-5-1',
    );
    expect(goalDescription(coverageGoal(saved))).toBe(saved);
  });
});
