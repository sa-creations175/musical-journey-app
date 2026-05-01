// @vitest-environment jsdom
/**
 * Phase 3 Step 2g — session role detection tests.
 */
import { describe, expect, it } from 'vitest';
import { carriesBreadthBurden, detectSessionRole } from '../sessionRole';

describe('detectSessionRole — declared day plan', () => {
  it('"just this session" → only, regardless of clock', () => {
    expect(
      detectSessionRole({ dayPlan: 'just_this_session', timeOfDay: 'morning', earlierSessionsToday: 0 }),
    ).toBe('only');
    expect(
      detectSessionRole({ dayPlan: 'just_this_session', timeOfDay: 'evening', earlierSessionsToday: 2 }),
    ).toBe('only');
  });

  it('"first of multiple" → opener', () => {
    expect(
      detectSessionRole({ dayPlan: 'first_of_multiple', timeOfDay: 'morning', earlierSessionsToday: 0 }),
    ).toBe('opener');
    expect(
      detectSessionRole({ dayPlan: 'first_of_multiple', timeOfDay: 'evening', earlierSessionsToday: 0 }),
    ).toBe('opener');
  });

  it('"continuing today" + earlier sessions + evening → closer', () => {
    expect(
      detectSessionRole({ dayPlan: 'continuing_today', timeOfDay: 'evening', earlierSessionsToday: 2 }),
    ).toBe('closer');
    expect(
      detectSessionRole({ dayPlan: 'continuing_today', timeOfDay: 'late_night', earlierSessionsToday: 1 }),
    ).toBe('closer');
  });

  it('"continuing today" + earlier sessions + daytime → middler', () => {
    expect(
      detectSessionRole({ dayPlan: 'continuing_today', timeOfDay: 'midday', earlierSessionsToday: 1 }),
    ).toBe('middler');
    expect(
      detectSessionRole({ dayPlan: 'continuing_today', timeOfDay: 'morning', earlierSessionsToday: 1 }),
    ).toBe('middler');
  });
});

describe('detectSessionRole — fallback heuristic (no declared plan)', () => {
  it('no plan, no earlier sessions, morning → opener', () => {
    expect(
      detectSessionRole({ dayPlan: null, timeOfDay: 'morning', earlierSessionsToday: 0 }),
    ).toBe('opener');
  });

  it('no plan, no earlier sessions, midday → opener', () => {
    expect(
      detectSessionRole({ dayPlan: null, timeOfDay: 'midday', earlierSessionsToday: 0 }),
    ).toBe('opener');
  });

  it('no plan, no earlier sessions, evening → closer', () => {
    expect(
      detectSessionRole({ dayPlan: null, timeOfDay: 'evening', earlierSessionsToday: 0 }),
    ).toBe('closer');
  });

  it('no plan, earlier sessions, evening → closer', () => {
    expect(
      detectSessionRole({ dayPlan: null, timeOfDay: 'evening', earlierSessionsToday: 2 }),
    ).toBe('closer');
  });

  it('no plan, earlier sessions, midday → middler', () => {
    expect(
      detectSessionRole({ dayPlan: null, timeOfDay: 'midday', earlierSessionsToday: 1 }),
    ).toBe('middler');
  });
});

describe('carriesBreadthBurden', () => {
  it('only and closer carry the burden', () => {
    expect(carriesBreadthBurden('only')).toBe(true);
    expect(carriesBreadthBurden('closer')).toBe(true);
  });

  it('opener and middler do not', () => {
    expect(carriesBreadthBurden('opener')).toBe(false);
    expect(carriesBreadthBurden('middler')).toBe(false);
  });
});
