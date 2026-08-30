// @vitest-environment jsdom
/**
 * The session's own rating.
 *
 * It is a rep for the band rule and NOT a drill for the practice log.
 * Those two facts pull in opposite directions, and the split between
 * `write` and `writeSessionRating` is what keeps both true: a session
 * rating must band, and must not bill time or a rep count that no run
 * earned.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type DrillSkill, type DrillType } from '../../../../lib/db';
import { bandVerdictForRow } from '../../../../lib/spacing/row';
import { chordShapeSurface, scaleSurface, songSurface } from '../makeSurfaces';

const SKILL: DrillSkill = {
  id: 'skill-1', kind: 'chord-shape', name: 'Cmaj7',
  quality: 'maj7', keyName: 'C', inversionState: 'root',
} as unknown as DrillSkill;

const TYPE: DrillType = {
  id: 'dt-1', skillId: 'skill-1', name: 'Blocked',
  repCount: 0, totalSeconds: 0,
} as unknown as DrillType;

const shapes = () => chordShapeSurface({
  cellLabel: 'Cmaj7', skillLabel: 'Root · Left',
  skill: SKILL, drillType: TYPE, hand: 'left',
});

beforeEach(async () => {
  await Promise.all([
    db.spacingState.clear(), db.drillSessions.clear(),
    db.drillTypes.clear(), db.drillSkills.clear(),
  ]);
  await db.drillSkills.add(SKILL);
  await db.drillTypes.add(TYPE);
});

describe('it bands like any other rep', () => {
  it('writes a spacing engagement', async () => {
    await shapes().writeSessionRating(3, false, 'ss-test-1');
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(bandVerdictForRow(rows[0])).toEqual({ kind: 'started', tries: 1 });
  });

  it('three practice sessions cap at Developing, however they felt', async () => {
    const s = shapes();
    for (let i = 0; i < 3; i++) await s.writeSessionRating(4, false, 'ss-test-1');
    const row = (await db.spacingState.toArray())[0];
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'developing' });
  });

  it('carries fromTest through, so the cap can be lifted by a test', async () => {
    const s = shapes();
    for (let i = 0; i < 3; i++) await s.writeSessionRating(4, true, 'ss-test-1');
    const row = (await db.spacingState.toArray())[0];
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'mastered' });
  });
});

describe('it is NOT a drill', () => {
  it('writes no drillSession row', async () => {
    await shapes().writeSessionRating(3, false, 'ss-test-1');
    expect(await db.drillSessions.count()).toBe(0);
  });

  it('bills no time and no rep count', async () => {
    // The drills already recorded their own seconds. Putting the
    // session rating through `write` would count them twice.
    await shapes().writeSessionRating(3, false, 'ss-test-1');
    const type = await db.drillTypes.get('dt-1');
    expect(type?.repCount).toBe(0);
    expect(type?.totalSeconds).toBe(0);
  });

  it('a drill DOES bill time — the contrast is the point', async () => {
    await shapes().write({
      ranSeconds: 60, targetSeconds: 60, scope: null,
      style: 'blocked', feel: 3, fromTest: false, sessionId: 'ss-test-1',
    });
    const type = await db.drillTypes.get('dt-1');
    expect(type?.repCount).toBe(1);
    expect(type?.totalSeconds).toBe(60);
    expect(await db.drillSessions.count()).toBe(1);
  });
});

describe('every surface has one', () => {
  it('scales record against their own itemRef', async () => {
    await scaleSurface({
      cellLabel: 'C major', skillLabel: 'Left', itemRef: 'scale:c-major', hand: 'left',
    }).writeSessionRating(2, false, 'ss-test-1');
    const rows = await db.spacingState.toArray();
    expect(rows.map(r => r.itemRef)).toEqual(['scale:c-major']);
    expect(rows[0].hand).toBe('left');
  });

  it('songs write the cell AND the song-and-key clock', async () => {
    await songSurface({
      cellLabel: 'Verse 1 · A♭', skillLabel: '',
      cellId: 'cell-1', songKeyId: 'key-1', songId: 's1', keyName: 'Ab',
      cellIdBySectionId: new Map(), sections: [], onOpenLeadSheet: () => {}, readSessionElapsedMs: () => 0,
      readSessionId: () => 'ss-test-1',
      expectedSectionCount: 1,
      readRunTempo: () => null,
      songTitle: 'No Weapon', spelledKeyName: 'A\u266d',
      renderBadgePreview: () => null,
      readTestStreak: () => 0,
      isRetest: false,
      songTempo: 90,
    }).writeSessionRating(3, false, 'ss-test-1');
    const refs = (await db.spacingState.toArray()).map(r => r.itemRef).sort();
    expect(refs).toEqual(['songCell:cell-1', 'songKey:key-1']);
  });

  it('a song session rating does NOT fan out to other sections', async () => {
    // The sitting's verdict is about the sitting. Only a RUN can say
    // it covered the whole song.
    await songSurface({
      cellLabel: 'Verse 1 · A♭', skillLabel: '',
      cellId: 'cell-1', songKeyId: 'key-1', songId: 's1', keyName: 'Ab',
      cellIdBySectionId: new Map([['sec-a', 'cell-1'], ['sec-b', 'cell-2']]),
      sections: [], onOpenLeadSheet: () => {}, readSessionElapsedMs: () => 0,
      readSessionId: () => 'ss-test-1',
      expectedSectionCount: 1,
      readRunTempo: () => null,
      songTitle: 'No Weapon', spelledKeyName: 'A\u266d',
      renderBadgePreview: () => null,
      readTestStreak: () => 0,
      isRetest: false,
      songTempo: 90,
    }).writeSessionRating(3, false, 'ss-test-1');
    const refs = (await db.spacingState.toArray()).map(r => r.itemRef);
    expect(refs).not.toContain('songCell:cell-2');
  });
});

describe('readVerdict — what the done step reports', () => {
  it('is Not Started before anything is written', async () => {
    expect(await shapes().readVerdict()).toEqual({ kind: 'not-started' });
  });

  it('is the SHARED reader s answer, not a local one', async () => {
    // Three practice sittings at In flow. The done step must say
    // Developing, because the ceiling is the reader's business and the
    // panel does not get its own opinion about it.
    const s = shapes();
    for (let i = 0; i < 3; i++) await s.writeSessionRating(4, false, 'ss-test-1');
    expect(await s.readVerdict()).toEqual({ kind: 'band', band: 'developing' });
  });

  it('reports the CELL for songs, not the schedule', async () => {
    // "Now Reads" is how well the section goes. The song-and-key row
    // is a clock and has no band to show.
    const s = songSurface({
      cellLabel: 'Verse 1 · A♭', skillLabel: '',
      cellId: 'cell-1', songKeyId: 'key-1', songId: 's1', keyName: 'Ab',
      cellIdBySectionId: new Map(), sections: [], onOpenLeadSheet: () => {}, readSessionElapsedMs: () => 0,
      readSessionId: () => 'ss-test-1',
      expectedSectionCount: 1,
      readRunTempo: () => null,
      songTitle: 'No Weapon', spelledKeyName: 'A\u266d',
      renderBadgePreview: () => null,
      readTestStreak: () => 0,
      isRetest: false,
      songTempo: 90,
    });
    for (let i = 0; i < 3; i++) await s.writeSessionRating(3, true, 'ss-test-1');
    expect(await s.readVerdict()).toEqual({ kind: 'band', band: 'fluent' });
  });
});
