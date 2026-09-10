/**
 * RULE_LEGIBILITY.md cites no file that does not exist.
 *
 * =====================================================================
 * A POINTER TO A DELETED FILE IS A RULE NOBODY CAN FIND.
 *
 * The document tells a reader where each rule lives so they can go and
 * read it. Twelve of its citations had gone stale by 10 Sep 2026 — the
 * drill pop-ups, the old dashboard, a retired ladder — each still
 * written as if it were there. Silas's ruling that day: no entry cites a
 * deleted file. This walks every `.ts` / `.tsx` path the document names
 * and fails on one the source tree does not have.
 *
 * A BARE FILE NAME MATCHES ANY FILE OF THAT NAME, a partial path any
 * file ending in it — the document is written for a reader, who writes
 * `ChordMotionTab.tsx:440`, not the full path. Line numbers are allowed
 * to drift (the document says so); the file is not.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import doc from '../../../docs/RULE_LEGIBILITY.md?raw';

// Vite's glob leaves out the file doing the globbing, and the document
// cites this test by name — so it is added back.
const files = [
  ...Object.keys(import.meta.glob('/src/**/*.{ts,tsx}')),
  '/src/lib/__tests__/ruleLegibilityPaths.test.ts',
];

function exists(cited: string): boolean {
  const path = cited.replace(/^\.?\//, '');
  if (path.includes('/')) return files.some(f => f === `/${path}` || f.endsWith(`/${path}`));
  return files.some(f => f.endsWith(`/${path}`));
}

describe('RULE_LEGIBILITY.md', () => {
  const cited = [...new Set([...doc.matchAll(/[\w./-]+\.tsx?\b/g)].map(m => m[0]))];

  it('cites files, and plenty of them', () => {
    // Guard the guard: the walk really reads the document.
    expect(cited.length).toBeGreaterThan(50);
    expect(cited).toContain('ChordMotionTab.tsx');
  });

  it('cites no file that does not exist', () => {
    expect(cited.filter(c => !exists(c))).toEqual([]);
  });
});
