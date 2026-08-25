/**
 * The per-module daily goal, and the zero it refuses to hold.
 *
 * =====================================================================
 * THE HANG THIS PREVENTS.
 *
 * `computeDayStreak` walks backwards while each day clears the goal. A
 * goal of 0 is cleared by every day there has ever been, so the walk
 * never ends — one arrived as an array, coerced to 0, and hung a full
 * test run instead of failing it.
 *
 * Two defences, and both are asserted here: "any practice" is a unit
 * with no amount field, so the numeric path is unreachable from it by
 * construction; and anything that reaches `computeDayStreak` non-
 * positive stops there.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODULE_GOAL,
  MAX_DAILY_GOAL,
  isNumericGoal,
  isValidGoalAmount,
  moduleGoalKey,
  normaliseModuleGoal,
} from '../goalConfig';
import { computeDayStreak } from '../dailyGoal';
import { MODULE_ORDER } from '../moduleMeta';
import type { AttemptRecord } from '../db';

describe('what every module ships with', () => {
  it('is "any practice", with no number anywhere', () => {
    expect(DEFAULT_MODULE_GOAL).toEqual({ unit: 'any-practice' });
    expect('amount' in DEFAULT_MODULE_GOAL).toBe(false);
  });

  it('applies to every module in the app, by derivation', () => {
    // No list of six typed here: a module added to `MODULE_ORDER`
    // arrives with the same goal and its own key.
    const keys = MODULE_ORDER.map(m => moduleGoalKey(m.id));
    expect(new Set(keys).size).toBe(MODULE_ORDER.length);
    for (const m of MODULE_ORDER) {
      expect(normaliseModuleGoal(null)).toEqual(DEFAULT_MODULE_GOAL);
      expect(moduleGoalKey(m.id)).toMatch(/^moduleGoal/);
    }
  });

  it('uses a key of its own, so an older number cannot be read as one', () => {
    expect(moduleGoalKey('harmonic-fluency')).toBe('moduleGoalHarmonicFluency');
    expect(moduleGoalKey('chord-recognition')).toBe('moduleGoalChordRecognition');
  });
});

describe('"any practice" is a mode, not a threshold', () => {
  it('carries no amount to read', () => {
    const goal = normaliseModuleGoal({ unit: 'any-practice' });
    expect(goal.unit).toBe('any-practice');
    expect(isNumericGoal(goal)).toBe(false);
  });

  it('is what a zero degrades to, rather than being stored as one', () => {
    // The shape that would hang: a numeric unit with nothing usable.
    expect(normaliseModuleGoal({ unit: 'answers', amount: 0 })).toEqual(DEFAULT_MODULE_GOAL);
    expect(normaliseModuleGoal({ unit: 'minutes', amount: 0 })).toEqual(DEFAULT_MODULE_GOAL);
  });

  it('is what any unusable stored value degrades to', () => {
    for (const raw of [
      null, undefined, 42, 'answers', [],
      { unit: 'answers' },
      { unit: 'answers', amount: -1 },
      { unit: 'answers', amount: 1.5 },
      { unit: 'answers', amount: Number.NaN },
      { unit: 'minutes', amount: MAX_DAILY_GOAL + 1 },
      { unit: 'nonsense', amount: 10 },
    ]) {
      expect(normaliseModuleGoal(raw), JSON.stringify(raw) ?? 'undefined')
        .toEqual(DEFAULT_MODULE_GOAL);
    }
  });
});

describe('a numeric goal', () => {
  it('survives normalisation with its unit and amount', () => {
    expect(normaliseModuleGoal({ unit: 'answers', amount: 20 }))
      .toEqual({ unit: 'answers', amount: 20 });
    expect(normaliseModuleGoal({ unit: 'minutes', amount: 15 }))
      .toEqual({ unit: 'minutes', amount: 15 });
  });

  it('must be a positive whole number within range', () => {
    expect(isValidGoalAmount(1)).toBe(true);
    expect(isValidGoalAmount(MAX_DAILY_GOAL)).toBe(true);
    expect(isValidGoalAmount(0)).toBe(false);
    expect(isValidGoalAmount(-5)).toBe(false);
    expect(isValidGoalAmount(2.5)).toBe(false);
    expect(isValidGoalAmount(MAX_DAILY_GOAL + 1)).toBe(false);
    expect(isValidGoalAmount('10')).toBe(false);
    expect(isValidGoalAmount(undefined)).toBe(false);
  });

  it('is the only shape that reads as numeric', () => {
    const numeric = normaliseModuleGoal({ unit: 'answers', amount: 20 });
    expect(isNumericGoal(numeric)).toBe(true);
    if (isNumericGoal(numeric)) expect(numeric.amount).toBe(20);
  });
});

describe('the walk cannot run away', () => {
  const attempt = (ts: number): AttemptRecord =>
    ({ id: `a${ts}`, moduleId: 'reading', itemId: 'x', correct: true, timestamp: ts });

  it('returns 0 for a non-positive goal instead of walking forever', () => {
    // Without the guard this test does not fail — it hangs, which is
    // exactly what happened in the run that found it.
    const attempts = [attempt(Date.now())];
    expect(computeDayStreak(attempts, 0)).toBe(0);
    expect(computeDayStreak(attempts, -3)).toBe(0);
    expect(computeDayStreak(attempts, Number.NaN)).toBe(0);
  });

  it('still counts normally for a real goal', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const attempts = [attempt(now), attempt(now - DAY)];
    expect(computeDayStreak(attempts, 1)).toBeGreaterThanOrEqual(2);
  });
});
