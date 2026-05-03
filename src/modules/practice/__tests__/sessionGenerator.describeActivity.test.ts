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
