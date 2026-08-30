/**
 * One test model, for every surface.
 *
 * =====================================================================
 * THE RULE THIS REPLACES TOOK THE FIRST THREE, NOT THE BEST THREE.
 *
 * `countsTowardTest` was `!belowTarget && !tooShort && feel !== null` —
 * it never looked at the feel's VALUE. So a fumbled first drill was
 * already in your result, the two after it could not rescue you, and
 * there was no fourth. Meanwhile `banding.ts` read those same three
 * reps, hit the fumble, reset, and refused the pass. The screen said
 * the test was done and the rule said otherwise.
 *
 * These pin the one count both now use, and they pin the RESET
 * hardest: it is the whole difference, and the thing a future
 * simplification would remove first.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  TEST_REPS, meetsFloor, projectTestStreak, streakPassed,
} from '../testStreak';

const clean = { counts: true, feel: 3 } as const;
const flow = { counts: true, feel: 4 } as const;
const bad = { counts: true, feel: 1 } as const;
const slow = { counts: false, feel: 3 } as const;
const unrated = { counts: true, feel: null } as const;

describe('three in a row', () => {
  it('passes at three, and not at two', () => {
    expect(streakPassed([clean, clean])).toBe(false);
    expect(streakPassed([clean, clean, clean])).toBe(true);
  });

  it('caps at three', () => {
    expect(projectTestStreak([clean, clean, clean, clean])).toBe(TEST_REPS);
  });
});

describe('a bad run costs the streak, and that is the change', () => {
  it('drops two back to nothing', () => {
    expect(projectTestStreak([clean, clean])).toBe(2);
    expect(projectTestStreak([clean, clean, bad])).toBe(0);
  });

  it('THREE CLEAN RUNS WITH A FUMBLE BETWEEN THEM DO NOT PASS', () => {
    // The old rule's exact case: three at-target rated drills, one of
    // them Struggled, and the panel called it a completed test.
    expect(streakPassed([clean, bad, clean, clean])).toBe(false);
  });

  it('and you can go again in the same session', () => {
    // The other half of the reset, and the reason it is not just a
    // punishment: keep going until you get it right is what a person
    // actually does.
    expect(streakPassed([bad, clean, clean, clean])).toBe(true);
  });

  it('the fumble does not cap what the recovery can reach', () => {
    // It cost the streak once. Charging for it twice would mean one
    // bad run capped the whole session.
    expect(streakPassed([bad, flow, flow, flow])).toBe(true);
  });
});

describe('a run that does not count is invisible, not a failure', () => {
  it('a below-floor run neither advances nor resets', () => {
    // A warm-up under tempo is a different activity, not a failed
    // demonstration. Treating it as a failure would make practising
    // inside a test session cost you the test.
    expect(projectTestStreak([clean, clean, slow])).toBe(2);
    expect(projectTestStreak([clean, clean, slow, clean])).toBe(3);
  });

  it('below-floor runs never advance it either', () => {
    expect(projectTestStreak([slow, slow, slow, slow])).toBe(0);
  });

  it('AN UNRATED RUN RESETS — it is not the same as a slow one', () => {
    // A test rep is a claim, and a run you declined to judge is not
    // one. Letting it pass through untouched would make three clean
    // runs with an unrated one between them read as three in a row.
    expect(projectTestStreak([clean, clean, unrated])).toBe(0);
    expect(streakPassed([clean, unrated, clean, clean])).toBe(false);
  });
});

describe('the shared floor', () => {
  it('no floor means everything counts', () => {
    // A song with no stated tempo, or a surface with no target.
    expect(meetsFloor(40, null)).toBe(true);
    expect(meetsFloor(null, null)).toBe(true);
  });

  it('NO MEASURED VALUE MEANS NOTHING COUNTS, when there is a floor', () => {
    // "Clean at a tempo you didn't say" is not an answer to "clean at
    // tempo".
    expect(meetsFloor(null, 90)).toBe(false);
  });

  it('is inclusive, and one-sided', () => {
    // Playing faster than the target is a harder claim, not a
    // disqualifying one.
    expect(meetsFloor(90, 90)).toBe(true);
    expect(meetsFloor(89, 90)).toBe(false);
    expect(meetsFloor(400, 90)).toBe(true);
  });
});
