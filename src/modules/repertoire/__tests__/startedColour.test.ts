/**
 * One rung, one colour.
 *
 * =====================================================================
 * THE MATRIX PAINTED A STARTED CELL BLUE AND THE PILL ABOVE IT GREY.
 *
 * Two tables answered for the same rung: the cells read the tier ramp,
 * the song page's status pill read the ladder's own. Nothing was wrong
 * in either on its own — they simply disagreed, on one screen, about
 * one word.
 *
 * These pin them together. A future recolour of Started has to move
 * both or fail here.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { TIER_BADGE_CLASS } from '../../../lib/tier';
import { STAGE_BADGE_CLASS } from '../stage';

describe('Started', () => {
  it('the pill takes the tier badge it always should have', () => {
    expect(STAGE_BADGE_CLASS.started).toBe(TIER_BADGE_CLASS.started);
  });

  it('ITS FILL IS NOT GREY', () => {
    // The specific failure: `bg-neutral-100 text-neutral-600` on a rung
    // the grid draws in blue.
    //
    // THE FILL, NOT THE WHOLE CLASS. Started's colour is a pale blue
    // and its INK is a neutral, because a pale blue word on a white
    // page is unreadable — see `statusColour`. The rung's colour is
    // what must not be grey; what is written on it is a legibility
    // question and has a different answer.
    expect(STAGE_BADGE_CLASS.started).toContain('bg-started');
    expect(STAGE_BADGE_CLASS.started).not.toContain('bg-neutral');
  });

  it('Not Started stays neutral — it is the empty one', () => {
    // Started had to stop being grey precisely so it could not be
    // mistaken for this.
    expect(STAGE_BADGE_CLASS.not_started).toContain('neutral');
    expect(STAGE_BADGE_CLASS.started).not.toBe(STAGE_BADGE_CLASS.not_started);
  });
});
