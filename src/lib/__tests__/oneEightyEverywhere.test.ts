/**
 * One 80 in the app, and it is the Fluent floor.
 *
 * =====================================================================
 * THREE NUMBERS THAT HAD ALWAYS BEEN EQUAL, ANY ONE MOVABLE ALONE.
 *
 * The Fluent rating is drawn at 80. A Tier's pass bar is 80. An item is
 * "acquired" at 80. They were three separate constants, which was
 * harmless while all three were literals nobody edited — and stopped
 * being harmless on 10 Sep 2026, when the Settings page made the Fluent
 * floor editable. A reader who set Fluent to 85 was still being told
 * items were acquired at 80.
 *
 * What this asserts is that moving the one number moves the others.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { declarativeAcquiredThreshold, nextStageDeclarative } from '../spacingState';
import { DEFAULT_RATING_RULES, ratingRules, setRatingRules } from '../ratingRules';

const attempts = (correct: number, total: number) =>
  Array.from({ length: total }, (_, i) => ({
    t: i, kind: 'attempt' as const, correct: i < correct,
  }));

afterEach(() => { setRatingRules(DEFAULT_RATING_RULES); });

describe('the acquisition threshold is the Fluent floor', () => {
  it('is the same number by default', () => {
    expect(declarativeAcquiredThreshold()).toBe(ratingRules().fluentFloor);
  });

  it('follows Fluent when Fluent moves', () => {
    setRatingRules({ ...ratingRules(), fluentFloor: 0.9 });
    expect(declarativeAcquiredThreshold()).toBe(0.9);
  });

  it('changes what counts as acquired', () => {
    // Eight of ten is acquired at the default 80 and is not at 90.
    const eightOfTen = attempts(8, 10);
    expect(nextStageDeclarative('acquiring', eightOfTen)).toBe('acquired');

    setRatingRules({ ...ratingRules(), fluentFloor: 0.9 });
    expect(nextStageDeclarative('acquiring', eightOfTen)).toBe('acquiring');
    expect(nextStageDeclarative('acquiring', attempts(9, 10))).toBe('acquired');
  });
});
