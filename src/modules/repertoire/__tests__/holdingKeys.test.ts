// @vitest-environment jsdom
/**
 * What the "holding this rung" line shows, and in what order.
 *
 * Ordering is a rule about what the user reads first when a song is
 * about to lose a rung, not a styling choice — so it is asserted
 * without rendering.
 */
import { describe, expect, it } from 'vitest';
import {
  DUE_SOON_DEFAULT_DAYS,
  GRACE_DEFAULT_DAYS,
  keyDueState,
  type DueWindows,
} from '../matrix/keySpacing';
import {
  describeDue,
  orderHoldingKeys,
  type HoldingKey,
} from '../StageCriteriaPanel';

const NOW = 1_760_000_000_000;
const WINDOWS: DueWindows = {
  dueSoonDays: DUE_SOON_DEFAULT_DAYS,
  graceDays: GRACE_DEFAULT_DAYS,
};

const k = (keyName: string, state: HoldingKey['state'], daysUntil: number | null): HoldingKey =>
  ({ keyName, state, daysUntil });

describe('order', () => {
  it('puts the key about to cost something first', () => {
    const out = orderHoldingKeys([
      k('C', 'held', 40), k('A', 'overdue', -9),
      k('Eb', 'due-soon', 3), k('F#', 'due', 0),
    ]);
    expect(out.map(x => x.keyName)).toEqual(['A', 'F#', 'Eb', 'C']);
  });

  it('is stable by key name within a state', () => {
    // Guard the guard: a fixture where every key had a different state
    // could not tell a stable sort from an arbitrary one.
    const out = orderHoldingKeys([k('G', 'held', 5), k('C', 'held', 5)]);
    expect(out.map(x => x.keyName)).toEqual(['C', 'G']);
  });

  it('does not mutate its input', () => {
    const input = [k('C', 'held', 5), k('A', 'overdue', -1)];
    orderHoldingKeys(input);
    expect(input.map(x => x.keyName)).toEqual(['C', 'A']);
  });
});

describe('what each state reads as', () => {
  it('counts days overdue as a positive number', () => {
    // The stored value is negative; showing "overdue -9d" would be
    // arithmetic leaking onto the screen.
    expect(describeDue(k('A', 'overdue', -9))).toBe('overdue 9d');
  });

  it('says due now rather than a day count', () => {
    expect(describeDue(k('A', 'due', 0))).toBe('due now');
  });

  it('counts down to a due date', () => {
    expect(describeDue(k('A', 'due-soon', 3))).toBe('due in 3d');
  });

  it('says held with no number', () => {
    expect(describeDue(k('A', 'held', 40))).toBe('held');
  });

  it('a never-proven key reads as held, by the state and not the guard', () => {
    // `keyDueState(null, …)` returns 'held', so a key with no due date
    // never reaches the day count in the first place. Asserted as the
    // PAIRING rather than as the guard's doing: removing the guard
    // leaves this green, which is the honest description of it.
    expect(keyDueState(null, NOW, WINDOWS)).toBe('held');
    expect(describeDue(k('A', keyDueState(null, NOW, WINDOWS), null))).toBe('held');
  });
});
