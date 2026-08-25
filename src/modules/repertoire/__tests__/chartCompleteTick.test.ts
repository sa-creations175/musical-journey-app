// @vitest-environment jsdom
/**
 * `SongSection.chartComplete` — the tick, and who is allowed to set it.
 *
 * =====================================================================
 * THE SECOND HALF IS THE POINT.
 *
 * That the value round-trips is easy and would be true of any field.
 * The rule worth a test is the one that is an ABSENCE: nothing derives
 * this, nothing infers it, no save path sets it as a side effect. An
 * absence cannot be shown by exercising behaviour — a test that added
 * chords and checked the flag stayed false would pass while a writer
 * sat in a component the test never rendered.
 *
 * So the writers are checked at the source, the way
 * `crossKeyProgressRetired` checks its retired table. The risk being
 * guarded is the obvious future convenience: a save handler, a
 * migration, or a "helpful" backfill that sets the flag from a chord
 * count. Each of those would turn the user's declaration into the
 * app's opinion, and each would look reasonable in review.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SongSection } from '../../../lib/db';
import { syncMatrixSectionsForSong } from '../matrix/matrixSectionsSync';

const SONG = 'song-tick';

function section(id: string, overrides: Partial<SongSection> = {}): SongSection {
  return {
    id,
    songId: SONG,
    name: 'Verse 1',
    order: 0,
    lyrics: '',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.songSections.clear();
  await db.songMatrixSections.clear();
});

describe('the tick round-trips', () => {
  it('stores and reads back, and absence means unticked', async () => {
    await db.songSections.add(section('sec-1'));
    const before = await db.songSections.get('sec-1');
    // Absent, not false — nothing writes a default, so nothing has to
    // be backfilled.
    expect(before?.chartComplete).toBeUndefined();

    await db.songSections.update('sec-1', { chartComplete: true });
    expect((await db.songSections.get('sec-1'))?.chartComplete).toBe(true);

    await db.songSections.update('sec-1', { chartComplete: false });
    expect((await db.songSections.get('sec-1'))?.chartComplete).toBe(false);
  });

  it('needs no schema change to survive a write of the whole row', async () => {
    // The field rides the section's JSONB blob (`songSections` maps
    // only `songId` to a column), so it must survive a full `put` the
    // same way the other unindexed fields do.
    await db.songSections.put(section('sec-1', { chartComplete: true, notes: 'hi' }));
    const row = await db.songSections.get('sec-1');
    expect(row?.chartComplete).toBe(true);
    expect(row?.notes).toBe('hi');
  });

  it('the matrix reconciler leaves it alone', async () => {
    // The reconciler is the one thing that runs off a `songSections`
    // write hook. It mirrors name / order / archived onto the matrix
    // and has no business reading or clearing the tick.
    await db.songSections.add(section('sec-1', { chartComplete: true }));
    await syncMatrixSectionsForSong(SONG, 1_700_000_000_000);

    expect((await db.songSections.get('sec-1'))?.chartComplete).toBe(true);
    const matrix = await db.songMatrixSections.where('songId').equals(SONG).toArray();
    expect(matrix).toHaveLength(1);
    expect((matrix[0] as unknown as Record<string, unknown>).chartComplete).toBeUndefined();
  });
});

/**
 * Sources read through Vite's own glob rather than `node:fs` — the
 * app's tsconfig carries no node types, so a test importing `node:fs`
 * passes under vitest and fails `tsc -b`.
 */
const SOURCES: Record<string, string> = import.meta.glob(
  '../../../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

/**
 * Non-test sources. Vite normalises glob keys relative to THIS file,
 * so a sibling test arrives as `./foo.test.ts` with no `__tests__`
 * segment to filter on — hence the filename check as well.
 */
const FILES = Object.entries(SOURCES).filter(
  ([path]) => !path.includes('__tests__') && !/\.test\.tsx?$/.test(path),
);

/**
 * Every non-test file allowed to mention the field, and why.
 *
 * NAMED RATHER THAN PATTERN-MATCHED. A new file touching the tick has
 * to be added here deliberately, which is the whole guard: the failure
 * message arrives at the moment someone teaches a second surface to
 * write it.
 */
const ALLOWED = [
  'lib/db.ts',              // the declaration
  'LeadSheetSection.tsx',   // the checkbox — the only writer
  'sectionChips.ts',        // reads it onto a chip
  'SongCard.tsx',           // draws that chip's border
];

describe('only a person sets it', () => {
  it('the sweep actually reads files', () => {
    // Guard the guard: a glob matching nothing makes all of this
    // vacuously true.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.some(([p]) => p.endsWith('lib/db.ts'))).toBe(true);
  });

  it('no source outside the named four mentions the field at all', () => {
    const mentions = FILES
      .filter(([, src]) => src.includes('chartComplete'))
      .map(([path]) => path)
      .filter(path => !ALLOWED.some(allowed => path.endsWith(allowed)));
    expect(mentions).toEqual([]);
  });

  it('nothing anywhere hardcodes the flag as ticked', () => {
    // A seed template, a promote-from-want-to-learn default, or a
    // migration writing `chartComplete: true` would be the app making
    // the declaration on the user's behalf. The checkbox writes the
    // event's own boolean, never a literal.
    const offenders = FILES
      .filter(([, src]) => /chartComplete:\s*(true|false)\b/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the one writer is a checkbox handler', () => {
    const hit = FILES.find(([p]) => p.endsWith('LeadSheetSection.tsx'));
    expect(hit).toBeDefined();
    const src = hit![1];

    // Exactly one commit of the field, and it takes its value from the
    // argument rather than computing one.
    const writes = src.match(/commit\(\{\s*chartComplete/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(src).toContain('const setChartComplete = async (next: boolean) => {');
    expect(src).toContain('await commit({ chartComplete: next });');

    // And it is reached from a checkbox's change event — not from an
    // effect, a save handler, or a render.
    const at = src.indexOf('setChartComplete(e.target.checked)');
    expect(at).toBeGreaterThan(-1);
    const context = src.slice(Math.max(0, at - 400), at);
    expect(context).toContain('type="checkbox"');
  });

  it('no effect or save path calls the setter', () => {
    const hit = FILES.find(([p]) => p.endsWith('LeadSheetSection.tsx'));
    const src = hit![1];
    // Two call sites total: the declaration and the one onChange.
    const calls = src.match(/setChartComplete\b/g) ?? [];
    expect(calls).toHaveLength(2);
  });
});
