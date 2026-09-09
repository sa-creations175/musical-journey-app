/**
 * A movement is stored, and nothing that counts songs can see it.
 *
 * =====================================================================
 * THE SECOND CLAIM IS THE ONE THAT MATTERS AND THE ONE THAT IS EASY TO
 * GET WRONG LATER.
 *
 * Ruling 1 is that a captured move is never counted where songs are
 * counted — the repertoire list, the dashboard's song squares,
 * practice-session generation, goals, the weekly plan. A flag on
 * `songs` was ruled out because twenty-two files read `db.songs` with
 * no filter and every one of them would have to remember it.
 *
 * A separate table makes that checkable rather than promised: code that
 * does not NAME `chordMovements` cannot reach one. So the test reads
 * the source tree and asserts which files name it — derived from the
 * files themselves, not from a list somebody keeps up to date. The day
 * a dashboard or a session generator learns the word, this fails and
 * says so by name.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, MOVEMENT_ARRANGEMENT_ID } from '../../../../lib/db';
import {
  createMovement, deleteMovement, getMovement, listMovements,
  movementBarCount, movementPlacement, newMovement, updateMovement,
} from '../movementStore';

beforeEach(async () => {
  await db.chordMovements.clear();
});

describe('the record', () => {
  it('starts unnamed, keyless, and at the prototype’s speed', async () => {
    const m = await createMovement('6/8');
    expect(m.name).toBe('');
    expect(m.description).toBe('');
    expect(m.key).toBeUndefined();
    expect(m.timeSignature).toBe('6/8');
    expect(m.placements).toEqual([]);
    expect(m.playbackBpm).toBe(72);
    expect(m.bassBalance).toBe('forward');
  });

  it('never invents a name', () => {
    // Ruling 4. The app fills this in nowhere, so there is nothing to
    // assert but the absence — and the absence is the ruling.
    for (const ts of ['4/4', '6/8', '12/8']) {
      expect(newMovement(ts).name).toBe('');
    }
  });

  it('reads back, updates with a stamp, and deletes', async () => {
    const m = await createMovement('6/8');
    await updateMovement(m.id, { name: 'Gospel walk-up', key: 'C' }, m.createdAt + 500);
    const after = (await getMovement(m.id))!;
    expect(after.name).toBe('Gospel walk-up');
    expect(after.key).toBe('C');
    expect(after.updatedAt).toBe(m.createdAt + 500);
    expect(after.createdAt).toBe(m.createdAt);
    await deleteMovement(m.id);
    expect(await getMovement(m.id)).toBeUndefined();
  });

  it('lists most recently touched first', async () => {
    const a = await createMovement('4/4');
    const b = await createMovement('6/8');
    await updateMovement(a.id, { name: 'later' }, Date.now() + 1000);
    expect((await listMovements()).map(m => m.id)).toEqual([a.id, b.id]);
  });

  it('holds the lead sheet’s own placement shape', () => {
    // Ruling 5: one shared editor, which means one shape. An adapter
    // between two nearly-identical shapes is the second implementation
    // that rule exists to prevent.
    const p = movementPlacement({
      barIndex: 1, beatPos: 3, beats: 3,
      chord: { function: '6', quality: 'm' },
      voicing: [{ offset: 0, hand: 'L' }, { offset: 12, hand: 'R' }],
    });
    expect(p.arrangementId).toBe(MOVEMENT_ARRANGEMENT_ID);
    expect(p.id).toEqual(expect.any(String));
    expect(p.voicing).toEqual([{ offset: 0, hand: 'L' }, { offset: 12, hand: 'R' }]);
  });
});

describe('how many bars it shows', () => {
  it('is derived from the placements, never stored', () => {
    // The prototype has no control for adding a bar, so a stored count
    // would be a number nothing could change.
    const at = (barIndex: number, beats: number) => movementPlacement({
      barIndex, beatPos: 0, beats, chord: { function: '1', quality: '' },
    });
    expect(movementBarCount({ placements: [] })).toBe(1);
    expect(movementBarCount({ placements: [at(0, 3)] })).toBe(1);
    expect(movementBarCount({ placements: [at(2, 3), at(0, 3)] })).toBe(3);
  });
});

// =====================================================================
// Nothing that counts songs can reach one
// =====================================================================

/**
 * Every source file under `src/`, read as text.
 *
 * `import.meta.glob` rather than `node:fs`, because the app's own
 * tsconfig carries no node types — the same reason the sidebar tests
 * read their subject this way.
 */
const SOURCES = import.meta.glob(
  '../../../../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

/**
 * A glob key, resolved back to a path under `src/`.
 *
 * Vite hands back the SHORTEST relative form — `../movementStore.ts`
 * for a sibling, `../../../../lib/db.ts` for something at the root —
 * so the `..` segments have to be walked rather than stripped.
 * Stripping them made every sibling look like a root file, which is how
 * this module's own store read as an outsider.
 */
const TEST_DIR = 'modules/shapes-and-patterns/movements/__tests__'.split('/');

function relative(path: string): string {
  const parts = path.split('/').filter(p => p !== '.');
  let up = 0;
  while (parts[up] === '..') up += 1;
  return [...TEST_DIR.slice(0, TEST_DIR.length - up), ...parts.slice(up)].join('/');
}

describe('a movement is not a song', () => {
  /** Every file that names the table at all, relative to src/. */
  const namers = Object.entries(SOURCES)
    .filter(([, text]) => text.includes('chordMovements'))
    .map(([path]) => relative(path))
    // A TEST IS NOT A SURFACE. The claim is about what the app can
    // reach; a test naming the table is a test of the table.
    .filter(f => !f.includes('__tests__/'))
    .sort();

  it('is named by the schema, the sync config and Shapes & Patterns', () => {
    // DERIVED FROM THE TREE, not from a list kept by hand. A file that
    // learns the word shows up here by name, which is the whole point:
    // the failure names the surface that started counting it.
    //
    // Shapes & Patterns joined the list when ruling 19 made the
    // voice-leading page the movements page: the page draws them, and
    // the module home and its section page count them (ruling 20).
    for (const file of namers) {
      const allowed = file === 'lib/db.ts'
        || file === 'lib/sync/tables.ts'
        || file.startsWith('modules/shapes-and-patterns/');
      expect(allowed, `${file} reads chordMovements`).toBe(true);
    }
    // And the ones that must be there actually are, so this cannot pass
    // by finding nothing.
    expect(namers).toContain('lib/db.ts');
    expect(namers).toContain('lib/sync/tables.ts');
  });

  it('is invisible to every module that counts songs', () => {
    // THE CLAIM RULING 1 ACTUALLY MAKES, stated as its own assertion
    // rather than left as a consequence of the allowlist above. These
    // four are where a song is counted: the repertoire list, the
    // dashboard's squares, session generation, and goals.
    //
    // A movement DOES enter the practice schedule (ruling 20) — through
    // its spacing rows, under the `vl:` refs every other Shapes item
    // uses. Nothing has to know the word `chordMovements` to schedule
    // one, and nothing here does.
    for (const file of namers) {
      for (const counter of [
        'modules/repertoire/', 'modules/dashboard/',
        'modules/practice/', 'modules/goals/', 'lib/sessionAlgorithm/',
      ]) {
        expect(file.startsWith(counter), `${file} reads chordMovements`).toBe(false);
      }
    }
  });

  it('is invisible to every reader of db.songs', async () => {
    await createMovement('6/8');
    expect(await db.songs.count()).toBe(0);
    expect(await db.songSections.count()).toBe(0);
    expect(await db.chordMovements.count()).toBe(1);
  });
});
