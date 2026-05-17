/**
 * Phase 3 Step 3g — Input questionnaire pre-fill.
 *
 * Per the design's pre-fill table:
 *   Context  — remembers last session
 *   Day plan — remembers last session
 *   Time / Intent / Energy — always blank
 *
 * The "remember last" surfaces persist via userPrefs on every
 * Generate. Reload on every sheet open. Time / Intent / Energy are
 * intentionally not persisted — they're per-session conscious
 * choices.
 *
 * Edge case: a saved dayPlan of `continuing_today` only makes sense
 * when there's already a session logged today; loadPrefill drops
 * that value when the caller signals no earlier sessions today.
 */

import { getPref, setPref } from '../../lib/userPrefs';
import type { PracticeSessionContext } from '../../lib/db';
import type { DayPlanChoice, IntentChoice } from './inputs';

const KEY_CONTEXT = 'practice.questionnaire.lastContext';
const KEY_DAY_PLAN = 'practice.questionnaire.lastDayPlan';
/** Persists on Accept (not Generate) — see saveLastIntentKind. */
const KEY_LAST_INTENT = 'practice.questionnaire.lastIntentKind';

export type IntentKind = IntentChoice['kind'];

export interface Prefill {
  context: PracticeSessionContext | null;
  dayPlan: DayPlanChoice | null;
}

export interface LoadPrefillOptions {
  /** Used to drop a saved 'continuing_today' value when the new day
   *  has no earlier sessions yet. Defaults to false. */
  hasEarlierSessionsToday?: boolean;
}

export async function loadPrefill(opts: LoadPrefillOptions = {}): Promise<Prefill> {
  const context = await getPref<PracticeSessionContext | null>(KEY_CONTEXT, null);
  const rawDayPlan = await getPref<DayPlanChoice | null>(KEY_DAY_PLAN, null);

  const dayPlan = sanitizeDayPlan(rawDayPlan, opts.hasEarlierSessionsToday ?? false);
  return { context, dayPlan };
}

export async function savePrefill(input: {
  context: PracticeSessionContext;
  dayPlan: DayPlanChoice;
}): Promise<void> {
  await Promise.all([
    setPref(KEY_CONTEXT, input.context),
    setPref(KEY_DAY_PLAN, input.dayPlan),
  ]);
}

/**
 * Last-used intent kind — surfaced on Q4 as a "Last time: …" hint.
 * Informational only; the user always re-picks. Persisted on Accept
 * (the user committed to this intent for a real session) rather than
 * on Generate (where they're still browsing). Returns null when no
 * intent has been accepted yet.
 */
export async function loadLastIntentKind(): Promise<IntentKind | null> {
  return await getPref<IntentKind | null>(KEY_LAST_INTENT, null);
}

export async function saveLastIntentKind(kind: IntentKind): Promise<void> {
  await setPref(KEY_LAST_INTENT, kind);
}

/**
 * Drop a saved 'continuing_today' when the new day has no earlier
 * sessions logged. Pure; exported for unit testing.
 */
export function sanitizeDayPlan(
  saved: DayPlanChoice | null,
  hasEarlierSessionsToday: boolean,
): DayPlanChoice | null {
  if (!saved) return null;
  if (saved.kind === 'continuing_today' && !hasEarlierSessionsToday) return null;
  return saved;
}
