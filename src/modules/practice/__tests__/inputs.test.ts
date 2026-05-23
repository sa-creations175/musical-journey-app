// @vitest-environment jsdom
/**
 * Phase 3 Step 3 — input questionnaire pure-helper tests.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  EMPTY_ENERGY,
  dayPlanForAlgorithm,
  finalizeDraft,
  isDraftComplete,
  seedDraft,
  type InputQuestionnaireDraft,
} from '../inputs';

function complete(): InputQuestionnaireDraft {
  return {
    timeMinutes: 30,
    context: 'keys',
    dayPlan: { kind: 'just_this_session' },
    intent: { kind: 'balanced' },
    energy: EMPTY_ENERGY,
  };
}

describe('isDraftComplete', () => {
  it('false on the empty draft', () => {
    expect(isDraftComplete(EMPTY_DRAFT)).toBe(false);
  });

  it('false when any required field is missing', () => {
    const d = complete();
    expect(isDraftComplete({ ...d, timeMinutes: null })).toBe(false);
    expect(isDraftComplete({ ...d, context: null })).toBe(false);
    expect(isDraftComplete({ ...d, dayPlan: null })).toBe(false);
    expect(isDraftComplete({ ...d, intent: null })).toBe(false);
  });

  it('true when all required fields are set, energy ignored', () => {
    expect(isDraftComplete(complete())).toBe(true);
  });

  it('"push on item" intent requires a moduleRef', () => {
    const d = complete();
    expect(
      isDraftComplete({ ...d, intent: { kind: 'push_on_item', moduleRef: null, songId: null } }),
    ).toBe(false);
    expect(
      isDraftComplete({ ...d, intent: { kind: 'push_on_item', moduleRef: 'harmonic-fluency', songId: null } }),
    ).toBe(true);
  });

  it('"push on item" with moduleRef + songId is also complete (deep-focus 60+ min)', () => {
    const d = complete();
    expect(
      isDraftComplete({
        ...d,
        intent: { kind: 'push_on_item', moduleRef: 'harmonic-fluency', songId: 'song-x' },
      }),
    ).toBe(true);
  });
});

describe('finalizeDraft', () => {
  it('returns the assembled result for a complete draft', () => {
    const d = complete();
    expect(finalizeDraft(d)).toEqual({
      timeMinutes: 30,
      context: 'keys',
      dayPlan: { kind: 'just_this_session' },
      intent: { kind: 'balanced' },
      energy: EMPTY_ENERGY,
    });
  });

  it('throws on an incomplete draft', () => {
    expect(() => finalizeDraft(EMPTY_DRAFT)).toThrow();
  });
});

describe('seedDraft', () => {
  it('all-null inputs produce EMPTY_DRAFT', () => {
    expect(
      seedDraft({
        prefilledContext: null,
        prefilledDayPlan: null,
        initialDayProfile: null,
      }),
    ).toEqual(EMPTY_DRAFT);
  });

  it('passes through saved Context + Day plan when no override', () => {
    const result = seedDraft({
      prefilledContext: 'keys',
      prefilledDayPlan: { kind: 'just_this_session' },
      initialDayProfile: null,
    });
    expect(result.context).toBe('keys');
    expect(result.dayPlan).toEqual({ kind: 'just_this_session' });
    expect(result.timeMinutes).toBeNull();
    expect(result.intent).toEqual({ kind: 'balanced' });
  });

  it('initialDayProfile overrides saved Day plan with first_of_multiple + profile', () => {
    const result = seedDraft({
      prefilledContext: 'phone',
      prefilledDayPlan: { kind: 'just_this_session' },
      initialDayProfile: 'deep',
    });
    expect(result.dayPlan).toEqual({ kind: 'first_of_multiple', profile: 'deep' });
    // Context still passes through.
    expect(result.context).toBe('phone');
  });

  it('Time / Energy stay blank regardless of inputs; Intent defaults to balanced', () => {
    const result = seedDraft({
      prefilledContext: 'laptop',
      prefilledDayPlan: { kind: 'first_of_multiple', profile: 'standard' },
      initialDayProfile: 'deep',
    });
    expect(result.timeMinutes).toBeNull();
    expect(result.intent).toEqual({ kind: 'balanced' });
    expect(result.energy).toEqual(EMPTY_ENERGY);
  });
});

describe('dayPlanForAlgorithm', () => {
  it('maps each kind onto the algorithm enum', () => {
    expect(dayPlanForAlgorithm({ kind: 'just_this_session' })).toBe('just_this_session');
    expect(
      dayPlanForAlgorithm({ kind: 'first_of_multiple', profile: 'deep' }),
    ).toBe('first_of_multiple');
    expect(dayPlanForAlgorithm({ kind: 'continuing_today' })).toBe('continuing_today');
  });

  it('returns null for null input', () => {
    expect(dayPlanForAlgorithm(null)).toBeNull();
  });
});
