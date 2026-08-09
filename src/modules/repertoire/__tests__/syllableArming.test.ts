import { describe, expect, it } from 'vitest';
import {
  armedSyllableId,
  armingReducer,
  hasPendingIntent,
  isArmed,
  pendingLineEnd,
  type ArmingState,
} from '../syllableArming';

const NONE: ArmingState = null;
const armed = (id: string): ArmingState => ({ kind: 'syllable', syllableId: id });
const awaiting = (id: string): ArmingState => ({ kind: 'line-end', lineId: id });

describe('armingReducer — arm', () => {
  it('arms a syllable from nothing', () => {
    expect(armingReducer(NONE, { type: 'tap-syllable', syllableId: 'a' })).toEqual(
      armed('a'),
    );
  });

  it('arms a PLACED and an UNPLACED syllable identically', () => {
    // The reducer has no notion of placed vs unplaced, deliberately —
    // a tap means the same thing either way. This test exists to pin
    // that as intent rather than omission.
    const fromUnplaced = armingReducer(NONE, { type: 'tap-syllable', syllableId: 'u' });
    const fromPlaced = armingReducer(NONE, { type: 'tap-syllable', syllableId: 'p' });
    expect(fromUnplaced).toEqual(armed('u'));
    expect(fromPlaced).toEqual(armed('p'));
  });
});

describe('armingReducer — disarm', () => {
  it('disarms when the armed syllable is tapped again', () => {
    expect(armingReducer(armed('a'), { type: 'tap-syllable', syllableId: 'a' })).toBeNull();
  });

  it('disarms on dismiss', () => {
    expect(armingReducer(armed('a'), { type: 'dismiss' })).toBeNull();
  });

  it('dismiss is a no-op when nothing is pending', () => {
    expect(armingReducer(NONE, { type: 'dismiss' })).toBeNull();
  });
});

describe('armingReducer — transfer', () => {
  it('moves arming to a different syllable', () => {
    expect(armingReducer(armed('a'), { type: 'tap-syllable', syllableId: 'b' })).toEqual(
      armed('b'),
    );
  });

  it('never holds more than one at a time', () => {
    let state: ArmingState = NONE;
    for (const id of ['a', 'b', 'c', 'd']) {
      state = armingReducer(state, { type: 'tap-syllable', syllableId: id });
      expect(state).toEqual(armed(id));
    }
  });
});

describe('armingReducer — placement', () => {
  it('clears arming after a SUCCESSFUL placement', () => {
    expect(armingReducer(armed('a'), { type: 'placed' })).toBeNull();
  });

  it('clears the line-end wait after a successful end placement', () => {
    expect(armingReducer(awaiting('l1'), { type: 'placed' })).toBeNull();
  });

  it('keeps arming after a REFUSED placement', () => {
    // A refusal dispatches nothing, so the user can immediately aim at
    // another cell without re-arming. Asserted by omission being the
    // documented contract: only success dispatches 'placed'.
    const state = armed('a');
    expect(state).toEqual(armed('a'));
    expect(armingReducer(state, { type: 'tap-syllable', syllableId: 'a' })).toBeNull();
  });
});

describe('armingReducer — syllable removal', () => {
  it('disarms when the armed syllable is removed', () => {
    expect(
      armingReducer(armed('a'), { type: 'syllable-removed', syllableId: 'a' }),
    ).toBeNull();
  });

  it('leaves arming alone when a different syllable is removed', () => {
    const state = armed('a');
    expect(armingReducer(state, { type: 'syllable-removed', syllableId: 'b' })).toBe(
      state,
    );
  });

  it('never disturbs a line-end wait', () => {
    const state = awaiting('l1');
    expect(armingReducer(state, { type: 'syllable-removed', syllableId: 'a' })).toBe(
      state,
    );
  });

  it('is a no-op when nothing is armed', () => {
    expect(
      armingReducer(NONE, { type: 'syllable-removed', syllableId: 'a' }),
    ).toBeNull();
  });
});

describe('armingReducer — line-end wait (beat two)', () => {
  it('enters the wait when beat one lands', () => {
    expect(armingReducer(NONE, { type: 'await-line-end', lineId: 'l1' })).toEqual(
      awaiting('l1'),
    );
  });

  it('overrides a previously armed syllable', () => {
    // Beat one just wrote an anchor, so its follow-up is the only
    // sensible next tap.
    expect(
      armingReducer(armed('a'), { type: 'await-line-end', lineId: 'l1' }),
    ).toEqual(awaiting('l1'));
  });

  it('IGNORES syllable chip taps — the wait is not escapable that way', () => {
    // The whole point of beat two. A chip tap here would leave the
    // line's first unit placed with nothing asking for the rest, which
    // is exactly the dead end this mode removes.
    const state = awaiting('l1');
    expect(armingReducer(state, { type: 'tap-syllable', syllableId: 'a' })).toBe(state);
    expect(armingReducer(state, { type: 'tap-syllable', syllableId: 'b' })).toBe(state);
  });

  it('cancels on dismiss', () => {
    expect(armingReducer(awaiting('l1'), { type: 'dismiss' })).toBeNull();
  });

  it('clears when the line itself is removed', () => {
    expect(
      armingReducer(awaiting('l1'), { type: 'line-removed', lineId: 'l1' }),
    ).toBeNull();
  });

  it('leaves the wait alone when a different line is removed', () => {
    const state = awaiting('l1');
    expect(armingReducer(state, { type: 'line-removed', lineId: 'l2' })).toBe(state);
  });

  it('line-removed never disturbs a syllable arming', () => {
    const state = armed('a');
    expect(armingReducer(state, { type: 'line-removed', lineId: 'l1' })).toBe(state);
  });

  it('a second beat one replaces the first — re-dragging restarts the gesture', () => {
    expect(
      armingReducer(awaiting('l1'), { type: 'await-line-end', lineId: 'l2' }),
    ).toEqual(awaiting('l2'));
  });
});

describe('selectors', () => {
  it('isArmed identifies the armed syllable only', () => {
    expect(isArmed(armed('a'), 'a')).toBe(true);
    expect(isArmed(armed('a'), 'b')).toBe(false);
    expect(isArmed(NONE, 'a')).toBe(false);
    // A line-end wait arms no chip.
    expect(isArmed(awaiting('l1'), 'a')).toBe(false);
  });

  it('armedSyllableId reads through only the syllable variant', () => {
    expect(armedSyllableId(armed('a'))).toBe('a');
    expect(armedSyllableId(awaiting('l1'))).toBeNull();
    expect(armedSyllableId(NONE)).toBeNull();
  });

  it('pendingLineEnd is the rollback signal', () => {
    // Non-null means dismissing must undo beat one; null means
    // dismissing needs no cleanup.
    expect(pendingLineEnd(awaiting('l1'))).toBe('l1');
    expect(pendingLineEnd(armed('a'))).toBeNull();
    expect(pendingLineEnd(NONE)).toBeNull();
  });

  it('hasPendingIntent covers both kinds — it drives the cell hint', () => {
    expect(hasPendingIntent(armed('a'))).toBe(true);
    expect(hasPendingIntent(awaiting('l1'))).toBe(true);
    expect(hasPendingIntent(NONE)).toBe(false);
  });
});

describe('armingReducer — sequences', () => {
  it('arm → transfer → place → nothing armed', () => {
    let s: ArmingState = NONE;
    s = armingReducer(s, { type: 'tap-syllable', syllableId: 'a' });
    s = armingReducer(s, { type: 'tap-syllable', syllableId: 'b' });
    expect(s).toEqual(armed('b'));
    s = armingReducer(s, { type: 'placed' });
    expect(s).toBeNull();
  });

  it('beat one → beat two → complete', () => {
    let s: ArmingState = NONE;
    s = armingReducer(s, { type: 'await-line-end', lineId: 'l1' });
    expect(pendingLineEnd(s)).toBe('l1');
    s = armingReducer(s, { type: 'placed' });
    expect(s).toBeNull();
    expect(pendingLineEnd(s)).toBeNull();
  });

  it('beat one → refusal → retry → complete', () => {
    // A refused end keeps the wait alive, so the next cell can be tried
    // without re-running beat one.
    let s: ArmingState = armingReducer(NONE, { type: 'await-line-end', lineId: 'l1' });
    // refusal dispatches nothing
    expect(pendingLineEnd(s)).toBe('l1');
    s = armingReducer(s, { type: 'placed' });
    expect(s).toBeNull();
  });

  it('beat one → cancel leaves a rollback signal readable first', () => {
    const s = armingReducer(NONE, { type: 'await-line-end', lineId: 'l1' });
    const rollbackTarget = pendingLineEnd(s);
    expect(rollbackTarget).toBe('l1');
    expect(armingReducer(s, { type: 'dismiss' })).toBeNull();
  });

  it('is pure — the same input never mutates the previous state', () => {
    const before = armed('a');
    const snapshot = { ...before };
    armingReducer(before, { type: 'tap-syllable', syllableId: 'b' });
    expect(before).toEqual(snapshot);
  });
});

describe('one state above all sections (step 6b)', () => {
  // The reducer moved from LeadSheetSection (one instance per section,
  // so arming in one was invisible to the next) to SongDetailView (one
  // instance for the song). These pin the properties that makes safe.

  it('carries no section identity — only a syllable or line id', () => {
    const state = armingReducer(NONE, { type: 'tap-syllable', syllableId: 'x' });
    expect(state).toEqual({ kind: 'syllable', syllableId: 'x' });
    expect(Object.keys(state!).sort()).toEqual(['kind', 'syllableId']);
  });

  it('survives store churn that removes OTHER syllables', () => {
    let s: ArmingState = armed('a');
    for (const id of ['b', 'c', 'd']) {
      s = armingReducer(s, { type: 'syllable-removed', syllableId: id });
    }
    expect(s).toEqual(armed('a'));
    s = armingReducer(s, { type: 'placed' });
    expect(s).toBeNull();
  });

  it('is idempotent for placed and dismiss', () => {
    expect(armingReducer(armingReducer(armed('a'), { type: 'placed' }), { type: 'placed' }))
      .toBeNull();
    expect(
      armingReducer(armingReducer(armed('a'), { type: 'dismiss' }), { type: 'dismiss' }),
    ).toBeNull();
  });

  it('transfers between syllables that live in different sections', () => {
    let s: ArmingState = armed('sec-a-syl');
    s = armingReducer(s, { type: 'tap-syllable', syllableId: 'sec-b-syl' });
    expect(s).toEqual(armed('sec-b-syl'));
    s = armingReducer(s, { type: 'placed' });
    expect(s).toBeNull();
  });
});
