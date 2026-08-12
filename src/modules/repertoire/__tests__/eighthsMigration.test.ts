import { describe, expect, it } from 'vitest';
import type { ChordPlacement, SongSection } from '../../../lib/db';
import {
  auditChordDurations,
  describeHalveBlockers,
  doubleChordDurations,
  EIGHTHS_DURATION_VERSION,
  halveChordDurations,
  isInSlotUnits,
  planDurationHalving,
  planDurationRepair,
  renderedWidth,
  repairSectionDurations,
} from '../eighthsMigration';

const p = (id: string, beats: number, beatPos = 0): ChordPlacement =>
  ({
    id,
    arrangementId: 'arr',
    barIndex: 0,
    beatPos,
    beats,
    chord: { function: '1', quality: 'maj' },
  }) as ChordPlacement;

const section = (id: string, placements: ChordPlacement[]): SongSection =>
  ({ id, songId: 's', name: id, order: 0, chordPlacements: placements }) as
    unknown as SongSection;

describe('doubleChordDurations', () => {
  it('doubles every duration and touches nothing else', () => {
    const before = p('a', 2, 3);
    const [after] = doubleChordDurations([before]);
    expect(after.beats).toBe(4);
    expect({ ...after, beats: 0 }).toEqual({ ...before, beats: 0 });
  });

  it('leaves the input untouched', () => {
    const list = [p('a', 1), p('b', 4)];
    doubleChordDurations(list);
    expect(list.map(x => x.beats)).toEqual([1, 4]);
  });
});

describe('reversibility', () => {
  it('halving restores the original exactly', () => {
    const before = [p('a', 1), p('b', 2), p('c', 4)];
    const after = halveChordDurations(doubleChordDurations(before));
    expect(after).toEqual(before);
  });

  it('round-trips across a spread of realistic durations', () => {
    const before = Array.from({ length: 12 }, (_, i) => p(`p${i}`, i + 1));
    expect(halveChordDurations(doubleChordDurations(before))).toEqual(before);
  });

  it('REFUSES to halve a genuine eighth rather than flooring it', () => {
    // The one case where the inverse is not safe: a one-eighth chord
    // created after the migration is odd, and halving would round it
    // to a value the user never chose.
    expect(halveChordDurations([p('a', 1)])).toBeNull();
    expect(halveChordDurations([p('a', 2), p('b', 3)])).toBeNull();
  });
});

describe('the invariant — rendered width is unchanged', () => {
  // Width is beats / slotsPerBar. The migration doubles the numerator
  // and the denominator, so the ratio holds. Asserted, not assumed:
  // if a chord looks different afterwards the migration is wrong
  // regardless of what the numbers say.
  it('holds for every duration in every common time signature', () => {
    for (const beatsPerBar of [2, 3, 4, 5, 6, 7, 12]) {
      for (let beats = 1; beats <= beatsPerBar; beats++) {
        const before = renderedWidth(beats, beatsPerBar);
        const [migrated] = doubleChordDurations([p('x', beats)]);
        const after = renderedWidth(migrated.beats, beatsPerBar * 2);
        expect(after).toBeCloseTo(before, 12);
      }
    }
  });

  it('holds for a whole bar of chords, summing to the same total', () => {
    const bar = [p('a', 1, 0), p('b', 2, 1), p('c', 1, 3)];
    const widthBefore = bar.reduce((n, c) => n + renderedWidth(c.beats, 4), 0);
    const widthAfter = doubleChordDurations(bar).reduce(
      (n, c) => n + renderedWidth(c.beats, 8),
      0,
    );
    expect(widthAfter).toBeCloseTo(widthBefore, 12);
    expect(widthAfter).toBeCloseTo(1, 12);
  });

  it('a chord that ends early still leaves the same gap', () => {
    // (c) would have lost this — a chord stopping before the next one
    // and leaving space is expressible and must stay so.
    const before = renderedWidth(1, 4);
    const [after] = doubleChordDurations([p('a', 1)]);
    expect(renderedWidth(after.beats, 8)).toBeCloseTo(before, 12);
    expect(after.beats).toBe(2);
  });
});

describe('auditChordDurations — the dry run', () => {
  it('counts sections and placements', () => {
    const audit = auditChordDurations([
      section('s1', [p('a', 1), p('b', 2)]),
      section('s2', [p('c', 4)]),
    ]);
    expect(audit.sections).toBe(2);
    expect(audit.placements).toBe(3);
  });

  it('skips sections that never migrated to bar-anchored chords', () => {
    const legacy = { id: 'old', songId: 's', name: 'old', order: 0 } as
      unknown as SongSection;
    const audit = auditChordDurations([legacy, section('s1', [p('a', 1)])]);
    expect(audit.sections).toBe(1);
    expect(audit.placements).toBe(1);
  });

  it('reports a histogram, commonest first', () => {
    const audit = auditChordDurations([
      section('s1', [p('a', 4), p('b', 4), p('c', 2)]),
    ]);
    expect(audit.histogram[0]).toEqual({ beats: 4, count: 2 });
    expect(audit.histogram[1]).toEqual({ beats: 2, count: 1 });
  });

  it('flags a non-integer duration, which would not round-trip', () => {
    const audit = auditChordDurations([section('s1', [p('a', 1.5)])]);
    expect(audit.anomalies).toHaveLength(1);
    expect(audit.anomalies[0].reason).toContain('not an integer');
  });

  it('flags a duration below one beat, which the model forbids', () => {
    const audit = auditChordDurations([section('s1', [p('a', 0)])]);
    expect(audit.anomalies[0].reason).toContain('less than one beat');
  });

  it('flags a non-finite duration', () => {
    const audit = auditChordDurations([section('s1', [p('a', NaN)])]);
    expect(audit.anomalies[0].reason).toContain('not a finite number');
  });

  it('reports no anomalies for clean data', () => {
    const audit = auditChordDurations([
      section('s1', [p('a', 1), p('b', 2), p('c', 4)]),
    ]);
    expect(audit.anomalies).toEqual([]);
  });

  it('writes nothing', () => {
    const list = [p('a', 1)];
    const sec = section('s1', list);
    auditChordDurations([sec]);
    expect(list[0].beats).toBe(1);
    expect(sec.chordPlacements).toBe(list);
  });
});

// ---------------------------------------------------------------------
// The repair pass (step 2)
// ---------------------------------------------------------------------

/** A section that has never been migrated to bar-anchored placements —
 *  `chordPlacements` genuinely absent, not an empty array. */
const unmigrated = (id: string): SongSection =>
  ({ id, songId: 's', name: id, order: 0 }) as unknown as SongSection;

const stamped = (id: string, placements: ChordPlacement[]): SongSection =>
  ({
    ...section(id, placements),
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
  }) as SongSection;

describe('isInSlotUnits', () => {
  it('reads an absent stamp as beats', () => {
    expect(isInSlotUnits(section('a', [p('x', 4)]))).toBe(false);
  });

  it('reads the current version as slots', () => {
    expect(isInSlotUnits(stamped('a', [p('x', 8)]))).toBe(true);
  });

  it('does not accept a stamp from another version', () => {
    expect(
      isInSlotUnits({ eighthsDurationVersion: EIGHTHS_DURATION_VERSION + 1 }),
    ).toBe(false);
  });
});

describe('planDurationRepair — the exclusions', () => {
  it('EXCLUDES a section with no stored placements, and says why', () => {
    const plan = planDurationRepair([unmigrated('legacy')]);
    expect(plan.sectionsToDouble).toBe(0);
    expect(plan.decisions).toEqual([
      {
        sectionId: 'legacy',
        double: false,
        skipped: 'no-stored-placements',
        placements: 0,
      },
    ]);
  });

  it('excludes a section already stamped, and says why', () => {
    const plan = planDurationRepair([stamped('done', [p('x', 8)])]);
    expect(plan.sectionsToDouble).toBe(0);
    expect(plan.decisions[0].skipped).toBe('already-in-slot-units');
  });

  it('doubles an unstamped section that has stored placements', () => {
    const plan = planDurationRepair([section('broken', [p('x', 4), p('y', 2)])]);
    expect(plan.sectionsToDouble).toBe(1);
    expect(plan.placementsToDouble).toBe(2);
    expect(plan.decisions[0].skipped).toBeUndefined();
  });

  it('sorts a mixed set into exactly the three outcomes', () => {
    const plan = planDurationRepair([
      unmigrated('legacy'),
      stamped('done', [p('a', 8)]),
      section('broken', [p('b', 4)]),
    ]);
    expect(plan.decisions.map(d => d.skipped)).toEqual([
      'no-stored-placements',
      'already-in-slot-units',
      undefined,
    ]);
    expect(plan.sectionsToDouble).toBe(1);
  });
});

describe('repairSectionDurations', () => {
  it('returns null for an unmigrated section — the hole-1 guard', () => {
    expect(repairSectionDurations(unmigrated('legacy'))).toBeNull();
  });

  it('doubles and stamps in a single patch', () => {
    expect(repairSectionDurations(section('broken', [p('x', 4)]))).toEqual({
      chordPlacements: [p('x', 8)],
      eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
    });
  });

  it('stamps a migrated-but-empty section so it stops being reconsidered', () => {
    const patch = repairSectionDurations(section('empty', []));
    expect(patch).toEqual({
      chordPlacements: [],
      eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
    });
  });

  it('IS IDEMPOTENT — a second pass over its own output is a no-op', () => {
    const before = section('broken', [p('x', 4), p('y', 3)]);
    const first = repairSectionDurations(before)!;
    const after = { ...before, ...first };
    expect(repairSectionDurations(after)).toBeNull();
    expect(after.chordPlacements).toEqual([p('x', 8), p('y', 6)]);
  });

  it('never touches beatPos (invariant 4)', () => {
    const before = section('b', [p('x', 4, 2), p('y', 1, 3)]);
    const patch = repairSectionDurations(before)!;
    expect(patch.chordPlacements!.map(q => q.beatPos)).toEqual([2, 3]);
  });

  it('keeps every duration a positive integer (invariant 2)', () => {
    const patch = repairSectionDurations(section('b', [p('x', 1), p('y', 3)]))!;
    for (const q of patch.chordPlacements!) {
      expect(Number.isInteger(q.beats)).toBe(true);
      expect(q.beats).toBeGreaterThan(0);
    }
  });

  it('holds rendered width across the repair (invariant 1)', () => {
    // 4 beats in a 4-beat bar is a full bar; 8 slots in an 8-slot bar
    // is the same full bar.
    const patch = repairSectionDurations(section('b', [p('x', 4)]))!;
    expect(renderedWidth(patch.chordPlacements![0].beats, 8)).toBe(
      renderedWidth(4, 4),
    );
  });
});

// ---------------------------------------------------------------------
// Turning eighths off — all or nothing (step 3)
// ---------------------------------------------------------------------

describe('planDurationHalving', () => {
  it('halves every stamped section when all of them round-trip', () => {
    const plan = planDurationHalving([
      stamped('verse', [p('a', 8), p('b', 4)]),
      stamped('chorus', [p('c', 2)]),
    ]);
    expect(plan.blockers).toEqual([]);
    expect(plan.patches).toEqual([
      { sectionId: 'verse', chordPlacements: [p('a', 4), p('b', 2)] },
      { sectionId: 'chorus', chordPlacements: [p('c', 1)] },
    ]);
  });

  it('REFUSES THE WHOLE SONG when one section holds an odd duration', () => {
    const plan = planDurationHalving([
      stamped('verse', [p('a', 8)]),
      stamped('chorus', [p('c', 3)]),
    ]);
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0].sectionId).toBe('chorus');
    // The plan still COMPUTES the clean section's patch — it is a
    // decision to inspect, not a command. The contract is that a
    // caller seeing any blocker writes NONE of them, which is what
    // makes the refusal all-or-nothing. Asserted here so the contract
    // is written down next to the shape that depends on it.
    expect(plan.patches.map(x => x.sectionId)).toEqual(['verse']);
  });

  it('names the blocking section and the offending durations', () => {
    const plan = planDurationHalving([stamped('Bridge', [p('a', 3), p('b', 4), p('c', 5)])]);
    expect(plan.blockers[0]).toEqual({
      sectionId: 'Bridge',
      sectionName: 'Bridge',
      odd: [
        { placementId: 'a', beats: 3 },
        { placementId: 'c', beats: 5 },
      ],
    });
  });

  it('leaves an UNSTAMPED section alone — it is already in beats', () => {
    // Halving this would make every chord half as long.
    const plan = planDurationHalving([section('never-doubled', [p('a', 4)])]);
    expect(plan.patches).toEqual([]);
    expect(plan.blockers).toEqual([]);
  });

  it('leaves a section with no stored placements alone', () => {
    const plan = planDurationHalving([unmigrated('legacy')]);
    expect(plan.patches).toEqual([]);
    expect(plan.blockers).toEqual([]);
  });

  it('round-trips against the repair: double then halve restores the original', () => {
    const before = section('v', [p('a', 4), p('b', 1), p('c', 2)]);
    const doubled = { ...before, ...repairSectionDurations(before)! };
    const plan = planDurationHalving([doubled]);
    expect(plan.blockers).toEqual([]);
    expect(plan.patches[0].chordPlacements).toEqual(before.chordPlacements);
  });
});

describe('describeHalveBlockers', () => {
  const b = (name: string) => ({ sectionId: name, sectionName: name, odd: [] });

  it('renders one, two, and three names readably', () => {
    expect(describeHalveBlockers([b('Chorus')])).toBe('Chorus');
    expect(describeHalveBlockers([b('Verse'), b('Chorus')])).toBe('Verse and Chorus');
    expect(describeHalveBlockers([b('A'), b('B'), b('C')])).toBe('A, B and C');
  });

  it('falls back for an untitled section rather than rendering blank', () => {
    expect(describeHalveBlockers([b('  ')])).toBe('an untitled section');
  });

  it('is empty for no blockers', () => {
    expect(describeHalveBlockers([])).toBe('');
  });
});
