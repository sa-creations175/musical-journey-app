// @vitest-environment jsdom
/**
 * The whole-song test's bar: three clean run-throughs BACK TO BACK,
 * in one sitting, any not-clean run back to zero.
 *
 * Consecutive is the whole claim. Three clean runs across a day with
 * failures scattered between them is materially weaker than three in
 * a row — the thing being trained for is playing it once, in front of
 * someone, with no retries. So these pin the reset, not just the
 * count, and they pin that a sitting does not carry.
 *
 * None of this was covered before: no test referenced
 * projectKeyConsecutiveCleanCount.
 */
import { describe, expect, it } from 'vitest';
import type { SongKey } from '../../../../lib/db';
import {
  applyAttemptsToKey,
  attemptWasClean,
  projectKeyConsecutiveCleanCount,
  type KeyAttemptDraft,
} from '../cellRollup';

const NOW = 1_700_000_000_000;
const TEMPO = 100;
const FLOOR = TEMPO - 10;

let seq = 0;
function at(wasClean: boolean, bpm: number = TEMPO): KeyAttemptDraft {
  // Clean and Struggled — the two ends the old boolean stood for.
  return { id: `a${seq++}`, bpm, feel: wasClean ? 3 : 1 };
}
const clean = () => at(true);
const dirty = () => at(false);
/** Below the one-sided floor, so gate-irrelevant either way. */
const cleanSlow = () => at(true, FLOOR - 1);
const dirtySlow = () => at(false, FLOOR - 1);

function count(attempts: KeyAttemptDraft[]): number {
  return projectKeyConsecutiveCleanCount(attempts, TEMPO);
}

function mkKey(): SongKey {
  return {
    id: 'key-1', songId: 's1', keyName: 'C', isOriginalKey: true,
    keyState: 'comfortable', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: null,
    createdAt: NOW, updatedAt: NOW,
  };
}

describe('three in a row', () => {
  it('three clean at tempo reaches the gate', () => {
    expect(count([clean(), clean(), clean()])).toBe(3);
  });

  it('two clean is not the gate', () => {
    expect(count([clean(), clean()])).toBe(2);
  });

  it('caps at three — a fourth clean run adds nothing', () => {
    expect(count([clean(), clean(), clean(), clean()])).toBe(3);
  });
});

describe('a not-clean run resets to zero', () => {
  it('drops two back to nothing', () => {
    // Guard the guard: the streak really was at 2 before the failure,
    // so this is a reset and not an empty list.
    expect(count([clean(), clean()])).toBe(2);
    expect(count([clean(), clean(), dirty()])).toBe(0);
  });

  it('a clean run after a failure starts from one, not from where it was', () => {
    expect(count([clean(), clean(), dirty(), clean()])).toBe(1);
  });

  it('THREE CLEAN RUNS WITH A FAILURE BETWEEN THEM DO NOT PASS', () => {
    // The claim the bar exists to make. Same number of clean runs as
    // the passing case above — four, in fact — and it is not the same
    // achievement.
    const scattered = [clean(), dirty(), clean(), dirty(), clean(), clean()];
    expect(scattered.filter(attemptWasClean)).toHaveLength(4);
    expect(count(scattered)).toBe(2);
  });

  it('recovers to the gate when three land back to back after a failure', () => {
    expect(count([clean(), dirty(), clean(), clean(), clean()])).toBe(3);
  });
});

describe('below-floor runs are invisible to the gate, in both directions', () => {
  it('a slow NOT-clean run does not reset the streak', () => {
    // A warm-up pass under tempo is a different activity, not a failed
    // demonstration. Guard: the streak is genuinely at 2 either side.
    expect(count([clean(), clean()])).toBe(2);
    expect(count([clean(), clean(), dirtySlow()])).toBe(2);
    expect(count([clean(), clean(), dirtySlow(), clean()])).toBe(3);
  });

  it('a slow CLEAN run does not advance it', () => {
    expect(count([cleanSlow(), cleanSlow(), cleanSlow(), cleanSlow()])).toBe(0);
  });

  it('with no performance tempo the gate is off and every run counts', () => {
    // isInTempoRange returns true when there is no target, so a song
    // without a tempo can still be tested.
    expect(projectKeyConsecutiveCleanCount(
      [at(true, 40), at(true, 40), at(true, 40)], null,
    )).toBe(3);
  });
});

describe('a sitting does not carry', () => {
  it('the projection has no starting-count parameter — it always begins at zero', () => {
    // Structural, and the reason the modal resets to 0/3 on every
    // open: there is nowhere for a prior sitting's streak to come
    // from. Two separate calls do not compound.
    expect(count([clean(), clean()])).toBe(2);
    expect(count([clean()])).toBe(1);
  });

  it('applyAttemptsToKey starts each save at zero too', () => {
    const first = applyAttemptsToKey(mkKey(), [clean(), clean()], TEMPO, false, NOW);
    expect(first.finalCount).toBe(2);
    const second = applyAttemptsToKey(mkKey(), [clean()], TEMPO, false, NOW);
    expect(second.finalCount).toBe(1);
  });
});

describe('the audit trail records the reset', () => {
  it('each row carries the streak AFTER that attempt, including the zero', () => {
    // The stored rows have to show the shape of the sitting, or a
    // failed run reads afterwards as though it never happened.
    const { runThroughRows } = applyAttemptsToKey(
      mkKey(), [clean(), clean(), dirty(), clean()], TEMPO, false, NOW,
    );
    expect(runThroughRows.map(r => r.consecutiveCleanCount)).toEqual([1, 2, 0, 1]);
  });
});

/**
 * A run with no tempo.
 *
 * =====================================================================
 * THE TYPE SAID `number` AND THE WRITER BELIEVED IT.
 *
 * `applyAttemptsToKey` wrote `Math.max(1, Math.floor(a.bpm))` with no
 * null guard, while the CELL writer in the same file has had one all
 * along. Nothing reached it with a null, because the only caller gated
 * on a typed tempo field being valid — and that gate is exactly what
 * the metronome-as-tempo-source work removes.
 *
 * `Math.floor(null)` is 0 and `Math.max(1, 0)` is 1, so the first run
 * played with the metronome silent would have stored a tempo of ONE
 * BPM. Not a crash, not a NaN on screen: a plausible-looking number in
 * a synced column, read by `isInTempoRange` and by the Internalized
 * criterion in `stage.ts`.
 *
 * A run with no tempo is a legitimate stored value — `tempoBpm` is
 * `number | null` in the schema and always has been. Only the draft
 * type disagreed.
 * =====================================================================
 */
describe('a run played with no tempo', () => {
  const noTempo = (feel: 1 | 2 | 3 | 4): KeyAttemptDraft =>
    ({ id: `nt${seq++}`, bpm: null, feel });

  it('stores null, not 1 bpm', () => {
    const { runThroughRows } = applyAttemptsToKey(
      mkKey(), [noTempo(3)], TEMPO, false, NOW,
    );
    expect(runThroughRows[0].tempoBpm).toBeNull();
  });

  it('is invisible to the gate, like any other below-floor run', () => {
    // `isInTempoRange` already answers false for a null bpm — a run at
    // a tempo you did not state cannot be verified at the target. So a
    // silent run neither advances the streak nor resets it, which is
    // the same treatment a slow run gets.
    expect(count([clean(), clean()])).toBe(2);
    expect(count([clean(), clean(), noTempo(1)])).toBe(2);
    expect(count([clean(), clean(), noTempo(4)])).toBe(2);
  });

  it('with no performance tempo either, it still stores null', () => {
    // Two different nulls: no target to measure against, and no tempo
    // played. Neither is a reason to invent a number.
    const { runThroughRows } = applyAttemptsToKey(
      mkKey(), [noTempo(4)], null, false, NOW,
    );
    expect(runThroughRows[0].tempoBpm).toBeNull();
  });

  it('a real tempo still rounds down to a whole number', () => {
    // The guard must not have swallowed the flooring it was wrapped
    // around.
    const { runThroughRows } = applyAttemptsToKey(
      mkKey(), [{ id: 'f1', bpm: 100.7, feel: 3 }], TEMPO, false, NOW,
    );
    expect(runThroughRows[0].tempoBpm).toBe(100);
  });
});
