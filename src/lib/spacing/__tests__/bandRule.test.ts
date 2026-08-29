import { describe, expect, it } from 'vitest';
import { bandOf, selfRatedVerdict, type RatedRep } from '../banding';
import { bandVerdictForRow, lastTestAt } from '../row';
import type { Feel } from '../../fluencyScale';

/**
 * The band rule, in the four states it has.
 *
 *   never tested   practice sets it, capped at Developing
 *   once tested    the test sets it; practice cannot move it either way
 *   past due       the same band (staleness is marked, never decayed)
 *   tested again   the newer test replaces it, up or down
 *
 * Plus the one that would ship a silent regression if it were wrong:
 * a rating entry with no provenance flag is legacy and is never capped.
 */

const test = (feel: Feel): RatedRep => ({ feel, fromTest: true });
const practice = (feel: Feel): RatedRep => ({ feel, fromTest: false });
const legacy = (feel: Feel): RatedRep => ({ feel });

describe('the spec table — three test reps, worst one wins', () => {
  it('In flow, In flow, In flow reads Mastered', () => {
    expect(selfRatedVerdict([test(4), test(4), test(4)]))
      .toEqual({ kind: 'band', band: 'mastered' });
  });

  it('In flow, In flow, Clean reads Fluent', () => {
    expect(selfRatedVerdict([test(4), test(4), test(3)]))
      .toEqual({ kind: 'band', band: 'fluent' });
  });

  it('Clean, Clean, Clean reads Fluent', () => {
    expect(selfRatedVerdict([test(3), test(3), test(3)]))
      .toEqual({ kind: 'band', band: 'fluent' });
  });

  it('Clean, Clean, Working on it reads Developing', () => {
    expect(selfRatedVerdict([test(3), test(3), test(2)]))
      .toEqual({ kind: 'band', band: 'developing' });
  });

  it('Struggled anywhere in the three reads Needs Work', () => {
    expect(selfRatedVerdict([test(1), test(4), test(4)]))
      .toEqual({ kind: 'band', band: 'needs-work' });
    expect(selfRatedVerdict([test(4), test(4), test(1)]))
      .toEqual({ kind: 'band', band: 'needs-work' });
  });
});

describe('never tested — practice sets it, and stops at Developing', () => {
  it('caps three Clean practice reps at Developing, not Fluent', () => {
    // THE CEILING. Uncapped this window is Fluent; practice cannot
    // claim it however well it went.
    expect(selfRatedVerdict([practice(3), practice(3), practice(3)]))
      .toEqual({ kind: 'band', band: 'developing' });
  });

  it('caps three In Flow practice reps at Developing too', () => {
    expect(selfRatedVerdict([practice(4), practice(4), practice(4)]))
      .toEqual({ kind: 'band', band: 'developing' });
  });

  it('does not lift a band the ceiling is already above', () => {
    // Needs Work is BELOW the ceiling — capping must not promote.
    expect(selfRatedVerdict([practice(1), practice(3), practice(3)]))
      .toEqual({ kind: 'band', band: 'needs-work' });
  });

  it('reads Started under three reps, whatever they were', () => {
    expect(selfRatedVerdict([practice(4)])).toEqual({ kind: 'started', tries: 1 });
    expect(selfRatedVerdict([test(4), test(4)])).toEqual({ kind: 'started', tries: 2 });
  });
});

describe('once tested — practice cannot move it either way', () => {
  it('keeps the test band when practice goes badly afterwards', () => {
    // THE CASE A SHARED WINDOW WOULD GET WRONG. Three practice reps
    // after a passed test would push the test out of a three-slot
    // window and demote a Fluent shape for being practised.
    const reps = [
      test(3), test(3), test(3),
      practice(1), practice(1), practice(1),
    ];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('keeps the test band when practice goes well afterwards', () => {
    const reps = [
      test(2), test(2), test(2),
      practice(4), practice(4), practice(4),
    ];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'developing' });
  });

  it('an abandoned test does not set a band — practice still holds it', () => {
    // Two test reps is a test that never completed. It cannot claim
    // Fluent on its own, so the practice path carries on.
    const reps = [practice(3), practice(3), practice(3), test(4), test(4)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'developing' });
  });
});

describe('tested again — the newer test replaces it', () => {
  it('raises the band', () => {
    const reps = [test(2), test(2), test(2), test(4), test(4), test(4)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('lowers the band when the newer test also PASSES', () => {
    // Down is as real as up, but only a pass moves it. Three In flow,
    // then three Clean, is two completed tests and the second one is
    // the current claim.
    const reps = [test(4), test(4), test(4), test(3), test(3), test(3)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('DOES NOT lower the band when the newer test fails', () => {
    // This inverted when the streak rule landed, and the inversion is
    // the decision rather than a side effect: a failed test does not
    // demote. The old rule read the last three reps — 3, 3, 1 — and
    // banded Needs Work, so an attempt that went badly was punished
    // harder than not attempting at all.
    //
    // Now the three In flow runs are a pass that stands, and the
    // failed attempt after it leaves the band where it was. What
    // marks the row as due again is staleness, which is elsewhere and
    // unaffected by this.
    const reps = [test(4), test(4), test(4), test(3), test(3), test(1)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'mastered' });
  });
});

describe('the streak — three IN A ROW, and a bad run costs it', () => {
  it('three clean in a row passes', () => {
    expect(selfRatedVerdict([test(3), test(3), test(3)]))
      .toEqual({ kind: 'band', band: 'fluent' });
  });

  it('THREE CLEAN RUNS WITH A FAILURE BETWEEN THEM DO NOT PASS', () => {
    // The claim the rule exists to make, and the case the old window
    // got wrong: it read the last three — 3, 3, 3 — and passed. Four
    // clean runs here, and it is not the same achievement as three in
    // a row.
    const reps = [test(3), test(1), test(3), test(1), test(3), test(3)];
    expect(reps.filter(r => r.feel >= 3)).toHaveLength(4);
    // No pass, so nothing reached the test path at all. The band is
    // whatever the fall-through holds — which is emphatically NOT
    // Fluent, the answer the old last-three window gave.
    expect(bandOf(selfRatedVerdict(reps))).not.toBe('fluent');
    expect(bandOf(selfRatedVerdict(reps))).not.toBe('mastered');
  });

  it('the streak can be restarted in the same session and still pass', () => {
    // The other half of the reset: it costs the two before it AND
    // offers a way back. A rule with only the cost would make a bad
    // first run a reason to stop.
    const reps = [test(4), test(1), test(4), test(4), test(4)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('the lowest of the three WINNERS sets the height, not the lowest overall', () => {
    // A Struggled run earlier in the session is not in the winning
    // three, so it does not drag the result down to Needs Work. It
    // already cost the streak; charging for it twice would mean one
    // bad run permanently capped the session.
    const reps = [test(1), test(4), test(4), test(4)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'mastered' });
  });

  it('a passing test can only reach Fluent or Mastered', () => {
    // Structural: every run in a passing streak is Clean or better, so
    // the lowest is 3 or 4. There is no arrangement of test reps that
    // bands Needs Work or Developing THROUGH A PASS.
    const feels = [1, 2, 3, 4] as const;
    for (const a of feels) for (const b of feels) for (const c of feels) {
      const v = selfRatedVerdict([test(a), test(b), test(c)]);
      if (a >= 3 && b >= 3 && c >= 3) {
        expect(bandOf(v)).toBe(Math.min(a, b, c) === 4 ? 'mastered' : 'fluent');
      } else {
        // No pass — whatever holds it, it did not come from a test.
        expect(bandOf(v)).not.toBe('mastered');
      }
    }
  });

  it('a practice rep between two test runs does not break the streak', () => {
    // Practice is not part of a test and is not a failure of one.
    // Practising between two runs is not a fourth kind of outcome.
    const reps = [test(3), practice(1), test(3), test(3)];
    expect(selfRatedVerdict(reps)).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('four clean in a row is a pass plus one run, not a pass over four', () => {
    // The third clean run IS the pass, so the streak closes there and
    // the fourth run opens the next test. If the window were still
    // four wide, the trailing In flow would raise a Fluent pass to
    // Mastered without a test having been passed at that height.
    expect(selfRatedVerdict([test(3), test(3), test(3), test(4)]))
      .toEqual({ kind: 'band', band: 'fluent' });
  });
});

describe('legacy entries are never capped', () => {
  it('leaves an all-legacy window exactly where it was', () => {
    // THE SILENT REGRESSION THIS PREVENTS. Every rating entry written
    // before the flag existed has no provenance. Reading absent as
    // practice would drop every self-rated card in the database from
    // Fluent or Mastered to Developing on the day this shipped.
    expect(selfRatedVerdict([legacy(3), legacy(3), legacy(3)]))
      .toEqual({ kind: 'band', band: 'fluent' });
    expect(selfRatedVerdict([legacy(4), legacy(4), legacy(4)]))
      .toEqual({ kind: 'band', band: 'mastered' });
  });

  it('does not cap a window that is only PARTLY practice', () => {
    // One unknowable entry in the window is enough. Demoting a card on
    // a guess is worse than leaving a generous band alone.
    expect(selfRatedVerdict([legacy(3), practice(3), practice(3)]))
      .toEqual({ kind: 'band', band: 'fluent' });
  });
});

describe('reading it off a stored row', () => {
  const row = (entries: Array<Record<string, unknown>>) => ({ performanceHistory: entries });
  const ratingEntry = (t: number, feel: Feel, fromTest?: boolean) => ({
    t, kind: 'rating',
    rating: feel >= 4 ? 'flying' : feel >= 3 ? 'cruising' : 'crawling',
    feel,
    ...(fromTest !== undefined ? { fromTest } : {}),
  });

  it('carries the flag from the entry into the rule', () => {
    expect(bandVerdictForRow(row([
      ratingEntry(1, 3, false), ratingEntry(2, 3, false), ratingEntry(3, 3, false),
    ]))).toEqual({ kind: 'band', band: 'developing' });

    expect(bandVerdictForRow(row([
      ratingEntry(1, 3, true), ratingEntry(2, 3, true), ratingEntry(3, 3, true),
    ]))).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('leaves a row of flagless entries uncapped', () => {
    expect(bandVerdictForRow(row([
      ratingEntry(1, 3), ratingEntry(2, 3), ratingEntry(3, 3),
    ]))).toEqual({ kind: 'band', band: 'fluent' });
  });

  it('a non-scoring rep is still ignored, flag or no flag', () => {
    expect(bandVerdictForRow(row([
      { ...ratingEntry(1, 1, true), scores: false },
      ratingEntry(2, 3, true), ratingEntry(3, 3, true), ratingEntry(4, 3, true),
    ]))).toEqual({ kind: 'band', band: 'fluent' });
  });
});

describe('when it was last tested', () => {
  const row = (entries: Array<Record<string, unknown>>) => ({ performanceHistory: entries });

  it('is null when it never has been', () => {
    expect(lastTestAt(row([]))).toBeNull();
    expect(lastTestAt(row([
      { t: 5, kind: 'rating', rating: 'cruising', feel: 3, fromTest: false },
      { t: 6, kind: 'rating', rating: 'cruising', feel: 3 },
    ]))).toBeNull();
  });

  it('is the most recent test rep, not the most recent engagement', () => {
    // THE WHOLE POINT. Practice after a test must not make the shape
    // look freshly proved.
    expect(lastTestAt(row([
      { t: 100, kind: 'rating', rating: 'cruising', feel: 3, fromTest: true },
      { t: 200, kind: 'rating', rating: 'cruising', feel: 3, fromTest: true },
      { t: 900, kind: 'rating', rating: 'flying', feel: 4, fromTest: false },
    ]))).toBe(200);
  });
});
