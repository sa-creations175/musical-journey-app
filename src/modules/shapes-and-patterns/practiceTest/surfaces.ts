/**
 * What one surface has to tell the shell about itself.
 *
 * =====================================================================
 * THE SHELL USED TO TAKE A SKILL AND A DRILL TYPE, which is a
 * chord-shape shape and nothing else's. Scales and voice-leading have
 * no `DrillSkill` row at all — they stand their itemRef in for both
 * ids — and songs do not use `drillSessions` in the first place.
 *
 * So the contract is an ITEM plus a WAY TO WRITE A REP. One shell,
 * one writer per surface, and a surface that needs a different table
 * behind it changes nothing above the interface.
 *
 * WHAT A SURFACE MAY DIFFER ON IS THIS LIST AND NOTHING ELSE. Every
 * field here is a decision that was made deliberately per surface;
 * anything a surface wanted that is NOT here would be drift, and the
 * absence of a field is the check.
 * =====================================================================
 */

import type { DrillStyle } from '../../../lib/db';
import type { Feel } from '../../../lib/fluencyScale';
import type { Style } from './drillModel';

/** Which surface this is. Used for wording, never for behaviour — a
 *  branch on the id would be the fork this interface exists to avoid. */
export type SurfaceId = 'chord-shapes' | 'scales' | 'voice-leading' | 'song';

/** How many beats one repetition of the thing gets, and what to call it. */
export interface RateOption {
  /** The number the rate arithmetic multiplies or divides by. */
  per: number;
  label: string;
}

/** One finished repetition, as the writer receives it. */
export interface DrillRecord {
  /** Seconds actually played. */
  ranSeconds: number;
  /**
   * Seconds it was set to run for. ZERO ON A SURFACE THAT COUNTS UP —
   * a song run has no target length, so there is no number here to be
   * honest about. See `countsUp`.
   */
  targetSeconds: number;
  /**
   * What this rep covered, where a rep can cover more than the thing
   * you opened.
   *
   * Section ids for songs, because one run of the whole song is
   * evidence about every section in it — the prototype's "The Whole
   * Song" chip fans one rating across all of them. NULL on every
   * surface where a rep covers exactly the item it was started from,
   * which is all three of the others: a chord shape drill is about
   * that shape and nothing else.
   *
   * The writer decides what to do with it, because how a rating fans
   * out is a property of the thing being rated, not of the shell.
   */
  scope: readonly string[] | null;
  /** How it was played. Null on every surface that has no style. */
  style: Style | null;
  /** The four-point feel, or null when practice skipped the rating. */
  feel: Feel | null;
  /** True for a rep given inside a test. Rides into the band rule. */
  fromTest: boolean;
}

/** Writes one rep wherever this surface's reps live. */
export type DrillWriter = (record: DrillRecord) => Promise<void>;

export interface DrillSurface {
  id: SurfaceId;
  /** The cell, for the panel header — e.g. "Cmaj7 (major seventh)". */
  cellLabel: string;
  /** The skill within it — e.g. "Root position · Left". Empty where a
   *  cell IS the skill, which is voice-leading's whole point. */
  skillLabel: string;
  /**
   * Whether a run counts UP rather than down.
   *
   * A drill is set to a length and the clock falls to zero. A song
   * section takes as long as it takes — you press Done when the run is
   * over — so there is no target to count toward and `targetSeconds`
   * on the record is 0.
   *
   * IT CHANGES WHAT A REP IS, which is why it lives here rather than
   * being a presentation flag. Everywhere else a rep is "n seconds at
   * a rate"; here it is "one run, however long it took".
   */
  countsUp: boolean;
  /**
   * Whether a drill picks a style.
   *
   * CHORD SHAPES ONLY. A scale is a single line and voice-leading's
   * exercise is the movement between voicings; neither has anything to
   * block or break, so neither shows the question.
   */
  hasStyle: boolean;
  /** What the rate is counted in — "changes a minute", "notes a minute". */
  rateLabel: string;
  /** The rate the target is expressed at. */
  targetRate: number;
  rateOptions: ReadonlyArray<RateOption>;
  /**
   * The rate this surface runs at, from the click and the option.
   *
   * A FUNCTION BECAUSE SCALES INVERT IT. A chord shape gets some
   * number of BEATS each, so the rate is bpm ÷ per and a bigger `per`
   * is slower. A scale plays some number of NOTES per beat, so the
   * rate is bpm × per and a bigger `per` is faster. One is not the
   * other with a sign flipped in the caller — it is a different sum,
   * and it lives with the surface that means it.
   */
  rateFrom: (bpm: number, per: number) => number;
  write: DrillWriter;
}

export function rateFor(surface: DrillSurface, bpm: number, per: number): number {
  return surface.rateFrom(bpm, per);
}

export function isAtTarget(surface: DrillSurface, bpm: number, per: number): boolean {
  return rateFor(surface, bpm, per) >= surface.targetRate;
}

// ---------------------------------------------------------------------
// The three surfaces' numbers
// ---------------------------------------------------------------------

/** Chord shapes: some number of beats per shape, so a bigger option is
 *  slower. */
export const CHORD_RATE_OPTIONS: ReadonlyArray<RateOption> = [
  { per: 1, label: 'One Shape Per Beat' },
  { per: 2, label: 'One Shape Every 2 Beats' },
  { per: 4, label: 'One Shape Every 4 Beats' },
];

/** Scales: some number of notes per beat, so a bigger option is FASTER.
 *  The target is higher for the same reason — here you are quicker than
 *  the click rather than slower than it. */
export const SCALE_RATE_OPTIONS: ReadonlyArray<RateOption> = [
  { per: 1, label: 'One Note Per Beat' },
  { per: 2, label: 'Two Notes Per Beat' },
  { per: 4, label: 'Four Notes Per Beat' },
];

/** Voice leading: beats per chord change, like chord shapes. */
export const VOICE_LEADING_RATE_OPTIONS: ReadonlyArray<RateOption> = [
  { per: 1, label: 'One Chord Per Beat' },
  { per: 2, label: 'One Chord Every 2 Beats' },
  { per: 4, label: 'One Chord Every 4 Beats' },
];

/** Songs: one option, because a song has one tempo — its own. The
 *  target is that tempo rather than anything from the settings tree. */
export const SONG_RATE_OPTIONS: ReadonlyArray<RateOption> = [
  { per: 1, label: 'At The Written Tempo' },
];

/**
 * The rate each surface has to clear to count as at target.
 *
 * PLACEHOLDERS IN ONE PLACE, headed for the spacing settings tree per
 * skill alongside the drill length and the floor. The numbers are the
 * prototype's.
 */
export const TARGET_RATES = {
  'chord-shapes': 60,
  'scales': 240,
  'voice-leading': 60,
  // Songs are absent on purpose: the target is the SONG's own tempo,
  // read off the row, so there is no placeholder here to drift from it.
} as const;

const beatsPerRep = (bpm: number, per: number) => Math.round(bpm / per);
const repsPerBeat = (bpm: number, per: number) => Math.round(bpm * per);

export const RATE_SHAPE = { beatsPerRep, repsPerBeat };

/** The style a drill writes, given the surface and what was picked. */
export function styleFor(
  surface: DrillSurface, picked: Style | null,
): DrillStyle | undefined {
  return surface.hasStyle && picked !== null ? picked : undefined;
}
