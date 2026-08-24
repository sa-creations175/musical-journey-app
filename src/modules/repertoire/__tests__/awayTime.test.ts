/**
 * The buckets, and the numbers shown beside them.
 *
 * Pure. What matters is that the five answers span the whole stretch
 * from all of it to none of it, and that the minutes shown are the
 * minutes actually kept — a choice whose consequence is invisible is
 * not being offered.
 */
import { describe, expect, it } from 'vitest';
import {
  AWAY_BUCKETS, AWAY_PARTIAL, awayMinutes, gapMinutes,
} from '../awayTime';

const MIN = 60_000;

describe('the buckets', () => {
  it('runs 100 / 75 / 50 / 25 / 0 with nothing missing between', () => {
    const all = [AWAY_BUCKETS[0], ...AWAY_PARTIAL, AWAY_BUCKETS[1]];
    expect(all.map(b => b.keepFraction)).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it('offers an answer that keeps everything and one that keeps nothing', () => {
    // Both ends must exist. Without "I was locked in" the mechanism
    // would tax every long silence at a keyboard, which is what
    // practising looks like; without "I was gone" there would be no
    // way to say so and the time would be counted regardless.
    expect(AWAY_BUCKETS.map(b => b.id)).toEqual(['locked-in', 'gone']);
  });
});

describe('the minutes shown beside each choice', () => {
  it('reads the way the copy shows it — 38 minutes → 38 / 29 / 19 / 10 / 0', () => {
    const gap = 38 * MIN;
    expect(gapMinutes(gap)).toBe(38);
    expect(awayMinutes(gap, 0.75)).toBe(29);
    expect(awayMinutes(gap, 0.5)).toBe(19);
    expect(awayMinutes(gap, 0.25)).toBe(10);
    expect(awayMinutes(gap, 0)).toBe(0);
  });

  it('lets "I was gone" reach zero', () => {
    // The opposite rounding rule from `elapsedMinutes`, which rounds
    // UP so a 40-second pass is not recorded as no practice. Here a
    // rounded-up zero would mean the one answer that says "none of
    // this was practice" still kept a minute of it.
    expect(awayMinutes(45 * MIN, 0)).toBe(0);
  });

  it('never returns a negative number for a nonsense gap', () => {
    expect(awayMinutes(-5 * MIN, 1)).toBe(0);
  });
});
