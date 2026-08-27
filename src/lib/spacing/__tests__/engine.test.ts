/**
 * The scheduler, exercised against the spec's own defaults.
 */
import { describe, expect, it } from 'vitest';
import {
  MS_PER_DAY, answer, dueState, newCardState, previewSequence,
  type SpacingCardState,
} from '../engine';
import { DEFAULT_SPACING_SETTINGS, type SpacingSettings } from '../settings';

const T0 = 1_800_000_000_000;
const days = (n: number) => n * MS_PER_DAY;

function settings(over: (s: SpacingSettings) => void = () => {}): SpacingSettings {
  const s: SpacingSettings = JSON.parse(JSON.stringify(DEFAULT_SPACING_SETTINGS));
  over(s);
  return s;
}

/** Walk a card through N correct answers, returning the gaps in days. */
function correctRun(s: SpacingSettings, n: number): number[] {
  let state = newCardState();
  let at = T0;
  const gaps: number[] = [];
  for (let i = 0; i < n; i++) {
    state = answer({ state, settings: s, correct: true, band: 'fluent', answeredAt: at });
    const gap = state.nextDueAt === null ? 0 : (state.nextDueAt - at) / MS_PER_DAY;
    gaps.push(gap);
    at = state.nextDueAt ?? at;
  }
  return gaps;
}

describe('acquiring — the tally is the schedule', () => {
  it('walks the default 2·1·0·1·0·1 as five answers over four days', () => {
    // Day offsets 0,0,1,3,5 → gaps 0,1,2,2, then graduation.
    expect(correctRun(settings(), 4)).toEqual([0, 1, 2, 2]);
  });

  it('graduates on the last exposure, not after it', () => {
    let state = newCardState();
    let at = T0;
    for (let i = 0; i < 4; i++) {
      state = answer({ state, settings: settings(), correct: true, band: null, answeredAt: at });
      expect(state.stage).toBe('acquiring');
      at = state.nextDueAt as number;
    }
    state = answer({ state, settings: settings(), correct: true, band: null, answeredAt: at });
    expect(state.stage).toBe('maintaining');
    // The first wait, not a band multiplier — no band exists yet.
    expect(state.currentWaitDays).toBe(2);
  });

  it('counts the remaining gaps from when you actually answered', () => {
    // THE DAYS ARE MINIMUM GAPS. Answer the day-1 exposure a week late
    // and the day-3 exposure is still two days after THAT.
    let state = newCardState();
    state = answer({ state, settings: settings(), correct: true, band: null, answeredAt: T0 });
    state = answer({ state, settings: settings(), correct: true, band: null, answeredAt: T0 });
    const late = T0 + days(9);
    state = answer({ state, settings: settings(), correct: true, band: null, answeredAt: late });
    expect((state.nextDueAt as number) - late).toBe(days(2));
  });

  it('nothing resets when a day is missed', () => {
    let state = newCardState();
    state = answer({ state, settings: settings(), correct: true, band: null, answeredAt: T0 });
    const before = state.exposuresDone;
    state = answer({
      state, settings: settings(), correct: true, band: null,
      answeredAt: T0 + days(40),
    });
    expect(state.exposuresDone).toBe(before + 1);
    expect(state.stage).toBe('acquiring');
  });
});

describe('acquiring — what a miss does', () => {
  it('repeat-session brings it back now without spending an exposure', () => {
    const s = settings();
    let state = newCardState();
    state = answer({ state, settings: s, correct: false, band: null, answeredAt: T0 });
    expect(state.exposuresDone).toBe(0);
    expect(state.nextDueAt).toBe(T0);
  });

  it('restart-pattern goes back to the first exposure', () => {
    const s = settings(x => { x.acquiring.onWrong = 'restart-pattern'; });
    let state = newCardState();
    let at = T0;
    for (let i = 0; i < 3; i++) {
      state = answer({ state, settings: s, correct: true, band: null, answeredAt: at });
      at = state.nextDueAt as number;
    }
    expect(state.exposuresDone).toBe(3);
    state = answer({ state, settings: s, correct: false, band: null, answeredAt: at });
    expect(state.exposuresDone).toBe(0);
  });

  it('add-to-next-day owes an extra exposure on a LATER day', () => {
    const s = settings(x => { x.acquiring.onWrong = 'add-to-next-day'; });
    let state = newCardState();
    // Wrong on the first day-0 exposure: the extra must not land in
    // this same session, or it would be "repeat now" by another name.
    state = answer({ state, settings: s, correct: false, band: null, answeredAt: T0 });
    expect(state.extraExposures).toBe(1);
    // It advanced normally; the debt is paid the next time the card
    // comes up, giving that day one more exposure than the tally said.
    expect(state.exposuresDone).toBe(1);
    const at = state.nextDueAt as number;
    state = answer({ state, settings: s, correct: true, band: null, answeredAt: at });
    expect(state.extraExposures).toBe(0);
    expect(state.exposuresDone).toBe(1);
    expect(state.nextDueAt).toBe(at);
  });

  it('nothing carries on exactly as a correct answer would', () => {
    const s = settings(x => { x.acquiring.onWrong = 'nothing'; });
    let state = newCardState();
    state = answer({ state, settings: s, correct: false, band: null, answeredAt: T0 });
    expect(state.exposuresDone).toBe(1);
  });
});

describe('maintaining — the band decides growth and ceiling', () => {
  const graduated = (s: SpacingSettings): SpacingCardState => ({
    ...newCardState(),
    stage: 'maintaining',
    currentWaitDays: s.maintaining.firstWaitDays,
    lastAnsweredAt: T0,
    nextDueAt: T0 + days(s.maintaining.firstWaitDays),
  });

  it('needs work returns to the first wait every time', () => {
    const s = settings();
    let state = graduated(s);
    for (let i = 0; i < 4; i++) {
      state = answer({ state, settings: s, correct: true, band: 'needs-work', answeredAt: T0 });
      expect(state.currentWaitDays).toBe(2);
    }
  });

  it('fluent multiplies by 2.5 and stops at 30', () => {
    const s = settings();
    let state = graduated(s);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      state = answer({ state, settings: s, correct: true, band: 'fluent', answeredAt: T0 });
      seen.push(state.currentWaitDays);
    }
    // Unrounded chaining: 2 → 5 → 12.5 → 31.25 clamped to 30.
    expect(seen).toEqual([5, 12.5, 30, 30, 30, 30]);
  });

  it('drops a card under its new ceiling as soon as the band falls', () => {
    // A month-long wait is not kept by a card that is no longer fluent.
    const s = settings();
    let state = { ...graduated(s), currentWaitDays: 30 };
    state = answer({ state, settings: s, correct: true, band: 'developing', answeredAt: T0 });
    expect(state.currentWaitDays).toBe(7);
  });

  it('a wrong answer goes back to the first wait by default', () => {
    const s = settings();
    let state = { ...graduated(s), currentWaitDays: 30 };
    state = answer({ state, settings: s, correct: false, band: 'fluent', answeredAt: T0 });
    expect(state.currentWaitDays).toBe(2);
  });

  it('never schedules shorter than the floor', () => {
    const s = settings(x => {
      x.maintaining.minimumDays = 3;
      x.maintaining.onWrong = 'halve';
    });
    let state = { ...graduated(s), currentWaitDays: 4 };
    state = answer({ state, settings: s, correct: false, band: 'fluent', answeredAt: T0 });
    expect(state.currentWaitDays).toBe(3);
  });
});

describe('stale', () => {
  const s = settings();
  const state: SpacingCardState = {
    ...newCardState(), stage: 'maintaining', currentWaitDays: 60,
    lastAnsweredAt: T0, nextDueAt: T0 + days(60),
  };

  it('is grace counted from the DUE DATE, not from the wait', () => {
    const due = T0 + days(60);
    expect(dueState(state, s, due - 1)).toBe('waiting');
    expect(dueState(state, s, due)).toBe('due');
    expect(dueState(state, s, due + days(6))).toBe('due');
    expect(dueState(state, s, due + days(7))).toBe('stale');
  });

  it('a short wait goes stale on the same schedule as a long one', () => {
    const short: SpacingCardState = { ...state, currentWaitDays: 2, nextDueAt: T0 + days(2) };
    expect(dueState(short, s, T0 + days(2) + days(7))).toBe('stale');
  });
});

describe('out of the schedule', () => {
  it('carries no due date but keeps its progress', () => {
    const s = settings(x => { x.inSchedule = false; });
    let state = newCardState();
    state = answer({ state, settings: s, correct: true, band: null, answeredAt: T0 });
    expect(state.nextDueAt).toBeNull();
    expect(state.exposuresDone).toBe(1);
    expect(dueState(state, s, T0 + days(99))).toBe('not-scheduled');
  });
});

describe('the live preview runs the real scheduler', () => {
  it('produces the sequence the spec shows for the defaults', () => {
    expect(previewSequence(settings(), 'developing')).toEqual([2, 3, 5, 7]);
    // Needs work never leaves the first wait, and its ceiling is 2.
    expect(previewSequence(settings(), 'needs-work')).toEqual([2]);
    // The spec's own Chord Recognition row, first wait overridden to 1.
    const cr = settings(x => {
      x.maintaining.firstWaitDays = 1;
      x.maintaining.perBand.fluent = { growth: { kind: 'multiply', factor: 1.7 }, ceilingDays: 30 };
    });
    expect(previewSequence(cr, 'fluent')).toEqual([1, 2, 3, 5, 8, 14, 24, 30]);
  });
});
