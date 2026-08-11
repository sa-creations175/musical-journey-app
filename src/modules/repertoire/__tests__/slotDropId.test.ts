import { describe, expect, it } from 'vitest';
import { DRAG_ID, parseSlotDropId } from '../BarGridView';

/**
 * A builder and its inverse, tested together.
 *
 * The bug this covers: the lyric drop handler open-coded
 * `parseInt(beatStr, 10)`, which reads "2+" as 2. Dragging a word onto
 * the "and of 2" therefore landed it on BEAT 2 — no refusal, no shake,
 * just the wrong cell. The chord branch a few lines above had its own
 * correct copy of the parse, so the codebase held both a right and a
 * wrong answer to the same question at once. That is the argument for
 * a single parser living next to the builder it inverts.
 */
describe('parseSlotDropId — round-trips every DRAG_ID slot builder', () => {
  it('recovers bar, beat and offbeat from a lyric target', () => {
    for (const offbeat of [false, true]) {
      for (const bar of [0, 3, 17]) {
        for (const beat of [0, 2, 11]) {
          expect(parseSlotDropId(DRAG_ID.beat(bar, beat, offbeat))).toEqual({
            barIndex: bar,
            beatPos: beat,
            offbeat,
          });
        }
      }
    }
  });

  it('recovers them from a chord target too', () => {
    expect(parseSlotDropId(DRAG_ID.emptyBeat(2, 3, true))).toEqual({
      barIndex: 2,
      beatPos: 3,
      offbeat: true,
    });
  });

  it('THE BUG: a trailing + is never read as part of the beat number', () => {
    // parseInt('3+', 10) === 3, silently. Named explicitly because the
    // failure was a wrong placement rather than a refusal, which is the
    // kind that reaches the user's data before it reaches their eye.
    const parsed = parseSlotDropId(DRAG_ID.beat(1, 3, true))!;
    expect(parsed.beatPos).toBe(3);
    expect(parsed.offbeat).toBe(true);
    expect(parsed).not.toEqual(parseSlotDropId(DRAG_ID.beat(1, 3, false)));
  });

  it('on-beat ids are byte-identical to their pre-eighths form', () => {
    // The compatibility promise: a feature the song has not enabled
    // cannot rename an existing drop target.
    expect(DRAG_ID.beat(1, 3)).toBe('beat:1:3');
    expect(DRAG_ID.emptyBeat(1, 3)).toBe('emptybeat:1:3');
  });

  it('returns null for ids that are not slot targets', () => {
    for (const id of ['syl:abc', 'chord:x', 'pending:l1', 'bar:2', 'beat:', '']) {
      expect(parseSlotDropId(id)).toBeNull();
    }
  });
});
