// Tap-to-place arming state machine (Lyric Placement Redesign step 6a,
// Aug 2026 — docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §A3).
//
// Arming is "this syllable is the one a beat-cell tap will place". It is
// pure UI state: nothing here reads or writes the lyric store, and
// nothing here decides whether a placement is LEGAL. Legality lives in
// `checkPlacementOrder` and must stay there — the reducer is told a
// placement happened, never asked whether one may.
//
// Extracted as a reducer so the behaviour is unit-testable without a DOM.

/** Which syllable, if any, a beat-cell tap will place. */
export type ArmingState = { armedSyllableId: string } | null;

export type ArmingAction =
  /** A syllable chip was tapped — arms, disarms, or transfers. */
  | { type: 'tap-syllable'; syllableId: string }
  /** A tap landed somewhere that isn't a chip, a beat cell, or the edit
   *  popover. */
  | { type: 'tap-outside' }
  /** A placement SUCCEEDED. Refusals deliberately don't dispatch this —
   *  arming survives so the user can immediately try another cell. */
  | { type: 'placed' }
  /** The armed syllable no longer exists (split, join, un-place, undo). */
  | { type: 'syllable-removed'; syllableId: string };

/**
 * Exactly one syllable is armed at a time, and tapping is the only way
 * in or out.
 *
 * Tapping a chip ARMS it regardless of whether it is placed or unplaced
 * — the two states behave identically here on purpose. A placed
 * syllable being re-placeable by tap is the same gesture as placing an
 * unplaced one, and making the affordance conditional on state would
 * mean the user has to know which state a chip is in before knowing
 * what a tap will do.
 */
export function armingReducer(
  state: ArmingState,
  action: ArmingAction,
): ArmingState {
  switch (action.type) {
    case 'tap-syllable':
      // Re-tapping the armed syllable disarms; tapping a different one
      // transfers, since only one can be armed.
      return state?.armedSyllableId === action.syllableId
        ? null
        : { armedSyllableId: action.syllableId };
    case 'tap-outside':
      return null;
    case 'placed':
      return null;
    case 'syllable-removed':
      return state?.armedSyllableId === action.syllableId ? null : state;
    default:
      return state;
  }
}

/** True when this syllable is the armed one. */
export function isArmed(state: ArmingState, syllableId: string): boolean {
  return state?.armedSyllableId === syllableId;
}
