import type { PromptStatus, PromptSurface, PromptTier } from '../db';

export type { PromptStatus, PromptSurface, PromptTier };

/**
 * Phase 1 known prompt types. The `prompts.promptType` column is
 * a free-form string, but the app only writes one of these values
 * today — keeping the set centralized prevents drift between
 * producers (events.ts) and consumers (renderers, future surfaces).
 */
export const PROMPT_TYPE = {
  /** "You haven't set any goals yet" — banner on Practice Sessions
   *  home, the only user-facing prompt that fires in Phase 1. */
  SET_GOALS_NUDGE: 'set_goals_nudge',
  /** Logged when a vacation period ends. Phase 7 surfaces a
   *  welcome-back UI from this; Phase 1 just records the event. */
  VACATION_RETURN: 'vacation_return',
  /** Logged at the start of each calendar month for the previous
   *  month. Phase 7 surfaces the monthly review UI; Phase 1 just
   *  records the event. */
  END_OF_MONTH: 'end_of_month',
  /** Phase 3 Step 6i — fired at session end when a measurable goal
   *  just crossed its target_value. Payload carries goalId,
   *  targetMetric, targetValue so the surface UI (Phase 7) can
   *  render module-specific copy without a re-fetch. */
  GOAL_MILESTONE: 'goal_milestone',
  /** Song of the Month — fired when the spotlight song reaches
   *  comfortable in its original key. Payload carries songId,
   *  songTitle, umbrellaGoalId so the surface can render copy +
   *  wire the "Yes, advance" action without re-fetching. High
   *  tier; dedupe per songId across the prompt's lifetime. */
  SONG_OF_MONTH_CONGRATS: 'song_of_month_congrats',
  /** Song of the Month — fired when the spotlight song is past
   *  ~50% comfortable AND the next slot is TBD. Re-enqueued at
   *  most once per local day per umbrella (cadence:
   *  evaluateSongOfMonthPrompts checks for an existing prompt
   *  whose createdAt falls in the same local day before
   *  enqueuing again). Medium tier; payload carries
   *  umbrellaGoalId. */
  SONG_OF_MONTH_TBD_NUDGE: 'song_of_month_tbd_nudge',
} as const;

export type PromptType = typeof PROMPT_TYPE[keyof typeof PROMPT_TYPE];

/**
 * Soft daily cap (Q10): don't surface more than this many user-
 * facing prompts within a single local calendar day. Counted from
 * `prompts.shownAt` timestamps, not creation. Logged-only events
 * (vacation_return, end_of_month) don't count against the cap until
 * Phase 7 surfaces them.
 */
export const DAILY_CAP = 3;

/**
 * Active-session suppression window (Q10). If any practice session
 * was started within this window and hasn't ended, the orchestrator
 * returns no prompts — protects the user's flow during practice.
 *
 * Phase 1 has no real "active session" state (the timer + algorithm
 * ship in Phase 3+); this is defensive scaffolding so the rule is
 * encoded today and Phase 3 can replace the heuristic with a proper
 * session state machine without retrofitting consumers.
 */
export const ACTIVE_SESSION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Tier priority for selection. High wins over medium wins over low;
 * within the same tier the orchestrator falls back to FIFO by
 * createdAt.
 */
export const TIER_PRIORITY: Record<PromptTier, number> = {
  high: 3,
  medium: 2,
  low: 1,
};
