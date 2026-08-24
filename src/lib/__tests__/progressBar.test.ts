/**
 * The bar's three segments and the strip's per-tick ages.
 *
 * Nothing in the app pinned a bar's width or colour before this, which
 * is how accuracy-drives-width and tier-drives-colour got to disagree
 * for as long as they did. These pin the meanings.
 */
import { describe, expect, it } from 'vitest';
import {
  FADE_FLOOR, FADE_PER_INTERVAL, barSegments, progressBarExplanation,
  tickOpacity, tickStrip, tickStripLabel,
} from '../progressBar';
import { MIN_ATTEMPTS_FOR_TIER } from '../tier';
import { ROLLING_WINDOW_SIZE } from '../adaptiveSelection';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('all three segments, from one input', () => {
  // Each case asserts EVERY width. Checking only green passes on a bar
  // that renders a miss as grey — the exact bug being fixed.

  it('5 answered, 1 wrong → green and amber, no grey', () => {
    const s = barSegments({ correct: 4, wrong: 1 });
    expect(s.correctPct).toBe(80);
    expect(s.wrongPct).toBe(20);
    expect(s.pendingPct).toBe(0);
  });

  it('4 answered, 0 wrong → green and grey, NO amber', () => {
    // The case that reads as an empty bar today: four right answers,
    // tier `untouched`, painted grey at 80% width.
    const s = barSegments({ correct: 4, wrong: 0 });
    expect(s.correctPct).toBe(80);
    expect(s.wrongPct).toBe(0);
    expect(s.pendingPct).toBe(20);
  });

  it('3 right, 1 wrong, 1 to go → all three present', () => {
    const s = barSegments({ correct: 3, wrong: 1 });
    expect(s.correctPct).toBe(60);
    expect(s.wrongPct).toBe(20);
    expect(s.pendingPct).toBe(20);
  });

  it('nothing attempted → all grey, and still the same renderer', () => {
    const s = barSegments({ correct: 0, wrong: 0 });
    expect(s.correctPct).toBe(0);
    expect(s.wrongPct).toBe(0);
    expect(s.pendingPct).toBe(100);
  });

  it('all wrong → all amber, never grey', () => {
    // Grey must never mean "wrong" at any count. This is the collision
    // the shared bar exists to remove.
    const s = barSegments({ correct: 0, wrong: 5 });
    expect(s.wrongPct).toBe(100);
    expect(s.pendingPct).toBe(0);
  });

  it('above the threshold the denominator is the attempt count', () => {
    const s = barSegments({ correct: 9, wrong: 3 });
    expect(s.denominator).toBe(12);
    expect(s.correctPct).toBe(75);
    expect(s.wrongPct).toBe(25);
    expect(s.pendingPct).toBe(0);
  });

  it('always sums to 100 once anything is on the bar', () => {
    for (let c = 0; c <= 12; c++) {
      for (let w = 0; w <= 12; w++) {
        const s = barSegments({ correct: c, wrong: w });
        expect(s.correctPct + s.wrongPct + s.pendingPct).toBeCloseTo(100, 6);
      }
    }
  });
});

describe('width and colour come from the same source', () => {
  it('derives every segment from the SAME counts', () => {
    // The actual defect was two sources: accuracy for width, tier for
    // colour. Here one call produces all three widths, and the colours
    // are fixed per segment — so there is no second input that could
    // disagree. A rated and an unrated bar differ only in the numbers
    // that come out of this one function.
    const unrated = barSegments({ correct: 4, wrong: 0 });
    const rated = barSegments({ correct: 4, wrong: 1 });
    expect(unrated.rated).toBe(false);
    expect(rated.rated).toBe(true);
    // Same green input, same green width — the rating status does not
    // touch the correct segment.
    expect(unrated.correctPct).toBe(rated.correctPct);
  });

  it('never reports a tier or a colour of its own', () => {
    // If this object ever grew a `tier`, the two-source bug could
    // return through it.
    const s = barSegments({ correct: 4, wrong: 0 }) as unknown as Record<string, unknown>;
    expect(Object.hasOwn(s, 'tier')).toBe(false);
    expect(Object.hasOwn(s, 'colour')).toBe(false);
    expect(Object.hasOwn(s, 'className')).toBe(false);
  });

  it('reads the threshold from the shared constant', () => {
    // Not a literal 5. If MIN_ATTEMPTS_FOR_TIER moves, this follows.
    const s = barSegments({ correct: 0, wrong: 0 });
    expect(s.denominator).toBe(MIN_ATTEMPTS_FOR_TIER);
  });
});

describe('each tick fades on its own age', () => {
  it('gives DIFFERENT opacities to attempts of different ages', () => {
    // THE TEST A SINGLE-TICK CHECK WOULD PASS WITHOUT. A uniform
    // whole-strip fade returns one value for both of these.
    const today = tickOpacity(NOW, NOW, 7);
    const monthAgo = tickOpacity(NOW - 30 * DAY, NOW, 7);
    expect(today).toBe(1);
    expect(monthAgo).toBeLessThan(today);
  });

  it('keeps ten fresh and ten stale reps distinguishable in one strip', () => {
    const attempts = [
      ...Array.from({ length: 10 }, () => ({ correct: true, timestamp: NOW })),
      ...Array.from({ length: 10 }, () => ({ correct: true, timestamp: NOW - 60 * DAY })),
    ];
    const ticks = tickStrip(attempts, NOW, 7);
    // Oldest first: the 60-day-old half is on the LEFT.
    const stale = new Set(ticks.slice(0, 10).map(t => t.opacity));
    const fresh = new Set(ticks.slice(10, 20).map(t => t.opacity));
    expect(stale).toEqual(new Set([FADE_FLOOR]));
    expect(fresh).toEqual(new Set([1]));
    // And the two groups are not the same value, which a uniform fade
    // would make them.
    expect(fresh).not.toEqual(stale);
  });

  it('measures age in the ITEM’s intervals, not in days', () => {
    // Six days is nearly current on a weekly item and three intervals
    // stale on a two-day one. A hardcoded day count cannot tell them
    // apart.
    const weekly = tickOpacity(NOW - 6 * DAY, NOW, 7);
    const fast = tickOpacity(NOW - 6 * DAY, NOW, 2);
    expect(weekly).toBeGreaterThan(fast);
    expect(weekly).toBeCloseTo(1 - FADE_PER_INTERVAL * (6 / 7), 6);
  });

  it('loses exactly one step per full interval', () => {
    expect(tickOpacity(NOW - 7 * DAY, NOW, 7)).toBeCloseTo(1 - FADE_PER_INTERVAL, 6);
    expect(tickOpacity(NOW - 14 * DAY, NOW, 7)).toBeCloseTo(1 - 2 * FADE_PER_INTERVAL, 6);
  });

  it('floors rather than vanishing', () => {
    // An old answer is weak evidence, not missing evidence — the tick
    // still has to say whether it was right.
    expect(tickOpacity(NOW - 3650 * DAY, NOW, 7)).toBe(FADE_FLOOR);
    expect(FADE_FLOOR).toBeGreaterThan(0);
  });

  it('treats a missing interval conservatively rather than as fresh', () => {
    // No spacing row yet. Falling back to one day fades faster; the
    // alternative would claim freshness the data does not support.
    expect(tickOpacity(NOW - 4 * DAY, NOW, 0)).toBe(FADE_FLOOR);
  });
});

describe('a tick maps to its own attempt', () => {
  it('puts the OLDEST attempt leftmost, matching the bar’s direction', () => {
    // THE ORDER PIN. The bar fills left to right from the earliest
    // attempts; a newest-first strip would read the opposite way
    // directly beneath it. Asserting only that all three attempts are
    // PRESENT passes on a reversed strip — which is the whole hazard,
    // because a reversed strip shows a recovering item as a declining
    // one.
    //
    // Timestamps are distinct and the outcomes are asymmetric, so a
    // reversal cannot coincide with the expected sequence.
    const attempts = [
      { correct: true, timestamp: NOW },              // newest
      { correct: false, timestamp: NOW - DAY },
      { correct: false, timestamp: NOW - 2 * DAY },   // oldest
    ];
    const ticks = tickStrip(attempts, NOW, 7);
    expect(ticks[0].correct).toBe(false);   // oldest, leftmost
    expect(ticks[1].correct).toBe(false);
    expect(ticks[2].correct).toBe(true);    // newest, rightmost of the filled

    // And the ages confirm it independently of the outcomes: opacity
    // RISES left to right, because the left edge is the oldest.
    expect(ticks[0].opacity).toBeLessThan(ticks[1].opacity);
    expect(ticks[1].opacity).toBeLessThan(ticks[2].opacity);
    expect(ticks[2].opacity).toBe(1);       // today
  });

  it('takes the NEWEST window from a long history, then orders it oldest-first', () => {
    // Slicing from the back to get oldest-first would take the oldest
    // twenty of a long history — not the rolling window at all.
    const attempts = Array.from({ length: 30 }, (_, i) => ({
      correct: i < ROLLING_WINDOW_SIZE,      // the newest 20 are right
      timestamp: NOW - i * DAY,              // index 0 is newest
    }));
    const ticks = tickStrip(attempts, NOW, 7);
    expect(ticks.every(t => t.correct === true)).toBe(true);
    // Leftmost is the oldest OF THE WINDOW — 19 days back, not 29.
    expect(ticks[0].opacity).toBeCloseTo(tickOpacity(NOW - 19 * DAY, NOW, 7), 6);
    expect(ticks.at(-1)!.opacity).toBe(1);
  });

  it('fills from the left and leaves the unmade attempts to the right', () => {
    // Empty slots sit where future reps will land, next to the newest
    // — the same direction the bar's grey segment sits in.
    const ticks = tickStrip([{ correct: true, timestamp: NOW }], NOW, 7);
    expect(ticks).toHaveLength(ROLLING_WINDOW_SIZE);
    expect(ticks[0].correct).toBe(true);
    expect(ticks[1].correct).toBeNull();
    expect(ticks.at(-1)!.correct).toBeNull();
  });

  it('does not fade an empty slot', () => {
    // Grey already means "not attempted". Fading it would make an
    // absence look like an old presence.
    expect(tickStrip([], NOW, 7).every(t => t.opacity === 1)).toBe(true);
  });
});

describe('the explanation is derived, not written', () => {
  it('states the threshold from the constant', () => {
    const text = progressBarExplanation(7).join(' ');
    expect(text).toContain(`${MIN_ATTEMPTS_FOR_TIER} attempts`);
    expect(text).toContain(`last ${ROLLING_WINDOW_SIZE} attempts`);
  });

  it('states the item’s OWN interval, not a fixed number of days', () => {
    expect(progressBarExplanation(7).join(' ')).toContain('7 days');
    expect(progressBarExplanation(21).join(' ')).toContain('21 days');
    expect(progressBarExplanation(1).join(' ')).toContain('1 day');
  });

  it('follows the fade constants', () => {
    const text = progressBarExplanation(7).join(' ');
    expect(text).toContain(`${Math.round(FADE_PER_INTERVAL * 100)}%`);
  });

  it('never says grey means wrong', () => {
    // The sentence that would reintroduce the collision in prose.
    const text = progressBarExplanation(7).join(' ').toLowerCase();
    expect(text).not.toMatch(/grey[^.]*wrong/);
  });
});

describe('the strip has a text equivalent', () => {
  it('reads the sequence, oldest first, matching the strip', () => {
    const ticks = tickStrip([
      { correct: true, timestamp: NOW },
      { correct: false, timestamp: NOW - DAY },
    ], NOW, 7);
    expect(tickStripLabel(ticks)).toBe(
      'Last 2 attempts, oldest first: wrong, right. 1 right, 1 wrong.',
    );
  });

  it('says so when there is nothing yet', () => {
    expect(tickStripLabel(tickStrip([], NOW, 7))).toBe('No attempts yet.');
  });
});
