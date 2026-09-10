// @vitest-environment jsdom
/**
 * The cross-submodule Ear Training gate, after the progressions ladder
 * was retired.
 *
 * =====================================================================
 * ONE LADDER GATES EVERYTHING NOW, AND IT IS CHORD RECOGNITION'S.
 *
 * Stages 3 and 4 used to require a progressions stage as well, which
 * held a reader at Scales & Modes Tier 1 on the strength of a ladder
 * over the old eight-entry catalog — a catalog the card they were
 * actually opening no longer used. Silas retired it on 10 Sep 2026.
 *
 * What these assert is that the gate that STAYED still bites: you name
 * the six triads by ear before the app asks you to hear them move.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  computeGlobalEtStage,
  isSubmoduleGated,
  maxAllowedScaleModesStage,
  meetsEtStage,
  type EtSubmoduleStatus,
} from '../etStageGate';

const status = (cr: number): EtSubmoduleStatus => ({ crTier: cr });

describe('meetsEtStage', () => {
  it('Stage 1 is always met', () => {
    expect(meetsEtStage(1, status(1))).toBe(true);
  });

  it('Stage 2 requires Chord Recognition Tier 1 cleared', () => {
    expect(meetsEtStage(2, status(1))).toBe(false);
    expect(meetsEtStage(2, status(2))).toBe(true);
  });

  it('each stage above it wants one more Chord Recognition Tier', () => {
    for (const stage of [3, 4, 5] as const) {
      expect(meetsEtStage(stage, status(stage - 1)), String(stage)).toBe(false);
      expect(meetsEtStage(stage, status(stage)), String(stage)).toBe(true);
    }
  });

  it('asks nothing of a progressions ladder, because there is none', () => {
    // The whole point of the retirement: a reader whose chord ear has
    // run ahead is not held back by a progressions stage.
    expect(meetsEtStage(5, status(5))).toBe(true);
  });
});

describe('computeGlobalEtStage', () => {
  it('walks up with the Chord Recognition Tier', () => {
    expect(computeGlobalEtStage(status(1))).toBe(1);
    expect(computeGlobalEtStage(status(2))).toBe(2);
    expect(computeGlobalEtStage(status(3))).toBe(3);
    expect(computeGlobalEtStage(status(4))).toBe(4);
    expect(computeGlobalEtStage(status(5))).toBe(5);
  });
});

describe('isSubmoduleGated', () => {
  it('holds everything shut until Chord Recognition Tier 1 clears', () => {
    expect(isSubmoduleGated(status(1))).toBe(true);
    expect(isSubmoduleGated(status(2))).toBe(false);
  });
});

describe('maxAllowedScaleModesStage', () => {
  it('opens Tier 1 at CR Tier 1 cleared and Tier 2 one Tier later', () => {
    expect(maxAllowedScaleModesStage(status(1))).toBe(1);
    expect(maxAllowedScaleModesStage(status(2))).toBe(1);
    expect(maxAllowedScaleModesStage(status(3))).toBe(2);
  });

  it('never goes past the last Tier the catalog has', () => {
    expect(maxAllowedScaleModesStage(status(5))).toBe(2);
  });
});
