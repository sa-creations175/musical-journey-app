/**
 * Persistence for the proposal-screen draft (refresh recovery).
 *
 * Parallel to activeSessionDraft, but for the PRE-acceptance proposal
 * state: a refresh on the proposal screen should restore the proposal,
 * not drop the user to the sessions home. Single Dexie row (key
 * 'current'). Written while the proposal screen is up; cleared on accept
 * or discard. The active-session draft takes precedence — once a session
 * is armed/running, the proposal is gone (accept clears this).
 */
import { db } from '../../lib/db';
import type { ProposalCardData } from './proposalTypes';
import type { AbundancePath, SessionPlanReason } from './sessionGenerator';
import type { DayProfileChoice, InputQuestionnaireResult } from './inputs';
import type { BehindPaceNotice } from '../../lib/sessionAlgorithm/weeklyPace';

export const PROPOSAL_DRAFT_KEY = 'current';

/** Restorable session-creation screens (home / goals-need are not
 *  persisted — they're the entry points, not in-flight work). */
export type ProposalDraftView = 'questionnaire' | 'abundance' | 'proposal';

/**
 * The slice of PracticeSessions state needed to restore the user to
 * whichever session-creation screen they were on (questionnaire,
 * abundance path-choice, or proposal). Transient UI bits (dismissed
 * pace modules, feasibility entries) are intentionally NOT persisted —
 * they reset/reload cheaply on restore.
 */
export interface ProposalDraftSnapshot {
  /** Which screen to restore to. */
  view: ProposalDraftView;
  proposals: ProposalCardData[];
  /** Drives accept (context + intent) and the swap picker's context;
   *  also feeds the abundance path handlers. */
  lastInputs: InputQuestionnaireResult | null;
  behindPaceNotices: BehindPaceNotice[];
  /** Non-null only in the abundance flow — enables Back / Regenerate. */
  activePath: AbundancePath | null;
  /** Required to render the abundance path-choice screen. */
  abundanceReason: SessionPlanReason | null;
  /** Questionnaire seeds (pre-selected day-profile + time). */
  initialDayProfile: DayProfileChoice | null;
  initialTimeMinutes: number | null;
}

/** Write (upsert) the proposal draft. */
export async function writeProposalDraft(snapshot: ProposalDraftSnapshot): Promise<void> {
  await db.proposalDraft.put({
    key: PROPOSAL_DRAFT_KEY,
    snapshot,
    savedAt: Date.now(),
  });
}

/** Read the persisted proposal snapshot, if any. */
export async function readProposalDraft(): Promise<ProposalDraftSnapshot | null> {
  const row = await db.proposalDraft.get(PROPOSAL_DRAFT_KEY);
  return row?.snapshot ?? null;
}

/** Remove the persisted proposal draft (accept / discard). */
export async function clearProposalDraft(): Promise<void> {
  await db.proposalDraft.delete(PROPOSAL_DRAFT_KEY);
}
