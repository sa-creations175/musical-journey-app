/**
 * One label for both module homes, with the count derived.
 *
 * The two homes said different things — "all categories mixed" and
 * "all four mixed" — and reading's carried a number in words that
 * nothing could keep true. This pins the shape and, more importantly,
 * that the number is an argument rather than a constant.
 */
import { describe, expect, it } from 'vitest';
import { mixedDrillLabel } from '../mixedDrillLabel';
import { CATEGORY_ORDER } from '../../../modules/harmonic-fluency/catalog';
import { READING_SKILL_ORDER } from '../../../modules/reading/homeCards';

describe('the mixed drill label', () => {
  it('reads in Title Case with the count in brackets', () => {
    expect(mixedDrillLabel(15)).toBe('Start Drill · All Categories (15) Mixed');
    expect(mixedDrillLabel(4)).toBe('Start Drill · All Categories (4) Mixed');
  });

  it('moves with the module rather than being written down', () => {
    // Today's two numbers, taken from the lists the buttons pass. If a
    // category is added or removed, these move on their own — which is
    // the whole reason the count is a parameter.
    expect(mixedDrillLabel(CATEGORY_ORDER.length))
      .toContain(`(${CATEGORY_ORDER.length})`);
    expect(mixedDrillLabel(READING_SKILL_ORDER.length))
      .toContain(`(${READING_SKILL_ORDER.length})`);
    expect(CATEGORY_ORDER.length).not.toBe(READING_SKILL_ORDER.length);
  });
});
