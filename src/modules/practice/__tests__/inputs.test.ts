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

  it('"push on item" intent requires an itemRef', () => {
    const d = complete();
    expect(
      isDraftComplete({ ...d, intent: { kind: 'push_on_item', itemRef: null } }),
    ).toBe(false);
    expect(
      isDraftComplete({ ...d, intent: { kind: 'push_on_item', itemRef: 'song-x' } }),
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
