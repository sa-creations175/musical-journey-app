/**
 * Phase 3 Step 3 — Input questionnaire types + shared constants.
 *
 * The InputQuestionnaire bottom sheet builds an `InputQuestionnaireResult`
 * — the full session-generation input that flows to the algorithm.
 * Internally the sheet maintains a draft (every field optional);
 * Generate is only enabled when all required fields are set.
 *
 * Types mirror the structures used throughout the algorithm so
 * downstream consumers (Step 5+ proposal screen, Step 6 session-start)
 * can pass straight through without re-mapping.
 */

import type { DayPlan } from '../../lib/sessionAlgorithm/sessionRole';
import type { PracticeSessionContext } from '../../lib/db';

export const TIME_PRESETS_MIN = [15, 30, 45, 60, 90] as const;

export const CUSTOM_TIME_MIN = 5;
export const CUSTOM_TIME_MAX = 180;
export const CUSTOM_TIME_STEP = 5;

export type DayProfileChoice = 'standard' | 'light' | 'deep' | 'custom';

export type DayPlanChoice =
  | { kind: 'just_this_session' }
  | { kind: 'first_of_multiple'; profile: DayProfileChoice }
  | { kind: 'continuing_today' };

export type IntentChoice =
  | { kind: 'balanced' }
  | { kind: 'lean_to_goals' }
  | { kind: 'push_on_item'; itemRef: string | null };

export interface EnergyChoice {
  focus: number | null;
  motivation: number | null;
  inspiration: number | null;
}

/** Internal draft shape — the bottom sheet's working state.
 *  Becomes a finalized `InputQuestionnaireResult` once required
 *  fields land. */
export interface InputQuestionnaireDraft {
  timeMinutes: number | null;
  context: PracticeSessionContext | null;
  dayPlan: DayPlanChoice | null;
  intent: IntentChoice | null;
  energy: EnergyChoice;
}

/** Final assembled result emitted by Generate. */
export interface InputQuestionnaireResult {
  timeMinutes: number;
  context: PracticeSessionContext;
  dayPlan: DayPlanChoice;
  intent: IntentChoice;
  energy: EnergyChoice;
}

export const EMPTY_ENERGY: EnergyChoice = {
  focus: null,
  motivation: null,
  inspiration: null,
};

export const EMPTY_DRAFT: InputQuestionnaireDraft = {
  timeMinutes: null,
  context: null,
  dayPlan: null,
  intent: null,
  energy: EMPTY_ENERGY,
};

/**
 * Map the questionnaire's day-plan choice onto the algorithm's
 * canonical DayPlan enum (sessionRole.ts). Returns null when the
 * draft hasn't been filled yet.
 */
export function dayPlanForAlgorithm(
  choice: DayPlanChoice | null,
): DayPlan | null {
  if (!choice) return null;
  return choice.kind;
}

/**
 * True when every required field is set. Energy is skippable; Time +
 * Context + DayPlan + Intent are required to enable Generate. For
 * 'push_on_item' intent the itemRef must also be picked.
 */
export function isDraftComplete(draft: InputQuestionnaireDraft): boolean {
  if (draft.timeMinutes === null) return false;
  if (draft.context === null) return false;
  if (draft.dayPlan === null) return false;
  if (draft.intent === null) return false;
  if (draft.intent.kind === 'push_on_item' && !draft.intent.itemRef) return false;
  return true;
}

/**
 * Promote a complete draft into a finalized result. Throws on an
 * incomplete draft — caller must check isDraftComplete first.
 */
export function finalizeDraft(
  draft: InputQuestionnaireDraft,
): InputQuestionnaireResult {
  if (!isDraftComplete(draft)) {
    throw new Error('finalizeDraft: draft is incomplete');
  }
  return {
    timeMinutes: draft.timeMinutes!,
    context: draft.context!,
    dayPlan: draft.dayPlan!,
    intent: draft.intent!,
    energy: draft.energy,
  };
}

/**
 * Build the initial draft state for a fresh sheet open. Layers in
 * order:
 *   1. EMPTY_DRAFT — Time / Intent / Energy stay blank, by design.
 *   2. userPrefs pre-fill — Context + Day plan (if present, post-
 *      sanitize for hasEarlierSessionsToday).
 *   3. initialDayProfile — Step 3h Deep-day tap-through. Wins over
 *      the saved Day plan because the Practice Sessions home banner
 *      is making an explicit "go deep" suggestion.
 *
 * Pure; tests pass each layer's input directly.
 */
export function seedDraft(input: {
  prefilledContext: PracticeSessionContext | null;
  prefilledDayPlan: DayPlanChoice | null;
  initialDayProfile: DayProfileChoice | null;
  /** When set, seeds Q1's time selection. Used by the
   *  "What your goals need today" screen so the user's chosen time
   *  carries into the questionnaire without a second tap. */
  initialTimeMinutes?: number | null;
}): InputQuestionnaireDraft {
  const draft: InputQuestionnaireDraft = {
    ...EMPTY_DRAFT,
    context: input.prefilledContext,
    dayPlan: input.prefilledDayPlan,
    timeMinutes: input.initialTimeMinutes ?? null,
  };
  if (input.initialDayProfile) {
    draft.dayPlan = {
      kind: 'first_of_multiple',
      profile: input.initialDayProfile,
    };
  }
  return draft;
}
