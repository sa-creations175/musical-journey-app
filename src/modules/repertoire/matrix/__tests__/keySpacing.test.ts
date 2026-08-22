// @vitest-environment jsdom
/**
 * Turning a due date into one of four states.
 *
 * The boundary that matters most is `due` versus `overdue`: everything
 * up to and including `due` still holds the rung, and only `overdue`
 * drops it. A state that both warned and demoted would give the user
 * nothing to do with the warning, which is the whole reason there are
 * four states rather than two.
 */
import { describe, expect, it } from 'vitest';
import {
  DUE_SOON_DEFAULT_DAYS,
  GRACE_DEFAULT_DAYS,
  daysPastGrace,
  daysUntilDue,
  keyDueState,
  stateHoldsRung,
  type DueWindows,
} from '../keySpacing';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const W: DueWindows = {
  dueSoonDays: DUE_SOON_DEFAULT_DAYS,
  graceDays: GRACE_DEFAULT_DAYS,
};

/** A due date `days` from NOW. Negative is in the past. */
const due = (days: number) => NOW + days * DAY;

describe('the four states', () => {
  it('is held while the due date is comfortably ahead', () => {
    expect(keyDueState(due(30), NOW, W)).toBe('held');
  });

  it('warns inside the due-soon window', () => {
    expect(keyDueState(due(5), NOW, W)).toBe('due-soon');
  });

  it('is due on the day, not the day after', () => {
    expect(keyDueState(due(0), NOW, W)).toBe('due');
  });

  it('stays due through the whole grace period', () => {
    // Guard the guard: this is well past the due date, so a rule that
    // dropped on the due date itself would fail here.
    expect(keyDueState(due(-GRACE_DEFAULT_DAYS), NOW, W)).toBe('due');
  });

  it('goes overdue only after grace has fully elapsed', () => {
    expect(keyDueState(due(-GRACE_DEFAULT_DAYS - 1), NOW, W)).toBe('overdue');
  });
});

describe('the boundaries', () => {
  it('flips to due-soon exactly at the window edge, not before', () => {
    const edge = NOW + DUE_SOON_DEFAULT_DAYS * DAY;
    expect(keyDueState(edge, NOW, W)).toBe('due-soon');
    expect(keyDueState(edge + 1, NOW, W)).toBe('held');
  });

  it('flips to overdue exactly at the end of grace, not before', () => {
    const graceEnds = NOW - GRACE_DEFAULT_DAYS * DAY;
    expect(keyDueState(graceEnds, NOW, W)).toBe('due');
    expect(keyDueState(graceEnds - 1, NOW, W)).toBe('overdue');
  });

  it('honours windows that are not the defaults', () => {
    // These are settings, so a rule reading the constants instead of
    // the arguments would pass every test above and fail here.
    const wide: DueWindows = { dueSoonDays: 30, graceDays: 30 };
    expect(keyDueState(due(20), NOW, wide)).toBe('due-soon');
    expect(keyDueState(due(-20), NOW, wide)).toBe('due');
  });
});

describe('never proven', () => {
  it('reads as held rather than overdue', () => {
    // A key that has not earned a due date cannot lose a rung it never
    // counted toward. Returning overdue would demote a song for never
    // having started.
    expect(keyDueState(null, NOW, W)).toBe('held');
  });

  it('reports no days-until rather than zero', () => {
    // "Never proven" and "due today" are different facts and must not
    // render the same.
    expect(daysUntilDue(null, NOW)).toBeNull();
    expect(daysUntilDue(due(0), NOW)).toBe(0);
  });

  it('is never past grace', () => {
    expect(daysPastGrace(null, NOW, W)).toBe(0);
  });
});

describe('only overdue drops the rung', () => {
  it('held, due-soon and due all still count', () => {
    for (const s of ['held', 'due-soon', 'due'] as const) {
      expect(stateHoldsRung(s)).toBe(true);
    }
  });

  it('overdue does not', () => {
    expect(stateHoldsRung('overdue')).toBe(false);
  });
});

describe('counting for the copy', () => {
  it('counts days past grace, so a drop is visible approaching', () => {
    expect(daysPastGrace(due(-GRACE_DEFAULT_DAYS - 3), NOW, W)).toBe(3);
  });

  it('reports zero past grace while the rung still holds', () => {
    expect(daysPastGrace(due(-1), NOW, W)).toBe(0);
  });
});
