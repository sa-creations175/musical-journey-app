// @vitest-environment jsdom
/**
 * Phase 3 Step 3g — pre-fill sanitize tests.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeDayPlan } from '../inputsPrefill';

describe('sanitizeDayPlan', () => {
  it('passes through just_this_session and first_of_multiple', () => {
    expect(sanitizeDayPlan({ kind: 'just_this_session' }, false)).toEqual({
      kind: 'just_this_session',
    });
    expect(
      sanitizeDayPlan({ kind: 'first_of_multiple', profile: 'deep' }, false),
    ).toEqual({ kind: 'first_of_multiple', profile: 'deep' });
  });

  it('drops continuing_today when no earlier sessions today', () => {
    expect(sanitizeDayPlan({ kind: 'continuing_today' }, false)).toBeNull();
  });

  it('keeps continuing_today when earlier sessions exist', () => {
    expect(sanitizeDayPlan({ kind: 'continuing_today' }, true)).toEqual({
      kind: 'continuing_today',
    });
  });

  it('null in → null out', () => {
    expect(sanitizeDayPlan(null, false)).toBeNull();
    expect(sanitizeDayPlan(null, true)).toBeNull();
  });
});
