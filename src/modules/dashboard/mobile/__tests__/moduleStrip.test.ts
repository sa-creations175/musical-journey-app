/**
 * What the strip and its footer SAY. Not how they look.
 *
 * =====================================================================
 * THIS FILE CLAIMS NOTHING ABOUT LAYOUT.
 *
 * jsdom has no viewport, no media queries that mean anything, and no
 * way to tell a 390px screen from a 1440px one. Whether the strip wraps
 * legibly, whether five-pixel squares are tappable, and whether six
 * stacked cards can be compared without scrolling are questions only an
 * actual phone can answer.
 *
 * What IS testable is the derivation underneath: which tier a category
 * reads as, that the footer counts the same cells the strip drew, and
 * that a row resolves to the page it claims to.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  computeTier, MASTERY_WINDOW, MIN_ATTEMPTS_FOR_TIER, TIER_BAR_CLASS, TIER_LABEL,
} from '../../../../lib/tier';
import { NO_VALUE } from '../../bands';
import type { TreeNode } from '../../read/tree';
import { tierForNode } from '../../read/tierAdapter';
import { moduleScoreLine, subLine } from '../ModuleCards';
import { TIER_LEGEND, UNGRADED_LABEL, footerEntries, tierWord } from '../tierLegend';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 25, 12);

function node(over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 'n', label: 'Node', depth: 1, children: [],
    itemRefs: [], accuracyKind: 'measured', mixedKinds: false,
    excludedFromParentTotals: false, endsGroup: false,
    score: null, gradedLeafCount: 0, coveredItems: 0, totalItems: 0,
    engagementCount: 0,
    recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
    ...over,
  };
}

describe('the tier a category reads as', () => {
  it('is untouched with nothing behind it', () => {
    expect(tierForNode(node({ score: null, engagementCount: 0 }), NOW)).toBe('untouched');
    expect(tierForNode(node({ score: 90, engagementCount: 0 }), NOW)).toBe('untouched');
  });

  it('is started under the attempt minimum, whatever the score', () => {
    // The threshold is the app's, not a second one written here — a
    // perfect four-attempt run is still not a grade.
    expect(tierForNode(node({
      score: 100, engagementCount: MIN_ATTEMPTS_FOR_TIER - 1,
    }), NOW)).toBe('started');
  });

  it('grades from the minimum up, on the same thresholds as everything else', () => {
    const graded = (score: number) =>
      tierForNode(node({ score, engagementCount: 10 }), NOW);
    // Compared against `computeTier` itself rather than against hard
    // -coded words: if the app's bands move, this moves with them.
    const expected = (score: number) => computeTier({
      windowCorrect: Math.round((score / 100) * 10),
      windowTotal: 10,
      daysSinceLastAttempt: 0,
    });
    for (const score of [10, 45, 55, 75, 85, 95, 100]) {
      expect(graded(score), String(score)).toBe(expected(score));
    }
  });

  it('lets a full measured window reach mastered', () => {
    expect(tierForNode(node({
      score: 100, engagementCount: MASTERY_WINDOW,
    }), NOW)).toBe('mastered');
  });

  it('stops a SELF-RATED category one rung short of mastered', () => {
    // A four-rung feel scale cannot earn a perfect measured window, and
    // calling it mastered would claim twenty clean run-throughs nobody
    // counted.
    expect(tierForNode(node({
      score: 100, engagementCount: MASTERY_WINDOW, accuracyKind: 'self-rated',
    }), NOW)).toBe('fluent');
  });

  it('goes stale on a good grade left alone', () => {
    expect(tierForNode(node({
      score: 100, engagementCount: MASTERY_WINDOW,
      recency: { mostRecentAt: NOW - 60 * DAY, stalestAt: NOW - 60 * DAY, hasUntouched: false },
    }), NOW)).toBe('stale');
  });
});

describe('the footer counts the strip', () => {
  const cell = (tier: Parameters<typeof tierWord>[0], matched = true) => ({ tier, matched });
  const read = (entries: ReturnType<typeof footerEntries>) =>
    entries.map(e => `${e.count} ${e.label}`).join(' · ');

  it('counts each tier by its own name', () => {
    expect(read(footerEntries([
      cell('fluent'), cell('fluent'), cell('developing'),
    ]))).toBe(`2 ${TIER_LABEL.fluent} · 1 ${TIER_LABEL.developing}`);
  });

  it('counts the two ungraded states SEPARATELY, which the legend does not', () => {
    // REVERSES A DOCUMENTED DECISION, and only here. Once every footer
    // entry carries its own swatch, one entry wearing two different
    // swatches reads as a fault — and `untouched` (nothing attempted)
    // and `started` (real work under the line) are different facts.
    expect(read(footerEntries([cell('started'), cell('untouched')])))
      .toBe(`1 ${TIER_LABEL.started} · 1 ${TIER_LABEL.untouched}`);
  });

  it('leaves the shared legend merging them, so nothing else moves', () => {
    // `tierWord` feeds the strip cell's own label, the cell popover and
    // every row of the skills list. None of them changed.
    expect(tierWord('started')).toBe(UNGRADED_LABEL);
    expect(tierWord('untouched')).toBe(UNGRADED_LABEL);
    const ungraded = TIER_LEGEND.filter(e => e.label === UNGRADED_LABEL);
    expect(ungraded).toHaveLength(1);
    expect(ungraded[0].swatches).toHaveLength(2);
  });

  it(`gives every entry exactly one swatch, in that tier's own colour`, () => {
    const entries = footerEntries([cell('started'), cell('untouched'), cell('fluent')]);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.swatch, entry.label).toBe(TIER_BAR_CLASS[entry.tier]);
      expect(entry.swatch.split(/\s+/).length).toBeGreaterThan(0);
    }
  });

  it('drops a tier that is not on the strip rather than printing a zero', () => {
    const footer = read(footerEntries([cell('fluent')]));
    expect(footer).toBe(`1 ${TIER_LABEL.fluent}`);
    expect(footer).not.toContain('0 ');
  });

  it('says nothing for a module with no categories', () => {
    expect(footerEntries([])).toEqual([]);
  });

  it('keeps the whole count under a filter, and dims only what nothing matched', () => {
    // The footer counts the STRIP, and the strip keeps its full length
    // under any filter. What moves is emphasis, not arithmetic.
    const entries = footerEntries([
      cell('fluent', true), cell('fluent', false), cell('developing', false),
    ]);
    expect(read(entries)).toBe(`2 ${TIER_LABEL.fluent} · 1 ${TIER_LABEL.developing}`);
    expect(entries[0].matched, 'one fluent matched').toBe(true);
    expect(entries[1].matched, 'no developing matched').toBe(false);
  });

  it('accounts for every colour the strip can draw', () => {
    // A tier with no legend entry would paint a square nothing explains.
    const covered = new Set(TIER_LEGEND.flatMap(e => e.tiers));
    for (const tier of ['mastered', 'fluent', 'developing', 'needsWork', 'stale', 'started', 'untouched'] as const) {
      expect(covered.has(tier), tier).toBe(true);
    }
  });
});

describe('the number at the right of the top line', () => {
  it('says what it is', () => {
    // "90%" beside a module name reads as progress. It is the mean
    // accuracy across that module's graded categories.
    expect(moduleScoreLine(90)).toBe('90% accuracy');
    expect(moduleScoreLine(58.4)).toBe('58% accuracy');
  });

  it('leaves the empty case alone', () => {
    // A dash followed by the word accuracy would label a measurement
    // nobody took.
    expect(moduleScoreLine(null)).toBe(NO_VALUE);
    expect(moduleScoreLine(null)).not.toContain('accuracy');
  });
});

describe('the sub-line', () => {
  it('carries attempts, categories and when it was last touched', () => {
    expect(subLine(node({
      engagementCount: 412,
      children: [node(), node(), node()],
      recency: { mostRecentAt: NOW - 3 * DAY, stalestAt: NOW - 3 * DAY, hasUntouched: false },
    }), NOW)).toBe('412 attempts · 3 categories · last practised 3d ago');
  });

  it('says today rather than 0d ago', () => {
    expect(subLine(node({ engagementCount: 1, children: [node()] }), NOW))
      .toBe('1 attempt · 1 category · last practised today');
  });

  it('says never rather than a fabricated number', () => {
    expect(subLine(node({
      engagementCount: 0,
      recency: { mostRecentAt: null, stalestAt: null, hasUntouched: true },
    }), NOW)).toBe('0 attempts · 0 categories · never practised');
  });
});
