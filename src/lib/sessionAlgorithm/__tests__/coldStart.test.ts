// @vitest-environment jsdom
/**
 * Phase 3 Step 2i — cold-start ordering contract tests.
 */
import { describe, expect, it } from 'vitest';
import {
  COLD_START_STRATEGY,
  ET_SUBMODULE_ORDER,
  HF_GROUP_ORDER,
  SHAPES_AREA_PREFIX_ORDER,
  harmonicFluencyColdStartOrder,
  pickColdStartItems,
  productionColdStartOrder,
} from '../coldStart';
import { FLASHCARDS } from '../../../modules/harmonic-fluency/catalog';
import { PRODUCTION_LESSONS } from '../../../modules/production/content/lessons';

describe('pickColdStartItems', () => {
  it('returns up to max items, skipping touched', () => {
    const ordered = ['a', 'b', 'c', 'd', 'e'];
    const touched = new Set(['b', 'd']);
    expect(pickColdStartItems(ordered, touched, 3)).toEqual(['a', 'c', 'e']);
  });

  it('respects the original order (stable filter)', () => {
    const ordered = ['z', 'a', 'm', 'b'];
    expect(pickColdStartItems(ordered, new Set(), 4)).toEqual(['z', 'a', 'm', 'b']);
  });

  it('returns at most max items even when more remain', () => {
    expect(pickColdStartItems(['a', 'b', 'c', 'd'], new Set(), 2)).toEqual(['a', 'b']);
  });

  it('returns [] for max <= 0', () => {
    expect(pickColdStartItems(['a', 'b'], new Set(), 0)).toEqual([]);
    expect(pickColdStartItems(['a', 'b'], new Set(), -1)).toEqual([]);
  });

  it('returns [] when all are touched', () => {
    expect(pickColdStartItems(['a', 'b'], new Set(['a', 'b']), 5)).toEqual([]);
  });
});

describe('module ordering constants', () => {
  it('ET submodule order matches the design — intervals → CR → CP → SM', () => {
    expect(ET_SUBMODULE_ORDER).toEqual([
      'intervals',
      'chord-recognition',
      'chord-progressions',
      'scales-modes',
    ]);
  });

  it('Shapes area prefix order is chord-shape → scale → vl', () => {
    expect(SHAPES_AREA_PREFIX_ORDER).toEqual([
      'chord-shape:',
      'scale:',
      'vl:',
    ]);
  });

  it('HF group order matches the four coverage groups', () => {
    expect(HF_GROUP_ORDER).toEqual([
      'foundational',
      'chord-knowledge',
      'functional-applied',
      'ear-recognition',
    ]);
  });
});

describe('COLD_START_STRATEGY map', () => {
  it('every relevant module has a strategy entry', () => {
    expect(COLD_START_STRATEGY['ear-training']).toBe('submodule-sequence');
    expect(COLD_START_STRATEGY['harmonic-fluency']).toBe('concrete-ordering');
    expect(COLD_START_STRATEGY['shapes-and-patterns']).toBe('submodule-sequence');
    expect(COLD_START_STRATEGY['production']).toBe('concrete-ordering');
    expect(COLD_START_STRATEGY['repertoire']).toBe('goal-driven');
    expect(COLD_START_STRATEGY['practice-consistency']).toBe('consistency-only');
  });
});

describe('harmonicFluencyColdStartOrder', () => {
  it('enumerates every flashcard exactly once', () => {
    const order = harmonicFluencyColdStartOrder();
    expect(order).toHaveLength(FLASHCARDS.length);
    expect(new Set(order).size).toBe(FLASHCARDS.length);
  });

  it('returns ids that all match real flashcards', () => {
    const valid = new Set(FLASHCARDS.map(c => c.id));
    const order = harmonicFluencyColdStartOrder();
    for (const id of order) {
      expect(valid.has(id)).toBe(true);
    }
  });

  it('foundational-group cards come before ear-recognition cards', () => {
    const order = harmonicFluencyColdStartOrder();
    const cardById = new Map(FLASHCARDS.map(c => [c.id, c]));
    const foundationalCats = ['scale-degree-math', 'named-notes', 'key-signatures'];
    const earCats = ['modes', 'intervals', 'ear-theory'];

    let lastFoundationalIdx = -1;
    let firstEarIdx = order.length;
    order.forEach((id, idx) => {
      const cat = cardById.get(id)?.category;
      if (cat && foundationalCats.includes(cat)) {
        lastFoundationalIdx = Math.max(lastFoundationalIdx, idx);
      }
      if (cat && earCats.includes(cat)) {
        firstEarIdx = Math.min(firstEarIdx, idx);
      }
    });
    expect(lastFoundationalIdx).toBeLessThan(firstEarIdx);
  });
});

describe('productionColdStartOrder', () => {
  it('enumerates every lesson exactly once', () => {
    const order = productionColdStartOrder();
    expect(order).toHaveLength(PRODUCTION_LESSONS.length);
    expect(new Set(order).size).toBe(PRODUCTION_LESSONS.length);
  });

  it('workflow-foundations lessons come before language-of-production lessons', () => {
    const order = productionColdStartOrder();
    const lessonById = new Map(PRODUCTION_LESSONS.map(l => [l.id, l]));

    let lastWorkflowIdx = -1;
    let firstLanguageIdx = order.length;
    order.forEach((id, idx) => {
      const path = lessonById.get(id)?.pathId;
      if (path === 'workflow-foundations') {
        lastWorkflowIdx = Math.max(lastWorkflowIdx, idx);
      }
      if (path === 'language-of-production') {
        firstLanguageIdx = Math.min(firstLanguageIdx, idx);
      }
    });
    expect(lastWorkflowIdx).toBeLessThan(firstLanguageIdx);
  });
});
