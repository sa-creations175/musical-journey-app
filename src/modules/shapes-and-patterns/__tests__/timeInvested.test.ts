/**
 * Time invested, per sub-module.
 *
 * =====================================================================
 * TWO KINDS OF `skillId`, AND BOTH HAVE TO LAND. Scales, voice leading
 * and mental visualisation stand their canonical itemRef in for the
 * skill id, so a session names its own section. Chord shapes store a
 * `DrillSkill` row id, which says nothing until it is looked up — and
 * a sum that only handled the first kind would report chord shapes as
 * zero while every other section was right, which reads as "I have not
 * done any" rather than as a missing join.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import type { DrillSession, DrillSkill } from '../../../lib/db';
import {
  sectionForSession, sessionsByTarget, shapesTimeInvested, splitOf, timeForTargets,
} from '../timeInvested';
import { sectionCells, itemCellTargets } from '../cellTargets';
import { CHORD_QUALITIES, KEYS } from '../catalog';
import { SCALE_CELLS } from '../scaleSkills';

const session = (
  skillId: string,
  durationSeconds: number,
  over: Partial<DrillSession> = {},
): DrillSession => ({
  id: `dses-${skillId}-${durationSeconds}-${over.fromTest ? 't' : 'p'}`,
  drillTypeId: skillId,
  skillId,
  hand: 'both',
  durationSeconds,
  feelRating: 3,
  timestamp: 1_800_000_000_000,
  ...over,
});

/** A real chord-shape skill, so its itemRef lands on a real target. */
const CHORD_Q = CHORD_QUALITIES[0].id;
const CHORD_KEY = KEYS[0];
const chordSkill: DrillSkill = {
  id: 'skill-1',
  kind: 'chord-shape',
  quality: CHORD_Q,
  keyName: CHORD_KEY,
  inversionState: 'root',
  createdAt: 1,
} as DrillSkill;

describe('which section a session belongs to', () => {
  const kinds = new Map([['skill-1', 'chord-shape' as const]]);

  it('reads a self-naming itemRef straight off its prefix', () => {
    expect(sectionForSession('scale:major:C', kinds)).toBe('scales');
    expect(sectionForSession('vl:aba-251:Bb', kinds)).toBe('voice-leading');
    expect(sectionForSession('mv:seventh:maj7:root:C', kinds)).toBe('mental-viz');
  });

  it('joins a DrillSkill id back through the skills table', () => {
    expect(sectionForSession('skill-1', kinds)).toBe('chord-shapes');
  });

  it('drops a session whose skill is gone rather than guessing', () => {
    // A cleanup pass deletes skills and leaves sessions behind; adding
    // those into whichever section came first would invent time.
    expect(sectionForSession('skill-vanished', kinds)).toBeNull();
  });
});

describe('the sum', () => {
  const rows = [
    session(SCALE_CELLS[0].itemRef, 90),
    session(SCALE_CELLS[1].itemRef, 30, { fromTest: true }),
    session(sectionCells('voice-leading')[0][0].itemRef, 60),
    session('skill-1', 120),
    session('skill-1', 45, { fromTest: true }),
  ];

  it('adds each section\u2019s own seconds, and nobody else\u2019s', () => {
    const time = shapesTimeInvested(rows, [chordSkill]);
    expect(time.get('scales')).toEqual({ practiceSeconds: 90, testingSeconds: 30 });
    expect(time.get('voice-leading')).toEqual({ practiceSeconds: 60, testingSeconds: 0 });
    expect(time.get('chord-shapes')).toEqual({ practiceSeconds: 120, testingSeconds: 45 });
  });

  it('SPLITS PRACTICE FROM TESTING, and reads an absent flag as practice', () => {
    // Absent is the row's own rule: a run written before `fromTest`
    // existed is a practice run, and `!== false` would put every one of
    // them in the testing half.
    const legacy = session(SCALE_CELLS[0].itemRef, 40);
    delete (legacy as { fromTest?: boolean }).fromTest;
    expect(splitOf([legacy])).toEqual({ practiceSeconds: 40, testingSeconds: 0 });
    expect(splitOf([session(SCALE_CELLS[0].itemRef, 40, { fromTest: true })]))
      .toEqual({ practiceSeconds: 0, testingSeconds: 40 });
  });

  it('leaves a section with nothing logged ABSENT, not zero', () => {
    // A card shows a time it has measured or shows none; `0s` is a
    // measurement, and the wrong one.
    const time = shapesTimeInvested([session(SCALE_CELLS[0].itemRef, 60)], []);
    expect(time.has('scales')).toBe(true);
    expect(time.has('voice-leading')).toBe(false);
    expect(time.get('voice-leading')).toBeUndefined();
  });

  it('drops an orphaned session from every total', () => {
    const time = shapesTimeInvested([session('skill-gone', 999)], []);
    expect([...time.values()]).toEqual([]);
  });

  it('THE SECTION IS THE SUM OF ITS CELLS, exactly', () => {
    // The card adds up the section's targets; Progress Details adds up
    // one cell's. Both read the same grouping, so the card can never
    // hold more minutes than everything under it adds up to.
    const byTarget = sessionsByTarget(rows, [chordSkill]);
    const perCell = sectionCells('scales')
      .map(targets => timeForTargets(targets, byTarget));
    const summed = perCell.reduce(
      (acc, t) => ({
        practiceSeconds: acc.practiceSeconds + t.practiceSeconds,
        testingSeconds: acc.testingSeconds + t.testingSeconds,
      }),
      { practiceSeconds: 0, testingSeconds: 0 },
    );
    expect(shapesTimeInvested(rows, [chordSkill]).get('scales')).toEqual(summed);
  });

  it('and a cell is the sum of ITS targets', () => {
    const byTarget = sessionsByTarget(rows, [chordSkill]);
    const targets = itemCellTargets(SCALE_CELLS[0].itemRef);
    expect(timeForTargets(targets, byTarget))
      .toEqual({ practiceSeconds: 90, testingSeconds: 0 });
  });
});

describe('mental visualisation now writes a row to sum', () => {
  it('maps its three-way rating so it round-trips', async () => {
    // The drill rates flying / cruising / crawling; `DrillSession`
    // stores a four-point feel. The mapping has to come back out as
    // the rating the reader gave, or the spacing signal and the
    // session row would describe different reps.
    const { feelToRating } = await import('../drillModel');
    expect(feelToRating(4)).toBe('flying');
    expect(feelToRating(3)).toBe('cruising');
    expect(feelToRating(2)).toBe('crawling');
  });
});
