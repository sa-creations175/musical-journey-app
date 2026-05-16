// @vitest-environment jsdom
/**
 * Unit tests for songOfMonth queue parsing + advancement.
 *
 * Builds a Repertoire monthly umbrella + N child rows in fake-
 * indexeddb, calls loadActiveSpotlight / advanceSpotlightQueue,
 * and verifies the resulting state. Pins the storage encoding so a
 * future schema change has to update these fixtures explicitly.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type Goal,
  type Song,
  type WantToLearnEntry,
} from '../../../lib/db';
import {
  SONG_OF_MONTH_METRIC,
  advanceSpotlightQueue,
  loadActiveSpotlight,
} from '../songOfMonth';

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const UMBRELLA_ID = 'u-rep-2026';

function umbrella(): Goal {
  return {
    id: UMBRELLA_ID,
    scope: 'monthly',
    description: 'Repertoire month',
    contextTag: null,
    relatedModules: ['repertoire'],
    startDate: NOW,
    targetDate: FUTURE,
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: true,
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    relatedItems: [],
    lastEngagedAt: null,
    currentValue: 0,
  };
}

function childSpecific(id: string, songId: string): Goal {
  return {
    id,
    scope: 'monthly',
    description: 'spotlight',
    contextTag: null,
    relatedModules: ['repertoire'],
    startDate: NOW,
    targetDate: FUTURE,
    status: 'active',
    parentGoalId: UMBRELLA_ID,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    targetMetric: 'song_whole_at_level',
    targetValue: null,
    targetUnit: 'comfortable',
    relatedItems: [songId],
    lastEngagedAt: null,
    currentValue: 0,
  };
}

function childSongOfMonth(
  id: string,
  slotIndex: number,
  kind: 'song' | 'wtl' | 'tbd',
  refId: string | null,
): Goal {
  return {
    id,
    scope: 'monthly',
    description: `queue ${slotIndex}`,
    contextTag: null,
    relatedModules: ['repertoire'],
    startDate: NOW,
    targetDate: FUTURE,
    status: 'active',
    parentGoalId: UMBRELLA_ID,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    targetMetric: SONG_OF_MONTH_METRIC,
    targetValue: slotIndex,
    targetUnit: kind,
    relatedItems: kind === 'tbd' || !refId ? [] : [refId],
    lastEngagedAt: null,
    currentValue: 0,
  };
}

function song(id: string, title: string): Song {
  return {
    id,
    title,
    artist: '',
    stage: 'learning',
    audioLinks: [],
    addedDate: NOW,
    learningOrder: 1,
  };
}

function wtl(id: string, title: string): WantToLearnEntry {
  return {
    id,
    title,
    artist: '',
    priority: 'medium',
    tags: [],
    addedDate: NOW,
  };
}

beforeEach(async () => {
  await db.goals.clear();
  await db.songs.clear();
  await db.wantToLearn.clear();
  await db.songSections.clear();
});

// -------------------------------------------------------------
// loadActiveSpotlight
// -------------------------------------------------------------

describe('loadActiveSpotlight', () => {
  it('returns null when no active Repertoire monthly umbrella exists', async () => {
    expect(await loadActiveSpotlight(NOW + 1)).toBeNull();
  });

  it('returns null when the umbrella has only non-queue children (days target)', async () => {
    await db.goals.bulkAdd([
      umbrella(),
      {
        ...umbrella(),
        id: 'days-child',
        parentGoalId: UMBRELLA_ID,
        isUmbrella: false,
        targetMetric: 'repertoire_days_per_cadence',
        targetValue: 6,
        targetUnit: 'week',
        description: 'days target',
        relatedItems: [],
      },
    ]);
    expect(await loadActiveSpotlight(NOW + 1)).toBeNull();
  });

  it('parses a legacy single-song umbrella as slot-1 specific', async () => {
    await db.songs.add(song('song-1', 'Take Me to the King'));
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
    ]);
    const result = await loadActiveSpotlight(NOW + 1);
    expect(result).not.toBeNull();
    expect(result!.umbrellaGoalId).toBe(UMBRELLA_ID);
    expect(result!.slots).toHaveLength(1);
    expect(result!.slots[0]).toMatchObject({
      slotIndex: 1,
      kind: 'song',
      refId: 'song-1',
      displayTitle: 'Take Me to the King',
    });
    expect(result!.spotlight?.refId).toBe('song-1');
  });

  it('parses a full 3-slot queue with mixed payload kinds', async () => {
    await db.songs.add(song('song-1', 'Spotlight Song'));
    await db.songs.add(song('song-3', 'Slot Three Song'));
    await db.wantToLearn.add(wtl('wtl-2', 'Queued WTL Song'));
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
      childSongOfMonth('c2', 2, 'wtl', 'wtl-2'),
      childSongOfMonth('c3', 3, 'song', 'song-3'),
    ]);
    const result = await loadActiveSpotlight(NOW + 1);
    expect(result).not.toBeNull();
    expect(result!.slots).toHaveLength(3);
    expect(result!.slots.map(s => s.slotIndex)).toEqual([1, 2, 3]);
    expect(result!.slots[0].kind).toBe('song');
    expect(result!.slots[0].displayTitle).toBe('Spotlight Song');
    expect(result!.slots[1].kind).toBe('wtl');
    expect(result!.slots[1].displayTitle).toBe('Queued WTL Song');
    expect(result!.slots[2].kind).toBe('song');
    expect(result!.slots[2].displayTitle).toBe('Slot Three Song');
  });

  it('marks TBD slot 1 (no specific spotlight yet)', async () => {
    await db.goals.bulkAdd([
      umbrella(),
      childSongOfMonth('c1', 1, 'tbd', null),
    ]);
    const result = await loadActiveSpotlight(NOW + 1);
    expect(result!.slots[0]).toMatchObject({
      slotIndex: 1,
      kind: 'tbd',
      refId: null,
      displayTitle: 'TBD',
    });
  });

  it('renders "(missing)" for a dangling song reference', async () => {
    await db.goals.bulkAdd([
      umbrella(),
      childSongOfMonth('c1', 1, 'song', 'song-missing'),
    ]);
    const result = await loadActiveSpotlight(NOW + 1);
    expect(result!.slots[0].displayTitle).toBe('(missing)');
  });

  it('picks the most-recent umbrella when multiple match', async () => {
    await db.songs.bulkAdd([
      song('s-old', 'Old'),
      song('s-new', 'New'),
    ]);
    await db.goals.bulkAdd([
      { ...umbrella(), id: 'u-old', startDate: NOW - 1000 },
      { ...umbrella(), id: 'u-new', startDate: NOW + 1000 },
      { ...childSpecific('c-old', 's-old'), parentGoalId: 'u-old' },
      { ...childSpecific('c-new', 's-new'), parentGoalId: 'u-new' },
    ]);
    const result = await loadActiveSpotlight(NOW + 2000);
    expect(result!.umbrellaGoalId).toBe('u-new');
    expect(result!.spotlight!.refId).toBe('s-new');
  });

  it('skips expired umbrellas', async () => {
    await db.songs.add(song('s1', 'Expired'));
    await db.goals.bulkAdd([
      {
        ...umbrella(),
        targetDate: NOW - 1000, // already past
      },
      childSpecific('c1', 's1'),
    ]);
    expect(await loadActiveSpotlight(NOW)).toBeNull();
  });
});

// -------------------------------------------------------------
// advanceSpotlightQueue
// -------------------------------------------------------------

describe('advanceSpotlightQueue', () => {
  it('no-ops on a missing umbrella', async () => {
    await advanceSpotlightQueue('missing'); // should not throw
  });

  it('removes the spotlight and promotes a slot-2 song to slot 1', async () => {
    await db.songs.bulkAdd([
      song('song-1', 'Done'),
      song('song-2', 'Next'),
    ]);
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
      childSongOfMonth('c2', 2, 'song', 'song-2'),
    ]);

    await advanceSpotlightQueue(UMBRELLA_ID);

    const result = await loadActiveSpotlight(NOW + 1);
    expect(result!.slots).toHaveLength(1);
    expect(result!.slots[0]).toMatchObject({
      slotIndex: 1,
      kind: 'song',
      refId: 'song-2',
    });
    // The new slot 1 goal should now use song_whole_at_level.
    const newSlot1 = await db.goals.get('c2');
    expect(newSlot1?.targetMetric).toBe('song_whole_at_level');
    expect(newSlot1?.targetValue).toBeNull();
    expect(newSlot1?.targetUnit).toBe('comfortable');
    expect(newSlot1?.relatedItems).toEqual(['song-2']);
  });

  it('promotes a slot-2 want-to-learn entry into songs + rewrites the goal', async () => {
    await db.songs.add(song('song-1', 'Spotlight'));
    await db.wantToLearn.add(wtl('wtl-2', 'Queued'));
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
      childSongOfMonth('c2', 2, 'wtl', 'wtl-2'),
    ]);

    await advanceSpotlightQueue(UMBRELLA_ID);

    // The WTL entry should be gone.
    expect(await db.wantToLearn.get('wtl-2')).toBeUndefined();
    // A new song record should exist titled 'Queued'.
    const songs = await db.songs.toArray();
    const promoted = songs.find(s => s.title === 'Queued');
    expect(promoted).toBeDefined();
    // The slot-2 goal should now point at the new songId.
    const newSlot1 = await db.goals.get('c2');
    expect(newSlot1?.targetMetric).toBe('song_whole_at_level');
    expect(newSlot1?.relatedItems).toEqual([promoted!.id]);
  });

  it('decrements slot 3 → slot 2 after advance', async () => {
    await db.songs.bulkAdd([
      song('song-1', 'Done'),
      song('song-2', 'Next'),
      song('song-3', 'After Next'),
    ]);
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
      childSongOfMonth('c2', 2, 'song', 'song-2'),
      childSongOfMonth('c3', 3, 'song', 'song-3'),
    ]);

    await advanceSpotlightQueue(UMBRELLA_ID);

    const result = await loadActiveSpotlight(NOW + 1);
    expect(result!.slots).toHaveLength(2);
    expect(result!.slots[0].refId).toBe('song-2');
    expect(result!.slots[1].refId).toBe('song-3');
    // The (previously slot 3) goal should now carry targetValue=2.
    const newSlot2 = await db.goals.get('c3');
    expect(newSlot2?.targetMetric).toBe(SONG_OF_MONTH_METRIC);
    expect(newSlot2?.targetValue).toBe(2);
  });

  it('settles to TBD when the next slot is a dangling wtl ref', async () => {
    await db.songs.add(song('song-1', 'Done'));
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
      childSongOfMonth('c2', 2, 'wtl', 'wtl-missing'),
    ]);

    await advanceSpotlightQueue(UMBRELLA_ID);

    const result = await loadActiveSpotlight(NOW + 1);
    expect(result!.slots[0]).toMatchObject({
      slotIndex: 1,
      kind: 'tbd',
    });
  });

  it('settles to TBD when slot 2 was already TBD', async () => {
    await db.songs.add(song('song-1', 'Done'));
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
      childSongOfMonth('c2', 2, 'tbd', null),
    ]);

    await advanceSpotlightQueue(UMBRELLA_ID);

    const result = await loadActiveSpotlight(NOW + 1);
    expect(result!.slots[0]).toMatchObject({
      slotIndex: 1,
      kind: 'tbd',
      displayTitle: 'TBD',
    });
    const newSlot1 = await db.goals.get('c2');
    expect(newSlot1?.targetMetric).toBe(SONG_OF_MONTH_METRIC);
    expect(newSlot1?.targetValue).toBe(1);
    expect(newSlot1?.targetUnit).toBe('tbd');
  });

  it('leaves the queue empty when advancing a single-slot queue', async () => {
    await db.songs.add(song('song-1', 'Solo'));
    await db.goals.bulkAdd([
      umbrella(),
      childSpecific('c1', 'song-1'),
    ]);

    await advanceSpotlightQueue(UMBRELLA_ID);

    expect(await loadActiveSpotlight(NOW + 1)).toBeNull();
  });
});
