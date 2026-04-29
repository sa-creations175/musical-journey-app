// @vitest-environment jsdom
/**
 * Phase 2 step 5c.1 contract tests for the shared dimension
 * primitives. Today this covers the only piece of the file that
 * has logic worth testing on its own: `pruneMasteryToBreadth` —
 * the coordinated update rule that keeps Mastery's selected
 * groupIds within the active Breadth scope.
 *
 * jsdom env required because the dimensions file imports
 * CategoryPillButton from GoalCreationFlow, which transitively
 * pulls db.ts (touches `window` under an `import.meta.env.DEV`
 * guard). Same pattern as moduleItemCounts.test.ts and
 * progress.test.ts.
 *
 * The visual primitives (DimensionSection, BreadthYesNoPicker,
 * AccuracySlider, ConsistencyControl, CountInput) are presentational
 * — pure-controlled, no internal state — so they're tested
 * indirectly through their consumers' integration paths once
 * 5c.2–5c.6 wire all six modules.
 */
import { describe, it, expect } from 'vitest';
import { pruneMasteryToBreadth, type BreadthState } from '../yearlyAnchorDimensions';

describe('pruneMasteryToBreadth', () => {
  it('returns a fresh array when Breadth is "all"', () => {
    const breadth: BreadthState = { kind: 'all' };
    const mastery = ['intervals', 'chord-recognition'];
    const result = pruneMasteryToBreadth(breadth, mastery);
    expect(result).toEqual(mastery);
    // Defensive contract: callers may freely mutate the returned
    // array — it is never the input reference.
    expect(result).not.toBe(mastery);
  });

  it('drops Mastery ids that are not in a "subset" Breadth', () => {
    const breadth: BreadthState = { kind: 'subset', groupIds: ['intervals'] };
    const mastery = ['intervals', 'chord-recognition', 'chord-progressions'];
    expect(pruneMasteryToBreadth(breadth, mastery)).toEqual(['intervals']);
  });

  it('returns empty when no Mastery id is in the subset', () => {
    const breadth: BreadthState = { kind: 'subset', groupIds: ['scales-modes'] };
    const mastery = ['intervals', 'chord-recognition'];
    expect(pruneMasteryToBreadth(breadth, mastery)).toEqual([]);
  });

  it('preserves Mastery order from the input', () => {
    const breadth: BreadthState = {
      kind: 'subset',
      groupIds: ['intervals', 'chord-recognition', 'scales-modes'],
    };
    const mastery = ['scales-modes', 'intervals', 'chord-recognition'];
    expect(pruneMasteryToBreadth(breadth, mastery)).toEqual([
      'scales-modes',
      'intervals',
      'chord-recognition',
    ]);
  });

  it('returns empty for an empty subset Breadth', () => {
    const breadth: BreadthState = { kind: 'subset', groupIds: [] };
    expect(pruneMasteryToBreadth(breadth, ['intervals'])).toEqual([]);
  });

  it('returns empty for empty Mastery regardless of Breadth', () => {
    expect(pruneMasteryToBreadth({ kind: 'all' }, [])).toEqual([]);
    expect(pruneMasteryToBreadth({ kind: 'subset', groupIds: ['intervals'] }, []))
      .toEqual([]);
  });

  it('does not mutate the input Mastery array', () => {
    const mastery = ['intervals', 'chord-recognition'];
    const snapshot = [...mastery];
    pruneMasteryToBreadth({ kind: 'subset', groupIds: ['intervals'] }, mastery);
    expect(mastery).toEqual(snapshot);
  });

  it('destructive pruning: widening Breadth back to "all" does not restore previously-pruned ids', () => {
    // This test encodes the spec call that "pruning is destructive":
    // a user who narrows Breadth, accepts the prune, then widens
    // Breadth back to "all" does NOT see their dropped Mastery
    // selections come back. The function itself is stateless; the
    // destructive property is enforced by the parent component
    // calling pruneMasteryToBreadth on every Breadth change.
    let mastery: string[] = ['intervals', 'chord-recognition'];

    // 1. Breadth narrows to ['intervals'] — prune.
    mastery = pruneMasteryToBreadth({ kind: 'subset', groupIds: ['intervals'] }, mastery);
    expect(mastery).toEqual(['intervals']);

    // 2. Breadth widens back to all — Mastery stays pruned.
    mastery = pruneMasteryToBreadth({ kind: 'all' }, mastery);
    expect(mastery).toEqual(['intervals']);

    // 3. Even with all Breadth groups available, chord-recognition
    //    does not auto-return — that selection is genuinely gone.
    expect(mastery).not.toContain('chord-recognition');
  });
});
