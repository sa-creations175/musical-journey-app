/**
 * The walk-away ceiling, and both sides of it.
 *
 * ---------------------------------------------------------------
 * ABSENT IS NOT THE SAME AS UNDEFINED, AND THE TEST HAS TO KNOW.
 *
 * `toHaveProperty('elapsedMs', undefined)` passes for a record that
 * omits the field AND for one that sets it to undefined. Only the
 * first survives a round trip to Postgres as "no measurement"; the
 * second is a key with a null on the other side. So every absence
 * assertion here goes through `Object.hasOwn`.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import {
  WALK_AWAY_CEILING_MS, elapsedFields, timedOutFields,
} from '../attemptTiming';

const START = 1_700_000_000_000;

describe('the ceiling', () => {
  it('is five minutes', () => {
    expect(WALK_AWAY_CEILING_MS).toBe(300_000);
  });

  it('records an answer at 4:59', () => {
    const fields = elapsedFields(START, START + 299_000);
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(true);
    expect(fields.elapsedMs).toBe(299_000);
  });

  it('records an answer at exactly five minutes', () => {
    // The boundary is inclusive: five minutes is the last measurement
    // we keep, not the first we throw away.
    const fields = elapsedFields(START, START + WALK_AWAY_CEILING_MS);
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(true);
  });

  it('records NOTHING one millisecond over', () => {
    const fields = elapsedFields(START, START + WALK_AWAY_CEILING_MS + 1);
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(false);
  });

  it('omits rather than clamping — the value is gone, not capped', () => {
    // A clamp would file a "slow" vote from a datapoint nobody trusts.
    const fields = elapsedFields(START, START + 4 * 60 * 60 * 1000);
    expect(fields).toEqual({});
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(false);
  });

  it('records nothing when the clock never started', () => {
    expect(Object.hasOwn(elapsedFields(null, START), 'elapsedMs')).toBe(false);
  });

  it('records nothing for a negative reading', () => {
    // The clock restarted after the answer — a bug, not a fast answer.
    expect(Object.hasOwn(elapsedFields(START, START - 10), 'elapsedMs')).toBe(false);
  });

  it('records a genuinely fast answer', () => {
    expect(elapsedFields(START, START + 820).elapsedMs).toBe(820);
  });
});

describe('the timeout flag', () => {
  it('is present only when the countdown expired', () => {
    expect(timedOutFields(true)).toEqual({ timedOut: true });
    expect(Object.hasOwn(timedOutFields(false), 'timedOut')).toBe(false);
  });

  it('is distinguishable from a wrong answer', () => {
    // Both score correct:false. A wrong answer says the knowledge is
    // wrong; a timeout says it was never retrieved.
    const wrong = { correct: false, ...timedOutFields(false) };
    const expired = { correct: false, ...timedOutFields(true) };
    expect(wrong).not.toEqual(expired);
    expect(Object.hasOwn(wrong, 'timedOut')).toBe(false);
    expect(expired.timedOut).toBe(true);
  });
});
