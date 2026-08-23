/**
 * Nothing writes `songCrossKeyProgress` any more.
 *
 * ---------------------------------------------------------------
 * WHY THIS IS A SOURCE-LEVEL ASSERTION AND NOT A BEHAVIOUR ONE.
 *
 * The invariant is an absence — "no code path adds to this table" —
 * and an absence cannot be demonstrated by exercising behaviour. A
 * test that logged a practice session and checked the table stayed
 * empty would pass while a writer sat in a component it never
 * rendered, which is exactly where the last one was.
 *
 * The risk being guarded is a reintroduced writer, most likely by
 * someone copying a nearby pattern without knowing the table is
 * retired. That is a fact about the source, so the source is what is
 * checked.
 * ---------------------------------------------------------------
 *
 * DELETES ARE STILL ALLOWED, deliberately. The table still exists and
 * still holds historical rows, so the section-delete and song-delete
 * cascades must keep cleaning it — orphaned rows would be worse than
 * the rows themselves.
 *
 * AND SO IS EXACTLY ONE RESTORE. Deleting a section offers an undo,
 * and that undo puts back the rows the delete removed. Restoring what
 * was just deleted is not recording new progress — it is the delete
 * not having happened — and an undo that silently kept part of the
 * deletion would be a worse lie than the table itself. The exemption
 * is named rather than pattern-matched, so a SECOND write appearing
 * anywhere still fails.
 *
 * This test found that site. The first draft forbade `bulkAdd`
 * outright and the undo path failed it, which is the test working
 * rather than the rule being wrong.
 */
import { describe, expect, it } from 'vitest';

/**
 * Sources read through Vite's own glob rather than `node:fs`.
 *
 * The app's tsconfig does not include node types — deliberately, since
 * app code has no business reaching for them — so a test importing
 * `node:fs` passes under vitest and fails `tsc -b`. That split is
 * exactly the trap this workstream keeps hitting from the other
 * direction, so the test uses the toolchain the app already has.
 */
const SOURCES: Record<string, string> = import.meta.glob(
  '../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

/** Everything under modules/repertoire except the tests themselves. */
const FILES = Object.entries(SOURCES)
  .filter(([path]) => !path.includes('__tests__'));

/** Mutations that write a row. `delete`, `bulkDelete` and `clear` are
 *  absent on purpose — see the header. */
const WRITE_METHODS = ['add', 'put', 'bulkAdd', 'bulkPut', 'update'];

function read(suffix: string): string {
  const hit = FILES.find(([path]) => path.endsWith(suffix));
  if (!hit) throw new Error(`no source found for ${suffix}`);
  return hit[1];
}

describe('songCrossKeyProgress is retired', () => {
  it('the sweep actually reads files', () => {
    // Guard the guard: a glob that matched nothing would make every
    // assertion below vacuously true.
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES.some(([p]) => p.endsWith('SongDetailView.tsx'))).toBe(true);
  });

  it('no repertoire source writes a row to it, beyond the one undo restore', () => {
    const offenders: string[] = [];
    for (const [path, src] of FILES) {
      for (const method of WRITE_METHODS) {
        const marker = `songCrossKeyProgress.${method}(`;
        let from = 0;
        for (;;) {
          const at = src.indexOf(marker, from);
          if (at < 0) break;
          from = at + marker.length;
          offenders.push(`${path.replace('../', '')} → .${method}()`);
        }
      }
    }
    // The section-delete undo, and nothing else. Listed explicitly so
    // a second write fails even if it is the same method in the same
    // file.
    expect(offenders).toEqual(['SongDetailView.tsx → .bulkAdd()']);
  });

  it('the one allowed write really is the undo restore', () => {
    // Guard the guard: the exemption above is a string match, and a
    // string match cannot tell an undo from a fresh write. This pins
    // that the single site sits under an Undo action alongside the
    // sibling restores it belongs with.
    const detail = read('SongDetailView.tsx');
    const at = detail.indexOf('songCrossKeyProgress.bulkAdd(');
    const context = detail.slice(Math.max(0, at - 600), at);
    expect(context).toContain("label: 'Undo'");
    expect(context).toContain('songChords.bulkAdd');
  });

  it('the delete cascades are still there', () => {
    // The other half of the same rule. Removing the writes must not
    // quietly become removing the cleanup, which would leave orphaned
    // rows behind every deleted song.
    const detail = read('SongDetailView.tsx');
    expect(detail).toContain('songCrossKeyProgress.bulkDelete');
  });

  it('the card that displayed it is gone', () => {
    expect(FILES.some(([p]) => p.endsWith('CrossKeyGrid.tsx'))).toBe(false);
    const detail = read('SongDetailView.tsx');
    expect(detail).not.toContain('<CrossKeyGrid');
  });
});
