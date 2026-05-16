// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  computeGlobalEtStage,
  isSubmoduleGated,
  maxAllowedProgressionStage,
  maxAllowedScaleModesStage,
  meetsEtStage,
  type EtSubmoduleStatus,
} from '../etStageGate';

const status = (cr: number, prog: number): EtSubmoduleStatus => ({
  crTier: cr, progressionStage: prog,
});

// -----------------------------------------------------------------
// meetsEtStage — per-gate predicates
// -----------------------------------------------------------------

describe('meetsEtStage', () => {
  it('Stage 1 is always met', () => {
    expect(meetsEtStage(1, status(1, 1))).toBe(true);
  });

  it('Stage 2 requires CR Tier 1 cleared (CR ≥ 2)', () => {
    expect(meetsEtStage(2, status(1, 1))).toBe(false);
    expect(meetsEtStage(2, status(2, 1))).toBe(true);
  });

  it('Stage 3 requires CR T2 cleared AND progressions Stage 1 cleared', () => {
    expect(meetsEtStage(3, status(3, 1))).toBe(false); // missing progression
    expect(meetsEtStage(3, status(2, 2))).toBe(false); // missing CR
    expect(meetsEtStage(3, status(3, 2))).toBe(true);
  });

  it('Stage 4 requires CR T3 cleared AND progressions Stage 2 cleared', () => {
    expect(meetsEtStage(4, status(4, 2))).toBe(false); // missing progression
    expect(meetsEtStage(4, status(3, 3))).toBe(false); // missing CR
    expect(meetsEtStage(4, status(4, 3))).toBe(true);
  });

  it('Stage 5 requires CR T4 cleared', () => {
    expect(meetsEtStage(5, status(4, 4))).toBe(false); // CR still at T4 unlocked
    expect(meetsEtStage(5, status(5, 4))).toBe(true);
  });
});

// -----------------------------------------------------------------
// computeGlobalEtStage
// -----------------------------------------------------------------

describe('computeGlobalEtStage', () => {
  it('cold start (CR T1 only, no progressions) → ET Stage 1', () => {
    expect(computeGlobalEtStage(status(1, 1))).toBe(1);
  });

  it('CR T1 cleared, no progressions yet → ET Stage 2', () => {
    expect(computeGlobalEtStage(status(2, 1))).toBe(2);
  });

  it('CR T2 cleared + progressions Stage 1 cleared → ET Stage 3', () => {
    expect(computeGlobalEtStage(status(3, 2))).toBe(3);
  });

  it('CR T3 cleared + progressions Stage 2 cleared → ET Stage 4', () => {
    expect(computeGlobalEtStage(status(4, 3))).toBe(4);
  });

  it('CR T4 cleared (full requirement for Stage 5) → ET Stage 5', () => {
    expect(computeGlobalEtStage(status(5, 4))).toBe(5);
  });

  it('stops at the first failed gate (CR T2 cleared but no progression) → Stage 2', () => {
    // crTier=3 means CR T2 cleared. progressionStage=1 means Stage 1 not
    // cleared. Stage 3 requires both → gate fails → caps at Stage 2.
    expect(computeGlobalEtStage(status(3, 1))).toBe(2);
  });
});

// -----------------------------------------------------------------
// max-allowed clamps
// -----------------------------------------------------------------

describe('maxAllowedProgressionStage', () => {
  it('returns 1 when below ET Stage 2 (submodule fully gated)', () => {
    expect(maxAllowedProgressionStage(status(1, 1))).toBe(1);
  });

  it('ET Stage 2 → progressions Stage 1 max', () => {
    expect(maxAllowedProgressionStage(status(2, 1))).toBe(1);
  });

  it('ET Stage 3 → progressions Stage 2 max', () => {
    expect(maxAllowedProgressionStage(status(3, 2))).toBe(2);
  });

  it('ET Stage 4 → progressions Stage 3 max', () => {
    expect(maxAllowedProgressionStage(status(4, 3))).toBe(3);
  });

  it('ET Stage 5 → progressions Stage 4 max (catalog cap)', () => {
    expect(maxAllowedProgressionStage(status(5, 4))).toBe(4);
  });
});

describe('maxAllowedScaleModesStage', () => {
  it('ET Stage 2 → scales-modes Stage 1 max', () => {
    expect(maxAllowedScaleModesStage(status(2, 1))).toBe(1);
  });

  it('ET Stage 3 → scales-modes Stage 2 max (catalog cap)', () => {
    expect(maxAllowedScaleModesStage(status(3, 2))).toBe(2);
  });

  it('ET Stage 5 → still caps at scales-modes Stage 2 (catalog cap)', () => {
    expect(maxAllowedScaleModesStage(status(5, 4))).toBe(2);
  });
});

// -----------------------------------------------------------------
// isSubmoduleGated
// -----------------------------------------------------------------

describe('isSubmoduleGated', () => {
  it('true when CR T1 not yet cleared (below ET Stage 2)', () => {
    expect(isSubmoduleGated(status(1, 1))).toBe(true);
  });

  it('false once ET Stage 2 is met', () => {
    expect(isSubmoduleGated(status(2, 1))).toBe(false);
  });
});
