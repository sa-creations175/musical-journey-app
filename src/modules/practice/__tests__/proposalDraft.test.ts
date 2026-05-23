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
        id: 'b1',
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
  view: 'proposal',
  proposals: [mkCard()],
  lastInputs: null,
  behindPaceNotices: [],
  activePath: null,
  abundanceReason: null,
  initialDayProfile: null,
  initialTimeMinutes: null,
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

  it('round-trips the goals-need view (no proposals)', async () => {
    await writeProposalDraft({ ...snapshot, view: 'goals-need', proposals: [] });
    const restored = await readProposalDraft();
    expect(restored!.view).toBe('goals-need');
    expect(restored!.proposals).toHaveLength(0);
  });

  it('round-trips the captured view + questionnaire seeds', async () => {
    await writeProposalDraft({
      ...snapshot,
      view: 'questionnaire',
      proposals: [],
      initialDayProfile: 'deep',
      initialTimeMinutes: 45,
    });
    const restored = await readProposalDraft();
    expect(restored!.view).toBe('questionnaire');
    expect(restored!.proposals).toHaveLength(0);
    expect(restored!.initialDayProfile).toBe('deep');
    expect(restored!.initialTimeMinutes).toBe(45);
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
