/**
 * How long a drill is, and how short is too short.
 *
 * =====================================================================
 * NUMBERS THAT ARE SET, NOT DERIVED.
 *
 * A drill was 120 seconds for a while and nobody chose 120. It fell out
 * of dividing a session block's budget by however many passes the block
 * happened to contain — so the length of a drill was a side effect of
 * the arithmetic above it, and it moved whenever that arithmetic did.
 * Retiring the arpeggiated dimension halved the pass count and doubled
 * every in-session drill, which is how it was noticed.
 *
 * A drill is as long as it is set to be. A block covers however many
 * passes fit at that length; it does not stretch the drills to fill
 * itself. The floor is the same kind of number — a decision about what
 * counts as a run at all, not something arithmetic produces.
 *
 * =====================================================================
 * THEY BELONG IN THE SPACING SETTINGS TREE, PER SKILL, and are not
 * there yet. A scale and a two-handed seventh do not need the same
 * drill length or the same floor, and the spec says both move into the
 * tree alongside the target rate and inherit the same way.
 *
 * This file is the ONE PLACE they live until that exists, so the move
 * is a change of source rather than a hunt. Nothing should read a
 * literal 60 or 30 for either of these again.
 * =====================================================================
 */

/**
 * The default length of one drill, in seconds.
 *
 * What the setup screen opens on, and what an in-session drill runs
 * for. The reader can change it per drill on the setup screen; that
 * choice is theirs and is not written back here.
 */
export const DEFAULT_DRILL_SECONDS = 60;

/**
 * The shortest a run can be and still have happened.
 *
 * Below this a drill writes nothing — no session row, no engagement —
 * and the surface says why rather than disabling the control that
 * would have saved it.
 */
export const DRILL_FLOOR_SECONDS = 30;

/** The lengths the setup screen offers. The default is one of them. */
export const DRILL_LENGTH_OPTIONS = [30, 60, 90, 120, 180] as const;
