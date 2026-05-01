/**
 * Phase 3 Step 2g — Single-session role detection.
 *
 * Per algorithm Step 2, each session plays one of four roles in a
 * day:
 *
 *   only    — the user declared "just this session." Carries the
 *             full breadth burden, even if short.
 *   opener  — first session of a planned day. Cognitively fresh;
 *             suitable for acquisition work.
 *   middler — daytime in-between session. Lower cognitive load;
 *             review and maintenance.
 *   closer  — evening / last session. Consolidates and addresses
 *             what's been missed during the day.
 *
 * This module handles SINGLE-session role detection only. Cross-
 * session day coordination (the kind that needs to know what the
 * other sessions of the day are doing) is Phase 4 territory.
 *
 * Pure function. Inputs come from the input questionnaire (Q3 day
 * plan), the system clock (time of day), and a count of earlier
 * practice sessions logged today.
 */

import type { PracticeSessionTimeOfDay } from '../db';

export type DayPlan = 'just_this_session' | 'first_of_multiple' | 'continuing_today';

export type SessionRole = 'opener' | 'middler' | 'closer' | 'only';

export interface SessionRoleInput {
  /** Q3 of the input questionnaire. null when not declared (e.g.
   *  algorithm called outside the standard flow). */
  dayPlan: DayPlan | null;
  /** Auto-derived from system clock per the time-of-day windows
   *  table (lib/db.ts comment). */
  timeOfDay: PracticeSessionTimeOfDay;
  /** Count of practice sessions logged today before this one.
   *  Determines middler vs closer when dayPlan is 'continuing_today'
   *  or absent. */
  earlierSessionsToday: number;
}

/**
 * Map declared day plan + time of day + earlier sessions onto a
 * session role. Pure.
 *
 * Rules, in order of precedence:
 *
 *   1. dayPlan === 'just_this_session' → 'only'
 *      (carries the full breadth burden; algorithm treats it like a
 *      closer with no prior context)
 *
 *   2. dayPlan === 'first_of_multiple' → 'opener'
 *
 *   3. dayPlan === 'continuing_today' (or absent), earlierSessionsToday > 0:
 *        - timeOfDay 'evening' / 'late_night' → 'closer'
 *        - timeOfDay 'morning' / 'midday'     → 'middler'
 *
 *   4. Fallback (no dayPlan, no earlier sessions):
 *        - 'morning' / 'midday' → 'opener'
 *        - 'evening' / 'late_night' → 'closer'
 *
 * Late-night sessions roll up under the previous calendar day's
 * metrics (db.ts comment) but for role purposes count as evening.
 */
export function detectSessionRole(input: SessionRoleInput): SessionRole {
  const { dayPlan, timeOfDay, earlierSessionsToday } = input;

  if (dayPlan === 'just_this_session') return 'only';
  if (dayPlan === 'first_of_multiple') return 'opener';

  // dayPlan === 'continuing_today' OR null
  if (earlierSessionsToday > 0) {
    if (timeOfDay === 'evening' || timeOfDay === 'late_night') return 'closer';
    return 'middler';
  }

  // No declared plan, no earlier sessions — pick by clock.
  if (timeOfDay === 'evening' || timeOfDay === 'late_night') return 'closer';
  return 'opener';
}

/**
 * True when the session carries the day's full breadth burden — the
 * algorithm should distribute coverage broadly rather than going
 * narrow. 'only' and 'closer' both qualify per the design ("If
 * closer is the only session of the day, carries full breadth
 * burden — even if short.").
 */
export function carriesBreadthBurden(role: SessionRole): boolean {
  return role === 'only' || role === 'closer';
}
