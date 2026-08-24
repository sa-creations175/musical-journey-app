/**
 * Answering for time the app could not see.
 *
 * ---------------------------------------------------------------
 * THE MECHANISM EXISTED FROM 3b-4 AND HAD NO SURFACE.
 *
 * `songTimer.withActivity` banks any stretch longer than the amber
 * threshold into `pendingGapMs`, and `bankOpenGap` folds in a silence
 * still open when the clock stops. `resolvePendingGap` settles it. All
 * three shipped, and nothing ever ASKED — so the amber signal led
 * nowhere and the banked minutes sat unresolved, which is the same
 * silent-counting failure one step later than the one the banking was
 * built to prevent.
 *
 * The rating step is where it belongs. It is the one moment the user
 * is already answering questions about the sitting they just finished,
 * and the only place the question can be asked without interrupting
 * the playing it is asking about.
 * ---------------------------------------------------------------
 *
 * ONLY THE USER KNOWS. The app is not guessing and must not appear to:
 * forty minutes of real work at a keyboard looks exactly like forty
 * minutes of absence, which is why `SongTimerActivityWatcher` refuses
 * to count `mousemove` and why the answer here is asked rather than
 * inferred.
 */

/**
 * What a bucket keeps, as a fraction of the un-attributed stretch.
 *
 * Coarse on purpose. The honest precision available is "most of it"
 * versus "about half" versus "barely any" — offering minutes to enter
 * would ask for a number nobody has, and a slider would imply the
 * difference between 60% and 65% is a fact.
 */
export interface AwayBucket {
  /** Stable id — the label may be reworded, this may not. */
  id: 'locked-in' | 'most' | 'half' | 'barely' | 'gone';
  label: string;
  keepFraction: number;
}

/** The three top-level answers. "Some of it" opens `AWAY_PARTIAL`. */
export const AWAY_BUCKETS: ReadonlyArray<AwayBucket> = [
  { id: 'locked-in', label: 'I was locked in', keepFraction: 1 },
  { id: 'gone',      label: 'I was gone',      keepFraction: 0 },
];

/** What sits behind "I was here for some of it". */
export const AWAY_PARTIAL: ReadonlyArray<AwayBucket> = [
  { id: 'most',   label: 'most of it',  keepFraction: 0.75 },
  { id: 'half',   label: 'about half',  keepFraction: 0.5 },
  { id: 'barely', label: 'barely any',  keepFraction: 0.25 },
];

/**
 * Whole minutes a bucket would keep from `gapMs`.
 *
 * Rounded, not floored or ceiled. This number is shown BESIDE the
 * choice so the user can see what each answer costs before making it —
 * an answer whose consequence is invisible is not really being
 * offered — and rounding is what makes the five numbers add up the way
 * a reader expects. `elapsedMinutes` rounds UP for the opposite reason:
 * there, a 40-second pass must not record as zero. Here, "I was gone"
 * must be able to reach zero.
 */
export function awayMinutes(gapMs: number, keepFraction: number): number {
  return Math.round(Math.max(0, gapMs) * keepFraction / 60_000);
}

/** Whole minutes in the un-attributed stretch itself. */
export function gapMinutes(gapMs: number): number {
  return awayMinutes(gapMs, 1);
}
