/**
 * What a drill is, before anything is written down.
 *
 * The in-memory shape of a drill: what the setup screen is choosing
 * and what the session list shows. Writing happens behind
 * `DrillSurface.write`; nothing in this file touches the database, and
 * nothing in it knows which surface it is describing.
 */

import type { DrillStyle } from '../../../lib/db';
import {
  DEFAULT_DRILL_SECONDS as DEFAULT_DRILL_LENGTH,
  DRILL_LENGTH_OPTIONS,
} from '../../../lib/spacing/drillSettings';

/**
 * How the shape is played. Chord shapes only — a scale is a single
 * line and has nothing to block.
 *
 * The db's own `DrillStyle`, not a parallel word for it. This used to
 * be a local `Manner` type — a second word for one thing, mapped on
 * the way out, and a mapping between two names is where they drift.
 */
export type Style = DrillStyle;

/** Which of the two things a sitting can be. */
export type SessionMode = 'practice' | 'test';


/**
 * The lengths a drill can be set to, and where the picker starts.
 *
 * BOTH COME FROM `spacing/drillSettings`, which is the one place these
 * live until they move into the settings tree per skill. Re-exported
 * here so this module still reads as the drill's own model.
 */
export const DRILL_LENGTHS = DRILL_LENGTH_OPTIONS;
export const DEFAULT_DRILL_SECONDS = DEFAULT_DRILL_LENGTH;

/** A drill that has been set up but not yet run. */
export interface DrillDraft {
  style: Style | null;
  targetSeconds: number;
  /** Which rate option is picked — beats per rep, or reps per beat.
   *  What it means is the surface's business. */
  per: number;
}

/** A drill that ran, as the session list shows it. In memory only. */
export interface CompletedDrill {
  id: string;
  /** Null on every surface that has no style to pick. */
  style: Style | null;
  /** Seconds actually played — the full length, or less if finished early. */
  ranSeconds: number;
  bpm: number;
  /**
   * WHAT THE RUN WAS ACTUALLY PLAYED TO, or null when the metronome
   * was silent.
   *
   * Distinct from `bpm` directly above, which is the metronome's
   * SETTING and is what the rate arithmetic multiplies. A run played
   * in silence still has a setting sitting there; it does not have a
   * tempo, and the row must be able to say so.
   */
  playedBpm: number | null;
  per: number;
  rate: number;
  belowTarget: boolean;
  /** The four-point feel, or null when practice skipped the rating. */
  feel: 1 | 2 | 3 | 4 | null;
  /**
   * True when the run was too short to count. It goes on the list and
   * says so; nothing is written for it.
   *
   * ON THE LIST RATHER THAN DISCARDED, and rather than behind a
   * disabled button. The spec is explicit: tell the reader the run was
   * too short and why, instead of a control that refuses and explains
   * nothing.
   */
  tooShort: boolean;
}

/**
 * Whether a run was long enough to have been real.
 *
 * `MIN_REP_SECONDS` is the one place the floor lives — thirty seconds
 * today, and headed for the spacing settings tree per skill. PER RUN,
 * not per session: a session is made of runs, and it is the run that
 * either happened or did not.
 */
export function isTooShort(ranSeconds: number, floorSeconds: number): boolean {
  return ranSeconds < floorSeconds;
}

export function newDraft(): DrillDraft {
  return {
    style: null,
    targetSeconds: DEFAULT_DRILL_SECONDS,
    per: 1,
  };
}

export function styleLabel(style: Style): string {
  return style === 'broken' ? 'Broken' : 'Blocked';
}
