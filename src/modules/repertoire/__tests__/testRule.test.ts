/**
 * The rule is stated one way, and a grep is the only thing that can
 * hold that.
 *
 * =====================================================================
 * A UNIT TEST CANNOT SEE A SEVENTH WORDING BEING BORN.
 *
 * The drift this replaces did not happen because anyone disagreed
 * about the rule. It happened because ten surfaces each needed a
 * sentence, and writing one is easier than finding the one that
 * exists. Every one of those surfaces would have passed its own tests.
 *
 * So this reads the source. It is the only kind of test that fails on
 * the eleventh surface — the one nobody has written yet.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { TEST_RULE_CLAUSE, TEST_RULE_SENTENCE } from '../testRule';

/**
 * Read through Vite's own glob, not `node:fs` — the app's tsconfig
 * carries no node types, so an fs import passes under vitest and fails
 * `tsc -b`. Same approach as `crossKeyProgressRetired.test.ts`.
 */
const SOURCES: Record<string, string> = import.meta.glob(
  '../../../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

/**
 * "In one sitting" about spreading FLASHCARD answers across days. Same
 * words, different rule, and it is the phrase being argued against
 * there rather than a statement of the test rule. Sweeping it in would
 * have been a wrong fix that looked like a thorough one.
 */
const NOT_THE_TEST_RULE = ['lib/spacing/settings.ts'];

/** Glob keys are relative to this file. */
const ALL_PATHS = Object.keys(SOURCES);

/** Comments are prose about the rule, not statements of it to a user. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const FILES = Object.entries(SOURCES)
  .filter(([path]) => !path.includes('__tests__'))
  .filter(([path]) => !NOT_THE_TEST_RULE.some(x => path.endsWith(x)))
  .map(([path, body]) => ({ path, body: withoutComments(body) }));

describe('the sweep actually reads the app', () => {
  it('the glob matched real sources', () => {
    // Guard the guard: a glob that matched nothing would make every
    // assertion below vacuously true.
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.some(f => f.path.endsWith('matrix/KeyRow.tsx'))).toBe(true);
    // And the one exclusion is live rather than a path that never
    // matched: the file is in the glob, and out of the sweep.
    expect(ALL_PATHS.some(p => p.endsWith('lib/spacing/settings.ts'))).toBe(true);
    expect(FILES.some(f => f.path.endsWith('lib/spacing/settings.ts'))).toBe(false);
  });
});

describe('the retired wordings are gone', () => {
  // The seven, as they actually appeared. Each one was somebody
  // writing the rule from memory rather than looking it up.
  const RETIRED = [
    'in one sitting',
    'consecutive clean run-throughs',
    'clean runs in a row in one sitting',
    'clean tests in a row',
    'clean test runs',
    'Back to Back',
    '3 clean in a row',
  ];

  for (const phrase of RETIRED) {
    it(`no surface says "${phrase}"`, () => {
      const guilty = FILES.filter(f => f.body.includes(phrase)).map(f => f.path);
      expect(guilty).toEqual([]);
    });
  }
});

describe('the one wording', () => {
  it('the clause is the sentence, minus the capital and the full stop', () => {
    // Pinned because they are two constants and could drift apart, at
    // which point the app has two wordings again and this file is
    // saying otherwise.
    expect(`${TEST_RULE_CLAUSE[0].toUpperCase()}${TEST_RULE_CLAUSE.slice(1)}.`)
      .toBe(TEST_RULE_SENTENCE);
  });

  it('names a testing session, not a sitting', () => {
    // The tail is the part that changed and the part that matters: a
    // session survives a pause, a sitting does not.
    expect(TEST_RULE_SENTENCE).toContain('in one testing session');
    expect(TEST_RULE_SENTENCE).not.toContain('sitting');
  });

  it('every surface that states the rule imports it', () => {
    // The inverse of the grep above: not just "no old wording", but
    // "the new one is not copy-pasted either". A literal of the
    // sentence anywhere but its own file is a second copy waiting to
    // drift.
    const inlined = FILES
      .filter(f => !f.path.endsWith('/testRule.ts'))
      .filter(f => f.body.includes(TEST_RULE_SENTENCE) || f.body.includes(TEST_RULE_CLAUSE))
      .map(f => f.path);
    expect(inlined).toEqual([]);
  });
});
