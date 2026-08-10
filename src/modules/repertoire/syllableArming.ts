// Tap-to-place arming state machine (Lyric Placement Redesign step 6a,
// Aug 2026 — docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §A3).
//
// Arming is "what a beat-cell tap will do next". It is pure UI state:
// nothing here reads or writes the lyric store, and nothing here decides
// whether a placement is LEGAL. Legality lives in `checkPlacementOrder`
// and must stay there — the reducer is told a placement happened, never
// asked whether one may.
//
// TWO INTENTS, ONE STATE. A beat-cell tap either places the armed
// SYLLABLE or advances a LINE placement. They are held in ONE
// discriminated union rather than separate pieces of state, because
// only one thing can answer a tap — if both could be pending at once, a
// tap would be ambiguous. Mutual exclusion is the invariant, so the
// type enforces it.
//
// Line placement has two beats (head, then end) and can be started
// from two places (dragging a line out of the tray, or tapping one in
// the drawer). All four combinations are the SAME kind carrying an
// `edge`, not three or four kinds — see the `line` variant.
//
// Extracted as a reducer so the behaviour is unit-testable without a
// DOM.

/** What a beat-cell tap will do next. */
export type ArmingState =
  /** Place this syllable. Freely escapable — dismissing changes
   *  nothing, because nothing has happened yet. */
  | { kind: 'syllable'; syllableId: string }
  /** Line placement, one edge at a time. `edge` is the marker
   *  mechanic's own vocabulary — `markerTargetSyllable(lines, lineId,
   *  edge)` already takes exactly this — so both beats resolve through
   *  one lookup and one guarded write, and arming a line from the
   *  drawer needs no third kind of arming.
   *
   *    'start' = beat one, the line's head. Nothing written yet.
   *    'end'   = beat two, the line's tail. Beat one HAS written an
   *              anchor, so dismissing must roll it back — see
   *              `pendingLineEnd`. */
  | { kind: 'line'; lineId: string; edge: 'start' | 'end' }
  | null;

export type ArmingAction =
  /** A syllable chip was tapped — arms, disarms, or transfers. */
  | { type: 'tap-syllable'; syllableId: string }
  /** The user backed out: a tap outside every arming surface, Escape,
   *  or the waiting bar's cancel control. All three mean the same
   *  thing, so they share an action. */
  | { type: 'dismiss' }
  /** A placement SUCCEEDED. Refusals deliberately don't dispatch this —
   *  arming survives so the user can immediately try another cell. */
  | { type: 'placed' }
  /** The armed syllable no longer exists (split, join, un-place, undo). */
  | { type: 'syllable-removed'; syllableId: string }
  /** Arm a line for placement at the given edge. `start` comes from
   *  tapping a line in the drawer; `end` from beat one landing. */
  | { type: 'await-line'; lineId: string; edge: 'start' | 'end' }
  /** The line being completed no longer exists (deleted mid-gesture). */
  | { type: 'line-removed'; lineId: string };

/**
 * At most one pending intent at a time, and tapping is the only way in
 * or out.
 *
 * Tapping a chip ARMS it regardless of whether it is placed or unplaced
 * — the two states behave identically here on purpose. A placed
 * syllable being re-placeable by tap is the same gesture as placing an
 * unplaced one, and making the affordance conditional on state would
 * mean the user has to know which state a chip is in before knowing
 * what a tap will do.
 *
 * **`line` ignores chip taps, at BOTH edges.** At `end` a chip tap
 * would be a silent escape from a state that is deliberately not
 * escapable halfway — it would leave the line's head placed with
 * nothing asking for the rest, which is exactly the dead end this mode
 * exists to remove. At `start` nothing is written yet, so it would be
 * harmless; it is ignored anyway, because a rule that depends on which
 * half of the gesture you are in is a worse rule. Beat cells advance
 * the placement; `dismiss` cancels; chips do nothing.
 */
export function armingReducer(
  state: ArmingState,
  action: ArmingAction,
): ArmingState {
  switch (action.type) {
    case 'tap-syllable':
      // A line placement in progress outranks arming a chip, at EITHER
      // edge. Nothing is written yet at 'start', so allowing a transfer
      // there would be harmless — but then the rule would depend on
      // which half of the gesture you were in, and a tap during an
      // active placement should never quietly become a different
      // gesture. Returning `state` (not a copy) keeps the no-op
      // observable to tests.
      if (state?.kind === 'line') return state;
      // Re-tapping the armed syllable disarms; tapping a different one
      // transfers, since only one can be armed.
      return state?.kind === 'syllable' && state.syllableId === action.syllableId
        ? null
        : { kind: 'syllable', syllableId: action.syllableId };
    case 'dismiss':
      return null;
    case 'placed':
      return null;
    case 'syllable-removed':
      return state?.kind === 'syllable' && state.syllableId === action.syllableId
        ? null
        : state;
    case 'await-line':
      // Overrides whatever was pending: the user just started (or
      // advanced) a line placement, so its next beat is the only
      // sensible next tap.
      return { kind: 'line', lineId: action.lineId, edge: action.edge };
    case 'line-removed':
      return state?.kind === 'line' && state.lineId === action.lineId
        ? null
        : state;
    default:
      return state;
  }
}

/** True when this syllable is the armed one. */
export function isArmed(state: ArmingState, syllableId: string): boolean {
  return state?.kind === 'syllable' && state.syllableId === syllableId;
}

/** The armed syllable, or null when the pending intent isn't one. */
export function armedSyllableId(state: ArmingState): string | null {
  return state?.kind === 'syllable' ? state.syllableId : null;
}

/**
 * The line awaiting a placement, and which edge — or null.
 *
 * Drives the anchored prompt's wording and the awaited marker.
 */
export function pendingLine(
  state: ArmingState,
): { lineId: string; edge: 'start' | 'end' } | null {
  return state?.kind === 'line'
    ? { lineId: state.lineId, edge: state.edge }
    : null;
}

/**
 * THE ROLLBACK SIGNAL: the line whose beat one must be undone if the
 * gesture is dismissed now.
 *
 * Only `edge: 'end'` qualifies — at that point beat one has written an
 * anchor. At `edge: 'start'` nothing has been written and dismissing
 * needs no cleanup, and a `syllable` intent never writes anything
 * either. The caller reads this BEFORE dispatching `dismiss`, which is
 * the only moment it is still available.
 */
export function pendingLineEnd(state: ArmingState): string | null {
  return state?.kind === 'line' && state.edge === 'end' ? state.lineId : null;
}

/** Any pending intent at all — what drives the beat-cell hint. */
export function hasPendingIntent(state: ArmingState): boolean {
  return state !== null;
}
