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
 *
 * ─── How this copy is written ────────────────────────────────────────
 *
 * ONE BULLET PER RULE, rule and reason on the same line. A bold line
 * over an indented paragraph reads as a wall of text at this density.
 *
 * NO UNDEFINED VOCABULARY. Exactly two structural words are used —
 * *group row* and *item row* — and both are defined in
 * `TREE_VOCABULARY`, rendered above the rules. "Parent", "child",
 * "branch", "leaf" and "descendant" are the tree's own words, not the
 * reader's, and they were being used interchangeably.
 *
 * NOTHING IS CITED THAT THE SCREEN DOES NOT SHOW. A reason that
 * compares the number to something you cannot see — "a lifetime average
 * never moves" — asks the reader to picture a figure this screen has
 * never displayed.
 *
 * A RULE THAT LEANS ON ANOTHER RULE NAMES IT AND POINTS AT IT. Ratings
 * are given with their numbers, *comfortable (75)*, matching the key
 * directly above; a rule resting on the 3-attempt threshold says so.
 */
export interface ColumnRule {
  rule: string;
  why: string;
}

/**
 * The two structural words the rules use, defined before they are used.
 *
 * Rendered at the top of every panel whose rules distinguish the two.
 * Four short lines, and without them half the copy below is describing
 * a shape the reader is being asked to infer from the indentation.
 */
export const TREE_VOCABULARY: ReadonlyArray<{ term: string; meaning: string }> = [
  {
    term: 'group row',
    meaning: 'a row you can open. Its numbers cover everything inside it.',
  },
  {
    term: 'item row',
    meaning: 'one thing you practise. It does not open any further.',
  },
];

/** Panels whose rules distinguish the two. Due's do not — its rules are
 *  about every row equally. */
export const TOPICS_USING_TREE_VOCABULARY: ReadonlySet<ColumnTopic> =
  new Set<ColumnTopic>(['score', 'coverage', 'recency']);

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
      rule: 'Accuracy counts your last 20 attempts on an item, and only those.',
      why: 'Twenty is enough to be stable, and short enough that getting '
        + 'better actually shows: the window rolls, so a bad run stops '
        + 'counting once you have done twenty more. Some attempts are left '
        + 'out of it; see focus practice, below.',
    },
    {
      rule: 'A group row only shows a rating once its average has reached '
        + "that rating's number.",
      why: 'Three items at comfortable (75) and one at struggled (25) average '
        + '62.5, which has not reached 75, so the group reads working on it '
        + '(50). The ratings and their numbers are in the fluency key above. '
        + 'Without this, a group reading lower than most of the items inside '
        + 'it looks like a bug.',
    },
    {
      rule: 'Focus practice: attempts made with fewer than 4 items selected '
        + 'are left out of the accuracy score, but still count toward coverage '
        + 'and recency.',
      why: 'A pool of three inflates a percentage: a blind guess is right one '
        + 'time in three, and short-term recall carries most of the rest. You '
        + 'did practise the item, though, so the fact that you sat down is not '
        + 'erased along with the score.',
    },
    {
      rule: 'A dash is not a zero.',
      why: 'A row with nothing scored yet has no signal, and it has not '
        + 'failed, so it gets neither a red nor a green.',
    },
    {
      rule: 'A group row whose items are scored in different ways shows a dash.',
      why: 'Production mixes self-rated lessons with vocabulary that is marked '
        + 'right or wrong, and averaging the two produces a number that means '
        + 'neither. Open the row to see each on its own.',
    },
  ],
  coverage: [
    {
      rule: 'An item counts as covered once you have practised it 3 or more '
        + 'times.',
      why: 'One attempt tells you nothing about whether an item is on its way '
        + 'to being learned: you may have guessed it right, or got it wrong '
        + 'and never come back. Three is the point where the uncovered list '
        + 'becomes worth reading.',
    },
    {
      rule: 'Coverage is measured against the full skill catalog for that row, '
        + 'never against what is currently on screen.',
      why: 'Otherwise a setting elsewhere in the app would move it. Ear '
        + "Training's chord-motion drill shows 42 motions with its "
        + 'diatonic-only filter on, and the full catalog is 132. If coverage '
        + 'divided by 42, turning that filter off would cut the '
        + 'percentage by two thirds without you practising anything.',
    },
    {
      rule: 'A group row shows a percentage and a total attempt count. An item '
        + 'row shows the count on its own.',
      why: 'Because of the 3-attempt rule above, everything you have practised '
        + 'once or twice still reads as uncovered, so a row can show 0% after '
        + 'real work. The attempt count is what separates "worked on, nothing '
        + 'over the line yet" from "never opened". On an item row the count '
        + 'says more than "covered" would: 5 sits differently from 47.',
    },
    {
      rule: 'A production lesson counts as covered at tried it (75), not at an '
        + 'attempt count.',
      why: 'Lessons use their own five-step scale: not started (0), read it '
        + '(25), deep dive (50), tried it (75), mastered (100). It is not '
        + 'the fluency scale in the key above. A lesson is not a rep you '
        + 'repeat: reading one and taking it in are worth recording, but '
        + 'neither is practice, so the first three steps leave it uncovered.',
    },
    {
      rule: 'Saying how well you already know a shape does not cover it.',
      why: 'The Shapes & Patterns question that asks "how well do you know C '
        + 'major?" sets where spaced repetition starts you off. Coverage '
        + 'measures practice recorded in the app.',
    },
    {
      rule: 'Shapes & Patterns counts 648 chord shapes, though there are 720 '
        + 'you can open and drill.',
      why: 'The other 72 are two-handed exercises: practice tools rather than '
        + 'shapes to learn, so they are not counted as things to cover. They '
        + 'are still there to drill.',
    },
    {
      rule: 'Practising the same shape with the other hand, or broken instead '
        + 'of solid, does not add to the count.',
      why: 'What is being counted is the shape in the key. Hands and '
        + 'articulation are ways of practising it rather than separate things '
        + 'to know, and counting them would make Shapes & Patterns '
        + 'incomparable with every other module, none of which has a hand to '
        + 'choose.',
    },
  ],
  recency: [
    {
      rule: 'A group row shows two numbers, like 12d / 61d: days since the '
        + 'most recent practice anywhere inside it, then days since the '
        + 'oldest. The sort control calls that second one stalest.',
      why: 'The most recent alone flatters: practise one item and the whole '
        + 'group looks fresh. The oldest alone freezes: one neglected corner '
        + 'pins it and nothing you do moves it.',
    },
    {
      rule: 'An item you have never practised reads never, not a number of '
        + 'days.',
      why: 'Never is not an age, and showing it as 0 would say you practised '
        + 'it today.',
    },
    {
      rule: 'Recency counts every attempt, including the ones the accuracy '
        + 'score leaves out.',
      why: 'A focus-practice attempt and an unscored practice session both '
        + 'happened. Recency asks when you last touched the item, not whether '
        + 'the result could be scored. The exclusions are listed under '
        + 'accuracy / fluency.',
    },
    {
      rule: 'Sorting by recency reads a different one of the two numbers in '
        + 'each direction.',
      why: 'Most recent first orders on the left number, stalest first on the '
        + 'right. A group practised 2 days ago that still holds a 40-day-old '
        + 'item ranks on the 40 one way and on the 2 the other.',
    },
  ],
  due: [
    {
      rule: 'Due means an item is past the review date the spacing algorithm '
        + 'gave it.',
      why: 'It is not a deadline and has nothing to do with goals. The date is '
        + 'set when you answer a card, from how well you answered it.',
    },
    {
      rule: 'Due is a filter and never a column.',
      why: 'After a break everything goes due and stays due, so as a column it '
        + 'would read the same on every row and tell you nothing. As a filter '
        + 'it is here for when you are caught up enough for it to mean '
        + 'something.',
    },
    {
      rule: 'Modules that schedule no reviews return nothing from this filter.',
      why: 'Shapes & Patterns, song repertoire, key detection and chord motion '
        + 'never set a review date at all, so they are absent from the results '
        + 'rather than showing a dash on every row.',
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
