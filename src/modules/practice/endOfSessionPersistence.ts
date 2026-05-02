/**
 * Phase 3 Step 6f–6j — Persistence pipeline for end-of-session.
 *
 * The Done button in EndOfSessionSummary (Step 6k) flushes all of
 * the following before reset()ing the timer:
 *
 *   6f — recordBlockEngagements: per-item recordEngagement calls
 *        for each completed block, memory-type-aware. Per-rep
 *        signals during practice already covered declarative +
 *        procedural; this pass adds the holistic signal we only
 *        have at session end (block rating, recency).
 *
 *   6g — next_due_at recalculation. recordEngagement (Phase 2)
 *        already updates the spacingState row's nextDueAt via the
 *        memory-type curve in computeNextStage. 6g is a thin
 *        documentation pass — no new code; the existing wiring
 *        does the work.
 *
 *   6h — acquisition_stage advancement. recordEngagement (Phase 2)
 *        runs computeNextStage on every signal — new → acquiring on
 *        first engagement; acquiring → acquired when the
 *        declarative-accuracy or rating-based threshold is met.
 *        consolidated / mastered transitions remain deferred until
 *        their thresholds are calibrated from real use (per the
 *        design's Phase 3 scope note). 6h is a no-code substep —
 *        the integration test in __tests__/endOfSessionPersistence
 *        exercises the full path so a regression can't slip
 *        through.
 *
 *   6i — Goal current_value updates + milestone-prompt queueing.
 *
 *   6j — songKeyEngagements logging at section + key cell level.
 *
 * Each substep adds one helper to this module; 6k composes them.
 *
 * All helpers swallow recordEngagement errors per-call rather than
 * aborting the batch — partial persistence is better than no
 * persistence when the user's session is over and they're waiting
 * on a Done button.
 */

import {
  db,
  type PracticeBlock,
  type PracticeSession,
  type PracticeSessionContext,
  type PracticeSessionRating,
  type PracticeSessionRole,
  type SongKeyEngagement,
} from '../../lib/db';
import { getMemoryType } from '../../lib/memoryType';
import { recordEngagement } from '../../lib/spacingState';
import { enqueue } from '../../lib/prompts/queue';
import { PROMPT_TYPE } from '../../lib/prompts/types';
import { getGoalProgress } from '../../modules/goals/progress';
import { timeOfDayFor } from './timeOfDay';
import { markColdStartBannerSeen } from './coldStartBannerPref';
import { sessionTimerReducer } from '../../lib/sessionTimer/reducer';
import type {
  PerformanceRating,
  SessionState,
} from '../../lib/sessionTimer/types';
import type { SessionBlock } from '../../lib/sessionTimer/types';

/**
 * Convention for the algorithm to encode song-key targets in a
 * block's itemRefs. The integration layer (Step 7+) populates these
 * when building blocks for the Song Repertoire module; 6j parses
 * the prefix to derive the songKeyId for engagement logging.
 *
 *   songKey:<songKeyId>
 *
 * Cell-level (section × key) refs are out of scope here — they
 * write to songCellRunThroughs as the user logs run-throughs in
 * the matrix UI. 6j's job is the per-key roll-up at session end.
 */
export const SONG_KEY_ITEM_REF_PREFIX = 'songKey:';

/**
 * Walk completed blocks and write a session-end engagement signal
 * per item. Memory-type-aware:
 *
 *   procedural / integration  →  recordEngagement(rating: block.rating)
 *     when the block has a per-block rating; skipped otherwise.
 *   expression                →  recordEngagement(recency)
 *     fires regardless of rating — the signal IS the engagement.
 *   declarative               →  skipped here. Per-attempt writes
 *     during the session (Phase 2 module wiring) already covered it
 *     at finer granularity than a block-level signal would; adding
 *     a holistic signal would distort the per-card history.
 *
 * Skipped blocks (status !== 'completed') and blocks with no
 * itemRefs are also skipped — there's no item to write against.
 *
 * Errors per-itemRef are logged and swallowed so one failure
 * doesn't abort the rest. Returns the count of successful writes
 * for downstream telemetry / tests.
 */
export async function recordBlockEngagements(
  blocks: ReadonlyArray<SessionBlock>,
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;

  for (const block of blocks) {
    if (block.status !== 'completed') {
      skipped += 1;
      continue;
    }
    if (!block.itemRefs || block.itemRefs.length === 0) continue;

    let memoryType;
    try {
      memoryType = getMemoryType(block.moduleRef);
    } catch {
      // Unknown module ref — skip rather than throw. Algorithm
      // shouldn't produce these, but be defensive.
      skipped += 1;
      continue;
    }

    for (const itemRef of block.itemRefs) {
      try {
        if (
          (memoryType === 'procedural' || memoryType === 'integration') &&
          block.rating
        ) {
          await recordEngagement({
            itemRef,
            moduleRef: block.moduleRef,
            signal: { kind: 'rating', rating: block.rating },
          });
          written += 1;
        } else if (memoryType === 'expression') {
          await recordEngagement({
            itemRef,
            moduleRef: block.moduleRef,
            signal: { kind: 'recency' },
          });
          written += 1;
        } else {
          // declarative without per-block applicable signal
          skipped += 1;
        }
      } catch (e) {
        // Log + swallow so the rest of the batch still runs.
        // eslint-disable-next-line no-console
        console.warn('[end-of-session] recordEngagement failed', {
          blockId: block.id,
          moduleRef: block.moduleRef,
          itemRef,
          error: e,
        });
        skipped += 1;
      }
    }
  }

  return { written, skipped };
}

/**
 * Merge the unrated-batch ratings (collected on the summary screen
 * in Step 6e) into a fresh block list. Returns a new array;
 * doesn't mutate. Used by 6k before recordBlockEngagements so the
 * batch ratings drive the engagement signal.
 */
export function mergeBatchRatings(
  blocks: ReadonlyArray<SessionBlock>,
  batchRatings: Record<string, SessionBlock['rating']>,
): SessionBlock[] {
  return blocks.map(b => {
    const r = batchRatings[b.id];
    if (!r) return { ...b };
    return { ...b, rating: r };
  });
}

/**
 * Phase 3 Step 6i — recompute current_value for active goals after
 * the session's engagement writes have settled, then enqueue a
 * GOAL_MILESTONE prompt for any goal whose current_value just
 * crossed its target_value.
 *
 * Walks active goals; uses getGoalProgress (Phase 2) to compute
 * new current values, updates goal.currentValue when it changed,
 * and detects "wasReached / isReached" transitions so the prompt
 * only fires the moment a milestone is crossed (not every session
 * thereafter).
 *
 * Per-goal failures are logged + swallowed — partial progress
 * updates are better than none if one goal's read happens to
 * fault. Returns { updated, milestonesQueued } counts for tests
 * and telemetry.
 *
 * Phase 3 v0 only: 'coverage' and 'accuracy' goal kinds are
 * supported (everything getGoalProgress returns kind !== 'unsupported'
 * for). Item-count + song-proficiency progress lands in Phase 7
 * polish.
 */
/**
 * Phase 3 Step 6j — songKeyEngagements logging. Walks completed
 * Song Repertoire blocks and records one row per (songKey,
 * session) into the deferred-from-Phase-1.5 songKeyEngagements
 * table. Lived-with window logic (Step 2h helpers) reads from
 * this table to surface fading / lapsed songs to the algorithm.
 *
 * itemRef convention: 'songKey:<songKeyId>'. Refs that don't
 * match the prefix are ignored (defensive against non-song-key
 * itemRefs sharing the block).
 *
 * Idempotent at the (songKey, session) granularity is not
 * enforced here — the same block's items will only fire once per
 * session because end-of-session runs once. If a future flow
 * re-runs persistence (e.g., resume-after-crash), the caller is
 * responsible for deduping or accepting duplicate rows; the
 * lived-with helpers count distinct sessions via DISTINCT(songKey,
 * practiceSessionId), so duplicates don't double-count.
 *
 * Per-row failures are logged + swallowed.
 */
export async function logSongKeyEngagements(
  blocks: ReadonlyArray<SessionBlock>,
  practiceSessionId: string,
  now: number = Date.now(),
): Promise<{ logged: number }> {
  let logged = 0;

  for (const block of blocks) {
    if (block.status !== 'completed') continue;
    if (block.moduleRef !== 'repertoire') continue;
    if (!block.itemRefs || block.itemRefs.length === 0) continue;

    for (const ref of block.itemRefs) {
      if (!ref.startsWith(SONG_KEY_ITEM_REF_PREFIX)) continue;
      const songKeyId = ref.slice(SONG_KEY_ITEM_REF_PREFIX.length);
      if (!songKeyId) continue;

      try {
        const songKey = await db.songKeys.get(songKeyId);
        if (!songKey) continue;
        const engagement: SongKeyEngagement = {
          id: makeEngagementId(now),
          songKeyId,
          songId: songKey.songId,
          practiceSessionId,
          engagedAt: now,
          createdAt: now,
        };
        await db.songKeyEngagements.add(engagement);
        logged += 1;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[end-of-session] songKeyEngagement insert failed', {
          ref,
          error: e,
        });
      }
    }
  }

  return { logged };
}

function makeEngagementId(now: number): string {
  return `eng-${Math.random().toString(36).slice(2, 8)}-${now.toString(36)}`;
}

// ---------------------------------------------------------------------
// Pipeline orchestrator (6k + "end & start new" share this)
// ---------------------------------------------------------------------

export interface EndOfSessionPipelineInput {
  /** State the pipeline runs against. Expected to be in 'ended' or
   *  'paused' status — the reducer's end-session action has run, so
   *  the current block's activeMs is finalized. Callers from a
   *  live-running session should run sessionTimerReducer manually
   *  via endActiveSessionForPipeline() to derive this state. */
  state: SessionState;
  summary: {
    sessionRating: PracticeSessionRating | null;
    affirmation: string | null;
    /** From Step 6e — keyed by block id. Empty when the user is
     *  abandoning a session via the home's "End & start new" path. */
    batchRatings: Record<string, PerformanceRating>;
  };
  extras?: PersistSessionExtras;
}

/**
 * Runs the full end-of-session persistence chain: merge batch
 * ratings into blocks → persist session/blocks rows → record
 * per-item engagements → recompute goal progress + milestones →
 * log songKeyEngagements → mark the cold-start banner seen.
 *
 * Returns the persisted session id.
 *
 * Two callers as of Step 7+:
 *   - EndOfSessionSummary's Done button (post-summary user flow)
 *   - PracticeSessions' "End & start new" (mid-session abandon)
 */
export async function runEndOfSessionPipeline(
  input: EndOfSessionPipelineInput,
): Promise<string> {
  const { state, summary, extras } = input;
  const blocksWithRatings = mergeBatchRatings(state.blocks, summary.batchRatings);
  const sessionId = await persistSession(
    state,
    {
      sessionRating: summary.sessionRating,
      affirmation: summary.affirmation,
      blocksWithFinalRatings: blocksWithRatings,
    },
    extras,
  );
  await recordBlockEngagements(blocksWithRatings);
  await recomputeGoalsAndQueueMilestones();
  await logSongKeyEngagements(blocksWithRatings, sessionId);
  await markColdStartBannerSeen();
  return sessionId;
}

/**
 * Pure: derive the post-end state from a live (running / paused)
 * SessionState by running the reducer's end-session action against
 * it. Caller hands the result to runEndOfSessionPipeline so the
 * persisted blocks include the final activeMs of the current
 * (mid-session-abandoned) block. The actual timer dispatch + reset
 * are the caller's responsibility — this is the snapshot pass.
 */
export function endActiveSessionForPipeline(
  state: SessionState,
  now: number = Date.now(),
): SessionState {
  return sessionTimerReducer(state, {
    type: 'end-session',
    now,
    markStatus: 'completed',
  });
}

// Re-export to silence unused-import warning when PerformanceRating
// is referenced solely in type position above.
export type { PerformanceRating };

/**
 * Phase 3 Step 6k — write practiceSession + practiceBlocks rows.
 *
 * Composes the timer's session state + summary form values + the
 * input-questionnaire metadata into a PracticeSession + per-block
 * PracticeBlock rows. extras carry questionnaire-derived fields
 * the timer doesn't track (context, sessionRole, sessionIntent,
 * energy*, dayProfileUsed, reasoningSnapshot). Phase 3 v0 ships
 * with extras typically empty; Step 7+ integration wires real
 * values from the proposal-acceptance flow.
 *
 * Returns the sessionId so the caller can chain further writes
 * (Step 6j wants it for songKeyEngagements.practiceSessionId).
 */
export interface PersistSessionExtras {
  context?: PracticeSessionContext;
  sessionRole?: PracticeSessionRole;
  sessionIntent?: string | null;
  hardBlocks?: boolean;
  energyFocus?: number | null;
  energyMotivation?: number | null;
  energyInspiration?: number | null;
  dayProfileUsed?: PracticeSession['dayProfileUsed'];
  reasoningSnapshot?: PracticeSession['reasoningSnapshot'];
  notes?: string | null;
}

export async function persistSession(
  state: SessionState,
  summary: {
    sessionRating: PracticeSessionRating | null;
    affirmation: string | null;
    blocksWithFinalRatings: ReadonlyArray<SessionBlock>;
  },
  extras: PersistSessionExtras = {},
): Promise<string> {
  if (!state.sessionId || state.startedAt === null) {
    throw new Error('persistSession: session never started');
  }

  const startedAt = state.startedAt;
  const endedAt = state.endedAt ?? Date.now();
  const finalizedTotalMs = endedAt - startedAt;
  const activeMs = summary.blocksWithFinalRatings.reduce(
    (sum, b) => sum + b.activeMs,
    0,
  );

  const trimmedAffirmation =
    summary.affirmation && summary.affirmation.trim().length > 0
      ? summary.affirmation.trim()
      : null;

  const sessionRow: PracticeSession = {
    id: state.sessionId,
    startedAt,
    endedAt,
    plannedDurationMin: Math.round(
      summary.blocksWithFinalRatings.reduce(
        (s, b) => s + b.plannedSeconds,
        0,
      ) / 60,
    ),
    actualDurationMin: Math.round(activeMs / 60_000),
    context: extras.context ?? 'mixed',
    timeOfDay: timeOfDayFor(startedAt),
    sessionRole: extras.sessionRole ?? 'only',
    sessionIntent: extras.sessionIntent ?? null,
    hardBlocks: extras.hardBlocks ?? false,
    energyFocus: extras.energyFocus ?? null,
    energyMotivation: extras.energyMotivation ?? null,
    energyInspiration: extras.energyInspiration ?? null,
    dayProfileUsed: extras.dayProfileUsed ?? null,
    reasoningSnapshot: extras.reasoningSnapshot ?? null,
    notes: extras.notes ?? null,
    lastEngagedAt: endedAt,
    sessionRating: summary.sessionRating,
    affirmation: trimmedAffirmation,
  };

  const blockRows: PracticeBlock[] = summary.blocksWithFinalRatings.map(
    (b, i): PracticeBlock => ({
      id: b.id,
      sessionId: state.sessionId!,
      orderIndex: i,
      moduleRef: b.moduleRef,
      subModuleRef: null,
      itemRefs: b.itemRefs ? [...b.itemRefs] : [],
      plannedMinutes: Math.round(b.plannedSeconds / 60),
      actualMinutes: Math.round(b.activeMs / 60_000),
      completionStatus:
        b.status === 'completed'
          ? 'completed'
          : b.status === 'skipped'
            ? 'skipped'
            : null,
      performanceRating: b.rating ?? null,
      blockColor: null,
      notes: null,
    }),
  );

  // Single transaction so a partial write doesn't strand a session
  // without its blocks (or vice versa).
  await db.transaction('rw', [db.practiceSessions, db.practiceBlocks], async () => {
    await db.practiceSessions.put(sessionRow);
    await db.practiceBlocks.bulkPut(blockRows);
  });

  // Touch finalizedTotalMs so the unused-import linter ignores it
  // — kept around for a future "session length vs active time"
  // surface that may want the wall-clock total.
  void finalizeAvailable(finalizedTotalMs);

  return state.sessionId;
}

function finalizeAvailable(_total: number): void {
  // intentional no-op
}

export async function recomputeGoalsAndQueueMilestones(): Promise<{
  updated: number;
  milestonesQueued: number;
}> {
  let updated = 0;
  let milestonesQueued = 0;

  const goals = await db.goals.where('status').equals('active').toArray();

  for (const goal of goals) {
    try {
      const progress = await getGoalProgress(goal);
      if (progress.kind === 'unsupported') continue;
      if (progress.current === null) continue;

      const target = progress.target;
      const newCurrent = progress.current;
      const oldCurrent = goal.currentValue ?? 0;

      if (newCurrent !== oldCurrent) {
        await db.goals.update(goal.id, { currentValue: newCurrent });
        updated += 1;
      }

      const wasReached = oldCurrent >= target;
      const isReached = newCurrent >= target;
      if (!wasReached && isReached) {
        await enqueue({
          promptType: PROMPT_TYPE.GOAL_MILESTONE,
          tier: 'medium',
          surface: 'session_end',
          payload: {
            goalId: goal.id,
            targetMetric: goal.targetMetric,
            targetValue: target,
            currentValue: newCurrent,
          },
        });
        milestonesQueued += 1;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[end-of-session] goal recompute failed', {
        goalId: goal.id,
        error: e,
      });
    }
  }

  return { updated, milestonesQueued };
}
