// @vitest-environment jsdom
/**
 * Polish-sprint test — locks in tier-1 activity-description
 * templates. Tier 2 (item-name resolvers per module) lives in the
 * deferred list; until then these generic shapes fill the lower
 * line of SessionBlock without repeating moduleLabel or duration
 * (both rendered separately by the UI).
 */
import { describe, expect, it } from 'vitest';
import { describeActivity } from '../sessionGenerator';
import type { AllocatedBlock } from '../../../lib/sessionAlgorithm/timeAllocation';

function block(partial: Partial<AllocatedBlock>): AllocatedBlock {
  return {
    id: 'b-x',
    moduleRef: 'harmonic-fluency',
    memoryType: 'declarative',
    itemRefs: [],
    weight: 1,
    hasAcquiringItems: false,
    plannedSeconds: 600,
    phase: 'review',
    ...partial,
  };
}

describe('describeActivity — tier 1 templates', () => {
  it('declarative blocks → "flashcards · N card(s)"', () => {
    expect(describeActivity(block({ memoryType: 'declarative', itemRefs: ['c1'] })))
      .toBe('flashcards · 1 card');
    expect(describeActivity(block({ memoryType: 'declarative', itemRefs: ['c1', 'c2', 'c3'] })))
      .toBe('flashcards · 3 cards');
  });

  it('procedural blocks → "drills · N item(s)"', () => {
    expect(
      describeActivity(
        block({ moduleRef: 'shapes-and-patterns', memoryType: 'procedural', itemRefs: ['s1'] }),
      ),
    ).toBe('drills · 1 item');
    expect(
      describeActivity(
        block({
          moduleRef: 'shapes-and-patterns',
          memoryType: 'procedural',
          itemRefs: ['s1', 's2', 's3', 's4'],
        }),
      ),
    ).toBe('drills · 4 items');
  });

  it('integration + repertoire → "repertoire · N song(s)"', () => {
    expect(
      describeActivity(
        block({ moduleRef: 'repertoire', memoryType: 'integration', itemRefs: ['song-a'] }),
      ),
    ).toBe('repertoire · 1 song');
    expect(
      describeActivity(
        block({
          moduleRef: 'repertoire',
          memoryType: 'integration',
          itemRefs: ['song-a', 'song-b'],
        }),
      ),
    ).toBe('repertoire · 2 songs');
  });

  it('integration + production → "lessons · N lesson(s)"', () => {
    expect(
      describeActivity(
        block({ moduleRef: 'production', memoryType: 'integration', itemRefs: ['wf-01'] }),
      ),
    ).toBe('lessons · 1 lesson');
    expect(
      describeActivity(
        block({
          moduleRef: 'production',
          memoryType: 'integration',
          itemRefs: ['wf-01', 'wf-02'],
        }),
      ),
    ).toBe('lessons · 2 lessons');
  });

  it('expression blocks → "freeform play"', () => {
    expect(describeActivity(block({ memoryType: 'expression', itemRefs: [] })))
      .toBe('freeform play');
  });

  describe('procedural with itemLabels (S&P drill names)', () => {
    it('names a single drill when one label resolves', () => {
      const labels = new Map([['s1', 'Cmaj (major) — root position']]);
      const result = describeActivity(
        block({ moduleRef: 'shapes-and-patterns', memoryType: 'procedural', itemRefs: ['s1'] }),
        labels,
      );
      expect(result).toBe('Cmaj (major) — root position · 1 item');
    });

    it('joins up to 2 unique labels, then appends "+N more"', () => {
      const labels = new Map([
        ['s1', 'Cmaj (major)'],
        ['s2', 'Dmaj (major)'],
        ['s3', 'Emaj (major)'],
        ['s4', 'Fmaj (major)'],
      ]);
      const result = describeActivity(
        block({
          moduleRef: 'shapes-and-patterns',
          memoryType: 'procedural',
          itemRefs: ['s1', 's2', 's3', 's4'],
        }),
        labels,
      );
      expect(result).toBe('Cmaj (major), Dmaj (major), +2 more · 4 items');
    });

    it('dedupes labels — 6 items with the same label show one entry', () => {
      const labels = new Map([
        ['s1', 'Major triads'],
        ['s2', 'Major triads'],
        ['s3', 'Major triads'],
      ]);
      const result = describeActivity(
        block({
          moduleRef: 'shapes-and-patterns',
          memoryType: 'procedural',
          itemRefs: ['s1', 's2', 's3'],
        }),
        labels,
      );
      expect(result).toBe('Major triads · 3 items');
    });

    it('falls back to the generic noun when no labels resolve', () => {
      // Empty map + items the resolver doesn't know about → drop
      // to the pre-existing "drills · N items" output. Preserves
      // the prior contract for tests / fallback paths that don't
      // pre-load labels.
      const result = describeActivity(
        block({
          moduleRef: 'shapes-and-patterns',
          memoryType: 'procedural',
          itemRefs: ['unknown-1', 'unknown-2'],
        }),
        new Map(),
      );
      expect(result).toBe('drills · 2 items');
    });

    it('mixes resolved + unresolved — uses the resolved ones', () => {
      const labels = new Map([['s1', 'Major triads']]);
      const result = describeActivity(
        block({
          moduleRef: 'shapes-and-patterns',
          memoryType: 'procedural',
          itemRefs: ['s1', 'unknown-1', 'unknown-2'],
        }),
        labels,
      );
      // item count stays at 3 (every itemRef counts), but only one
      // label was resolvable.
      expect(result).toBe('Major triads · 3 items');
    });
  });

  it('never repeats the module label or duration', () => {
    const result = describeActivity(
      block({
        moduleRef: 'harmonic-fluency',
        memoryType: 'declarative',
        itemRefs: ['c1', 'c2'],
        plannedSeconds: 180,
      }),
    );
    expect(result).not.toMatch(/harmonic fluency/i);
    expect(result).not.toMatch(/min\b/);
    expect(result).not.toMatch(/\d+\s*min/);
  });
});
