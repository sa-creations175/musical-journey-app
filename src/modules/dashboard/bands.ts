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
 * One rule, and what it gives the reader.
 *
 * ─── Who this is written for ─────────────────────────────────────────
 *
 * SOMEONE MEETING THE SCREEN COLD. Not the person who designed it, and
 * not a reader who already knows which alternatives were considered.
 *
 * That distinction is the whole shape of this copy, and the first
 * version got it wrong. Every entry was written as a DEFENCE — "most
 * recent alone flatters", "showing it as 0 would say you practised
 * today", "a lifetime average never moves" — arguing against
 * alternatives nobody proposed, and comparing the number to figures
 * this screen has never displayed. That is the author's reasoning from
 * the design session, written as though the reader shares the context.
 *
 * So: **say what the reader is looking at and what they can do with
 * it.** Reasoning earns a place as a second clause where it genuinely
 * helps someone read the number; it is never the whole explanation.
 *
 * ─── The other four rules this copy follows ──────────────────────────
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
 * A RULE THAT LEANS ON ANOTHER RULE NAMES IT AND POINTS AT IT. Ratings
 * are given with their numbers, *comfortable (75)*, matching the key
 * directly above; a rule resting on the 3-attempt threshold says so.
 *
 * THE EM-DASH IS RESERVED for the boundary between a rule and its
 * reason, because the panel joins them with one. Colons and full stops
 * do the internal work.
 */
export interface ColumnRule {
  rule: string;
  /**
   * OPTIONAL, and rarely absent.
   *
   * A rule stated without its reason usually reads as an arbitrary
   * constraint, and the first instinct on meeting an unexpected number
   * is that the screen is broken. But a handful of rules are
   * self-evident — *an item you have never practised reads never* — and
   * explaining those draws attention to a question nobody asked.
   *
   * `SELF_EVIDENT_RULE_MAX` is what keeps that from becoming an excuse:
   * the reason may only be dropped from a rule short enough to carry
   * itself.
   */
  why?: string;
}

/** A rule may go unexplained only if it is this short. Anything longer
 *  is doing enough work to owe the reader an account of itself. */
export const SELF_EVIDENT_RULE_MAX = 60;

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
      rule: 'Accuracy is your last 20 attempts on an item.',
      why: 'It reads as recent form rather than your whole history. The window '
        + 'rolls forward, so twenty attempts of focused work will move it, and '
        + 'anything older has already dropped out. A few attempts are held out '
        + 'of it: see focus practice, below.',
    },
    {
      rule: 'A group row shows the rating its average has actually reached, '
        + 'using the fluency key above.',
      why: 'So a group reads at the level its weaker items are holding it to. '
        + 'Three items at comfortable (75) with one at struggled (25) average '
        + '62.5, which reads working on it (50). When a group sits below most '
        + 'of what is inside it, opening it shows you which item is pulling it '
        + 'down.',
    },
    {
      rule: 'Focus practice: attempts made with fewer than 4 items selected '
        + 'stay out of the accuracy score, and still count toward coverage and '
        + 'recency.',
      why: 'So you can drill two or three things hard without moving your '
        + 'accuracy in either direction. With a pool that small a guess is '
        + 'right one time in three and short-term recall carries the rest, so '
        + 'the percentage would not mean much. The work still registers as '
        + 'practice done.',
    },
    {
      rule: 'A dash means nothing has been scored on this row yet.',
      why: 'It is untested rather than failing, which is why it carries no '
        + 'colour. Coverage is the column that tells you how much of the row '
        + 'you have touched.',
    },
    {
      rule: 'A group row whose items are scored in different ways shows a dash.',
      why: 'Production is the one that does this: its lessons are self-rated '
        + 'and its vocabulary is marked right or wrong, and a single number '
        + 'cannot mean the same thing for both. Open the row and each side '
        + 'shows its own.',
    },
  ],
  coverage: [
    {
      rule: 'An item counts as covered once you have practised it 3 or more '
        + 'times.',
      why: 'Three is where an item is genuinely underway rather than seen '
        + 'once, so what is left uncovered stays a reliable list of where to '
        + 'start. Anything at one or two attempts is still on that list.',
    },
    {
      rule: 'Coverage is measured against the full skill catalog for that row, '
        + 'whatever the filters are showing.',
      why: 'So the percentage means the same thing every time you open the '
        + "screen, and two rows can be compared. Ear Training's chord-motion "
        + 'drill, for instance, shows 42 motions with its diatonic-only filter '
        + 'on; the catalog holds 132, and 132 is what coverage divides by.',
    },
    {
      rule: 'A group row shows a percentage and a total attempt count; an item '
        + 'row shows the count on its own.',
      why: 'The two answer different questions: the percentage is how much has '
        + 'crossed the 3-attempt line above, and the count is how much work '
        + 'has gone in. A row reading 0% with 24 attempts is one you have '
        + 'started and not finished; 0% with no attempts is one you have never '
        + 'opened. On a single item the raw count is the more useful of the '
        + 'two, because 5 sits differently from 47.',
    },
    {
      rule: 'A production lesson counts as covered once you rate it tried it '
        + '(75).',
      why: 'Lessons carry their own five-step scale, separate from the fluency '
        + 'key above: not started (0), read it (25), deep dive (50), tried it '
        + '(75), mastered (100). Coverage marks the point where you have done '
        + 'the thing rather than read about it, so a lesson you have read or '
        + 'dug into still shows as uncovered until you try it.',
    },
    {
      rule: 'Coverage counts practice you have recorded here, not what you '
        + 'already knew coming in.',
      why: 'The Shapes & Patterns question that asks how well you know C major '
        + 'sets where spaced repetition starts you off, so a shape you already '
        + 'have comes round less often. The coverage number still fills in '
        + 'from the reps you log.',
    },
    {
      rule: 'Shapes & Patterns divides by 648 chord shapes, and there are 720 '
        + 'you can open and drill.',
      why: 'The extra 72 are two-handed exercises: ways of working on a shape '
        + 'rather than shapes to learn in their own right. They are there to '
        + 'drill whenever they are useful, without adding to what there is to '
        + 'cover.',
    },
    {
      rule: 'One cell is one shape in one key, however many ways you practise '
        + 'it.',
      why: 'Right hand, left hand, solid, broken: all of them fill in the same '
        + 'cell. So the number stays a count of shapes you know, and stays '
        + 'comparable with the modules that have no hand to choose.',
    },
  ],
  recency: [
    {
      rule: 'A group row shows two numbers, like 12d / 61d: days since you '
        + 'last practised anything inside it, then days since the most '
        + 'neglected item inside it was touched.',
      why: 'The first tells you the group is active; the second tells you '
        + 'something in it is being skipped. The sort control calls that '
        + 'second number stalest.',
    },
    {
      rule: 'An item you have never practised reads never.',
    },
    {
      rule: 'Recency counts every attempt, including the ones the accuracy '
        + 'score leaves out.',
      why: 'So it always tells you when you last worked on something, whatever '
        + 'came of it. Focus practice with fewer than 4 items selected, and '
        + 'repertoire sessions logged without a test, both stay out of the '
        + 'accuracy score and both show up here.',
    },
    {
      rule: 'Sorting by recency reads one of the two numbers, depending on the '
        + 'direction.',
      why: 'Most recent first orders on the left number and stalest first on '
        + 'the right, so a group practised 2 days ago that still holds a '
        + '40-day-old item ranks on the 2 one way and the 40 the other.',
    },
  ],
  due: [
    {
      rule: 'Due means an item is past the review date the spacing algorithm '
        + 'set for it.',
      why: 'That date is set when you answer a card, from how well you '
        + 'answered it, so the filter hands you what the app thinks you are '
        + 'closest to forgetting. It is not a deadline and is unrelated to '
        + 'goals.',
    },
    {
      rule: 'Due is a filter rather than a column.',
      why: 'It is most useful once you are broadly caught up and want to know '
        + 'what to revisit next. After a long break almost everything is due '
        + 'at once, which is why it narrows the list instead of sitting on '
        + 'every row.',
    },
    {
      rule: 'Some modules schedule no reviews, so this filter returns nothing '
        + 'from them.',
      why: 'Shapes & Patterns, song repertoire, key detection and chord motion '
        + 'do not set review dates, so filtering by due shows you the rest of '
        + 'the app rather than everything.',
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
