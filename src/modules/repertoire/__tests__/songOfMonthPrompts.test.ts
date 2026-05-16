// @vitest-environment jsdom
/**
 * Unit tests for evaluateSongOfMonthPrompts.
 *
 *   · Congrats: fires once per songId across statuses.
 *   · TBD nudge: fires once per local-day-per-umbrella; re-fires
 *     the next day when conditions still hold.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type Goal,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../../lib/db';
import { PROMPT_TYPE } from '../../../lib/prompts/types';
import { SONG_OF_MONTH_METRIC } from '../songOfMonth';
import {
  evaluateSongComfortablePathPrompts,
  evaluateSongOfMonthPrompts,
} from '../songOfMonthPrompts';

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const UMBRELLA_ID = 'u-rep';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

function spotlightSongChild(songId: string): Goal {
  return {
    id: 'c-spotlight',
    scope: 'monthly',
    description: '',
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

function tbdSlotChild(slotIndex: number): Goal {
  return {
    id: `c-slot-${slotIndex}`,
    scope: 'monthly',
    description: '',
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
    targetUnit: 'tbd',
    relatedItems: [],
    lastEngagedAt: null,
    currentValue: 0,
  };
}

function song(id: string): Song {
  return {
    id,
    title: 'Song ' + id,
    artist: '',
    stage: 'learning',
    audioLinks: [],
    addedDate: NOW,
    learningOrder: 1,
  };
}

function songKey(id: string, songId: string, isOriginalKey = true): SongKey {
  return {
    id,
    songId,
    keyName: 'C',
    isOriginalKey,
    keyState: 'not_started',
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    lastEngagedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function songCell(
  id: string,
  songId: string,
  songKeyId: string,
  cellState: SongCell['cellState'],
  sectionId = 'sec-1',
): SongCell {
  return {
    id,
    songId,
    sectionId,
    songKeyId,
    cellState,
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** The comfortable predicates denominate by non-archived matrix
 *  sections, so every cell fixture needs a matching section row. */
function matrixSection(
  id: string,
  songId: string,
  displayOrder = 0,
): SongMatrixSection {
  return {
    id,
    songId,
    name: id,
    displayOrder,
    isArchived: false,
    splitFromSectionId: null,
    songSectionId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(async () => {
  await db.goals.clear();
  await db.songs.clear();
  await db.songKeys.clear();
  await db.songCells.clear();
  await db.songMatrixSections.clear();
  await db.prompts.clear();
});

// -------------------------------------------------------------
// CONGRATS
// -------------------------------------------------------------

describe('evaluateSongOfMonthPrompts — congrats', () => {
  it('does nothing when no umbrella exists', async () => {
    await evaluateSongOfMonthPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('does nothing when spotlight is not yet comfortable', async () => {
    await db.songs.add(song('s1'));
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.bulkAdd([
      matrixSection('sec-1', 's1', 0),
      matrixSection('sec-2', 's1', 1),
    ]);
    await db.songCells.bulkAdd([
      songCell('c1', 's1', 'k1', 'comfortable', 'sec-1'),
      songCell('c2', 's1', 'k1', 'learning', 'sec-2'),
    ]);
    await db.goals.bulkAdd([umbrella(), spotlightSongChild('s1')]);
    await evaluateSongOfMonthPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('enqueues a high-tier congrats when spotlight reaches comfortable', async () => {
    await db.songs.add(song('s1'));
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.bulkAdd([
      matrixSection('sec-1', 's1', 0),
      matrixSection('sec-2', 's1', 1),
    ]);
    await db.songCells.bulkAdd([
      songCell('c1', 's1', 'k1', 'comfortable', 'sec-1'),
      songCell('c2', 's1', 'k1', 'comfortable', 'sec-2'),
    ]);
    await db.goals.bulkAdd([umbrella(), spotlightSongChild('s1')]);

    await evaluateSongOfMonthPrompts(NOW + 1);

    const prompts = await db.prompts.toArray();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({
      promptType: PROMPT_TYPE.SONG_OF_MONTH_CONGRATS,
      tier: 'high',
      surface: 'banner',
      status: 'queued',
    });
    expect(prompts[0].payload).toMatchObject({
      songId: 's1',
      umbrellaGoalId: UMBRELLA_ID,
    });
  });

  it('does not re-enqueue congrats when one already exists for the same song', async () => {
    await db.songs.add(song('s1'));
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.add(matrixSection('sec-1', 's1', 0));
    await db.songCells.add(songCell('c1', 's1', 'k1', 'comfortable', 'sec-1'));
    await db.goals.bulkAdd([umbrella(), spotlightSongChild('s1')]);

    await evaluateSongOfMonthPrompts(NOW + 1);
    await evaluateSongOfMonthPrompts(NOW + 100);

    expect(await db.prompts.count()).toBe(1);
  });

  it('re-enqueues congrats for a different spotlight song', async () => {
    await db.songs.bulkAdd([song('s1'), song('s2')]);
    await db.songKeys.bulkAdd([songKey('k1', 's1'), songKey('k2', 's2')]);
    await db.songMatrixSections.bulkAdd([
      matrixSection('sec-s1', 's1', 0),
      matrixSection('sec-s2', 's2', 0),
    ]);
    await db.songCells.bulkAdd([
      songCell('c1', 's1', 'k1', 'comfortable', 'sec-s1'),
      songCell('c2', 's2', 'k2', 'comfortable', 'sec-s2'),
    ]);

    // First spotlight = s1.
    await db.goals.bulkAdd([umbrella(), spotlightSongChild('s1')]);
    await evaluateSongOfMonthPrompts(NOW + 1);

    // Pretend the queue advanced — now s2 is the spotlight.
    await db.goals.delete('c-spotlight');
    await db.goals.add({ ...spotlightSongChild('s2'), id: 'c-spotlight-2' });
    await evaluateSongOfMonthPrompts(NOW + 2);

    const prompts = await db.prompts.toArray();
    expect(prompts).toHaveLength(2);
    const songIds = prompts.map(p => p.payload.songId).sort();
    expect(songIds).toEqual(['s1', 's2']);
  });
});

// -------------------------------------------------------------
// TBD NUDGE
// -------------------------------------------------------------

describe('evaluateSongOfMonthPrompts — tbd nudge', () => {
  async function setupHalfComfortableSpotlightWithTbdNext() {
    await db.songs.add(song('s1'));
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.bulkAdd([
      matrixSection('sec-1', 's1', 0),
      matrixSection('sec-2', 's1', 1),
    ]);
    // 2 sections: 1 comfortable, 1 learning → ratio = 0.5.
    await db.songCells.bulkAdd([
      songCell('c1', 's1', 'k1', 'comfortable', 'sec-1'),
      songCell('c2', 's1', 'k1', 'learning', 'sec-2'),
    ]);
    await db.goals.bulkAdd([
      umbrella(),
      spotlightSongChild('s1'),
      tbdSlotChild(2),
    ]);
  }

  it('does nothing when next slot is not TBD', async () => {
    await db.songs.bulkAdd([song('s1'), song('s2')]);
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.bulkAdd([
      matrixSection('sec-1', 's1', 0),
      matrixSection('sec-2', 's1', 1),
    ]);
    await db.songCells.bulkAdd([
      songCell('c1', 's1', 'k1', 'comfortable', 'sec-1'),
      songCell('c2', 's1', 'k1', 'learning', 'sec-2'),
    ]);
    await db.goals.bulkAdd([
      umbrella(),
      spotlightSongChild('s1'),
      // Slot 2 is a specific song — not TBD.
      {
        ...tbdSlotChild(2),
        targetUnit: 'song',
        relatedItems: ['s2'],
      },
    ]);
    await evaluateSongOfMonthPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('does nothing when spotlight is below 50% comfortable', async () => {
    await db.songs.add(song('s1'));
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.bulkAdd([
      matrixSection('sec-1', 's1', 0),
      matrixSection('sec-2', 's1', 1),
      matrixSection('sec-3', 's1', 2),
    ]);
    // 1 of 3 sections comfortable → ratio = 0.33.
    await db.songCells.bulkAdd([
      songCell('c1', 's1', 'k1', 'comfortable', 'sec-1'),
      songCell('c2', 's1', 'k1', 'learning', 'sec-2'),
      songCell('c3', 's1', 'k1', 'learning', 'sec-3'),
    ]);
    await db.goals.bulkAdd([
      umbrella(),
      spotlightSongChild('s1'),
      tbdSlotChild(2),
    ]);
    await evaluateSongOfMonthPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('enqueues medium-tier nudge when ratio >= 0.5 AND next is TBD', async () => {
    await setupHalfComfortableSpotlightWithTbdNext();
    await evaluateSongOfMonthPrompts(NOW + 1);
    const prompts = await db.prompts.toArray();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({
      promptType: PROMPT_TYPE.SONG_OF_MONTH_TBD_NUDGE,
      tier: 'medium',
      surface: 'banner',
    });
    expect(prompts[0].payload.umbrellaGoalId).toBe(UMBRELLA_ID);
  });

  it('does not re-enqueue on a second call the same day', async () => {
    await setupHalfComfortableSpotlightWithTbdNext();
    await evaluateSongOfMonthPrompts(NOW + 1);
    await evaluateSongOfMonthPrompts(NOW + 100);
    expect(await db.prompts.count()).toBe(1);
  });

  it('re-enqueues on the next local day when conditions still hold', async () => {
    await setupHalfComfortableSpotlightWithTbdNext();
    await evaluateSongOfMonthPrompts(NOW + 1);
    // Advance by ~26 hours to roll the local-day key forward.
    await evaluateSongOfMonthPrompts(NOW + 26 * 60 * 60 * 1000);
    expect(await db.prompts.count()).toBe(2);
  });

  it('does not re-enqueue across midnight when conditions no longer hold', async () => {
    await setupHalfComfortableSpotlightWithTbdNext();
    await evaluateSongOfMonthPrompts(NOW + 1);
    // Flip the TBD slot to a specific song before the next call.
    await db.goals.update('c-slot-2', {
      targetUnit: 'song',
      relatedItems: ['s-some-song'],
    });
    await evaluateSongOfMonthPrompts(NOW + ONE_DAY_MS + 1000);
    expect(await db.prompts.count()).toBe(1);
  });
});

// -------------------------------------------------------------
// NON-SPOTLIGHT COMFORTABLE PATH CHOICE
// -------------------------------------------------------------

describe('evaluateSongComfortablePathPrompts', () => {
  /** Build a song that satisfies the comfortable-in-original-key
   *  predicate: one original-key songKey row + one non-archived
   *  section + one comfortable cell at that section + key. */
  async function seedComfortableSong(songId: string, keyId: string) {
    await db.songs.add(song(songId));
    await db.songKeys.add(songKey(keyId, songId));
    await db.songMatrixSections.add(matrixSection(`sec-${songId}`, songId, 0));
    await db.songCells.add(
      songCell(`c-${songId}`, songId, keyId, 'comfortable', `sec-${songId}`),
    );
  }

  it('does nothing when no songs exist', async () => {
    await evaluateSongComfortablePathPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('does nothing when songs exist but none are comfortable', async () => {
    await db.songs.add(song('s1'));
    await db.songKeys.add(songKey('k1', 's1'));
    await db.songMatrixSections.add(matrixSection('sec-1', 's1', 0));
    await db.songCells.add(songCell('c1', 's1', 'k1', 'learning', 'sec-1'));
    await evaluateSongComfortablePathPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('enqueues a high-tier path-choice prompt for a comfortable non-spotlight song', async () => {
    await seedComfortableSong('s1', 'k1');
    // No umbrella → spotlight is null → every comfortable song
    // becomes eligible.
    await evaluateSongComfortablePathPrompts(NOW + 1);
    const prompts = await db.prompts.toArray();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({
      promptType: PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE,
      tier: 'high',
      surface: 'banner',
      status: 'queued',
    });
    expect(prompts[0].payload).toMatchObject({
      songId: 's1',
      songTitle: 'Song s1',
    });
  });

  it('skips the active SotM spotlight song (handed off to the SotM evaluator)', async () => {
    await seedComfortableSong('s1', 'k1');
    await db.goals.bulkAdd([umbrella(), spotlightSongChild('s1')]);
    await evaluateSongComfortablePathPrompts(NOW + 1);
    // s1 is the spotlight → the SotM evaluator owns this case, the
    // path-choice evaluator must not enqueue a duplicate prompt.
    const prompts = await db.prompts
      .where('promptType').equals(PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE)
      .toArray();
    expect(prompts).toHaveLength(0);
  });

  it('fires for a non-spotlight comfortable song while another song is the spotlight', async () => {
    await seedComfortableSong('s1', 'k1'); // spotlight
    await seedComfortableSong('s2', 'k2'); // non-spotlight, also comfy
    await db.goals.bulkAdd([umbrella(), spotlightSongChild('s1')]);
    await evaluateSongComfortablePathPrompts(NOW + 1);
    const prompts = await db.prompts
      .where('promptType').equals(PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE)
      .toArray();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].payload.songId).toBe('s2');
  });

  it('skips songs that already have progressionPath set', async () => {
    await seedComfortableSong('s1', 'k1');
    await db.songs.update('s1', { progressionPath: 'deepen' });
    await evaluateSongComfortablePathPrompts(NOW + 1);
    expect(await db.prompts.count()).toBe(0);
  });

  it('dedupes per songId across calls (no second enqueue while a non-expired prompt exists)', async () => {
    await seedComfortableSong('s1', 'k1');
    await evaluateSongComfortablePathPrompts(NOW + 1);
    await evaluateSongComfortablePathPrompts(NOW + 100);
    expect(await db.prompts.count()).toBe(1);
  });

  it('serialises concurrent calls — no duplicate prompts for the same songId', async () => {
    // React StrictMode double-invokes useEffect in dev, firing the
    // evaluator twice in quick succession on every PracticeSessions
    // / Goals mount. Without an in-flight guard the two calls race
    // the per-songId dedupe check — both see no existing prompt and
    // both enqueue. The duplicate then breaks banner dismiss:
    // markEngaged acks one prompt, useLiveBanner picks up the
    // still-queued sibling, and the banner persists.
    await seedComfortableSong('s1', 'k1');
    await Promise.all([
      evaluateSongComfortablePathPrompts(NOW + 1),
      evaluateSongComfortablePathPrompts(NOW + 1),
    ]);
    const prompts = await db.prompts
      .where('promptType').equals(PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE)
      .toArray();
    expect(prompts).toHaveLength(1);
  });

  it('enqueues one prompt per comfortable non-spotlight song', async () => {
    await seedComfortableSong('s1', 'k1');
    await seedComfortableSong('s2', 'k2');
    await seedComfortableSong('s3', 'k3');
    await evaluateSongComfortablePathPrompts(NOW + 1);
    const prompts = await db.prompts
      .where('promptType').equals(PROMPT_TYPE.SONG_COMFORTABLE_PATH_CHOICE)
      .toArray();
    expect(prompts.map(p => p.payload.songId).sort()).toEqual(
      ['s1', 's2', 's3'],
    );
  });
});
