// @vitest-environment jsdom
/**
 * Phase 3 Step 2b — acquisition-stage predicate contract tests.
 *
 * The transition math is tested separately in
 * `lib/__tests__/spacingState.test.ts`. These tests cover the Phase 3
 * algorithm-side predicates that handle the "no row = implicitly
 * new" rule.
 */
import { describe, expect, it } from 'vitest';
import {
  COVERED_STAGES,
  acquisitionStageFor,
  getAcquiringItems,
  isAcquired,
  isAcquiring,
  isNew,
} from '../acquisitionStage';
import type { SpacingRow } from '../types';
import type { AcquisitionStage } from '../../db';

function row(stage: AcquisitionStage): SpacingRow {
  return {
    itemRef: `item-${stage}`,
    moduleRef: 'shapes-and-patterns',
    acquisitionStage: stage,
    lastEngagedAt: null,
    nextDueAt: null,
  };
}

describe('acquisitionStageFor', () => {
  it('returns the row stage when present', () => {
    expect(acquisitionStageFor(row('acquiring'))).toBe('acquiring');
    expect(acquisitionStageFor(row('acquired'))).toBe('acquired');
  });

  it('returns "new" for missing rows', () => {
    expect(acquisitionStageFor(undefined)).toBe('new');
  });
});

describe('predicates', () => {
  it('isNew', () => {
    expect(isNew(undefined)).toBe(true);
    expect(isNew(row('new'))).toBe(true);
    expect(isNew(row('acquiring'))).toBe(false);
    expect(isNew(row('acquired'))).toBe(false);
  });

  it('isAcquiring', () => {
    expect(isAcquiring(undefined)).toBe(false);
    expect(isAcquiring(row('new'))).toBe(false);
    expect(isAcquiring(row('acquiring'))).toBe(true);
    expect(isAcquiring(row('acquired'))).toBe(false);
  });

  it('isAcquired (covers acquired / consolidated / mastered)', () => {
    expect(isAcquired(undefined)).toBe(false);
    expect(isAcquired(row('new'))).toBe(false);
    expect(isAcquired(row('acquiring'))).toBe(false);
    expect(isAcquired(row('acquired'))).toBe(true);
    expect(isAcquired(row('consolidated'))).toBe(true);
    expect(isAcquired(row('mastered'))).toBe(true);
  });
});

describe('getAcquiringItems', () => {
  it('returns only rows in acquiring stage', () => {
    const rows = [
      row('new'),
      row('acquiring'),
      row('acquired'),
      row('consolidated'),
    ];
    const out = getAcquiringItems(rows);
    expect(out.length).toBe(1);
    expect(out[0].acquisitionStage).toBe('acquiring');
  });
});

describe('COVERED_STAGES', () => {
  it('matches the design — acquired / consolidated / mastered only', () => {
    expect(COVERED_STAGES.has('new')).toBe(false);
    expect(COVERED_STAGES.has('acquiring')).toBe(false);
    expect(COVERED_STAGES.has('acquired')).toBe(true);
    expect(COVERED_STAGES.has('consolidated')).toBe(true);
    expect(COVERED_STAGES.has('mastered')).toBe(true);
  });
});
