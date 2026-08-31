/**
 * One acquisition rule, and the disagreement it replaces.
 *
 * =====================================================================
 * THE FIXTURE IS THE OLD BUG. A cell worked left and right but never
 * hands-together read three ways at once: the matrix drew it in
 * progress, the Progress line called it not started (it read only the
 * `both` row), and the module home card called it touched. Every test
 * below that uses `leftAndRight` is asking the three surfaces the same
 * question and requiring one answer.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import type { AcquisitionStage, DrillHand, SpacingState } from '../../../lib/db';
import {
  HAND_ORDER,
  acquisitionIndex,
  bucketForStage,
  handsFor,
} from '../acquisition';

const row = (
  itemRef: string,
  hand: DrillHand,
  acquisitionStage: AcquisitionStage,
): SpacingState => ({
  id: `ss-${itemRef}-${hand}`,
  itemRef,
  moduleRef: 'shapes-and-patterns',
  hand,
  memoryType: 'procedural',
  acquisitionStage,
  currentIntervalDays: 3,
  lastEngagedAt: 1,
  nextDueAt: null,
  performanceHistory: [],
} as SpacingState);

const SCALE = 'scale:major:C';
const VL = 'vl:aba-251:Bb';
const CHORD = 'chord-shape:maj7:C:root';

describe('the ladder collapses one way', () => {
  it('reads acquired and everything above it as acquired', () => {
    for (const s of ['acquired', 'consolidated', 'mastered'] as AcquisitionStage[]) {
      expect(bucketForStage(s), s).toBe('acquired');
    }
  });

  it('reads a row that exists but has not got there as in progress', () => {
    expect(bucketForStage('acquiring')).toBe('in-progress');
  });

  it('reads no row at all as not started', () => {
    expect(bucketForStage(undefined)).toBe('not-started');
    expect(bucketForStage(null)).toBe('not-started');
  });
});

describe('which hands an item is drilled on', () => {
  it('is three for scales and chord shapes', () => {
    expect(handsFor(SCALE)).toEqual(HAND_ORDER);
    expect(handsFor(CHORD)).toEqual(HAND_ORDER);
  });

  it('is BOTH alone where there is no hand dimension', () => {
    // Voice leading is two-handed by nature and only ever writes
    // `both`. Requiring left and right of it would make every VL cell
    // permanently unacquirable — waiting on rows that cannot exist.
    expect(handsFor(VL)).toEqual(['both']);
  });
});

describe('a cell', () => {
  it('is not started with no row for any hand', () => {
    expect(acquisitionIndex([]).cell(SCALE)).toBe('not-started');
  });

  it('is in progress the moment one hand has a row', () => {
    const index = acquisitionIndex([row(SCALE, 'left', 'acquiring')]);
    expect(index.cell(SCALE)).toBe('in-progress');
  });

  it('is STILL in progress with left and right acquired and both untouched', () => {
    // The fixture the three surfaces disagreed about.
    const index = acquisitionIndex([
      row(SCALE, 'left', 'acquired'),
      row(SCALE, 'right', 'mastered'),
    ]);
    expect(index.cell(SCALE)).toBe('in-progress');
    expect(index.hand(SCALE, 'left')).toBe('acquired');
    expect(index.hand(SCALE, 'right')).toBe('acquired');
    expect(index.hand(SCALE, 'both')).toBe('not-started');
  });

  it('is acquired only when every hand it is drilled on is', () => {
    const index = acquisitionIndex([
      row(SCALE, 'left', 'acquired'),
      row(SCALE, 'right', 'acquired'),
      row(SCALE, 'both', 'consolidated'),
    ]);
    expect(index.cell(SCALE)).toBe('acquired');
  });

  it('is acquired from its one hand where that is all it has', () => {
    expect(acquisitionIndex([row(VL, 'both', 'acquired')]).cell(VL)).toBe('acquired');
  });

  it('reads a chord-shape hand from its one row', () => {
    // THIS USED TO PIN THE OPPOSITE. Chord shapes were drilled solid
    // and arpeggiated with a spacing row each, and a hand counted as
    // acquired only when both were. The arpeggiated dimension is
    // retired, so the manner no longer forks the rating and a hand has
    // one row again.
    const index = acquisitionIndex([row(CHORD, 'left', 'acquired')]);
    expect(index.hand(CHORD, 'left')).toBe('acquired');
  });

  it('still takes the lower answer if a duplicate row somehow exists', () => {
    // Not a rule, a guard: a stray second row must not be able to
    // promote a hand past what its worst row says.
    const index = acquisitionIndex([
      row(CHORD, 'left', 'acquired'),
      row(CHORD, 'left', 'acquiring'),
    ]);
    expect(index.hand(CHORD, 'left')).toBe('in-progress');
  });
});

describe('counting a group', () => {
  const rows = [
    row('scale:major:C', 'left', 'acquired'),
    row('scale:major:C', 'right', 'acquired'),
    row('scale:major:C', 'both', 'acquired'),
    row('scale:major:G', 'left', 'acquired'),
    row('scale:major:G', 'right', 'acquired'),
    row('scale:major:D', 'left', 'acquiring'),
  ];
  const refs = ['scale:major:C', 'scale:major:G', 'scale:major:D', 'scale:major:A'];

  it('divides the group across the three buckets, summing to its size', () => {
    const counts = acquisitionIndex(rows).count(refs);
    expect(counts).toEqual({
      total: 4, acquired: 1, inProgress: 2, notStarted: 1,
    });
    expect(counts.acquired + counts.inProgress + counts.notStarted)
      .toBe(counts.total);
  });

  it('still answers the per-hand question one item at a time', () => {
    // `handCounts` — the group roll-up this used to assert — went with
    // the per-hand bars it fed. The per-hand FACT is unchanged and is
    // still asked cell by cell, which is where a reader can act on it.
    const index = acquisitionIndex(rows);
    expect(index.hand(refs[0], 'left')).toBe('acquired');
    expect(index.hand(refs[0], 'both')).toBe('acquired');
  });
});
