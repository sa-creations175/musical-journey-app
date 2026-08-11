import { describe, expect, it } from 'vitest';
import type { ChordPlacement, SongSection } from '../../../lib/db';
import {
  auditChordDurations,
  doubleChordDurations,
  halveChordDurations,
  renderedWidth,
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
