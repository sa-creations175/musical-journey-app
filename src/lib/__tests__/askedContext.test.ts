/**
 * The row says what was in force WHEN THE QUESTION WAS ASKED.
 *
 * =====================================================================
 * THE BUG THIS EXISTS FOR IS INVISIBLE IN THE HAPPY PATH.
 *
 * Reading the four settings at write time gives the same answer as
 * reading them at ask time — right up until the reader moves a control
 * while thinking, which is exactly the case the fields exist to
 * separate. A test that presents and answers without touching
 * anything passes on both implementations, so every case here changes
 * the live setting in between and asserts the CAPTURED value wins.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  answerTimingFields, type AskedContext,
} from '../attemptTiming';

/** A module's live settings — the things a reader can move mid-round. */
function liveSettings() {
  return { speed: 1.0, style: 'blocked' as 'blocked' | 'broken', tab: 'scale' };
}

const ASKED_AT = 1_700_000_000_000;

describe('playbackSpeed', () => {
  it('holds the speed the question was heard at, not the current one', () => {
    const live = liveSettings();
    // Presented at full speed…
    const asked: AskedContext = {
      playbackEndsAt: ASKED_AT,
      playbackSpeed: live.speed,
    };
    // …reader drags the slider to half while thinking…
    live.speed = 0.5;
    // …and answers.
    const row = answerTimingFields(asked, ASKED_AT + 3_000);
    expect(row.playbackSpeed).toBe(1.0);
    expect(row.playbackSpeed).not.toBe(live.speed);
  });

  it('would be wrong if it read the live value', () => {
    // The negative case stated explicitly, so the assertion above
    // cannot be satisfied by a coincidence of equal defaults.
    const live = liveSettings();
    const asked: AskedContext = { playbackEndsAt: ASKED_AT, playbackSpeed: 0.75 };
    live.speed = 1.0;
    expect(answerTimingFields(asked, ASKED_AT).playbackSpeed).toBe(0.75);
  });
});

describe('playStyle', () => {
  it('holds the style the chord was played in, not the toggle now', () => {
    const live = liveSettings();
    const asked: AskedContext = {
      playbackEndsAt: ASKED_AT,
      playbackSpeed: live.speed,
      playStyle: live.style,
    };
    live.style = 'broken';
    const row = answerTimingFields(asked, ASKED_AT + 900);
    expect(row.playStyle).toBe('blocked');
  });
});

describe('drillTab', () => {
  it('holds the tab the question came from, not the tab now open', () => {
    // A reader can answer, then switch tabs before the write settles.
    const live = liveSettings();
    const asked: AskedContext = {
      playbackEndsAt: ASKED_AT,
      playbackSpeed: live.speed,
      drillTab: live.tab,
    };
    live.tab = 'vamp';
    expect(answerTimingFields(asked, ASKED_AT + 1_200).drillTab).toBe('scale');
  });
});

describe('all four together', () => {
  it('survives every setting moving between ask and answer', () => {
    const live = { speed: 1.0, style: 'broken' as const, tab: 'chord-motion' };
    const asked: AskedContext = {
      playbackEndsAt: ASKED_AT,
      playbackSpeed: live.speed,
      playStyle: live.style,
      drillTab: live.tab,
    };
    const moved = { speed: 0.25, style: 'blocked', tab: 'key-detection' };
    void moved;
    expect(answerTimingFields(asked, ASKED_AT + 2_500)).toEqual({
      elapsedMs: 2_500,
      playbackSpeed: 1.0,
      playStyle: 'broken',
      drillTab: 'chord-motion',
    });
  });

  it('writes nothing at all when the question was never presented', () => {
    // A submit with no round — the fields are absent rather than
    // guessed from whatever the controls happen to say.
    const row = answerTimingFields(null, ASKED_AT);
    expect(row).toEqual({});
    for (const field of ['elapsedMs', 'playbackSpeed', 'playStyle', 'drillTab']) {
      expect(Object.hasOwn(row, field), field).toBe(false);
    }
  });

  it('omits a field the module does not have, rather than writing undefined', () => {
    // Intervals has no style and no tab. Absence is a true statement
    // about that row; `undefined` is a key with a null on the other
    // side of the sync boundary.
    const row = answerTimingFields(
      { playbackEndsAt: ASKED_AT, playbackSpeed: 1 }, ASKED_AT + 10,
    );
    expect(Object.hasOwn(row, 'playStyle')).toBe(false);
    expect(Object.hasOwn(row, 'drillTab')).toBe(false);
  });
});
