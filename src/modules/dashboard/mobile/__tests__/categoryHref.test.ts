/**
 * Where a category row goes.
 *
 * The rule worth pinning: it resolves from the STORED REFS, never from
 * the node's label. The dashboard Title Cases its labels for display,
 * so a resolver reading them would be re-deriving a slug from prose —
 * and would keep working right up until someone rephrased a category.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, CATEGORY_ORDER } from '../../../harmonic-fluency/catalog';
import { categoryPath } from '../../../harmonic-fluency/categoryRoutes';
import { readingSkillPath } from '../../../reading/skillRoutes';
import type { TreeNode } from '../../read/tree';
import { categoryHref } from '../categoryHref';

const NOW = Date.UTC(2026, 7, 25, 12);

function node(itemRefs: string[], over: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 'n', label: 'Some Nicely Title Cased Label', depth: 1, children: [],
    itemRefs, accuracyKind: 'measured', mixedKinds: false,
    excludedFromParentTotals: false, endsGroup: false,
    score: null, gradedLeafCount: 0, coveredItems: 0, totalItems: 0,
    engagementCount: 0,
    recency: { mostRecentAt: NOW, stalestAt: NOW, hasUntouched: false },
    ...over,
  };
}

describe('harmonic fluency', () => {
  it('lands on the category page for every category the module has', () => {
    // WALKS THE CATALOG rather than naming one category: a category
    // added tomorrow is covered without editing this.
    for (const category of CATEGORY_ORDER) {
      const refs = FLASHCARDS.filter(c => c.category === category).map(c => c.id);
      expect(refs.length, category).toBeGreaterThan(0);
      expect(categoryHref('harmonic-fluency', node(refs)), category)
        .toBe(categoryPath(category));
    }
  });

  it('ignores the label entirely', () => {
    // Same refs, a label naming a different category. The refs win.
    const refs = FLASHCARDS.filter(c => c.category === 'degree-notes').map(c => c.id);
    expect(categoryHref('harmonic-fluency', node(refs, { label: 'Modes' })))
      .toBe(categoryPath('degree-notes'));
  });

  it('falls back to the module home for a row spanning two categories', () => {
    // A row with no single category has no single page, and sending it
    // to the first one's would be a wrong answer delivered confidently.
    const a = FLASHCARDS.find(c => c.category === 'modes')!.id;
    const b = FLASHCARDS.find(c => c.category === 'degree-notes')!.id;
    expect(categoryHref('harmonic-fluency', node([a, b]))).toBe('/harmonic-fluency');
  });
});

describe('reading', () => {
  it('lands on each skill page from that skill’s own refs', () => {
    expect(categoryHref('reading', node(['sig:2s:major:count'])))
      .toBe(readingSkillPath('sig'));
    expect(categoryHref('reading', node(['note:treble:5'])))
      .toBe(readingSkillPath('note'));
    expect(categoryHref('reading', node(['shape:triad:root'])))
      .toBe(readingSkillPath('shape'));
    expect(categoryHref('reading', node(['chord:maj:root:treble'])))
      .toBe(readingSkillPath('chord'));
  });

  it('falls back where the refs disagree', () => {
    expect(categoryHref('reading', node(['note:treble:5', 'chord:maj:root:treble'])))
      .toBe('/reading');
  });
});

describe('a module with no page per category', () => {
  it('goes to the module home', () => {
    // Ear training's sub-modules are their own screens, shapes has one
    // page per sub-module, repertoire is a song list. None of them has
    // a category page, and the home is the honest destination.
    expect(categoryHref('shapes-and-patterns', node(['scale:major:C'])))
      .toBe('/shapes-and-patterns');
    expect(categoryHref('repertoire', node(['song-1']))).toBe('/repertoire');
  });

  it('goes somewhere even with no refs at all', () => {
    expect(categoryHref('harmonic-fluency', node([]))).toBe('/harmonic-fluency');
    expect(categoryHref('reading', node([]))).toBe('/reading');
  });
});
