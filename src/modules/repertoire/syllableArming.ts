// Tap-to-place arming state machine (Lyric Placement Redesign step 6a,
// Aug 2026 — docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §A3).
//
// Arming is "what a beat-cell tap will do next". It is pure UI state:
// nothing here reads or writes the lyric store, and nothing here decides
// whether a placement is LEGAL. Legality lives in `checkPlacementOrder`
// and must stay there — the reducer is told a placement happened, never
// asked whether one may.
//
// TWO INTENTS, ONE STATE. There are two things a beat-cell tap can
// mean: place the armed syllable, or set the end of a line whose first
// unit was just dropped. They are held in ONE discriminated union
// rather than two pieces of state, because only one thing can answer a
// tap — if both could be pending at once, a tap would be ambiguous.
// Mutual exclusion is the invariant, so the type enforces it.
//
// Extracted as a reducer so the behaviour is unit-testable without a
// DOM.

/** What a beat-cell tap will do next. */
export type ArmingState =
  /** Place this syllable. Freely escapable — dismissing changes
   *  nothing, because nothing has happened yet. */
  | { kind: 'syllable'; syllableId: string }
  /** Beat two of line placement: set this line's END. NOT freely
   *  escapable — beat one already wrote an anchor, so dismissing has to
   *  roll that write back. See `pendingLineEnd`. */
  | { kind: 'line-end'; lineId: string }
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
  /** Beat one landed: the line's first unit is placed, now wait for its
   *  end. */
  | { type: 'await-line-end'; lineId: string }
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
 * **`line-end` ignores chip taps.** A chip tap while waiting for a
 * line's end would be a silent escape from a state that is deliberately
 * not escapable halfway — it would leave the line's first unit placed
 * and nothing asking for the rest, which is exactly the dead end this
 * mode exists to remove. Beat cells set the end; `dismiss` cancels;
 * chips do nothing.
 */
export function armingReducer(
  state: ArmingState,
  action: ArmingAction,
): ArmingState {
  switch (action.type) {
    case 'tap-syllable':
      // Waiting for a line's end outranks arming a chip. Returning
      // `state` (not a copy) also keeps the no-op observable to tests.
      if (state?.kind === 'line-end') return state;
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
    case 'await-line-end':
      // Overrides whatever was pending: beat one just wrote an anchor,
      // so its follow-up is now the only sensible next tap.
      return { kind: 'line-end', lineId: action.lineId };
    case 'line-removed':
      return state?.kind === 'line-end' && state.lineId === action.lineId
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
 * The line awaiting its end, or null.
 *
 * This is also the rollback signal: dismissing while this is non-null
 * must undo beat one, because that intent left an anchor written.
 * Dismissing a `syllable` intent needs no cleanup. The caller reads
 * this BEFORE dispatching `dismiss` to decide which it is.
 */
export function pendingLineEnd(state: ArmingState): string | null {
  return state?.kind === 'line-end' ? state.lineId : null;
}

/** Any pending intent at all — what drives the beat-cell hint. */
export function hasPendingIntent(state: ArmingState): boolean {
  return state !== null;
}
