// @vitest-environment jsdom
/**
 * Phase B Step 9c — suggestion engine contract tests.
 *
 * Drives `computeNextProgressionSuggestion` with hand-built stages so
 * the cases are explicit. Real-catalog stages are exercised
 * separately in progressionStages.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  computeNextProgressionSuggestion,
} from '../progressionSuggestion';
import type { ProgressionStage } from '../progressionStages';

function stage(id: string, items: string[]): ProgressionStage {
  return { id, name: id, itemRefs: items };
}

// Helper that builds a 3-stage walk used by most tests.
const A = stage('a', ['a1', 'a2', 'a3']);
const B = stage('b', ['b1', 'b2', 'b3']);
const C = stage('c', ['c1', 'c2', 'c3']);

// =====================================================================
// Clear "next stage" cases
// =====================================================================

describe('computeNextProgressionSuggestion — clear next-stage case', () => {
  it('empty scope → suggests stage A', () => {
    const r = computeNextProgressionSuggestion([A, B, C], []);
    expect(r).toEqual({
      kind: 'next',
      stage: A,
      addItemRefs: ['a1', 'a2', 'a3'],
      addCount: 3,
    });
  });

  it('stage A fully in scope → suggests stage B', () => {
    const r = computeNextProgressionSuggestion([A, B, C], ['a1', 'a2', 'a3']);
    expect(r?.kind).toBe('next');
    if (r?.kind === 'next') expect(r.stage.id).toBe('b');
  });

  it('every stage fully in scope → null (nothing more to do)', () => {
    const r = computeNextProgressionSuggestion(
      [A, B, C],
      ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'],
    );
    expect(r).toBeNull();
  });
});

// =====================================================================
// Half-done case
// =====================================================================

describe('computeNextProgressionSuggestion — half-done case', () => {
  it('partial stage A with B/C empty → half-done with A=remain + B=next', () => {
    const r = computeNextProgressionSuggestion([A, B, C], ['a1']);
    expect(r?.kind).toBe('half-done');
    if (r?.kind !== 'half-done') return;
    expect(r.currentStage.id).toBe('a');
    expect(r.currentStageRemainingItemRefs).toEqual(['a2', 'a3']);
    expect(r.currentStageAddCount).toBe(2);
    expect(r.nextStage?.id).toBe('b');
    expect(r.nextStageAddItemRefs).toEqual(['b1', 'b2', 'b3']);
    expect(r.nextStageAddCount).toBe(3);
  });

  it('partial last stage → half-done with nextStage = null', () => {
    const r = computeNextProgressionSuggestion(
      [A, B, C],
      ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'],
    );
    expect(r?.kind).toBe('half-done');
    if (r?.kind !== 'half-done') return;
    expect(r.currentStage.id).toBe('c');
    expect(r.currentStageRemainingItemRefs).toEqual(['c2', 'c3']);
    expect(r.nextStage).toBeNull();
    expect(r.nextStageAddItemRefs).toEqual([]);
    expect(r.nextStageAddCount).toBe(0);
  });

  it('partial A with B partial → ambiguous, returns null', () => {
    // The user has spread scope across A AND B — the suggestion
    // engine shouldn't pick one. Falls back to Option A (info only).
    const r = computeNextProgressionSuggestion(
      [A, B, C], ['a1', 'b1'],
    );
    expect(r).toBeNull();
  });

  it("partial A with B full → still ambiguous", () => {
    const r = computeNextProgressionSuggestion(
      [A, B, C], ['a1', 'b1', 'b2', 'b3'],
    );
    expect(r).toBeNull();
  });
});

// =====================================================================
// Scattered / skip-stage cases
// =====================================================================

describe('computeNextProgressionSuggestion — scattered scope', () => {
  it("empty A but partial B → returns null (user reached forward)", () => {
    // Scope has B items but no A items. Don't urge the user
    // backward — return null.
    const r = computeNextProgressionSuggestion([A, B, C], ['b1', 'b2']);
    expect(r).toBeNull();
  });

  it('empty A and full C → null (scope jumped past A)', () => {
    const r = computeNextProgressionSuggestion(
      [A, B, C], ['c1', 'c2', 'c3'],
    );
    expect(r).toBeNull();
  });
});

// =====================================================================
// Empty / skip stages
// =====================================================================

describe('computeNextProgressionSuggestion — empty stages skipped', () => {
  const Empty = stage('empty', []);

  it('all-empty input → null (no actionable progression)', () => {
    const r = computeNextProgressionSuggestion([], []);
    expect(r).toBeNull();
  });

  it('TBD stage at front → walks to first item-bearing stage', () => {
    // The VL stub / TBD Layer-3 stages have no items. They must not
    // be returned as the "next thing" — the engine skips them.
    const r = computeNextProgressionSuggestion([Empty, A, B], []);
    expect(r?.kind).toBe('next');
    if (r?.kind === 'next') expect(r.stage.id).toBe('a');
  });

  it('TBD stage between full A and empty B → walks past TBD to B', () => {
    const r = computeNextProgressionSuggestion(
      [A, Empty, B], ['a1', 'a2', 'a3'],
    );
    expect(r?.kind).toBe('next');
    if (r?.kind === 'next') expect(r.stage.id).toBe('b');
  });

  it('every item-bearing stage full + only TBDs left → null', () => {
    const r = computeNextProgressionSuggestion(
      [A, Empty], ['a1', 'a2', 'a3'],
    );
    expect(r).toBeNull();
  });
});

// =====================================================================
// Iterable input
// =====================================================================

describe('computeNextProgressionSuggestion — input shapes', () => {
  it('accepts a Set directly without re-walking', () => {
    const r = computeNextProgressionSuggestion(
      [A, B, C],
      new Set(['a1', 'a2', 'a3']),
    );
    expect(r?.kind).toBe('next');
    if (r?.kind === 'next') expect(r.stage.id).toBe('b');
  });

  it('accepts any Iterable<string>', () => {
    function* gen(): Generator<string> {
      yield 'a1'; yield 'a2'; yield 'a3';
    }
    const r = computeNextProgressionSuggestion([A, B, C], gen());
    expect(r?.kind).toBe('next');
  });
});
