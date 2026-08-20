/**
 * Pins the folding that two of the three old stat computations skipped
 * (`docs/RULE_LEGIBILITY.md` §1.12) — the reason the Dashboard and the
 * Skills catalogue could disagree with the in-quiz tracker about the
 * same chord.
 */
import { describe, expect, it } from 'vitest';
import { canonicalItemId, moduleNormalisesItemIds } from '../canonicalItemId';

describe('canonicalItemId', () => {
  it('folds legacy chord-recognition ids onto root position', () => {
    // Attempts logged before the inversion build carry a bare chord id.
    expect(canonicalItemId('chord-recognition', 'maj')).toBe('maj:0');
    expect(canonicalItemId('chord-recognition', 'dom7sus4')).toBe('dom7sus4:0');
  });

  it('leaves already-canonical chord-recognition ids alone', () => {
    expect(canonicalItemId('chord-recognition', 'maj:0')).toBe('maj:0');
    expect(canonicalItemId('chord-recognition', 'min7:2')).toBe('min7:2');
  });

  it('buckets a legacy and a modern attempt on the same key', () => {
    // The actual defect: these two must land in one bucket or the same
    // chord shows two different tiers on two screens.
    expect(canonicalItemId('chord-recognition', 'maj'))
      .toBe(canonicalItemId('chord-recognition', 'maj:0'));
  });

  it('passes every other module through untouched', () => {
    // The same string means different things per module — an intervals
    // `M3:asc` must not acquire a `:0`.
    expect(canonicalItemId('intervals', 'M3:asc')).toBe('M3:asc');
    expect(canonicalItemId('harmonic-fluency', 'dq-maj-1')).toBe('dq-maj-1');
    expect(canonicalItemId('reading', 'sig:2s:major:name')).toBe('sig:2s:major:name');
    expect(canonicalItemId('chord-progressions', 'motion:1-5-asc')).toBe('motion:1-5-asc');
    // A bare id in a non-folding module stays bare.
    expect(canonicalItemId('intervals', 'M3')).toBe('M3');
  });

  it('is total — unknown modules and empty ids do not throw', () => {
    // Stored data outlives assumptions. A read path that crashes on an
    // unexpected id is worse than one that counts it literally.
    expect(canonicalItemId('not-a-module', 'whatever')).toBe('whatever');
    expect(canonicalItemId('chord-recognition', '')).toBe(':0');
    expect(canonicalItemId('', '')).toBe('');
  });

  it('reports which modules fold, so an affordance can say so', () => {
    expect(moduleNormalisesItemIds('chord-recognition')).toBe(true);
    expect(moduleNormalisesItemIds('intervals')).toBe(false);
  });
});
