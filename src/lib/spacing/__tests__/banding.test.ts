/**
 * Two rules, one per kind of module. The band picks the multiplier and
 * the ceiling, so getting these wrong lets a card that should be capped
 * at 2 days drift to 30.
 */
import { describe, expect, it } from 'vitest';
import {
  bandVerdictLabel, measuredVerdict, selfRatedVerdict,
} from '../banding';
import { bandVerdictForRow } from '../row';
import type { Feel } from '../../fluencyScale';

const answers = (pattern: string) =>
  [...pattern].map(c => ({ correct: c === '1' }));
const reps = (...feels: Feel[]) => feels.map(feel => ({ feel }));

describe('measured — percentage over the last twenty', () => {
  it('is Not Started until the card has been met', () => {
    expect(measuredVerdict([])).toEqual({ kind: 'not-started' });
    expect(bandVerdictLabel(measuredVerdict([]))).toBe('Not Started');
  });

  it('reads Started under five tries, and is not a band', () => {
    const v = measuredVerdict(answers('1111'));
    expect(v).toEqual({ kind: 'started', tries: 4 });
    expect(bandVerdictLabel(v)).toBe('Started');
    // FOUR OUT OF FOUR IS NOT MASTERED. A percentage over four answers
    // swings by 25 points on one miss, which is why the floor exists.
  });

  it('bands at exactly five tries', () => {
    expect(measuredVerdict(answers('11111'))).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('puts each boundary on the right side', () => {
    // 20 answers so the percentages are exact.
    const of = (right: number) =>
      measuredVerdict(answers('1'.repeat(right) + '0'.repeat(20 - right)));
    expect(of(11)).toEqual({ kind: 'band', band: 'needs-work' });  // 55%
    expect(of(12)).toEqual({ kind: 'band', band: 'developing' });  // 60%
    expect(of(15)).toEqual({ kind: 'band', band: 'developing' });  // 75%
    expect(of(16)).toEqual({ kind: 'band', band: 'fluent' });      // 80%
    expect(of(18)).toEqual({ kind: 'band', band: 'fluent' });      // 90%
    expect(of(19)).toEqual({ kind: 'band', band: 'mastered' });    // 95%
    expect(of(20)).toEqual({ kind: 'band', band: 'mastered' });    // 100%
  });

  it('only looks at the last twenty', () => {
    // Twenty years of misses followed by twenty clean answers is a card
    // that is now known.
    const old = answers('0'.repeat(40));
    const recent = answers('1'.repeat(20));
    expect(measuredVerdict([...old, ...recent]))
      .toEqual({ kind: 'band', band: 'mastered' });
  });
});

describe('self-rated — the lowest of the last three', () => {
  it('is Not Started until there is a rep', () => {
    expect(selfRatedVerdict([])).toEqual({ kind: 'not-started' });
  });

  it('reads Started under three rated reps', () => {
    expect(selfRatedVerdict(reps(4, 4))).toEqual({ kind: 'started', tries: 2 });
  });

  it('walks every example in the rules', () => {
    // Struggled anywhere in the three → Needs Work.
    expect(selfRatedVerdict(reps(1, 4, 4))).toEqual({ kind: 'band', band: 'needs-work' });
    expect(selfRatedVerdict(reps(4, 4, 1))).toEqual({ kind: 'band', band: 'needs-work' });
    // Clean, Clean, Working on it → Developing.
    expect(selfRatedVerdict(reps(3, 3, 2))).toEqual({ kind: 'band', band: 'developing' });
    // Clean, Clean, Clean → Fluent.
    expect(selfRatedVerdict(reps(3, 3, 3))).toEqual({ kind: 'band', band: 'fluent' });
    // In flow, In flow, Clean → Fluent.
    expect(selfRatedVerdict(reps(4, 4, 3))).toEqual({ kind: 'band', band: 'fluent' });
    // In flow ×3 → Mastered.
    expect(selfRatedVerdict(reps(4, 4, 4))).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('is the lowest, NOT the average', () => {
    // Three cleans and a struggle averages to Fluent. The rule reads it
    // as Needs Work, because the struggle has not been superseded.
    expect(selfRatedVerdict(reps(3, 3, 1))).toEqual({ kind: 'band', band: 'needs-work' });
  });

  it('forgets a bad rep once three good ones follow it', () => {
    expect(selfRatedVerdict(reps(1, 4, 4, 4))).toEqual({ kind: 'band', band: 'mastered' });
  });
});

describe('reading a stored row', () => {
  const row = (history: unknown[]) =>
    bandVerdictForRow({ performanceHistory: history as Array<Record<string, unknown>> });

  it('uses the measured rule when the row holds attempts', () => {
    const history = Array.from({ length: 20 }, () => ({ kind: 'attempt', correct: true }));
    expect(row(history)).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('uses the self-rated rule when the row holds ratings', () => {
    expect(row([
      { kind: 'rating', rating: 'flying', feel: 4 },
      { kind: 'rating', rating: 'flying', feel: 4 },
      { kind: 'rating', rating: 'cruising', feel: 3 },
    ])).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('falls back to the collapsed rating on a row with no feel', () => {
    // Rows written before the feel rode along. `crawling` covers both
    // Struggled and Working on it and resolves to the lower.
    expect(row([
      { kind: 'rating', rating: 'crawling' },
      { kind: 'rating', rating: 'flying' },
      { kind: 'rating', rating: 'flying' },
    ])).toEqual({ kind: 'band', band: 'needs-work' });
  });

  it('ignores a rep that does not score', () => {
    // SONGS: only a test rates. Three logged practice sessions leave
    // the card unrated however they felt.
    expect(row([
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
    ])).toEqual({ kind: 'not-started' });
  });

  it('counts the tests among them and nothing else', () => {
    expect(row([
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
      { kind: 'rating', rating: 'cruising', feel: 3 },
      { kind: 'rating', rating: 'cruising', feel: 3 },
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
      { kind: 'rating', rating: 'cruising', feel: 3 },
    ])).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('never counts a recency entry as a zero', () => {
    expect(row([{ kind: 'recency' }, { kind: 'recency' }]))
      .toEqual({ kind: 'not-started' });
  });
});
