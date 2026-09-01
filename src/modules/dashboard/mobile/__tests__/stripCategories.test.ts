/**
 * What a module's card counts as its categories.
 *
 * =====================================================================
 * BUILT FROM THE REAL CATALOGS, not from a fixture shaped to pass.
 * The whole defect was that production's catalog has a level the others
 * do not, so a hand-made tree would have been a tree without the
 * problem in it.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { buildMergedTree } from '../../read/tree';
import { statsForAttemptCatalog } from '../../read/adapters';
import {
  PRODUCTION_LESSONS_GROUP,
  intervalsCatalog,
  productionLessonsCatalog,
  productionVocabularyCatalog,
} from '../../read/catalogs';
import { PRODUCTION_PATHS } from '../../../production/content/paths';
import type { ModuleTree } from '../../read/query';
import { stripCategories } from '../stripCategories';

function moduleTreeFor(moduleId: string, label: string, catalogs: Parameters<
  typeof buildMergedTree
>[2][number]['catalog'][]): ModuleTree {
  return {
    moduleId,
    moduleLabel: label,
    root: buildMergedTree(moduleId, label, catalogs.map(catalog => ({
      catalog, stats: statsForAttemptCatalog(catalog, []),
    }))),
  };
}

const production = moduleTreeFor('production', 'production', [
  productionLessonsCatalog, productionVocabularyCatalog,
]);

describe('production', () => {
  it('has a grouping row between the module and its lesson paths', () => {
    // The thing that made the strip draw two squares. Asserted so the
    // fix is visibly a fix to the CARD and not to the catalog.
    expect(production.root.children.map(c => c.label))
      .toEqual([PRODUCTION_LESSONS_GROUP, 'Vocabulary']);
  });

  it('counts seven categories, the same seven its module home shows', () => {
    const labels = stripCategories(production).map(c => c.label);
    expect(labels).toHaveLength(PRODUCTION_PATHS.length + 1);
    for (const path of PRODUCTION_PATHS) {
      expect(labels, path.title).toContain(path.title);
    }
    expect(labels).toContain('Vocabulary');
  });

  it('leaves Vocabulary as one category, not seventeen clusters', () => {
    // It is one card on the module home, so it is one square here. The
    // rule is which rows are groupings, and that is declared per module
    // rather than guessed from having children — Vocabulary has
    // seventeen of them.
    const vocab = production.root.children.find(c => c.label === 'Vocabulary')!;
    expect(vocab.children.length).toBeGreaterThan(10);
    expect(stripCategories(production).filter(c => c.label === 'Vocabulary'))
      .toHaveLength(1);
  });

  it('does not touch the tree the tree view reads', () => {
    // `stripCategories` returns a different LIST; the module's own
    // children are unchanged, which is what the tree renders.
    stripCategories(production);
    expect(production.root.children.map(c => c.label))
      .toEqual([PRODUCTION_LESSONS_GROUP, 'Vocabulary']);
  });
});

describe('every other module', () => {
  it('is the row under the module, untouched', () => {
    const ear = moduleTreeFor('ear-training', 'ear training', [intervalsCatalog]);
    expect(stripCategories(ear)).toBe(ear.root.children);
  });
});
