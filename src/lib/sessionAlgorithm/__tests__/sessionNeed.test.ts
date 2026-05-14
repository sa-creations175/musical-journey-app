// @vitest-environment jsdom
/**
 * Phase B — computeModuleSessionNeed fixture tests.
 *
 * Pins the goal-pace formula across the five cases called out in
 * the build spec: a normal mid-week run, the over-practice branch,
 * the last-day calendar cap, fractional days completed (with the
 * round-up), and the zero-consistency-target edge case.
 *
 * Pure-function only — the async loader (computeSessionNeedByModule)
 * is a thin Dexie wrapper around this and is covered separately
 * once it has consumers to integration-test against.
 */
import { describe, it, expect } from 'vitest';
import {
  computeModuleSessionNeed,
  calendarDaysRemainingInWeek,
} from '../sessionNeed';

describe('computeModuleSessionNeed', () => {
  it('normal mid-week — spreads remaining attempts across remaining sessions', () => {
    // weekly 100, done 30, 5-day cadence, 4 calendar days left, 30 s/attempt.
    //   attempts_remaining        = 70
    //   daily_target              = 100 / 5 = 20
    //   fractional_days_completed = 30 / 20 = 1.5
    //   potential_sessions_left   = min(max(5 - 1.5, 1), 4) = 3.5
    //   attempts_today            = ceil(70 / 3.5) = 20
    //   time_needed               = 20 × 30 = 600 s
    const need = computeModuleSessionNeed({
      weeklyTarget: 100,
      attemptsSoFarThisWeek: 30,
      consistencyTargetDays: 5,
      calendarDaysRemainingInWeek: 4,
      timePerAttemptSeconds: 30,
    });
    expect(need).toEqual({
      attemptsToday: 20,
      timeNeededSeconds: 600,
      isOverPractice: false,
    });
  });

  it('over-practice — weekly target already met returns the over-practice flag', () => {
    // done == target → attempts_remaining = 0 → over-practice.
    const exact = computeModuleSessionNeed({
      weeklyTarget: 100,
      attemptsSoFarThisWeek: 100,
      consistencyTargetDays: 5,
      calendarDaysRemainingInWeek: 4,
      timePerAttemptSeconds: 30,
    });
    expect(exact).toEqual({
      attemptsToday: 0,
      timeNeededSeconds: 0,
      isOverPractice: true,
    });

    // done > target → still over-practice, never negative attempts.
    const past = computeModuleSessionNeed({
      weeklyTarget: 100,
      attemptsSoFarThisWeek: 130,
      consistencyTargetDays: 5,
      calendarDaysRemainingInWeek: 4,
      timePerAttemptSeconds: 30,
    });
    expect(past).toEqual({
      attemptsToday: 0,
      timeNeededSeconds: 0,
      isOverPractice: true,
    });
  });

  it('last day of week — calendar cap forces all remaining work into today', () => {
    // weekly 100, done 20, 5-day cadence, only 1 calendar day left.
    //   attempts_remaining        = 80
    //   daily_target              = 20
    //   fractional_days_completed = 20 / 20 = 1
    //   potential_sessions_left   = min(max(5 - 1, 1), 1) = 1   ← calendar cap wins
    //   attempts_today            = ceil(80 / 1) = 80
    //   time_needed               = 80 × 30 = 2400 s
    const need = computeModuleSessionNeed({
      weeklyTarget: 100,
      attemptsSoFarThisWeek: 20,
      consistencyTargetDays: 5,
      calendarDaysRemainingInWeek: 1,
      timePerAttemptSeconds: 30,
    });
    expect(need).toEqual({
      attemptsToday: 80,
      timeNeededSeconds: 2400,
      isOverPractice: false,
    });
  });

  it('fractional days completed — non-integer cadence progress, attempts_today rounds up', () => {
    // weekly 100, done 25, 6-day cadence, 5 calendar days left.
    //   attempts_remaining        = 75
    //   daily_target              = 100 / 6 = 16.666…
    //   fractional_days_completed = 25 / 16.666… = 1.5
    //   potential_sessions_left   = min(max(6 - 1.5, 1), 5) = 4.5
    //   attempts_today            = ceil(75 / 4.5) = ceil(16.666…) = 17
    //   time_needed               = 17 × 30 = 510 s
    const need = computeModuleSessionNeed({
      weeklyTarget: 100,
      attemptsSoFarThisWeek: 25,
      consistencyTargetDays: 6,
      calendarDaysRemainingInWeek: 5,
      timePerAttemptSeconds: 30,
    });
    expect(need).toEqual({
      attemptsToday: 17,
      timeNeededSeconds: 510,
      isOverPractice: false,
    });
  });

  it('zero consistency target — no cadence, falls back to "everything today" (no NaN)', () => {
    // weekly 100, done 30, NO consistency goal (consistency_target_days = 0).
    //   attempts_remaining        = 70
    //   daily_target              = 0  (guarded — would be ÷0 otherwise)
    //   fractional_days_completed = 0  (guarded — daily_target is 0)
    //   potential_sessions_left   = min(max(0 - 0, 1), 4) = 1
    //   attempts_today            = ceil(70 / 1) = 70
    //   time_needed               = 70 × 30 = 2100 s
    const need = computeModuleSessionNeed({
      weeklyTarget: 100,
      attemptsSoFarThisWeek: 30,
      consistencyTargetDays: 0,
      calendarDaysRemainingInWeek: 4,
      timePerAttemptSeconds: 30,
    });
    expect(need.attemptsToday).toBe(70);
    expect(need.timeNeededSeconds).toBe(2100);
    expect(need.isOverPractice).toBe(false);
    // The whole point of the guard: no NaN / Infinity leaks through.
    expect(Number.isFinite(need.attemptsToday)).toBe(true);
    expect(Number.isFinite(need.timeNeededSeconds)).toBe(true);
  });

  it('clamps a zero / sub-1 calendar-days input defensively', () => {
    // The loader always passes 1–7, but the formula floors at 1 so a
    // bad input can't divide attempts_today by zero.
    const need = computeModuleSessionNeed({
      weeklyTarget: 50,
      attemptsSoFarThisWeek: 0,
      consistencyTargetDays: 5,
      calendarDaysRemainingInWeek: 0,
      timePerAttemptSeconds: 30,
    });
    expect(need.attemptsToday).toBe(50); // 50 / 1
    expect(need.timeNeededSeconds).toBe(1500);
  });
});

describe('calendarDaysRemainingInWeek', () => {
  it('counts today inclusive — Sunday is 7, Saturday is 1', () => {
    // Pick known weekdays. 2026-05-17 is a Sunday.
    const sunday = new Date(2026, 4, 17, 12, 0, 0).getTime();
    const wednesday = new Date(2026, 4, 20, 12, 0, 0).getTime();
    const saturday = new Date(2026, 4, 23, 12, 0, 0).getTime();
    expect(calendarDaysRemainingInWeek(sunday)).toBe(7);
    expect(calendarDaysRemainingInWeek(wednesday)).toBe(4);
    expect(calendarDaysRemainingInWeek(saturday)).toBe(1);
  });
});
