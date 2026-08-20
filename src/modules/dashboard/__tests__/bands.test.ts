/**
 * Bands and cell text.
 *
 * The failures worth guarding are the ones where a missing value gets
 * painted as a present one: an ungraded row coloured red as though it
 * failed, a 0% that cannot be told from "never opened", a "never" that
 * renders as 0 days and claims you practised today.
 */
import { describe, expect, it } from 'vitest';
import {
  ACCURACY_LEGEND,
  FLUENCY_LEGEND,
  NO_VALUE,
  bandFor,
  formatCoverage,
  formatRecency,
  formatScore,
  legendFor,
  scoreColumnLabel,
} from '../bands';
import { FEEL_OPTIONS, fluencyValue } from '../../../lib/fluencyScale';

describe('accuracy bands', () => {
  it('places each cut-off on the right side', () => {
    const cases: Array<[number, string]> = [
      [0, 'red'], [49, 'red'], [49.9, 'red'],
      [50, 'amber'], [69, 'amber'], [69.9, 'amber'],
      [70, 'yellow-green'], [84, 'yellow-green'], [84.9, 'yellow-green'],
      [85, 'green'], [100, 'green'],
    ];
    for (const [score, band] of cases) {
      expect(bandFor(score, 'measured'), `${score}`).toBe(band);
    }
  });

  it('makes green reachable without perfection', () => {
    // 85 rather than 100: demanding perfect accuracy makes the top
    // band unreachable, and 85+ is the practical "this holds up".
    expect(bandFor(85, 'measured')).toBe('green');
    expect(bandFor(99, 'measured')).toBe('green');
  });
});

describe('fluency bands', () => {
  it('gives each of the four ratings its own band', () => {
    expect(bandFor(25, 'self-rated')).toBe('red');
    expect(bandFor(50, 'self-rated')).toBe('amber');
    expect(bandFor(75, 'self-rated')).toBe('yellow-green');
    expect(bandFor(100, 'self-rated')).toBe('green');
  });

  it('covers every value the scale can actually produce', () => {
    // Read off the scale rather than retyped, so a change to
    // fluencyScale.ts cannot leave a rating with no band.
    for (const option of FEEL_OPTIONS) {
      expect(bandFor(fluencyValue(option.feel), 'self-rated'), option.label)
        .not.toBeNull();
    }
  });

  it('snaps a rolled-up average to the nearest rating, not a threshold', () => {
    // A parent averages its children and lands between the four. 62.5
    // is between "working on it" and "comfortable"; nearest-value puts
    // it in one the player actually gave rather than inventing a fifth.
    expect(bandFor(62.5, 'self-rated')).toBe('amber');
    expect(bandFor(63, 'self-rated')).toBe('yellow-green');
    expect(bandFor(87.5, 'self-rated')).toBe('yellow-green');
    expect(bandFor(88, 'self-rated')).toBe('green');
  });

  it('bands the same number differently from accuracy', () => {
    // The whole reason there are two legends. 70 is yellow-green
    // measured and amber self-rated.
    expect(bandFor(70, 'measured')).toBe('yellow-green');
    expect(bandFor(70, 'self-rated')).toBe('yellow-green');
    expect(bandFor(60, 'measured')).toBe('amber');
    expect(bandFor(40, 'measured')).toBe('red');
    expect(bandFor(40, 'self-rated')).toBe('amber');
  });
});

describe('an ungraded row gets no band at all', () => {
  it('returns null rather than red', () => {
    // Red would say it failed; green would say it holds up. It gets
    // neither, because it has no signal.
    expect(bandFor(null, 'measured')).toBeNull();
    expect(bandFor(null, 'self-rated')).toBeNull();
  });

  it('renders as a dash, not a zero', () => {
    expect(formatScore(null)).toBe(NO_VALUE);
    expect(formatScore(0)).toBe('0%');
    expect(formatScore(null)).not.toBe('0%');
  });
});

describe('legends', () => {
  it('are two, not one combined', () => {
    expect(legendFor('measured')).toBe(ACCURACY_LEGEND);
    expect(legendFor('self-rated')).toBe(FLUENCY_LEGEND);
    expect(ACCURACY_LEGEND).not.toEqual(FLUENCY_LEGEND);
  });

  it('share the four colours and differ in what they say', () => {
    expect(ACCURACY_LEGEND.map(e => e.band)).toEqual(FLUENCY_LEGEND.map(e => e.band));
    expect(ACCURACY_LEGEND.map(e => e.label)).not.toEqual(FLUENCY_LEGEND.map(e => e.label));
  });

  it('names fluency bands off the rating scale, so they cannot drift', () => {
    expect(FLUENCY_LEGEND.map(e => e.label))
      .toEqual(FEEL_OPTIONS.map(o => o.label));
  });

  it('labels the column by what it means', () => {
    expect(scoreColumnLabel('measured')).toBe('accuracy');
    expect(scoreColumnLabel('self-rated')).toBe('fluency');
  });
});

describe('coverage cell', () => {
  it('tells "worked on" from "never opened" at 0%', () => {
    // THE FAILURE THIS PREVENTS: both read 0%, and without the count
    // real practice looks like neglect.
    const workedOn = formatCoverage({
      isLeaf: false, coveredItems: 0, totalItems: 40, engagementCount: 24,
    });
    const neverOpened = formatCoverage({
      isLeaf: false, coveredItems: 0, totalItems: 40, engagementCount: 0,
    });
    expect(workedOn).toBe('0% · 24 attempts');
    expect(neverOpened).toBe('0% · no attempts');
    expect(workedOn).not.toBe(neverOpened);
  });

  it('shows the count only on an item row', () => {
    // "5 attempts" tells you more than "covered", and 5 sits
    // differently from 47.
    expect(formatCoverage({
      isLeaf: true, coveredItems: 1, totalItems: 1, engagementCount: 5,
    })).toBe('5 attempts');
    expect(formatCoverage({
      isLeaf: true, coveredItems: 0, totalItems: 1, engagementCount: 1,
    })).toBe('1 attempt');
  });

  it('rounds the percentage and keeps the raw count exact', () => {
    expect(formatCoverage({
      isLeaf: false, coveredItems: 28, totalItems: 63, engagementCount: 63,
    })).toBe('44% · 63 attempts');
  });

  it('does not divide by zero on an empty node', () => {
    expect(formatCoverage({
      isLeaf: false, coveredItems: 0, totalItems: 0, engagementCount: 0,
    })).toBe('no attempts');
  });
});

describe('recency cell', () => {
  it('shows one number on an item and two on a parent', () => {
    expect(formatRecency({
      isLeaf: true, mostRecentDays: 12, stalestDays: 12, hasUntouched: false,
    })).toBe('12d');
    expect(formatRecency({
      isLeaf: false, mostRecentDays: 12, stalestDays: 61, hasUntouched: false,
    })).toBe('12d / 61d');
  });

  it('says never rather than fabricating a stalest', () => {
    // "Never" is not a number of days, and 0 would claim you practised
    // today.
    expect(formatRecency({
      isLeaf: false, mostRecentDays: 12, stalestDays: 12, hasUntouched: true,
    })).toBe('12d / never');
    expect(formatRecency({
      isLeaf: false, mostRecentDays: null, stalestDays: null, hasUntouched: true,
    })).toBe('never');
  });

  it('dashes an untouched item rather than showing zero days', () => {
    expect(formatRecency({
      isLeaf: true, mostRecentDays: null, stalestDays: null, hasUntouched: true,
    })).toBe(NO_VALUE);
  });
});
