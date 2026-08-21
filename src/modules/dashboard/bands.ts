/**
 * The four colour bands, and how each column formats its cell.
 *
 * Pure. Split out of the row component so the decisions that can be
 * wrong in a way that matters - which band a number falls in, what a
 * missing number renders as - are testable without a DOM.
 *
 * ─── Four bands, two meanings ────────────────────────────────────────
 *
 * Both columns use the same four colours so a red cell means the same
 * kind of thing wherever it appears. The NUMBERS behind them differ,
 * which is why each column carries its own legend rather than one
 * combined legend.
 *
 *   FLUENCY is self-rated and only ever produces four values, so each
 *   value is its own band: struggled / working on it / comfortable /
 *   in flow.
 *
 *   ACCURACY is measured and continuous. Below 50 is getting half of
 *   them wrong and reads as failing. 85 rather than 100 for green
 *   because demanding perfect accuracy makes the top band unreachable,
 *   and 85+ is the practical equivalent of "this holds up".
 *
 * Early practice will look like a wall of red. That is honest, and the
 * same principle as the screen opening nearly empty.
 */
import { FEEL_OPTIONS } from '../../lib/fluencyScale';
import type { AccuracyKind } from './read/itemStats';

export type Band = 'red' | 'amber' | 'yellow-green' | 'green';

/** Lower bound of each accuracy band, highest first. */
const ACCURACY_BANDS: ReadonlyArray<{ min: number; band: Band }> = [
  { min: 85, band: 'green' },
  { min: 70, band: 'yellow-green' },
  { min: 50, band: 'amber' },
  { min: 0, band: 'red' },
];

/** One band per fluency value, in scale order. */
const FLUENCY_BANDS: ReadonlyArray<{ value: number; band: Band }> = [
  { value: 25, band: 'red' },
  { value: 50, band: 'amber' },
  { value: 75, band: 'yellow-green' },
  { value: 100, band: 'green' },
];

/**
 * The band a score falls in, or `null` when there is no score.
 *
 * Null in, null out. An ungraded row has no band because it has no
 * signal - painting it red would say it failed, and painting it green
 * would say it holds up. It gets neither.
 *
 * A self-rated score ROUNDS DOWN to the highest rating it has actually
 * earned. A rolled-up parent averages its children and lands between
 * the four values; 62.5 sits between "working on it" and "comfortable"
 * and reads as "working on it".
 *
 * You reach a threshold, you are not rounded up into it. If half a
 * chord quality's inversions are still at 50, the parent has a way to
 * go, and reading it as comfortable because 62.5 is nearer to 75 would
 * flatter it. One rule, no special cases, and the same
 * honest-over-flattering principle as the dash that is not a zero.
 *
 * The scale has four rungs rather than a continuum, which is why this
 * lands on a rung at all instead of inventing a fifth colour for the
 * gaps between them.
 */
export function bandFor(score: number | null, kind: AccuracyKind): Band | null {
  if (score === null) return null;
  if (kind === 'self-rated') {
    // Highest rung at or below the score. Below the lowest rung can
    // only happen on a rolled-up average of nothing, and lands red.
    let earned = FLUENCY_BANDS[0];
    for (const candidate of FLUENCY_BANDS) {
      if (score >= candidate.value) earned = candidate;
    }
    return earned.band;
  }
  for (const { min, band } of ACCURACY_BANDS) {
    if (score >= min) return band;
  }
  return 'red';
}

/** The legend's swatch. A solid block rather than tinted text, because
 *  a legend entry has to show the COLOUR, not a word wearing it. */
export const BAND_SWATCH_CLASS: Readonly<Record<Band, string>> = {
  'red': 'bg-rose-600 dark:bg-rose-400',
  'amber': 'bg-amber-600 dark:bg-amber-400',
  'yellow-green': 'bg-lime-600 dark:bg-lime-400',
  'green': 'bg-emerald-600 dark:bg-emerald-400',
};

/** Text and background classes per band. Kept together so a band can
 *  never get a text colour from one row and a tint from another. */
export const BAND_TEXT_CLASS: Readonly<Record<Band, string>> = {
  'red': 'text-rose-600 dark:text-rose-400',
  'amber': 'text-amber-600 dark:text-amber-400',
  'yellow-green': 'text-lime-600 dark:text-lime-400',
  'green': 'text-emerald-600 dark:text-emerald-400',
};

/** What the legend for a column says. Two legends, never one combined:
 *  the colours match and the meanings do not. */
export interface LegendEntry {
  band: Band;
  label: string;
  /** The number behind the swatch. The lower bound of an accuracy band;
   *  the exact value of a fluency rating. Shown beside the fluency
   *  labels, where the number is not in the words. */
  value: number;
}

/**
 * DERIVED FROM `ACCURACY_BANDS`, never retyped.
 *
 * A legend that states a cut-off the band function does not use is
 * worse than no legend: it is a confident, wrong account of a colour
 * the reader can see. Deriving means moving a threshold moves the
 * legend with it, in the same edit.
 */
export const ACCURACY_LEGEND: ReadonlyArray<LegendEntry> =
  [...ACCURACY_BANDS].reverse().map(({ min, band }, i, ascending) => {
    const next = ascending[i + 1];
    const label = next === undefined
      ? `${min}%+`
      : min === 0 ? `below ${next.min}%` : `${min}–${next.min - 1}%`;
    return { band, label, value: min };
  });

export const FLUENCY_LEGEND: ReadonlyArray<LegendEntry> = FLUENCY_BANDS.map(
  ({ value, band }) => ({
    band,
    // Read off the scale rather than retyped, so the legend cannot
    // drift from the labels on the rating buttons.
    label: FEEL_OPTIONS.find(o => o.value === value)?.label ?? String(value),
    value,
  }),
);

export function legendFor(kind: AccuracyKind): ReadonlyArray<LegendEntry> {
  return kind === 'self-rated' ? FLUENCY_LEGEND : ACCURACY_LEGEND;
}

/** Column header. The same position carries two different questions,
 *  and the header is what says which. */
export function scoreColumnLabel(kind: AccuracyKind): string {
  return kind === 'self-rated' ? 'fluency' : 'accuracy';
}

// =====================================================================
// What each column MEANS
// =====================================================================

/**
 * One rule, and why it exists.
 *
 * BOTH HALVES ARE REQUIRED. A rule stated without its reason reads as
 * an arbitrary constraint, and the first instinct on meeting a number
 * you did not expect is that the screen is broken. Telling someone the
 * rule is half the job; telling them why it exists is what stops them
 * distrusting the number.
 *
 * `docs/RULE_LEGIBILITY.md` §2.3 — the 30-second minimum rep — is the
 * only rule in the app explained at all three moments, and it is the
 * pattern these copy.
 */
export interface ColumnRule {
  rule: string;
  why: string;
}

/** The four things a reader can interrogate. `due` is not a column;
 *  it is the filter, and its rule belongs at the filter. */
export type ColumnTopic = 'score' | 'coverage' | 'recency' | 'due';

export const COLUMN_TOPIC_TITLE: Readonly<Record<ColumnTopic, string>> = {
  score: 'accuracy / fluency',
  coverage: 'coverage',
  recency: 'recency',
  due: 'due',
};

export const COLUMN_RULES: Readonly<Record<ColumnTopic, ReadonlyArray<ColumnRule>>> = {
  score: [
    {
      rule: 'Accuracy is the mean over the last 20 eligible attempts on an item.',
      why: 'A lifetime average never moves. Twenty is enough to be stable, and '
        + 'short enough that getting better actually shows.',
    },
    {
      rule: 'A parent row reads the highest rating it has FULLY reached.',
      why: 'You reach a threshold, you are not rounded up into it. Three '
        + 'children at comfortable and one at struggled averages 62.5 and '
        + 'reads working on it — the parent still has a way to go. Without '
        + 'this stated, a parent reading lower than most of its children '
        + 'looks like a bug.',
    },
    {
      rule: 'Attempts made in a focus pool of fewer than 4 items are left out '
        + 'of accuracy — but still count toward coverage and recency.',
      why: 'A 3-item pool inflates a percentage: a blind guess is right one '
        + 'time in three and short-term recall carries the rest, so the number '
        + 'would read as skill. You did practise the item, though, so the fact '
        + 'you sat down is not erased with it.',
    },
    {
      rule: 'A dash is not a zero.',
      why: 'An ungraded row has no signal. It has not failed, so it gets '
        + 'neither a red nor a green.',
    },
    {
      rule: 'A row whose branches measure different things reads a dash.',
      why: 'Production holds self-rated lessons beside measured vocabulary. '
        + 'Both project onto 0–100, so averaging them produces a number — one '
        + 'that means neither thing.',
    },
  ],
  coverage: [
    {
      rule: 'An item is covered at 3 or more attempts.',
      why: 'An item seen once, guessed wrong and never revisited has to stay '
        + 'on the uncovered list, or that list stops being worth reading.',
    },
    {
      rule: 'The denominator is the FULL CATALOG for that row, never the '
        + 'current filter.',
      why: 'A denominator that moves with a setting makes the percentage mean '
        + 'a different thing on different days — 60% on Tuesday and 20% on '
        + 'Wednesday with no practice in between. Narrowing to what you are '
        + 'working on is a filter: it changes which rows you look at, not what '
        + 'a row is measured against.',
    },
    {
      rule: 'A parent shows a percentage AND a raw attempt total. An item row '
        + 'shows the count alone.',
      why: 'A percentage cannot tell "worked on, nothing consolidated yet" '
        + 'from "never opened" — both read 0%, and that gap would make real '
        + 'practice look like neglect. At item level, 5 attempts says more '
        + 'than "covered", and 5 sits differently from 47.',
    },
    {
      rule: 'A production lesson is covered at "tried it", not at a count.',
      why: 'A lesson is not a rep you repeat. Reading it and taking it in are '
        + 'worth recording, but neither is practice.',
    },
    {
      rule: 'Saying how well you already know a shape does not cover it.',
      why: 'The modal that asks "how well do you know C major?" sets where '
        + 'spacing begins. Coverage measures practice done in the app.',
    },
    {
      rule: 'Shapes & Patterns divides by 648 chord shapes, not the 720 you '
        + 'can open.',
      why: 'The 72 two-handed supplementary rows are practice tools rather '
        + 'than shapes to own, and they do not gate acquisition. Nor is a cell '
        + 'multiplied by hand or by articulation: those are ways of practising '
        + 'a shape, not separate things to know.',
    },
  ],
  recency: [
    {
      rule: 'A parent shows two numbers — most recent, then stalest.',
      why: 'Most recent alone flatters: touch one item and the whole category '
        + 'looks fresh. Stalest alone freezes: one neglected corner pins it '
        + 'and nothing you do moves it.',
    },
    {
      rule: 'A never-touched item reads "never", not a number of days.',
      why: 'Never is not an age, and rendering it as 0 would claim you '
        + 'practised it today.',
    },
    {
      rule: 'Recency counts every attempt, including the ones accuracy leaves out.',
      why: 'A focus-protected rep and an ungraded practice session both '
        + 'happened. Recency asks when you last touched the item, not whether '
        + 'the answer was a fluency signal.',
    },
    {
      rule: 'Sorting on recency reads a different number in each direction.',
      why: 'Most recent first orders on the left number, stalest first on the '
        + 'right. A row touched 2 days ago holding a 40-day-old item ranks on '
        + 'the 40 one way and the 2 the other.',
    },
  ],
  due: [
    {
      rule: 'Due means an item is past the next-review date the spacing '
        + 'algorithm gave it.',
      why: 'It is not a deadline and has nothing to do with goals. The date is '
        + 'written when you answer the card, from how well you answered it.',
    },
    {
      rule: 'Due is a filter and never a column.',
      why: 'After a gap everything goes due and stays due, so the number would '
        + 'read the same on every row and tell you nothing. As a filter it is '
        + 'there for when you are caught up enough for it to mean something.',
    },
    {
      rule: 'Modules that schedule no reviews return nothing from this filter.',
      why: 'Shapes & Patterns, song repertoire, key detection and chord motion '
        + 'write no spacing state at all. They are absent here rather than '
        + 'showing a dash on every row.',
    },
  ],
};

// =====================================================================
// Cell text
// =====================================================================

/** The dash. Not a zero: an ungraded row has no signal, it has not
 *  failed. */
export const NO_VALUE = '—';

export function formatScore(score: number | null): string {
  return score === null ? NO_VALUE : `${Math.round(score)}%`;
}

/**
 * Coverage.
 *
 * A parent row shows the percentage AND a raw attempt total, because
 * the percentage alone cannot tell "worked on, nothing consolidated
 * yet" from "never opened" - both read 0%, and that gap would make real
 * practice look like neglect.
 *
 * An item row shows the count only. "5 attempts" tells you more than
 * "covered", and 5 sits differently from 47.
 */
export function formatCoverage(input: {
  isLeaf: boolean;
  coveredItems: number;
  totalItems: number;
  engagementCount: number;
}): string {
  const attempts = input.engagementCount === 0
    ? 'no attempts'
    : `${input.engagementCount} attempt${input.engagementCount === 1 ? '' : 's'}`;
  if (input.isLeaf) return attempts;
  if (input.totalItems === 0) return attempts;
  const percent = Math.round((input.coveredItems / input.totalItems) * 100);
  return `${percent}% · ${attempts}`;
}

/**
 * Recency. `12d` on an item, `12d / 61d` on a parent - most recent,
 * then stalest.
 *
 * A never-touched descendant does not get a fabricated stalest.
 * "Never" is not a number of days, and rendering it as 0 would claim
 * you practised today.
 */
export function formatRecency(input: {
  isLeaf: boolean;
  mostRecentDays: number | null;
  stalestDays: number | null;
  hasUntouched: boolean;
}): string {
  const recent = input.mostRecentDays === null ? NO_VALUE : `${input.mostRecentDays}d`;
  if (input.isLeaf) return recent;
  const stalest = input.hasUntouched
    ? 'never'
    : input.stalestDays === null ? NO_VALUE : `${input.stalestDays}d`;
  if (input.mostRecentDays === null && input.hasUntouched) return 'never';
  return `${recent} / ${stalest}`;
}
