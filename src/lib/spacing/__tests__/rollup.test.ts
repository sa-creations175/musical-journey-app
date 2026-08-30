/**
 * The extracted cell rollup, against all three implementations it
 * replaces.
 *
 * =====================================================================
 * A REFACTOR HAS TO PROVE IT, AND TWO OF THE THREE SPOKE A DIFFERENT
 * LANGUAGE.
 *
 * `InversionBreakdownPanel` already rolled up bands, so that one is
 * checked directly: its retired reduce is kept below as an oracle and
 * agreed with over every shape of input it could meet.
 *
 * `HeatGrid` and `MatrixSnapshot` rolled up acquisition STAGES into
 * three buckets. There is no band they can be compared against, so
 * what is proved instead is that they were the same rule on a shorter
 * ladder: map "acquired" to a band and everything else to Started, and
 * the extracted rollup reproduces both, exhaustively, over every
 * combination of stages up to three rows. That is the claim the
 * deletion rests on — not that the numbers match, but that the rule
 * does.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { rollUpVerdict, rollUpVerdicts } from '../rollup';
import {
  NOT_STARTED, bandVerdictLabel, type BandVerdict,
} from '../banding';
import { bandVerdictForRow } from '../row';
import type { AccuracyBand } from '../bands';
import type { AcquisitionStage } from '../../db';

// ---------------------------------------------------------------------
// Fixtures — rows whose history lands on each verdict
// ---------------------------------------------------------------------

type Entry = Record<string, unknown>;
const row = (performanceHistory: Entry[]) => ({ performanceHistory });

const rep = (feel: 1 | 2 | 3 | 4, extra: Entry = {}): Entry => ({
  t: feel, kind: 'rating',
  rating: feel === 4 ? 'flying' : feel === 3 ? 'cruising' : 'crawling',
  feel, ...extra,
});
/** A passed test: three Clean-or-better runs in one session. */
const test3 = (feel: 3 | 4) =>
  [rep(feel, { fromTest: true, sessionId: 's' }),
    rep(feel, { fromTest: true, sessionId: 's' }),
    rep(feel, { fromTest: true, sessionId: 's' })];
/** Practice only — the ceiling applies. */
const practice3 = (feel: 1 | 2 | 3 | 4) =>
  [rep(feel, { fromTest: false }), rep(feel, { fromTest: false }),
    rep(feel, { fromTest: false })];

const ROWS = {
  'Not Started': row([]),
  'Started': row([rep(3, { fromTest: false })]),
  'Needs Work': row(practice3(1)),
  'Developing': row(practice3(3)),
  'Fluent': row(test3(3)),
  'Mastered': row(test3(4)),
} as const;

// Guard the fixtures themselves: if the banding rule ever moves, this
// file must fail here rather than quietly testing the wrong ladder.
describe('the fixtures land where they claim', () => {
  for (const [want, r] of Object.entries(ROWS)) {
    it(`${want}`, () => {
      expect(bandVerdictLabel(bandVerdictForRow(r))).toBe(want);
    });
  }
});

// ---------------------------------------------------------------------
// Oracle 1 — the chord panel's retired reduce, exactly
// ---------------------------------------------------------------------

function retiredPanelRollup(rows: ReadonlyArray<{ performanceHistory: Entry[] }>): BandVerdict {
  const order: ReadonlyArray<AccuracyBand> = ['needs-work', 'developing', 'fluent', 'mastered'];
  const verdicts = rows.map(r => bandVerdictForRow(r));
  const banded = verdicts.filter(
    (v): v is { kind: 'band'; band: AccuracyBand } => v.kind === 'band',
  );
  if (banded.length < verdicts.length) {
    const anyStarted = verdicts.some(v => v.kind !== 'not-started');
    return anyStarted ? { kind: 'started', tries: 0 } : NOT_STARTED;
  }
  return banded.reduce((low, v) =>
    order.indexOf(v.band) < order.indexOf(low.band) ? v : low, banded[0]);
}

const NAMES = Object.keys(ROWS) as Array<keyof typeof ROWS>;

describe('agrees with the chord panel it was taken from', () => {
  it('on every pair, in both orders', () => {
    for (const a of NAMES) {
      for (const b of NAMES) {
        const rows = [ROWS[a], ROWS[b]];
        expect(rollUpVerdict(rows), `${a} + ${b}`)
          .toEqual(retiredPanelRollup(rows));
      }
    }
  });

  it('on every triple', () => {
    for (const a of NAMES) {
      for (const b of NAMES) {
        for (const c of NAMES) {
          const rows = [ROWS[a], ROWS[b], ROWS[c]];
          expect(rollUpVerdict(rows), `${a} + ${b} + ${c}`)
            .toEqual(retiredPanelRollup(rows));
        }
      }
    }
  });

  it('on a single row — the square reads as the row does', () => {
    for (const n of NAMES) {
      expect(bandVerdictLabel(rollUpVerdict([ROWS[n]])), n)
        .toBe(bandVerdictLabel(bandVerdictForRow(ROWS[n])));
    }
  });

  it('but the square does NOT inherit the row\'s try count', () => {
    // A square has no tries of its own — the targets under it each
    // have their own, and adding them up would invent a number. The
    // retired reduce dropped it the same way, so this is the extracted
    // rule keeping a property rather than changing one.
    expect(bandVerdictForRow(ROWS['Started'])).toEqual({ kind: 'started', tries: 1 });
    expect(rollUpVerdict([ROWS['Started']])).toEqual({ kind: 'started', tries: 0 });
    expect(retiredPanelRollup([ROWS['Started']])).toEqual({ kind: 'started', tries: 0 });
  });

  it('on no rows at all, where the retired one returned undefined', () => {
    // The one place the extracted rule is deliberately NOT identical.
    // `banded.reduce(fn, banded[0])` over an empty list returns
    // undefined, which the panel never met because it only built keys
    // that had at least one row. A shared helper can be called with
    // an empty group, so it answers Not Started.
    expect(rollUpVerdict([])).toEqual(NOT_STARTED);
    expect(retiredPanelRollup([])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// Oracles 2 and 3 — the two stage rollups, as one rule on a short ladder
// ---------------------------------------------------------------------

type Bucket = 'not-started' | 'in-progress' | 'acquired';
const ACQUIRED: ReadonlySet<AcquisitionStage> = new Set<AcquisitionStage>([
  'acquired', 'consolidated', 'mastered',
]);

/** `HeatGrid.chordBandStage` and `MatrixSnapshot.aggregateHand` — the
 *  same body, twice, in two modules. */
function retiredStageRollup(stages: readonly AcquisitionStage[]): Bucket {
  if (stages.length === 0) return 'not-started';
  return stages.every(s => ACQUIRED.has(s)) ? 'acquired' : 'in-progress';
}

/** A stage read as a verdict: acquired+ has cleared the bar, anything
 *  else is engaged but unjudged. */
const verdictForStage = (s: AcquisitionStage): BandVerdict =>
  (ACQUIRED.has(s)
    ? { kind: 'band', band: 'mastered' }
    : { kind: 'started', tries: 0 });

const bucketForVerdict = (v: BandVerdict): Bucket =>
  (v.kind === 'band' ? 'acquired' : v.kind === 'started' ? 'in-progress' : 'not-started');

const STAGES: ReadonlyArray<AcquisitionStage> = [
  'new', 'acquiring', 'acquired', 'consolidated', 'mastered',
];

describe('reproduces both stage rollups, exhaustively', () => {
  const viaRollup = (stages: readonly AcquisitionStage[]): Bucket =>
    bucketForVerdict(rollUpVerdicts(stages.map(verdictForStage)));

  it('on no rows', () => {
    expect(viaRollup([])).toBe(retiredStageRollup([]));
  });

  it('on every single stage', () => {
    for (const a of STAGES) {
      expect(viaRollup([a]), a).toBe(retiredStageRollup([a]));
    }
  });

  it('on every pair of stages', () => {
    for (const a of STAGES) {
      for (const b of STAGES) {
        expect(viaRollup([a, b]), `${a} + ${b}`).toBe(retiredStageRollup([a, b]));
      }
    }
  });

  it('on every triple of stages — the three hands of a square', () => {
    for (const a of STAGES) {
      for (const b of STAGES) {
        for (const c of STAGES) {
          expect(viaRollup([a, b, c]), `${a} + ${b} + ${c}`)
            .toBe(retiredStageRollup([a, b, c]));
        }
      }
    }
  });
});

// ---------------------------------------------------------------------
// The rule itself
// ---------------------------------------------------------------------

describe('lowest, not furthest', () => {
  it('one untouched target holds the whole square back', () => {
    // The case the decision turns on: Furthest would call this
    // Mastered and hide eleven untouched targets behind one good one.
    const rows = [ROWS['Mastered'], ROWS['Not Started']];
    expect(bandVerdictLabel(rollUpVerdict(rows))).toBe('Started');
  });

  it('every target untouched is Not Started, not Started', () => {
    expect(rollUpVerdict([ROWS['Not Started'], ROWS['Not Started']]))
      .toEqual(NOT_STARTED);
  });

  it('a banded square reads as low as its weakest target', () => {
    const rows = [ROWS['Mastered'], ROWS['Fluent'], ROWS['Needs Work']];
    expect(bandVerdictLabel(rollUpVerdict(rows))).toBe('Needs Work');
  });

  it('a square where every target is banded gets a band', () => {
    const rows = [ROWS['Fluent'], ROWS['Mastered']];
    expect(bandVerdictLabel(rollUpVerdict(rows))).toBe('Fluent');
  });

  it('an unjudged target outranks a bad one — Started, not Needs Work', () => {
    // Started is not a score. A square holding one struggling target
    // and one nobody has judged has not earned Needs Work either.
    const rows = [ROWS['Needs Work'], ROWS['Started']];
    expect(bandVerdictLabel(rollUpVerdict(rows))).toBe('Started');
  });
});
