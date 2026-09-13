/**
 * The four-step rule, and the two things it deliberately ignores.
 */
import { describe, expect, it } from 'vitest';
import { feelOfAttempt, heardFeel, isAided } from '../heardFeel';
import { FEEL_OPTIONS, fluencyValue } from '../../fluencyScale';
import {
  DEFAULT_PLAYER_SETTINGS, type PlayerSettings,
} from '../../player/settings';

describe('where an answer lands', () => {
  const base = { firstRight: true, secondRight: true, replays: 0, aided: false };

  it('right on the first listen with no aid is In flow', () => {
    expect(heardFeel(base)).toBe(4);
    expect(fluencyValue(heardFeel(base))).toBe(100);
  });

  it('right after replays, with no aid, is Clean', () => {
    expect(heardFeel({ ...base, replays: 1 })).toBe(3);
    expect(heardFeel({ ...base, replays: 9 })).toBe(3);
    expect(fluencyValue(3)).toBe(75);
  });

  it('right with an aid is Working on it, however few the replays', () => {
    expect(heardFeel({ ...base, aided: true })).toBe(2);
    expect(heardFeel({ ...base, aided: true, replays: 4 })).toBe(2);
    expect(fluencyValue(2)).toBe(50);
  });

  it('half right is Working on it too', () => {
    // The right chord in the wrong inversion; the right progression
    // from the wrong position. You heard the harmony and not the
    // voicing — not a pass, and not a failure.
    expect(heardFeel({ ...base, secondRight: false })).toBe(2);
  });

  it('wrong on the first question is Struggled, whatever followed', () => {
    expect(heardFeel({ ...base, firstRight: false })).toBe(1);
    expect(heardFeel({ firstRight: false, secondRight: true, replays: 0, aided: false }))
      .toBe(1);
    expect(fluencyValue(1)).toBe(25);
  });

  it('uses the scale the rest of the app already grades practice on', () => {
    expect(FEEL_OPTIONS.map(o => o.label)).toEqual([
      'Struggled', 'Working on it', 'Clean', 'In flow',
    ]);
  });
});

describe('which controls count as an aid', () => {
  it('counts the bass on its own, everywhere', () => {
    expect(isAided({ ...DEFAULT_PLAYER_SETTINGS, listen: 'bass' })).toBe(true);
  });

  it('counts a run only where the surface says Play as is an aid', () => {
    // SILAS'S SPEC OF 13 SEP 2026: on the Chord Recognition quiz Up,
    // Down and Up and Down are an aid and only Together is free. No
    // other surface makes that claim.
    for (const playAs of ['up', 'down', 'upDown'] as const) {
      const run = { ...DEFAULT_PLAYER_SETTINGS, playAs };
      expect(isAided(run, { playAsIsAid: true })).toBe(true);
      expect(isAided(run)).toBe(false);
    }
    expect(isAided(DEFAULT_PLAYER_SETTINGS, { playAsIsAid: true })).toBe(false);
  });

  it('leaves tempo and octave free', () => {
    // Slowing a chord down or moving it an octave does not tell you
    // what it is. You still have to name it. The whole settings object
    // goes in, as a caller's would.
    const slow: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS, bpm: 30 };
    const lifted: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS, octaveUp: true };
    expect(isAided(slow)).toBe(false);
    expect(isAided(lifted)).toBe(false);
    expect(isAided(DEFAULT_PLAYER_SETTINGS)).toBe(false);
  });

  it('is not an aid on a surface with no Play as setting', () => {
    expect(isAided({ listen: 'both' })).toBe(false);
  });
});

describe('rows written before the scale existed', () => {
  it('read as the two ends of it, and nothing in between', () => {
    // NO MIGRATION. A row holding only `correct` holds exactly that;
    // inventing a Clean for it would be evidence nobody gave.
    expect(feelOfAttempt({ correct: true })).toBe(4);
    expect(feelOfAttempt({ correct: false })).toBe(1);
  });

  it('prefers the stored feel wherever there is one', () => {
    expect(feelOfAttempt({ correct: true, feelRating: 2 })).toBe(2);
    // Including where it disagrees with `correct` — a wrong inversion
    // is `correct: false` and Working on it, and the feel is the
    // fuller statement.
    expect(feelOfAttempt({ correct: false, feelRating: 2 })).toBe(2);
  });
});
