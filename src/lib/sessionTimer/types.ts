/**
 * Phase 3 Step 1a — Global session timer types.
 *
 * The session timer is a single, app-level primitive consumed by:
 *   1. Phase 3 block timer (active session screen)
 *   2. Shapes & Patterns drill sessions (Step 1e wires this)
 *   3. Song-only sessions from song detail page (deferred to Phase 7)
 *
 * One session may be active at a time. Sessions are linear sequences
 * of blocks; one block is "current" at any moment while running.
 *
 * Time bookkeeping intentionally separates wall-clock from active.
 *   - Wall-clock = (sessionEnd ?? now) - sessionStart, monotonic.
 *   - Active = wall-clock minus all paused durations (across blocks
 *     plus any in-progress pause segment).
 * This split powers Step 1d drift detection — active time is what the
 * user actually practiced; wall-clock is what the world observed.
 */

export type SessionStatus = 'idle' | 'running' | 'paused' | 'ended';

export type SessionOrigin = 'practice-sessions' | 'shapes-drill' | 'song-detail';

export type BlockStatus = 'pending' | 'running' | 'completed' | 'skipped';

export type PerformanceRating = 'flying' | 'cruising' | 'crawling';

/**
 * Why the session entered the paused state. Distinguishes manual
 * (user-initiated, e.g. the hard-prompt End-vs-Resume modal) from
 * auto-navigation (the user left the active module's route, Step 1b).
 *
 * Auto-pause-on-navigation is only auto-resumed when the user
 * navigates back. Manual pauses are sticky — returning to the active
 * module while manually paused does NOT auto-resume.
 */
export type PauseReason = 'manual' | 'auto-navigation';

export interface SessionBlock {
  /** Stable local id for this block within the session. */
  id: string;
  /** Canonical module ref (e.g. 'shapes-and-patterns'). */
  moduleRef: string;
  /** Optional item references this block targets (cards, songs, drills). */
  itemRefs?: string[];
  /** Human-readable label shown in the global banner and on the block screen. */
  label?: string;
  /** Optional route override for the active-session quick-launch button.
   *  When set, ActiveSessionScreen + the rating-phase auto-advance use
   *  this instead of moduleMeta.route. Lets a block surface a deeper
   *  destination (e.g. `/production?view=vocabulary`) without inventing
   *  a synthetic moduleRef. */
  quickLaunchRoute?: string;
  /** Intended duration in seconds. */
  plannedSeconds: number;
  /** True when this block's module needs a physical keyboard
   *  (S&P, Repertoire). False for cognitive modules (HF, ET,
   *  Production). Optional for back-compat with sessions that
   *  pre-date the field. */
  isKeyboardRequired?: boolean;
  /** True for warm-up blocks paired with a downstream song / cell
   *  (chord-quiz + scale-prep before a Repertoire song, scales
   *  warm-up before the Shapes walk). Surfaced so the active-session
   *  UI can suppress the per-block skip affordance — warm-ups are
   *  bound to their parent practice slot and shouldn't be skipped
   *  independently. Optional for back-compat. */
  isWarmup?: boolean;
  /**
   * User-applied extension on top of plannedSeconds (seconds).
   * Soft-block: tapping +2/+5/+10 in the global expiry modal bumps this.
   * Hard-block: untouched (auto-advance happens instead).
   * Lives in the reducer (not UI state) so the global banner countdown
   * stays in sync with extensions and the value survives navigation.
   */
  extensionSeconds: number;
  status: BlockStatus;
  /** Wall-clock start (ms). null until block starts. */
  startedAt: number | null;
  /** Wall-clock end (ms). null until finalized via advanceBlock or endSession. */
  endedAt: number | null;
  /**
   * Active practice time within this block (ms). Only meaningful once
   * the block finalizes (status = completed | skipped). For the
   * currently-running block use getTimes().blockActiveMs instead.
   */
  activeMs: number;
  /**
   * Cumulative paused time within this block (ms). Pause segments
   * that begin while this block is current contribute on resume (or
   * on advanceBlock / endSession if the session was still paused).
   */
  pausedMs: number;
  /** Optional per-block rating, captured at advance/end time (Step 5c). */
  rating?: PerformanceRating;
}

/**
 * Armed-but-not-running session. The proposal-acceptance flow stores
 * the planned blocks here and routes the user to the first block's
 * module; the actual `start` action fires once they arrive there. This
 * keeps session-time honest — the user's questionnaire-fill +
 * proposal-browse window doesn't count toward practice time.
 *
 * pendingStart is consumed (cleared) the moment a `start` action
 * fires, regardless of whether the start was triggered by arrival or
 * by an explicit consumer.
 */
export interface PendingStartConfig {
  origin: SessionOrigin;
  /**
   * Hard-block mode for this session. true = auto-advance after a 5s
   * grace once a block hits 0; false = soft-block (extend pills, no
   * auto-advance). Defaults to false. Carried through to SessionState.
   */
  hardBlock?: boolean;
  /**
   * Practice context the user picked at questionnaire time (keys /
   * laptop / phone). Carried through to SessionState so the
   * end-of-session pipeline can persist it on practiceSessions.context
   * instead of falling back to the 'keys' default. Defaults to 'keys'
   * when omitted. Algorithm filtering uses inputs.context directly at
   * generation time; this field is for persistence + survives an
   * abandon-and-restart.
   */
  context?: import('../db').PracticeSessionContext;
  blocks: Array<{
    moduleRef: string;
    itemRefs?: string[];
    label?: string;
    plannedSeconds: number;
    /** Optional route override forwarded onto the SessionBlock. */
    quickLaunchRoute?: string;
    /** Forwarded onto SessionBlock.isKeyboardRequired. Optional for
     *  back-compat with callers that pre-date the field. */
    isKeyboardRequired?: boolean;
    /** Forwarded onto SessionBlock.isWarmup. */
    isWarmup?: boolean;
  }>;
}

export interface SessionState {
  status: SessionStatus;
  /** Stable id for this session record. Persisted to practiceSessions on end. */
  sessionId: string | null;
  origin: SessionOrigin | null;
  /** Armed-but-not-running session (set by `arm`, consumed by `start`).
   *  null when nothing is armed. */
  pendingStart: PendingStartConfig | null;
  /**
   * The module ref the session is "anchored to." Step 1b auto-pause
   * compares this against the user's current route on every navigation
   * — when they leave, pause; when they return, resume.
   */
  activeModuleRef: string | null;
  /** Wall-clock session start (ms). Identical to first block's startedAt. */
  startedAt: number | null;
  /** Wall-clock session end (ms). null while running/paused. */
  endedAt: number | null;
  /**
   * If currently paused, when the in-progress pause began (ms).
   * null while running. Pause is global, not per-block — the
   * current block bears the cost.
   */
  pausedAt: number | null;
  /** Why we're paused, when paused. null while running/idle/ended. */
  pauseReason: PauseReason | null;
  /**
   * Hard-block mode. true = auto-advance after a 5s grace; false =
   * soft-block (extend pills only). Set at session start; survives
   * pause/resume.
   */
  hardBlock: boolean;
  /**
   * Practice context the user picked when generating this session.
   * Drives algorithm filtering at generation time; this copy is what
   * the end-of-session pipeline persists onto practiceSessions.context
   * (so the row reflects the user's actual choice instead of the
   * 'keys' fallback). Defaults to 'keys' for legacy sessions / when
   * the questionnaire didn't supply one.
   */
  context: import('../db').PracticeSessionContext;
  /**
   * Cross-screen handoff for "Next block" tapped in the global block
   * expiry modal. The active session screen reactively transitions to
   * the rating phase when this is true and clears it via
   * consume-block-end. Persisted in the reducer rather than UI state
   * so the modal can fire from any route.
   */
  blockEndRequested: boolean;
  blocks: SessionBlock[];
  currentBlockIndex: number | null;
}

export interface SessionTimes {
  /** Wall-clock total (ms) from session start to now-or-end. 0 when idle. */
  wallMs: number;
  /** Active total (ms) excluding all paused durations. 0 when idle. */
  activeMs: number;
  /** Same as wallMs but scoped to the current block. 0 when no current block. */
  blockWallMs: number;
  /** Same as activeMs but scoped to the current block. 0 when no current block. */
  blockActiveMs: number;
}

export interface StartSessionInput {
  origin: SessionOrigin;
  /** Module the session is anchored to (drives auto-pause in Step 1b). */
  activeModuleRef: string;
  /** Hard-block mode. Defaults to false. */
  hardBlock?: boolean;
  /** Practice context. Defaults to 'keys'. */
  context?: import('../db').PracticeSessionContext;
  /** Initial block plan. Must be non-empty. */
  blocks: Array<{
    moduleRef: string;
    itemRefs?: string[];
    label?: string;
    plannedSeconds: number;
    /** Optional route override forwarded onto the SessionBlock. */
    quickLaunchRoute?: string;
    /** Forwarded onto SessionBlock.isKeyboardRequired. */
    isKeyboardRequired?: boolean;
    /** Forwarded onto SessionBlock.isWarmup. */
    isWarmup?: boolean;
  }>;
  /**
   * Optional override for the session id. Used by tests to make
   * snapshots stable. Defaults to crypto.randomUUID() at runtime.
   */
  sessionId?: string;
  /** Optional override for now() — used by tests. Defaults to Date.now(). */
  now?: number;
}

export type SessionTimerAction =
  | { type: 'arm'; config: PendingStartConfig }
  | { type: 'clear-pending' }
  | { type: 'start'; input: StartSessionInput; blockIds: string[] }
  | { type: 'pause'; now: number; reason: PauseReason }
  | { type: 'resume'; now: number }
  | {
      type: 'advance-block';
      now: number;
      rating?: PerformanceRating;
      markStatus?: 'completed' | 'skipped';
      nextBlockId?: string;
    }
  | {
      type: 'end-session';
      now: number;
      rating?: PerformanceRating;
      markStatus?: 'completed' | 'skipped';
    }
  | { type: 'reset' }
  | { type: 'set-active-module-ref'; moduleRef: string | null }
  | { type: 'extend-block'; mins: number }
  | { type: 'request-block-end'; now: number }
  | { type: 'consume-block-end' };
