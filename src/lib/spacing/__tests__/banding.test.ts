/**
 * Two rules, one per kind of module. The band picks the multiplier and
 * the ceiling, so getting these wrong lets a card that should be capped
 * at 2 days drift to 30.
 */
import { describe, expect, it } from 'vitest';
import {
  bandOf, bandVerdictLabel, engagementVerdict, measuredVerdict, selfRatedVerdict,
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

  it('ignores a rep that does not score, but not the fact it happened', () => {
    // SONGS: only a test rates. Three logged practice sessions leave
    // the card UNRATED however they felt — no band, at any feel.
    //
    // They do not leave it UNTOUCHED. `logPractice` writes these to
    // record that the song was sat with; reading them back as Not
    // Started contradicted the writer and made three real sessions
    // look like never having opened the song.
    expect(row([
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
      { kind: 'rating', rating: 'flying', feel: 4, scores: false },
    ])).toEqual({ kind: 'started', tries: 0 });
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

  it('never counts a recency entry as a zero — it counts as engagement', () => {
    // The original point stands: a recency entry must never be read as
    // a wrong answer, so it can never produce a band. What it does
    // produce is Started, because Just Play happening is still the
    // thing happening.
    expect(row([{ kind: 'recency' }, { kind: 'recency' }]))
      .toEqual({ kind: 'started', tries: 0 });
  });

  it('an empty history is the only Not Started', () => {
    expect(row([])).toEqual({ kind: 'not-started' });
  });

  it('an entry too malformed to classify still counts as engagement', () => {
    // Counting the whole history rather than a list of known kinds is
    // deliberate: a future entry kind nobody remembers to add to the
    // list arrives as Started, not as never-met.
    expect(row([{ kind: 'something-not-invented-yet' }]))
      .toEqual({ kind: 'started', tries: 0 });
  });

  it('an abandoned test reads Started, not a band', () => {
    // Two test reps cannot set a band. Before this change the row fell
    // through the self-rated path and still reported Started via the
    // rep count; that is unchanged and asserted here so the two ways
    // of reaching Started stay distinguishable.
    expect(row([
      { kind: 'rating', rating: 'flying', feel: 4, fromTest: true },
      { kind: 'rating', rating: 'flying', feel: 4, fromTest: true },
    ])).toEqual({ kind: 'started', tries: 2 });
  });
});

describe('engagementVerdict — the rule on its own', () => {
  it('nothing recorded is Not Started', () => {
    expect(engagementVerdict(0)).toEqual({ kind: 'not-started' });
  });

  it('anything recorded is Started', () => {
    expect(engagementVerdict(1)).toEqual({ kind: 'started', tries: 0 });
    expect(engagementVerdict(47)).toEqual({ kind: 'started', tries: 0 });
  });

  it('reports no tries, because tries counts scoring signals', () => {
    // The count passed in is engagements, not attempts or rated reps.
    // Surfacing it as `tries` would put a number next to "Started"
    // that means something different from the number beside every
    // other Started.
    expect(engagementVerdict(9)).toEqual({ kind: 'started', tries: 0 });
  });

  it('labels as Started', () => {
    expect(bandVerdictLabel(engagementVerdict(1))).toBe('Started');
    expect(bandVerdictLabel(engagementVerdict(0))).toBe('Not Started');
  });

  it('is not a band', () => {
    expect(bandOf(engagementVerdict(3))).toBeNull();
  });
});
