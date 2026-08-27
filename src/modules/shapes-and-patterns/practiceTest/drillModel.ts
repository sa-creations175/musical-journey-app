/**
 * What a drill is, before anything is written down.
 *
 * =====================================================================
 * NOTHING HERE PERSISTS. Commit 1 is the shell: the list of drills
 * lives in React state and dies on reload, deliberately. No
 * `spacingState`, no `drillSessions`, no practice log. Those arrive
 * with the rating step and the log, in later commits.
 * =====================================================================
 */

/** How the shape is played. Chord shapes only — a scale is a single
 *  line and has nothing to block. */
export type Manner = 'broken' | 'blocked';

/** Which of the two things a sitting can be. Test is chosen in commit
 *  1 and does nothing; it is wired in a later commit. */
export type SessionMode = 'practice' | 'test';

/** The lengths a drill can be set to, in seconds. */
export const DRILL_LENGTHS = [30, 60, 90, 120, 180] as const;

/** Where the length picker starts. */
export const DEFAULT_DRILL_SECONDS = 60;

/**
 * How many beats each shape gets.
 *
 * THIS IS A DRILL SETTING, NOT A METRONOME SETTING. The click runs at
 * one tempo; this says how much of that tempo one shape is allowed to
 * take. Together they give the rate below, which is the number the
 * target is expressed in.
 */
export interface RateOption {
  beatsPerShape: number;
  label: string;
}

export const CHORD_RATE_OPTIONS: ReadonlyArray<RateOption> = [
  { beatsPerShape: 1, label: 'One Shape Per Beat' },
  { beatsPerShape: 2, label: 'One Shape Every 2 Beats' },
  { beatsPerShape: 4, label: 'One Shape Every 4 Beats' },
];

/** What a chord-shape drill is measured in. */
export const CHORD_RATE_LABEL = 'changes a minute';

/**
 * The rate a chord-shape drill has to clear to count as at target.
 *
 * A CONSTANT HERE, AND IT SHOULD NOT STAY ONE. The prototype hard-codes
 * 60 for chord shapes, so that is what this is. Where the real target
 * comes from — the spacing settings tree, a per-shape figure, something
 * else — is not settled, and inventing a source would be worse than
 * naming the placeholder. Test mode is the only thing that reads it as
 * a gate, and test mode is not built yet.
 */
export const CHORD_TARGET_RATE = 60;

/** Shape changes a minute, from the click and how long a shape gets. */
export function rateFor(bpm: number, beatsPerShape: number): number {
  return Math.round(bpm / beatsPerShape);
}

export function isAtTarget(bpm: number, beatsPerShape: number): boolean {
  return rateFor(bpm, beatsPerShape) >= CHORD_TARGET_RATE;
}

/** A drill that has been set up but not yet run. */
export interface DrillDraft {
  manner: Manner | null;
  targetSeconds: number;
  beatsPerShape: number;
}

/** A drill that ran, as the session list shows it. In memory only. */
export interface CompletedDrill {
  id: string;
  manner: Manner;
  /** Seconds actually played — the full length, or less if finished early. */
  ranSeconds: number;
  bpm: number;
  beatsPerShape: number;
  rate: number;
  belowTarget: boolean;
}

export function newDraft(): DrillDraft {
  return {
    manner: null,
    targetSeconds: DEFAULT_DRILL_SECONDS,
    beatsPerShape: 1,
  };
}

export function mannerLabel(manner: Manner): string {
  return manner === 'broken' ? 'Broken' : 'Blocked';
}
