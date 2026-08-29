/**
 * The gate on a test run.
 *
 * =====================================================================
 * THE DEFECT IT REPLACES WAS NOT A MISSING CHECK. IT WAS A CHECK
 * AGAINST A NUMBER THE APP HAD SUPPLIED ITSELF.
 *
 * The typed tempo box was pre-filled from the song's target, so a run
 * played at 70 on a song targeted at 100 recorded 100 and counted. The
 * gate ran, passed, and proved nothing — which is worse than no gate,
 * because a passing check reads as evidence.
 *
 * So these pin the ORDER of the reasons as hard as the reasons. A song
 * with no tempo and a silent metronome has two problems, and answering
 * with "start the metronome" sends the player to fix the one that will
 * not help.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  FLOOR_BELOW,
  canStartTestRun,
  clampTestBpm,
  noTempoText,
  testFloorBpm,
  testRunBlockReason,
  testTempoWindowText,
} from '../tempoGate';

const TEMPO = 100;
const FLOOR = TEMPO - FLOOR_BELOW;

describe('the window', () => {
  it('is ten below the song, and one-sided', () => {
    // Playing faster than the target is a harder claim, not a
    // disqualifying one — the same window `isInTempoRange` has always
    // applied.
    expect(testFloorBpm(TEMPO)).toBe(90);
    expect(canStartTestRun({ songTempo: TEMPO, metronomeOn: true, bpm: 90 })).toBe(true);
    expect(canStartTestRun({ songTempo: TEMPO, metronomeOn: true, bpm: 200 })).toBe(true);
    expect(canStartTestRun({ songTempo: TEMPO, metronomeOn: true, bpm: 89 })).toBe(false);
  });

  it('has no floor when the song has no tempo', () => {
    expect(testFloorBpm(null)).toBeNull();
  });
});

describe('why a run cannot start', () => {
  it('NO TEMPO IS A BLOCKER, and it is said first', () => {
    // Both problems present. Telling him to start the metronome would
    // send him to fix the one that will not help.
    const why = testRunBlockReason({ songTempo: null, metronomeOn: false, bpm: 90 });
    expect(why).toBe(
      'Set this song’s tempo before testing it. A test is three clean '
      + 'run-throughs at tempo, and there is nothing here to measure that against.',
    );
  });

  it('a silent metronome is next', () => {
    expect(testRunBlockReason({ songTempo: TEMPO, metronomeOn: false, bpm: 90 }))
      .toBe('Start the metronome to begin a test run.');
  });

  it('being under the floor is last, and names the floor', () => {
    expect(testRunBlockReason({ songTempo: TEMPO, metronomeOn: true, bpm: 80 }))
      .toBe(`A test runs at ${FLOOR} bpm or faster. Ten below the song’s tempo is the floor.`);
  });

  it('nothing to say when the run may start', () => {
    expect(testRunBlockReason({ songTempo: TEMPO, metronomeOn: true, bpm: 100 })).toBeNull();
  });

  it('a running metronome is not enough on its own', () => {
    // The old box let a run start with nothing sounding at all. The
    // metronome being on is one of three conditions, not the whole gate.
    expect(canStartTestRun({ songTempo: null, metronomeOn: true, bpm: 90 })).toBe(false);
  });
});

describe('the stepper clamps rather than refusing', () => {
  it('stops at the floor and says why', () => {
    // A button that silently does nothing at the boundary reads as
    // broken; one that stops and explains has taught the rule.
    const r = clampTestBpm(FLOOR - 1, TEMPO);
    expect(r.bpm).toBe(FLOOR);
    expect(r.why).toBe(
      `A test runs at ${FLOOR} bpm or faster. Ten below the song’s tempo is the floor.`,
    );
  });

  it('says nothing when nothing was clamped', () => {
    expect(clampTestBpm(120, TEMPO)).toEqual({ bpm: 120, why: null });
  });

  it('does not clamp a song with no tempo', () => {
    // There is no floor to clamp to. The run is blocked for a different
    // reason, and inventing a floor here would hide it.
    expect(clampTestBpm(40, null)).toEqual({ bpm: 40, why: null });
  });
});

describe('the standing explainer', () => {
  it('names both numbers, because they are different numbers', () => {
    expect(testTempoWindowText(TEMPO)).toBe(
      'This song is at 100 bpm. A test runs at 90 bpm or faster — ten below is the floor.',
    );
  });
});

describe('a song with no tempo asks differently by mode', () => {
  it('practice is a prompt — it does not block', () => {
    expect(noTempoText('practice')).toBe(
      'What tempo is this song at? Practice runs at any speed — but the '
      + 'metronome needs somewhere to start.',
    );
  });

  it('a test is a blocker, and they are not the same message', () => {
    expect(noTempoText('testing')).not.toBe(noTempoText('practice'));
    expect(noTempoText('testing')).toContain('before testing it');
  });
});
