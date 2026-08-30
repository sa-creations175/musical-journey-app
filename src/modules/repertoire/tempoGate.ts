import { isInTempoRange } from './matrix/cellRollup';

/**
 * Whether a test run may start, and what to say when it may not.
 *
 * =====================================================================
 * THE METRONOME IS WHERE TEMPO COMES FROM. THE TYPED BOX TOOK THE
 * PLAYER'S WORD AND THEN FILLED THE WORD IN FOR HIM.
 *
 * It was pre-filled from the song's `performanceTempo`, so a run played
 * at 70 on a song targeted at 100 recorded 100 and counted toward the
 * test. The app's claim is "three clean run-throughs AT TEMPO", and it
 * was verifying that against a number it had supplied itself.
 *
 * =====================================================================
 * "ALREADY RUNNING", NOT "STARTED AT SOME POINT".
 *
 * Requiring the metronome before the run begins makes "was it on" a
 * fact at a single instant, with nothing to police afterwards. The
 * alternative is watching it for the whole run and then ruling on how
 * much silence invalidates one — a judgement nobody wants to make and
 * no rule can state — or accepting that a run with no metronome at all
 * could count.
 *
 * Stopping it mid-run is handled where it happens; see §4 and the
 * strip. This module answers only "may a run start".
 *
 * =====================================================================
 * PRACTICE IS NOT GATED AT ALL. The metronome is optional there, it
 * moves anywhere, and slowing right down to get something under the
 * fingers is the point. Every function here answers for a test.
 * =====================================================================
 *
 * Copy: `TEMPO_SOURCE_SPEC.md` §10. Every string is approved.
 */

/**
 * How far below the song's tempo a test still counts.
 *
 * Not a new number: `isInTempoRange` has encoded this window since the
 * gate existed, and this names it so the copy can quote a floor
 * without a second constant to disagree with.
 */
export const FLOOR_BELOW = 10;

/** The slowest tempo a test may be taken at, or null with no target. */
export function testFloorBpm(songTempo: number | null): number | null {
  return songTempo === null ? null : songTempo - FLOOR_BELOW;
}

export interface TestGateInput {
  /** The song's stated tempo. Null means it has none set. */
  songTempo: number | null;
  /** Whether the metronome is sounding right now. */
  metronomeOn: boolean;
  /** What the metronome is set to. */
  bpm: number;
}

/**
 * Why a test run cannot start, or null when it can.
 *
 * ORDERED BY WHAT THE PLAYER HAS TO DO FIRST. A song with no tempo and
 * a silent metronome has two problems, and telling him to start the
 * metronome would send him to fix the one that will not help.
 */
export function testRunBlockReason(input: TestGateInput): string | null {
  const floor = testFloorBpm(input.songTempo);
  if (floor === null) {
    // A BLOCKER, NOT A PROMPT. There is nothing for "at tempo" to mean,
    // so this is not a test that could go ahead less rigorously.
    return 'Set this song’s tempo before testing it. A test is three clean '
      + 'run-throughs at tempo, and there is nothing here to measure that '
      + 'against.';
  }
  if (!input.metronomeOn) {
    return 'Start the metronome to begin a test run.';
  }
  if (!isInTempoRange(input.bpm, input.songTempo)) {
    return `A test runs at ${floor} bpm or faster. Ten below the song’s tempo `
      + 'is the floor.';
  }
  return null;
}

/** Whether a test run may start. */
export function canStartTestRun(input: TestGateInput): boolean {
  return testRunBlockReason(input) === null;
}

/**
 * The tempo a test may be taken at, clamped, and why if it moved.
 *
 * THE STEPPER CLAMPS RATHER THAN REFUSING. A button that silently does
 * nothing at the boundary reads as broken; one that stops at the floor
 * and says why has taught the rule.
 *
 * There is no upper bound. Playing a song faster than its target is a
 * harder claim, not a disqualifying one — the same one-sided window
 * `isInTempoRange` has always applied.
 */
export function clampTestBpm(
  next: number, songTempo: number | null,
): { bpm: number; why: string | null } {
  const floor = testFloorBpm(songTempo);
  if (floor === null || next >= floor) return { bpm: next, why: null };
  return {
    bpm: floor,
    why: `A test runs at ${floor} bpm or faster. Ten below the song’s tempo `
      + 'is the floor.',
  };
}

/**
 * The standing explainer above the metronome, in the mode's own words.
 *
 * =====================================================================
 * A PAIR, WRITTEN TOGETHER, AND THAT IS WHY THE TEST LINE CHANGED.
 *
 * The test's explainer used to read "This song is at {n} bpm. A test
 * runs at {n} bpm or faster — ten below is the floor." Same rule, and
 * it worked alone. It did not work beside a practice line, because the
 * two started from different places: one led with the song's tempo, the
 * other would have led with the freedom to leave it.
 *
 * Both now open on the same fact — what the song's target is — and then
 * say what the mode does about it. Read one after the other they are
 * two answers to one question rather than two paragraphs.
 *
 * The practice line is not a softer version of the test line. It says
 * "as you build up to target", which is what practice is FOR, and then
 * gives permission to go slow without hedging it.
 * =====================================================================
 *
 * The apostrophe in "that’s" is the app's, not the copy file's plain
 * one — the words are approved, the glyph matches every other sentence
 * on screen. Same call as the result screen's headline.
 */
export function tempoWindowText(
  mode: 'testing' | 'practice', songTempo: number,
): string {
  const target = `The target bpm for this song is ${songTempo}bpm.`;
  return mode === 'testing'
    ? `${target} A test run must be no lower than `
      + `${songTempo - FLOOR_BELOW}bpm (10 below the target).`
    : `${target} Practice can run at any tempo as you build up to `
      + 'target. Slow it down if that’s what you need to start.';
}

/**
 * What to ask when a song has no tempo, which differs by mode and is
 * not the same kind of message.
 *
 * Practice gets a PROMPT: it does not block, because practice runs at
 * any speed and the metronome only needs somewhere to start. A test
 * gets a BLOCKER, because there is nothing to gate against.
 */
export function noTempoText(mode: 'testing' | 'practice'): string {
  return mode === 'testing'
    ? 'Set this song’s tempo before testing it. A test is three clean '
      + 'run-throughs at tempo, and there is nothing here to measure that '
      + 'against.'
    : 'What tempo is this song at? Practice runs at any speed — but the '
      + 'metronome needs somewhere to start.';
}
