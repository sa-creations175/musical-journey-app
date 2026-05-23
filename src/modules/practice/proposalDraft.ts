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
import type { InputQuestionnaireResult } from './inputs';
import type { BehindPaceNotice } from '../../lib/sessionAlgorithm/weeklyPace';

export const PROPOSAL_DRAFT_KEY = 'current';

/**
 * The slice of PracticeSessions state needed to re-render the proposal
 * screen and accept/regenerate it. Transient UI bits (dismissed pace
 * modules, feasibility entries) are intentionally NOT persisted — they
 * reset/reload cheaply on restore.
 */
export interface ProposalDraftSnapshot {
  proposals: ProposalCardData[];
  /** Drives accept (context + intent) and the swap picker's context. */
  lastInputs: InputQuestionnaireResult | null;
  behindPaceNotices: BehindPaceNotice[];
  /** Non-null only in the abundance flow — enables Back / Regenerate. */
  activePath: AbundancePath | null;
  abundanceReason: SessionPlanReason | null;
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
