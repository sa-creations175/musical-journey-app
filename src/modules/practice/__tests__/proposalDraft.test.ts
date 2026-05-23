import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearProposalDraft,
  readProposalDraft,
  writeProposalDraft,
  type ProposalDraftSnapshot,
} from '../proposalDraft';
import type { ProposalCardData } from '../proposalTypes';
import { db } from '../../../lib/db';

function mkCard(): ProposalCardData {
  return {
    kind: 'balanced',
    title: 'Balanced',
    totalSeconds: 600,
    blocks: [
      {
        moduleRef: 'production',
        moduleLabel: 'production',
        moduleAccentHex: '#3a4875',
        activityDescription: '1 chord type',
        plannedSeconds: 600,
        whySnippet: 'why',
        itemRefs: ['wf-01'],
        isWarmup: false,
      },
    ],
  };
}

const snapshot: ProposalDraftSnapshot = {
  proposals: [mkCard()],
  lastInputs: null,
  behindPaceNotices: [],
  activePath: null,
  abundanceReason: null,
};

describe('proposalDraft persistence', () => {
  beforeEach(async () => {
    await db.proposalDraft.clear();
  });

  it('returns null when nothing is persisted', async () => {
    expect(await readProposalDraft()).toBeNull();
  });

  it('round-trips a snapshot through write → read', async () => {
    await writeProposalDraft(snapshot);
    const restored = await readProposalDraft();
    expect(restored).not.toBeNull();
    expect(restored!.proposals).toHaveLength(1);
    expect(restored!.proposals[0].blocks[0].itemRefs).toEqual(['wf-01']);
    expect(restored!.proposals[0].title).toBe('Balanced');
  });

  it('clear removes the draft (single-row, latest write wins)', async () => {
    await writeProposalDraft(snapshot);
    await writeProposalDraft({ ...snapshot, proposals: [] });
    // Single 'current' row — the second write overwrote the first.
    expect(await db.proposalDraft.count()).toBe(1);
    await clearProposalDraft();
    expect(await readProposalDraft()).toBeNull();
  });
});
