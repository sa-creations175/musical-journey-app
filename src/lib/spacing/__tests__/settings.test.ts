/**
 * Inheritance, the in-schedule switch, and the derived readouts.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPACING_SETTINGS, effectiveInSchedule, pathsSetAt, resolveSettings,
  tallyAnswerCount, tallyDistinctDays, tallyExposureDays, tallySummary, tallyWarnings,
  turnedOffBy, type SettingsLevel,
} from '../settings';

const level = (id: string, label: string, settings: SettingsLevel['settings']): SettingsLevel =>
  ({ id, label, settings });

describe('inheritance', () => {
  it('takes the shipped default when nothing in the chain sets it', () => {
    const r = resolveSettings([level('ear-training', 'Ear Training', {})]);
    expect(r.value.maintaining.firstWaitDays).toBe(2);
    expect(r.sourceByPath['maintaining.firstWaitDays']).toBeNull();
  });

  it('names the level a value came from', () => {
    const et = level('ear-training', 'Ear Training', {
      maintaining: { firstWaitDays: 3 },
    });
    const r = resolveSettings([et, level('chord-recognition', 'Chord Recognition', {})]);
    expect(r.value.maintaining.firstWaitDays).toBe(3);
    expect(r.sourceByPath['maintaining.firstWaitDays']?.label).toBe('Ear Training');
  });

  it('lets the deeper level win, per field, without taking its siblings', () => {
    // The spec's own case: Chord Recognition changes the first wait and
    // two of Fluent's numbers while inheriting the tally.
    const et = level('ear-training', 'Ear Training', {
      maintaining: { firstWaitDays: 2 },
      acquiring: { tally: [2, 1, 0, 1, 0, 1] },
    });
    const cr = level('chord-recognition', 'Chord Recognition', {
      maintaining: {
        firstWaitDays: 1,
        perBand: { fluent: { growth: { kind: 'multiply', factor: 1.7 }, ceilingDays: 30 } },
      },
    });
    const r = resolveSettings([et, cr]);
    expect(r.value.maintaining.firstWaitDays).toBe(1);
    expect(r.sourceByPath['maintaining.firstWaitDays']?.id).toBe('chord-recognition');
    expect(r.value.maintaining.perBand.fluent.growth).toEqual({ kind: 'multiply', factor: 1.7 });
    // Inherited, not overridden — the tally still names Ear Training.
    expect(r.value.acquiring.tally).toEqual([2, 1, 0, 1, 0, 1]);
    expect(r.sourceByPath['acquiring.tally']?.id).toBe('ear-training');
    // And an untouched band is still the shipped default.
    expect(r.sourceByPath['maintaining.perBand.mastered.ceilingDays']).toBeNull();
  });

  it('does not let a resolved value alias the shared default object', () => {
    const r = resolveSettings([level('a', 'A', {})]);
    r.value.acquiring.tally[0] = 99;
    r.value.maintaining.perBand.fluent.ceilingDays = 1;
    expect(DEFAULT_SPACING_SETTINGS.acquiring.tally[0]).toBe(2);
    expect(DEFAULT_SPACING_SETTINGS.maintaining.perBand.fluent.ceilingDays).toBe(30);
  });

  it('reports which paths a level sets itself', () => {
    const cr = level('chord-recognition', 'Chord Recognition', {
      maintaining: { firstWaitDays: 1, perBand: { fluent: { ceilingDays: 30 } } },
    });
    expect(pathsSetAt(cr).sort()).toEqual(
      ['maintaining.firstWaitDays', 'maintaining.perBand.fluent.ceilingDays'],
    );
  });
});

describe('the in-schedule switch', () => {
  it('cascades down and cannot be turned back on from below', () => {
    const chain = [
      level('ear-training', 'Ear Training', { inSchedule: false }),
      level('chord-motion', 'Chord Motion', { inSchedule: true }),
    ];
    expect(effectiveInSchedule(chain)).toBe(false);
    expect(turnedOffBy(chain)?.label).toBe('Ear Training');
  });

  it('is on when nothing in the chain turned it off', () => {
    const chain = [level('ear-training', 'Ear Training', {}), level('x', 'X', {})];
    expect(effectiveInSchedule(chain)).toBe(true);
    expect(turnedOffBy(chain)).toBeNull();
  });

  it('lets a child opt itself out while its parent stays in', () => {
    const chain = [
      level('chord-progressions', 'Chord Progression', {}),
      level('key-detection', 'Key Detection', { inSchedule: false }),
    ];
    expect(effectiveInSchedule(chain)).toBe(false);
    expect(effectiveInSchedule(chain.slice(0, 1))).toBe(true);
  });
});

describe('the tally is the leader', () => {
  it('derives the answer count rather than storing it', () => {
    expect(tallyAnswerCount([2, 1, 0, 1, 0, 1])).toBe(5);
    expect(tallyDistinctDays([2, 1, 0, 1, 0, 1])).toBe(4);
  });

  it('expands into the day each exposure falls on', () => {
    expect(tallyExposureDays([2, 1, 0, 1, 0, 1])).toEqual([0, 0, 1, 3, 5]);
  });

  it('reads back the spec line', () => {
    expect(tallySummary([2, 1, 0, 1, 0, 1]))
      .toBe('5 answers over 4 days — a rating appears after the last one.');
  });
});

describe('warnings are soft', () => {
  it('says nothing about the shipped default', () => {
    expect(tallyWarnings([2, 1, 0, 1, 0, 1])).toEqual([]);
  });

  it('warns under five answers', () => {
    const w = tallyWarnings([1, 1, 0, 1, 0, 0]);
    expect(w.map(x => x.id)).toEqual(['too-few-answers']);
  });

  it('warns under three distinct days', () => {
    const w = tallyWarnings([3, 3, 0, 0, 0, 0]);
    expect(w.map(x => x.id)).toEqual(['too-few-days']);
  });

  it('can say both at once, and neither blocks anything', () => {
    expect(tallyWarnings([1, 1, 0, 0, 0, 0]).map(x => x.id))
      .toEqual(['too-few-answers', 'too-few-days']);
  });
});
