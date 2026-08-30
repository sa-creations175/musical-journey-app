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
import type { BandVerdict } from '../../../lib/spacing/banding';
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
  /**
   * WHICH SESSION THIS REP HAPPENED IN.
   *
   * The band rule counts three clean runs in a row in ONE testing
   * session, and this is the only thing that says which one. Required
   * rather than optional: a rep written with no session cannot join a
   * streak or break one, and a shell that silently omitted it would
   * make a passing test impossible to reach with no error anywhere.
   *
   * Absent in the STORED history means pre-change, which is a
   * different claim and not one a live writer may make.
   */
  sessionId: string;
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
   * Where this surface's session elapsed actually lives, for one whose
   * clock outlives the panel.
   *
   * Songs store theirs (`mja.songTimer.v1`), so it survives a reload
   * and may be hours older than this mount; counting from mount would
   * show a session that had restarted while the record — the one that
   * gets logged — said otherwise. Null on the three whose session
   * begins and ends with the panel, where a ref is exactly as durable
   * as the thing it measures.
   */
  readSessionElapsedMs: (() => number) | null;
  /**
   * The session's OWN id, for a surface whose session outlives the
   * panel.
   *
   * =====================================================================
   * NULL MEANS THE PANEL OWNS THE SESSION, and the panel mints one.
   * Same split as `readSessionElapsedMs` directly above, for the same
   * reason and on the same surfaces: a song session is a stored record
   * that survives navigation, reload and a paused afternoon, so its id
   * has to come from the record. The other three begin and end with the
   * panel, where a value minted at mount is exactly as durable as the
   * session it names.
   *
   * A READER, NOT A VALUE, because a song's session can start after
   * the panel opens — the id is asked for at the moment a rep is
   * written, not captured once at mount.
   * =====================================================================
   */
  readSessionId: (() => string | null) | null;
  /**
   * A metronome on the SESSION, not only inside a drill.
   *
   * Plenty of the work on a song happens between runs — reading the
   * chart, finding a voicing, playing a passage over. A click that
   * only exists inside a timed drill is not available for any of it.
   * The drill surfaces have no such between-time: you are drilling or
   * you are not.
   */
  sessionMetronome: boolean;
  /**
   * What a single run can be scoped to, and null where a rep covers
   * exactly the item it was started from.
   *
   * Songs only: a run can be one section, several, or the whole song,
   * and what it covered decides where the rating lands. See
   * `DrillRecord.scope`.
   */
  scopeOptions: ReadonlyArray<{ id: string; label: string }> | null;
  /** Which of `scopeOptions` the panel was opened on, for the hints
   *  that name it. Null where there is no scope. */
  openedOnScopeId: string | null;
  /**
   * Open the thing being practised, where there is something to open.
   *
   * A lead sheet is the chart you are playing FROM, so it has to be
   * reachable mid-session without ending the session. Null on every
   * surface where the item is the notation — a chord shape has no
   * document behind it.
   */
  openItem: (() => void) | null;
  /**
   * The sections this item belongs to, for the wrap's "Sections You
   * Touched". Null where a sitting cannot span more than one thing.
   */
  wrapSections: ReadonlyArray<{ id: string; label: string }> | null;
  /**
   * Whether the wrap asks what the sitting consisted of.
   *
   * TIME RECORD ONLY. The activities land on the practice log beside
   * the duration and never feed a status: evidence sets status, and a
   * ticked box is not evidence. See `logPractice.ts`.
   */
  wrapAsksActivities: boolean;
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
  /**
   * The SESSION's own rating, which is a rep and not a drill.
   *
   * =====================================================================
   * WHY IT CANNOT GO THROUGH `write`.
   *
   * `write` records a run: for chord shapes that means a `DrillSession`
   * row plus a bump to the drill type's `repCount` and `totalSeconds`.
   * A session rating has no run behind it — the drills already recorded
   * their own time — so putting it through `write` would count a rep
   * that never happened and, with a duration, bill the same minutes
   * twice.
   *
   * It IS a rep for the band rule, though: practice caps at Developing
   * and only a test at tempo goes past, exactly as for a drill. So it
   * records the engagement and nothing else.
   *
   * A SECOND FIELD RATHER THAN A FLAG ON THE FIRST, because the two
   * write different things to different tables, and a boolean deciding
   * which is the kind of fork this interface exists to avoid.
   * =====================================================================
   */
  writeSessionRating: (
    feel: Feel, fromTest: boolean, sessionId: string,
  ) => Promise<void>;
  /**
   * The test was passed — record the durable fact.
   *
   * =====================================================================
   * NULL ON EVERY SURFACE THAT HAS NO SUCH FACT, and three of the four
   * do not. A passed shape test is entirely described by the reps it
   * wrote: the band moves and that is the whole of it.
   *
   * A song is not. Passing the whole-song test in a key writes
   * `wholeSongTestPassedAt`, which `stageCriteria` reads as the
   * Learning → Comfortable criterion, and it moves that key's retest
   * schedule. Neither is derivable from the three reps.
   *
   * Absence is the check, as everywhere else on this interface — a
   * surface with nothing to record supplies null rather than a
   * do-nothing function that would look like a wired-up path.
   * =====================================================================
   */
  recordTestPass: (() => Promise<void>) | null;
  /**
   * What this item reads NOW, after whatever was just written.
   *
   * THE DONE STEP MUST NOT COMPUTE ITS OWN BAND. It would be a second
   * opinion about a number the shared reader already owns, and the two
   * would drift the first time the band rule changed — which it has,
   * twice, in the last day.
   *
   * So the surface reads its own row back through
   * `bandVerdictForRow` and hands over the verdict. `not-started` for
   * an item with no row, which is a verdict rather than an absence.
   */
  readVerdict: () => Promise<BandVerdict>;
  /**
   * Record what the sitting CONSISTED OF, where the surface has a
   * place for it. Null on the surfaces that do not.
   *
   * =====================================================================
   * NO RATING GOES THROUGH HERE, and that is the whole distinction.
   *
   * The practice log records WHAT HAPPENED in a sitting — how long,
   * which sections, what kind of work, a note. The rating records HOW
   * IT WENT, and it has already been written by `writeSessionRating`
   * at the levels that band. Passing the feel again would put the same
   * verdict in a third place, and a status could then be traced to a
   * ticked box rather than to evidence.
   *
   * The log never feeds a status. That is a rule, not an oversight.
   * =====================================================================
   */
  writeSessionLog:
    | ((entry: {
        durationSeconds: number;
        sectionIds: readonly string[];
        activities: readonly string[];
        note: string;
      }) => Promise<void>)
    | null;
}

/**
 * Does the setup step have anything to ask?
 *
 * =====================================================================
 * A STEP WITH NOTHING IN IT DOES NOT RENDER. THAT IS THE WHOLE RULE.
 *
 * The setup step asks exactly three things, and each one is already
 * gated by a field that exists for its own reasons:
 *
 *   Style       `hasStyle` — Blocked or Broken is a property of a
 *               shapes drill. A song has no equivalent.
 *   How Long    `countsUp` — a drill runs for a chosen length. A song
 *               run has no target length; you play the song.
 *   Rate        `rateOptions` — a picker with ONE option is not a
 *               choice. A song has one: its own tempo.
 *
 * A song answers no to all three, so its setup screen would be a title
 * and a Start button.
 *
 * WHY THIS AND NOT `id === 'song'`. The question being asked is not
 * "is this a song", it is "is there anything to set" — and the answer
 * happens to be no for songs today. A surface added later with a fixed
 * length and no style gets the same treatment without anyone
 * remembering to add it to a list, and a song that grows something to
 * configure gets its setup screen back for free. Naming the surface
 * would make both of those into edits.
 *
 * The panel has just finished having ONE test model for every surface;
 * putting a song-shaped branch back in the step machine would be
 * re-exceptioning it one line below where it was un-exceptioned.
 * =====================================================================
 */
export function setupHasSomethingToSet(surface: DrillSurface): boolean {
  return surface.hasStyle
    || !surface.countsUp
    || surface.rateOptions.length > 1;
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
