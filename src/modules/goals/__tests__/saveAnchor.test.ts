// @vitest-environment jsdom
/**
 * Phase 2 step 5g — integration tests for saveAnchor + the trigger
 * detection round-trip.
 *
 * Three layers:
 *
 *   1. Create-mode shape — fresh save writes 1 umbrella + N
 *      children with shared parent_goal_id, scope='yearly',
 *      umbrella.isUmbrella=true, children.isUmbrella=false, and
 *      every other field correct.
 *
 *   2. Edit-mode delete-and-recreate — pre-seed an umbrella +
 *      children, save a different draft over it, verify previous
 *      children are gone and new children are written under the
 *      reused umbrella id.
 *
 *   3. Trigger detection round-trip — save an anchor, then call
 *      anchorExistsForModule for that module → returns true.
 *
 * fake-indexeddb backs the real `db` so writes hit a real Dexie
 * transaction. Sync hooks are not auto-installed in tests, so
 * writes don't touch a remote.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  saveAnchor,
  type AnchorDraft,
  type EarTrainingAnchor,
  type SaveAnchorOpts,
} from '../YearlyAnchorFlow';
import { anchorExistsForModule } from '../yearlyAnchorTrigger';

const YEAR = 2026;
const NOW  = new Date(2026, 4, 15, 12, 0, 0).getTime();  // May 15, 2026 noon

let counter = 0;
function deterministicUid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(4, '0')}`;
}

const baseOpts: SaveAnchorOpts = {
  now: NOW,
  year: YEAR,
  uidFactory: deterministicUid,
};

function etDraft(et: Partial<EarTrainingAnchor> = {}): AnchorDraft {
  const fullEt: EarTrainingAnchor = {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
    ...et,
  };
  return { moduleId: 'ear-training', name: null, earTraining: fullEt };
}

beforeEach(async () => {
  counter = 0;
  await db.goals.clear();
});

// -------------------------------------------------------------------
// Create-mode shape
// -------------------------------------------------------------------

describe('saveAnchor — create mode shape', () => {
  it('writes 1 umbrella + 2 children for an ET all-defaults draft (no consistency child)', async () => {
    // 7e decision: consistency dimension no longer encoded as a
    // child record. ET all-defaults yields Breadth + Depth = 2.
    const result = await saveAnchor(etDraft(), baseOpts);
    expect(result).not.toBeNull();
    expect(result!.umbrella.isUmbrella).toBe(true);
    expect(result!.children).toHaveLength(2);

    // Persisted to db.goals
    const all = await db.goals.toArray();
    expect(all).toHaveLength(3);  // 1 umbrella + 2 children
    const umbrella = all.find(g => g.isUmbrella)!;
    const children = all.filter(g => !g.isUmbrella);
    expect(children).toHaveLength(2);
    expect(children.every(c => c.parentGoalId === umbrella.id)).toBe(true);
  });

  it('umbrella has scope=yearly, status=active, currentValue=0', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    const u = result!.umbrella;
    expect(u.scope).toBe('yearly');
    expect(u.status).toBe('active');
    expect(u.currentValue).toBe(0);
    expect(u.targetMetric).toBeNull();
    expect(u.targetValue).toBeNull();
    expect(u.targetUnit).toBeNull();
    expect(u.parentGoalId).toBeNull();
  });

  it('umbrella description falls back to the ET vision statement when draft.name is null', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    expect(result!.umbrella.description).toBe(
      'Make music speak to me — intervals, chords, progressions, all of it.',
    );
  });

  it('umbrella description uses draft.name when provided', async () => {
    const result = await saveAnchor(
      { ...etDraft(), name: 'My Ear Training Year' },
      baseOpts,
    );
    expect(result!.umbrella.description).toBe('My Ear Training Year');
  });

  it('empty / whitespace draft.name falls back to vision statement', async () => {
    const result = await saveAnchor({ ...etDraft(), name: '   ' }, baseOpts);
    expect(result!.umbrella.description).toBe(
      'Make music speak to me — intervals, chords, progressions, all of it.',
    );
  });

  it('children all share scope=yearly, status=active, parentGoalId=umbrella, isUmbrella=false', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    for (const child of result!.children) {
      expect(child.scope).toBe('yearly');
      expect(child.status).toBe('active');
      expect(child.parentGoalId).toBe(result!.umbrella.id);
      expect(child.isUmbrella).toBe(false);
      expect(child.currentValue).toBe(0);
      expect(child.lastEngagedAt).toBeNull();
    }
  });

  it('umbrella + children carry the moduleId in relatedModules', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    expect(result!.umbrella.relatedModules).toEqual(['ear-training']);
    for (const child of result!.children) {
      expect(child.relatedModules).toEqual(['ear-training']);
    }
  });

  it('targetDate is end-of-year for both umbrella and children', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    const eoy = new Date(2026, 11, 31, 23, 59, 59, 999).getTime();
    expect(result!.umbrella.targetDate).toBe(eoy);
    for (const child of result!.children) {
      expect(child.targetDate).toBe(eoy);
    }
  });

  it('startDate is `now` and lastEngagedAt is `now` on create', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    expect(result!.umbrella.startDate).toBe(NOW);
    expect(result!.umbrella.lastEngagedAt).toBe(NOW);
  });

  it('all child ids are distinct', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    const ids = result!.children.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns null when the draft produces zero dimension records', async () => {
    // An anchor draft with no module slot populated — defensive.
    const emptyDraft: AnchorDraft = { moduleId: 'ear-training', name: null };
    const result = await saveAnchor(emptyDraft, baseOpts);
    expect(result).toBeNull();
    // db.goals should not have been touched.
    expect(await db.goals.count()).toBe(0);
  });

  it('produces 3 records when Mastery is also populated (Breadth + Mastery + Depth, no consistency child)', async () => {
    const result = await saveAnchor(
      etDraft({ mastery: { groupIds: ['intervals', 'chord-recognition'] } }),
      baseOpts,
    );
    expect(result!.children).toHaveLength(3);
    const masteryChild = result!.children.find(c => c.targetMetric?.includes('mastery'));
    expect(masteryChild).toBeDefined();
    expect(masteryChild!.relatedItems).toEqual(['intervals', 'chord-recognition']);
  });
});

// -------------------------------------------------------------------
// Edit-mode delete-and-recreate
// -------------------------------------------------------------------

describe('saveAnchor — edit-mode delete-and-recreate', () => {
  it('reuses umbrella id and replaces children', async () => {
    // First save: 2 children (Breadth + Depth; no consistency
    // child per 7e decision).
    const first = await saveAnchor(etDraft(), baseOpts);
    expect(first!.children).toHaveLength(2);
    const originalUmbrellaId = first!.umbrella.id;

    // Second save with mastery added → 3 children. Same umbrella.
    const second = await saveAnchor(
      etDraft({ mastery: { groupIds: ['intervals'] } }),
      { ...baseOpts, initialAnchor: first!.umbrella, now: NOW + 1000 },
    );
    expect(second!.umbrella.id).toBe(originalUmbrellaId);
    expect(second!.children).toHaveLength(3);

    // Persisted state: 1 umbrella + 3 children = 4 total. The
    // original 2 children are GONE (ids not reused), replaced by 3
    // fresh children.
    const all = await db.goals.toArray();
    expect(all).toHaveLength(4);
    const persistedChildren = all.filter(g => !g.isUmbrella);
    expect(persistedChildren).toHaveLength(3);
    const originalChildIds = first!.children.map(c => c.id);
    for (const ocid of originalChildIds) {
      expect(persistedChildren.find(c => c.id === ocid)).toBeUndefined();
    }
  });

  it('preserves umbrella currentValue / startDate / status / lastEngagedAt across edits', async () => {
    const first = await saveAnchor(etDraft(), baseOpts);

    // Simulate Phase 5 setting the umbrella's currentValue and
    // bumping lastEngagedAt out-of-band (between saves).
    await db.goals.update(first!.umbrella.id, {
      currentValue: 47,
      lastEngagedAt: NOW + 5000,
      status: 'paused',
    });

    const updated = await db.goals.get(first!.umbrella.id) as Goal;
    const second = await saveAnchor(
      etDraft({ depth: { accuracyPercent: 90 } }),
      { ...baseOpts, initialAnchor: updated, now: NOW + 10000 },
    );
    expect(second!.umbrella.currentValue).toBe(47);
    expect(second!.umbrella.startDate).toBe(first!.umbrella.startDate);
    expect(second!.umbrella.lastEngagedAt).toBe(NOW + 5000);
    expect(second!.umbrella.status).toBe('paused');
  });

  it('shrinking the dimension set deletes the orphaned children', async () => {
    // First save with 3 children (Breadth + Mastery + Depth;
    // no consistency child per 7e decision).
    const first = await saveAnchor(
      etDraft({ mastery: { groupIds: ['intervals', 'chord-recognition'] } }),
      baseOpts,
    );
    expect(first!.children).toHaveLength(3);

    // Second save: drop Mastery → 2 children (Breadth + Depth).
    const second = await saveAnchor(
      etDraft({ mastery: { groupIds: [] } }),
      { ...baseOpts, initialAnchor: first!.umbrella },
    );
    expect(second!.children).toHaveLength(2);

    const all = await db.goals.toArray();
    expect(all).toHaveLength(3);  // 1 umbrella + 2 children
    expect(all.filter(g => g.targetMetric?.includes('mastery'))).toHaveLength(0);
  });

  it('idempotent re-save produces the same row count', async () => {
    const first = await saveAnchor(etDraft(), baseOpts);
    const firstCount = await db.goals.count();

    const second = await saveAnchor(etDraft(), {
      ...baseOpts,
      initialAnchor: first!.umbrella,
    });
    const secondCount = await db.goals.count();

    expect(secondCount).toBe(firstCount);
    expect(second!.umbrella.id).toBe(first!.umbrella.id);
    // Children get fresh ids on each save (delete-and-recreate is
    // destructive); the COUNT is stable but the ids are not.
  });
});

// -------------------------------------------------------------------
// Trigger detection round-trip
// -------------------------------------------------------------------

describe('saveAnchor + anchorExistsForModule round-trip', () => {
  it('save then detect: anchor exists for the saved module', async () => {
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(false);
    await saveAnchor(etDraft(), baseOpts);
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(true);
  });

  it('saving for one module does not satisfy the detection for a different module', async () => {
    await saveAnchor(etDraft(), baseOpts);
    expect(await anchorExistsForModule('production', YEAR)).toBe(false);
    expect(await anchorExistsForModule('harmonic-fluency', YEAR)).toBe(false);
  });

  it('an abandoned umbrella does not satisfy the detection', async () => {
    const result = await saveAnchor(etDraft(), baseOpts);
    await db.goals.update(result!.umbrella.id, { status: 'abandoned' });
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(false);
  });

  it('two saves for two modules → both detect true', async () => {
    await saveAnchor(etDraft(), baseOpts);
    await saveAnchor(
      {
        moduleId: 'practice-consistency',
        name: null,
        practiceConsistency: { weeklyFloor: 4, monthlyFloor: 18, aspiration: 5 },
      },
      baseOpts,
    );
    expect(await anchorExistsForModule('ear-training', YEAR)).toBe(true);
    expect(await anchorExistsForModule('practice-consistency', YEAR)).toBe(true);
    expect(await anchorExistsForModule('production', YEAR)).toBe(false);
  });
});

// -------------------------------------------------------------------
// Per-module smoke (defensive — the encoder is already
// exhaustively tested in encodeDimensionRecords.test.ts; here we
// just confirm the save persists what the encoder produced)
// -------------------------------------------------------------------

describe('saveAnchor — per-module smoke', () => {
  it('saves a Practice consistency anchor with 3 dimension records', async () => {
    const result = await saveAnchor(
      {
        moduleId: 'practice-consistency',
        name: null,
        practiceConsistency: { weeklyFloor: 4, monthlyFloor: 18, aspiration: 5 },
      },
      baseOpts,
    );
    expect(result!.children).toHaveLength(3);
    expect(result!.umbrella.description).toBe(
      'Show up every day. Make music practice as natural as breathing.',
    );
  });

  it('Songs anchor with all-zero counts no longer saves (consistency-only is not a writable anchor)', async () => {
    // Per 7e decision, consistency isn't a child record. So a
    // songs anchor with all-zero breadth/depth/mastery counts
    // has nothing to encode and saveAnchor returns null. The
    // user has to set at least one numeric ambition.
    const result = await saveAnchor(
      {
        moduleId: 'repertoire',
        name: null,
        songRepertoire: {
          breadthCount: 0, depthCount: 0, masteryCount: 0,
          consistency: { count: 4, cadence: 'week' },
        },
      },
      baseOpts,
    );
    expect(result).toBeNull();
  });

  it('saves a Production anchor (Breadth only — no Mastery, no Depth, no Consistency child)', async () => {
    const result = await saveAnchor(
      {
        moduleId: 'production',
        name: null,
        production: {
          breadth: { kind: 'all' },
          depth: { pathIds: [] },
          consistency: { count: 2, cadence: 'week' },
        },
      },
      baseOpts,
    );
    expect(result!.children).toHaveLength(1);
    expect(result!.children.every(c => !c.targetMetric?.includes('mastery'))).toBe(true);
  });
});
