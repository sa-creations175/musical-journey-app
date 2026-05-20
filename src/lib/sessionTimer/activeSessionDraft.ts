/**
 * Persistence for the in-progress session draft (prep-flow redesign,
 * Part 1). Mirrors the live reducer state into a single Dexie row so a
 * browser refresh / crash can offer to resume.
 *
 * The session timer is timestamp-derived (getTimes computes elapsed
 * from startedAt/pausedMs), so we can't just store and replay raw
 * timestamps — that would count offline + resume-prompt time as
 * practice. Instead we snapshot the active-ms at write time and, on
 * resume, REBASE the timestamps to the moment the user resumes. Offline
 * time is discarded; the session continues from where it left off.
 */

import { db, type ActiveSessionDraft } from '../db';
import { getTimes } from './reducer';
import type { SessionBlock, SessionState } from './types';

export const ACTIVE_SESSION_DRAFT_KEY = 'current';

/**
 * Build the draft record for a live session, or null when there's
 * nothing to persist (idle / ended). Pure — `now` is supplied so the
 * active-ms snapshots are deterministic in tests.
 */
export function buildDraft(state: SessionState, now: number): ActiveSessionDraft | null {
  if (state.status !== 'running' && state.status !== 'paused') return null;
  if (state.sessionId === null) return null;
  const times = getTimes(state, now);
  return {
    key: ACTIVE_SESSION_DRAFT_KEY,
    sessionId: state.sessionId,
    status: state.status,
    state,
    savedSessionActiveMs: times.activeMs,
    savedBlockActiveMs: times.blockActiveMs,
    savedAt: now,
    updatedAt: now,
  };
}

/**
 * Reconstruct a live SessionState from a persisted draft, rebasing all
 * timestamps to `now` so the recovered session resumes with exactly the
 * saved elapsed time (offline gap excluded). Restores as 'running'.
 *
 * - Session start is anchored so getTimes().activeMs == saved value.
 * - The current block start is anchored to its saved block-active value.
 * - All pause accounting is zeroed (folded into the anchors) so it
 *   doesn't double-subtract.
 * - Completed / skipped blocks keep their finalized activeMs + rating.
 */
export function draftToSessionState(draft: ActiveSessionDraft, now: number): SessionState {
  const base = draft.state;
  const blocks: SessionBlock[] = base.blocks.map((b, i) => {
    if (i === base.currentBlockIndex) {
      return {
        ...b,
        status: 'running',
        startedAt: now - draft.savedBlockActiveMs,
        endedAt: null,
        pausedMs: 0,
      };
    }
    // Pre-current blocks: keep finalized activeMs/rating; zero pausedMs
    // so the session-level paused sum stays at 0 after rebasing.
    return { ...b, pausedMs: 0 };
  });

  return {
    ...base,
    status: 'running',
    startedAt: now - draft.savedSessionActiveMs,
    endedAt: null,
    pausedAt: null,
    pauseReason: null,
    blockEndRequested: false,
    blocks,
  };
}

/** Write (upsert) the draft for the current live session. No-op when
 *  idle / ended. */
export async function writeActiveSessionDraft(state: SessionState): Promise<void> {
  const draft = buildDraft(state, Date.now());
  if (!draft) return;
  await db.activeSessionDraft.put(draft);
}

/** Read the persisted draft, if any. */
export async function readActiveSessionDraft(): Promise<ActiveSessionDraft | undefined> {
  return db.activeSessionDraft.get(ACTIVE_SESSION_DRAFT_KEY);
}

/** Remove the persisted draft (normal end or user abandon). */
export async function clearActiveSessionDraft(): Promise<void> {
  await db.activeSessionDraft.delete(ACTIVE_SESSION_DRAFT_KEY);
}
