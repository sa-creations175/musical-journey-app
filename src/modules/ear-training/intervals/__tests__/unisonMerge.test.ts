/**
 * The unison has one case, and the selector stops starving a direction.
 *
 * ---------------------------------------------------------------
 * THE FACT UNDER ALL OF THIS, PINNED FIRST.
 *
 * `playInterval` computes `first = ascending ? root : root + semitones`
 * and `second` as the other one. At zero semitones both are `root`, so
 * an ascending and a descending unison were the same two notes. That is
 * why the four descending attempts merge rather than being discarded:
 * they are real unison data recorded under a second name.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  INTERVAL_SEEDS, directionsFor, directionsForId, intervalItemRefs,
  normaliseDirection, seedIntervals,
} from '../seed';
import { eligibleDirections } from '../directionBalance';
import { labelForIntervalItemRef } from '../itemRefLabel';
import { itemRefForAttempt } from '../../../dashboard/read/canonicalItemId';
import { db } from '../../../../lib/db';

describe('a descending unison was the same sound as an ascending one', () => {
  it('resolves both pitches to the root at zero semitones', () => {
    // The arithmetic `playInterval` runs, asserted directly. If this
    // ever stops holding, the merge below stops being justified — so
    // this is the assertion the whole change rests on.
    const pitches = (root: number, semitones: number, ascending: boolean) => [
      ascending ? root : root + semitones,
      ascending ? root + semitones : root,
    ];
    expect(pitches(60, 0, true)).toEqual([60, 60]);
    expect(pitches(60, 0, false)).toEqual([60, 60]);
    // ASYMMETRIC CONTROL: an octave genuinely differs, which is why it
    // keeps both directions.
    expect(pitches(60, 12, true)).not.toEqual(pitches(60, 12, false));
  });
});

describe('unison generates ONE case', () => {
  it('gives P1 one direction and every other interval two', () => {
    expect(directionsFor(0)).toEqual(['asc']);
    expect(directionsForId('P1')).toEqual(['asc']);
    for (const seed of INTERVAL_SEEDS.filter(s => s.semitones !== 0)) {
      expect(directionsForId(seed.id), seed.id).toEqual(['asc', 'desc']);
    }
    // The octave specifically — the interval it would be tempting to
    // generalise this to.
    expect(directionsForId('P8')).toEqual(['asc', 'desc']);
  });

  it('emits 25 item refs, and never P1:desc', () => {
    const refs = intervalItemRefs();
    expect(refs).toHaveLength(25);
    expect(refs).toContain('P1:asc');
    expect(refs).not.toContain('P1:desc');
  });

  it('seeds P1 with NO descending fields — absent, not zeroed', async () => {
    // Object.hasOwn, not `toBe(undefined)`. A count test passes if the
    // field is blanked rather than removed, and a zero would still say
    // "a descending unison exists and has never been drilled".
    await db.intervals.clear();
    await seedIntervals();
    const p1 = (await db.intervals.get('P1'))!;
    expect(Object.hasOwn(p1, 'descTotal')).toBe(false);
    expect(Object.hasOwn(p1, 'descCorrect')).toBe(false);
    expect(Object.hasOwn(p1, 'descAnchorDefault')).toBe(false);
    // ASYMMETRIC CONTROL: the octave keeps all of them.
    const p8 = (await db.intervals.get('P8'))!;
    expect(Object.hasOwn(p8, 'descTotal')).toBe(true);
    expect(Object.hasOwn(p8, 'descAnchorDefault')).toBe(true);
  });

  it('retires the columns on a row seeded before the merge', async () => {
    await db.intervals.clear();
    await db.intervals.put({
      id: 'P1', name: 'Unison', semitones: 0,
      ascAnchorDefault: 'Same note held twice',
      descAnchorDefault: 'Same note, step down',
      ascCorrect: 7, ascTotal: 7, descCorrect: 4, descTotal: 4,
    });
    await seedIntervals();
    const p1 = (await db.intervals.get('P1'))!;
    expect(p1.descAnchorDefault).toBeUndefined();
    expect(p1.descTotal).toBeUndefined();
    // The ascending side is untouched — this retires a distinction, it
    // does not reset the interval.
    expect(p1.ascTotal).toBe(7);
  });
});

describe('historical P1:desc rows merge rather than stranding', () => {
  it('reads a stored descending unison attempt as the ascending ref', () => {
    expect(itemRefForAttempt({ moduleId: 'intervals', itemId: 'P1', direction: 'desc' }))
      .toBe('P1:asc');
    // ASYMMETRIC CONTROL: every other interval keeps its direction.
    expect(itemRefForAttempt({ moduleId: 'intervals', itemId: 'P8', direction: 'desc' }))
      .toBe('P8:desc');
  });

  it('normaliseDirection folds only the directionless interval', () => {
    expect(normaliseDirection('P1', 'desc')).toBe('asc');
    expect(normaliseDirection('P1', 'asc')).toBe('asc');
    expect(normaliseDirection('m2', 'desc')).toBe('desc');
  });

  it('labels a historical P1:desc ref without a direction', () => {
    expect(labelForIntervalItemRef('P1:desc')).toBe('Unison');
    expect(labelForIntervalItemRef('P1:asc')).toBe('Unison');
    expect(labelForIntervalItemRef('P8:desc')).toBe('Octave (descending)');
  });
});

describe('the selector prefers the direction with fewer attempts', () => {
  // The CHOICE, not the shape of the output. A test that only checked
  // "returns a non-empty list" passes on the starving version.
  const counts = (asc: number, desc: number) =>
    (d: 'asc' | 'desc') => (d === 'asc' ? asc : desc);

  it('serves the starved side when the counts are lopsided', () => {
    // Unison sat at 7/4 and octave at 4/1 under the old weights,
    // because `untouched` (1.0) is LOWER than `developing` (1.5) and
    // `needsWork` (2.5) — the rated side outranked the unrated one.
    expect(eligibleDirections(['asc', 'desc'], counts(7, 4))).toEqual(['desc']);
    expect(eligibleDirections(['asc', 'desc'], counts(4, 1))).toEqual(['desc']);
    // And the other way round, so this is not "always prefer desc".
    expect(eligibleDirections(['asc', 'desc'], counts(2, 9))).toEqual(['asc']);
  });

  it('keeps current behaviour when the counts are equal', () => {
    expect(eligibleDirections(['asc', 'desc'], counts(5, 5))).toEqual(['asc', 'desc']);
    expect(eligibleDirections(['asc', 'desc'], counts(0, 0))).toEqual(['asc', 'desc']);
  });

  it('never widens a list that was already narrowed', () => {
    // A focus pool holding one direction, or a directionless interval,
    // must come back unchanged whatever the counts say.
    expect(eligibleDirections(['desc'], counts(99, 0))).toEqual(['desc']);
    expect(eligibleDirections(['asc'], counts(99, 0))).toEqual(['asc']);
    expect(eligibleDirections([], counts(0, 0))).toEqual([]);
  });

  it('settles at parity rather than oscillating', () => {
    // From 7/4 the descending side is served until both read 7, and
    // from then on the tier weights decide exactly as they did.
    let asc = 7; let desc = 4;
    for (let i = 0; i < 3; i++) {
      const eligible = eligibleDirections(['asc', 'desc'], counts(asc, desc));
      expect(eligible).toEqual(['desc']);
      desc += 1;
    }
    expect(eligibleDirections(['asc', 'desc'], counts(asc, desc))).toEqual(['asc', 'desc']);
    expect([asc, desc]).toEqual([7, 7]);
  });
});
