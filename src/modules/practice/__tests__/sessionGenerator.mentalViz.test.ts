// @vitest-environment jsdom
/**
 * Tests for the Mental Visualization parallel candidate stream
 * (SESSION_DESIGN.md § "Non-keyboard session — Block order"):
 *
 *   · maybeBuildMentalVizBlock — fires on laptop / phone / full;
 *     returns null on keys. Duration scales by per-context weight
 *     (phone primary, laptop + full secondary). Drops the block
 *     when the carve-out would leave less than
 *     MIN_VIABLE_PRACTICE_SECONDS for the rest of the session.
 *
 *   · buildMentalVizBlock — produces a ProposalBlock with
 *     isKeyboardRequired=false, no itemRefs (no SpacingState),
 *     quickLaunchRoute to the Mental Visualization tab.
 */
import { describe, expect, it } from 'vitest';
import {
  buildMentalVizBlock,
  maybeBuildMentalVizBlock,
} from '../sessionGenerator';
import {
  MENTAL_VIZ_PLANNED_SECONDS,
  MENTAL_VIZ_WEIGHT_FULL,
  MENTAL_VIZ_WEIGHT_LAPTOP,
  MENTAL_VIZ_WEIGHT_PHONE,
  MIN_VIABLE_PRACTICE_SECONDS,
} from '../../../lib/sessionAlgorithm/sessionDesign';

describe('maybeBuildMentalVizBlock — context gating', () => {
  it('fires on phone (primary surface — weight 1.4 × planned)', async () => {
    const block = await maybeBuildMentalVizBlock({
      context: 'phone',
      availableSeconds: 30 * 60,
    });
    expect(block).not.toBeNull();
    expect(block!.plannedSeconds).toBe(
      Math.round(MENTAL_VIZ_PLANNED_SECONDS * MENTAL_VIZ_WEIGHT_PHONE),
    );
  });

  it('fires on laptop (secondary surface — weight 0.8 × planned)', async () => {
    const block = await maybeBuildMentalVizBlock({
      context: 'laptop',
      availableSeconds: 30 * 60,
    });
    expect(block).not.toBeNull();
    expect(block!.plannedSeconds).toBe(
      Math.round(MENTAL_VIZ_PLANNED_SECONDS * MENTAL_VIZ_WEIGHT_LAPTOP),
    );
  });

  it('fires on full (non-keyboard arc — weight 0.8 × planned)', async () => {
    const block = await maybeBuildMentalVizBlock({
      context: 'full',
      availableSeconds: 60 * 60,
    });
    expect(block).not.toBeNull();
    expect(block!.plannedSeconds).toBe(
      Math.round(MENTAL_VIZ_PLANNED_SECONDS * MENTAL_VIZ_WEIGHT_FULL),
    );
  });

  it('returns null on keys (keyboard-only sessions don\'t surface mental viz)', async () => {
    const block = await maybeBuildMentalVizBlock({
      context: 'keys',
      availableSeconds: 30 * 60,
    });
    expect(block).toBeNull();
  });

  it('drops the block when carve-out would leave < MIN_VIABLE_PRACTICE_SECONDS for practice', async () => {
    // Phone planned ≈ 420 s. With availableSeconds just above the
    // floor, carving 420 s would push practice below the floor.
    const tightSeconds = MIN_VIABLE_PRACTICE_SECONDS + 60; // 6 min total
    const block = await maybeBuildMentalVizBlock({
      context: 'phone',
      availableSeconds: tightSeconds,
    });
    expect(block).toBeNull();
  });
});

describe('buildMentalVizBlock — ProposalBlock shape', () => {
  const planned = 5 * 60;
  const block = buildMentalVizBlock(planned);

  it('targets the S&P module with the Mental Visualization label', () => {
    expect(block.moduleRef).toBe('shapes-and-patterns');
    expect(block.moduleLabel).toBe('Mental Visualization');
  });

  it('carries no itemRefs (no SpacingState)', () => {
    expect(block.itemRefs).toEqual([]);
  });

  it('flagged as non-keyboard so full-context sequencing puts it in the non-kb bucket', () => {
    expect(block.isKeyboardRequired).toBe(false);
  });

  it('quick-launches into the Mental Visualization tab on the S&P page', () => {
    expect(block.quickLaunchRoute).toBe('/shapes-and-patterns?tab=mental-viz');
  });

  it('not a warm-up (no badge)', () => {
    expect(block.isWarmup).toBe(false);
  });

  it('carries the requested planned seconds', () => {
    expect(block.plannedSeconds).toBe(planned);
  });
});
