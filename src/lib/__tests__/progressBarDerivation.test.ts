/**
 * The ⓘ copy follows the constants — proved by MOVING one.
 *
 * ---------------------------------------------------------------
 * WHY THIS NEEDS ITS OWN FILE AND A MOCK.
 *
 * `MIN_ATTEMPTS_FOR_TIER` is 5. A test asserting the copy contains
 * "5 attempts" passes identically on `${MIN_ATTEMPTS_FOR_TIER}` and on
 * a hand-typed 5 — the two are indistinguishable while the constant
 * holds its current value, which is exactly when nobody notices the
 * copy has stopped being derived.
 *
 * So this file mocks the constant to a value it has never had and
 * asserts the sentence follows. Hand-written prose fails here and
 * cannot be made to pass without actually reading the constant.
 * `vi.mock` is hoisted per file, which is why this is not folded into
 * progressBar.test.ts.
 * ---------------------------------------------------------------
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../tier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tier')>();
  return { ...actual, MIN_ATTEMPTS_FOR_TIER: 9 };
});

vi.mock('../adaptiveSelection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adaptiveSelection')>();
  return { ...actual, ROLLING_WINDOW_SIZE: 33 };
});

const { progressBarExplanation, barSegments, tickStrip } =
  await import('../progressBar');

describe('with the thresholds moved', () => {
  it('the copy states the MOVED rating threshold', () => {
    expect(progressBarExplanation(7).join(' ')).toContain('9 attempts');
  });

  it('the copy states the MOVED window size', () => {
    expect(progressBarExplanation(7).join(' ')).toContain('last 33 attempts');
  });

  it('the bar fills to the moved threshold', () => {
    // Not just the copy — the arithmetic reads the same constant, so
    // the sentence and the bar cannot drift from one another.
    expect(barSegments({ correct: 0, wrong: 0 }).denominator).toBe(9);
    expect(barSegments({ correct: 4, wrong: 0 }).correctPct)
      .toBeCloseTo((4 / 9) * 100, 6);
  });

  it('the strip renders the moved window length', () => {
    expect(tickStrip([], Date.now(), 7)).toHaveLength(33);
  });
});
