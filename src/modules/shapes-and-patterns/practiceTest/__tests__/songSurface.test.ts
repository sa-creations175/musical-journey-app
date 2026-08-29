// @vitest-environment jsdom
/**
 * The song surface's writer.
 *
 * Two levels come out of one rated run and they are different things:
 * a BAND at every section the run covered, and one CLOCK entry for the
 * song in that key. Conflating them would schedule sections
 * independently, which is not how anyone practises a song.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../../lib/db';
import { bandVerdictForRow } from '../../../../lib/spacing/row';
import { songSurface } from '../makeSurfaces';
import type { DrillRecord } from '../surfaces';

const CELL = 'cell-verse-Ab';
const KEY = 'songkey-s1-Ab';
const BY_SECTION = new Map([
  ['sec-verse', CELL],
  ['sec-chorus', 'cell-chorus-Ab'],
  ['sec-bridge', 'cell-bridge-Ab'],
]);

function surface(songTempo: number | null = 90) {
  return songSurface({
    cellLabel: 'Verse 1 · A♭',
    skillLabel: '',
    cellId: CELL,
    songKeyId: KEY,
    songId: 's1',
    keyName: 'Ab',
    cellIdBySectionId: BY_SECTION,
    sections: [...BY_SECTION.keys()].map(id => ({ id, label: id })),
    onOpenLeadSheet: () => {},
    readSessionElapsedMs: () => 0,
    songTempo,
  });
}

const run = (over: Partial<DrillRecord> = {}): DrillRecord => ({
  ranSeconds: 140,
  // A song run has no target length.
  targetSeconds: 0,
  scope: null,
  style: null,
  feel: 3,
  fromTest: false,
  ...over,
});

const refsUnder = async (prefix: string) =>
  (await db.spacingState.toArray())
    .filter(r => String(r.itemRef).startsWith(prefix))
    .map(r => r.itemRef)
    .sort();

beforeEach(async () => {
  await db.spacingState.clear();
});

describe('the shape of the surface', () => {
  it('counts up, has no style, and takes the song s own tempo as target', () => {
    const s = surface(90);
    expect(s.id).toBe('song');
    expect(s.countsUp).toBe(true);
    expect(s.hasStyle).toBe(false);
    expect(s.targetRate).toBe(90);
    // The rate IS the tempo — no arithmetic.
    expect(s.rateFrom(84, 1)).toBe(84);
  });

  it('a song with no tempo set has no target, so every run counts', () => {
    expect(surface(null).targetRate).toBe(0);
  });
});

describe('one rated run writes two levels', () => {
  it('a band for the cell, and a clock for the song in that key', async () => {
    await surface().write(run());
    expect(await refsUnder('songCell:')).toEqual([`songCell:${CELL}`]);
    expect(await refsUnder('songKey:')).toEqual([`songKey:${KEY}`]);
  });

  it('the section it did NOT cover gets nothing', async () => {
    await surface().write(run());
    const refs = await refsUnder('songCell:');
    expect(refs).not.toContain('songCell:cell-chorus-Ab');
  });
});

describe('scope', () => {
  it('the whole song fans one rating across every section', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-chorus', 'sec-bridge'] }));
    expect(await refsUnder('songCell:')).toEqual([
      'songCell:cell-bridge-Ab',
      'songCell:cell-chorus-Ab',
      `songCell:${CELL}`,
    ]);
    // Still ONE clock entry. The song was played once.
    expect(await refsUnder('songKey:')).toHaveLength(1);
  });

  it('a scoped run writes only the sections named', async () => {
    await surface().write(run({ scope: ['sec-chorus'] }));
    expect(await refsUnder('songCell:')).toEqual(['songCell:cell-chorus-Ab']);
  });

  it('NO SCOPE MEANS THE CELL YOU OPENED, not everything', async () => {
    // A rep that cannot say what it covered must claim the least.
    await surface().write(run({ scope: null }));
    expect(await refsUnder('songCell:')).toEqual([`songCell:${CELL}`]);
  });

  it('a section with no cell in this key is skipped, not invented', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-nonexistent'] }));
    expect(await refsUnder('songCell:')).toEqual([`songCell:${CELL}`]);
  });
});

describe('the band rule rides through', () => {
  it('three PRACTICE reps cap at Developing however good they felt', async () => {
    const s = surface();
    for (let i = 0; i < 3; i++) await s.write(run({ feel: 4, fromTest: false }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'developing' });
  });

  it('three TEST reps at In flow reach Mastered', async () => {
    const s = surface();
    for (let i = 0; i < 3; i++) await s.write(run({ feel: 4, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('the lowest of the three picks it', async () => {
    const s = surface();
    for (const feel of [4, 2, 4] as const) {
      await s.write(run({ feel, fromTest: true }));
    }
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'band', band: 'developing' });
  });

  it('one rated rep is Started, not a band', async () => {
    await surface().write(run({ feel: 4, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    expect(bandVerdictForRow(row)).toEqual({ kind: 'started', tries: 1 });
  });

  it('marks the reps with the mode that produced them', async () => {
    const s = surface();
    await s.write(run({ feel: 3, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    const entry = (row.performanceHistory as Array<Record<string, unknown>>)[0];
    expect(entry.fromTest).toBe(true);
  });
});

describe('an unrated run', () => {
  it('writes no band and no clock — there is no verdict to record', async () => {
    await surface().write(run({ feel: null }));
    expect(await db.spacingState.count()).toBe(0);
  });

  it('does not count toward the three', async () => {
    const s = surface();
    await s.write(run({ feel: 3, fromTest: true }));
    await s.write(run({ feel: null }));
    await s.write(run({ feel: 3, fromTest: true }));
    const row = (await db.spacingState.toArray())
      .find(r => r.itemRef === `songCell:${CELL}`)!;
    // Two rated reps, so still Started rather than a band.
    expect(bandVerdictForRow(row)).toEqual({ kind: 'started', tries: 2 });
  });
});

describe('the clock is per song-and-key, never per section', () => {
  it('a whole-song run writes three bands and ONE clock entry', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-chorus', 'sec-bridge'] }));
    expect(await refsUnder('songCell:')).toHaveLength(3);
    expect(await refsUnder('songKey:')).toHaveLength(1);
  });

  it('no section ever gets a songKey ref of its own', async () => {
    await surface().write(run({ scope: ['sec-verse', 'sec-chorus'] }));
    const keyRefs = await refsUnder('songKey:');
    expect(keyRefs).toEqual([`songKey:${KEY}`]);
  });
});
