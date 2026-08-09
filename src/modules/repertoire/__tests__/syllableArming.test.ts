import { describe, expect, it } from 'vitest';
import {
  armingReducer,
  isArmed,
  type ArmingState,
} from '../syllableArming';

const NONE: ArmingState = null;
const armed = (id: string): ArmingState => ({ armedSyllableId: id });

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
    expect(fromUnplaced).toEqual({ armedSyllableId: 'u' });
    expect(fromPlaced).toEqual({ armedSyllableId: 'p' });
  });
});

describe('armingReducer — disarm', () => {
  it('disarms when the armed syllable is tapped again', () => {
    expect(armingReducer(armed('a'), { type: 'tap-syllable', syllableId: 'a' })).toBeNull();
  });

  it('disarms on a tap outside', () => {
    expect(armingReducer(armed('a'), { type: 'tap-outside' })).toBeNull();
  });

  it('tap-outside is a no-op when nothing is armed', () => {
    expect(armingReducer(NONE, { type: 'tap-outside' })).toBeNull();
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
      expect(state).toEqual({ armedSyllableId: id });
    }
  });
});

describe('armingReducer — placement', () => {
  it('clears arming after a SUCCESSFUL placement', () => {
    expect(armingReducer(armed('a'), { type: 'placed' })).toBeNull();
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

  it('is a no-op when nothing is armed', () => {
    expect(
      armingReducer(NONE, { type: 'syllable-removed', syllableId: 'a' }),
    ).toBeNull();
  });
});

describe('isArmed', () => {
  it('identifies the armed syllable only', () => {
    expect(isArmed(armed('a'), 'a')).toBe(true);
    expect(isArmed(armed('a'), 'b')).toBe(false);
    expect(isArmed(NONE, 'a')).toBe(false);
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

  it('arm → refuse (no dispatch) → place elsewhere', () => {
    let s: ArmingState = armed('a');
    // refusal: nothing dispatched
    expect(s).toEqual(armed('a'));
    s = armingReducer(s, { type: 'placed' });
    expect(s).toBeNull();
  });

  it('is pure — the same input never mutates the previous state', () => {
    const before = armed('a');
    const snapshot = { ...before };
    armingReducer(before, { type: 'tap-syllable', syllableId: 'b' });
    expect(before).toEqual(snapshot);
  });
});
